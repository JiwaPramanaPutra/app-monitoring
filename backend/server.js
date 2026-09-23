require('dotenv').config();
const dns = require('dns');
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) { }

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const ping = require('ping');
const { Client: SSHClient } = require('ssh2');
const { RouterOSAPI } = require('node-routeros');
const storage = require('./storage');
const Device = require('./models/Device');
const Project = require('./models/Project');
const Laporan = require('./models/Laporan');
const { sendTelegramAlert } = require('./services/telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// Koneksi ke MongoDB Atlas
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI && !MONGO_URI.includes('YOUR_PASSWORD_HERE')) {
    mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 })
        .then(() => console.log('✅ MongoDB Connected successfully.'))
        .catch(err => console.error('❌ MongoDB Connection Error:', err.message));
} else {
    console.warn('⚠️ MONGO_URI belum diatur atau password belum diisi di backend/.env. Mode offline storage aktif.');
}

app.use(cors());
app.use(express.json());

storage.seedLocalProjects();

// Konfigurasi Router MikroTik Fisik Riil
const MIKROTIK_CONFIG = {
    host: process.env.MIKROTIK_HOST || '223.27.147.18',
    port: parseInt(process.env.MIKROTIK_PORT || '8728', 10),
    user: process.env.MIKROTIK_USER || 'jiwa-monitoring',
    password: process.env.MIKROTIK_PASSWORD || 'Denpasar2026',
    interface: process.env.MIKROTIK_INTERFACE || 'ether5',
    timeout: 3
};

// Mapping site ke konfigurasi router MikroTik masing-masing
// Router RB450Gx4 di site Gizi: WAN = ether5 (WAN CNI)
// Untuk site lain, tambahkan router credentials masing-masing saat tersedia
const SITE_ROUTER_MAP = {
    'Gizi': {
        host: '223.27.147.18',
        port: 8729,
        displayPort: 8298,      // Port WinBox / Akses publik pengguna
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        interface: 'ether5',    // WAN CNI - bandwidth total site Gizi
        timeout: 5,
        routerModel: 'RB450Gx4 (RO.POLTEKKES GIZI)'
    }
    // Tambahkan site lain di sini ketika router mereka dikonfigurasi:
    // 'Direktorat': { host: 'x.x.x.x', port: 8728, displayPort: 8291, user: '...', password: '...', interface: 'etherX' },
    // 'Gigi': { ... },
    // 'Keperawatan': { ... },
    // 'Kebidanan': { ... },
};

// Backward compat: simple site-to-interface map (untuk endpoint site-mapping)
const SITE_INTERFACE_MAP = {};
for (const [site, cfg] of Object.entries(SITE_ROUTER_MAP)) {
    SITE_INTERFACE_MAP[site] = cfg.interface;
}

// Resolve konfigurasi router berdasarkan site
async function resolveRouterConfig(site, ifaceOverride) {
    if (!site) return MIKROTIK_CONFIG;

    let projectSite = null;
    if (mongoose.connection.readyState === 1) {
        const proj = await Project.findOne({ 'sites.name': site }).lean();
        if (proj) {
            projectSite = proj.sites.find(s => s.name === site);
        }
    } else {
        const projects = storage.getLocalProjects();
        for (const p of projects) {
            const s = p.sites.find(s => s.name === site);
            if (s) { projectSite = s; break; }
        }
    }

    if (projectSite && projectSite.routerConfig && projectSite.routerConfig.host) {
        const cfg = projectSite.routerConfig;
        return {
            host: cfg.host,
            port: cfg.port || 8728,
            displayPort: cfg.displayPort || 8291,
            user: cfg.user || '',
            password: cfg.password || '',
            interface: ifaceOverride || cfg.interface || 'ether1',
            timeout: cfg.timeout || 3,
            routerModel: cfg.routerModel || 'Unknown'
        };
    }

    if (site && SITE_ROUTER_MAP[site]) {
        const cfg = SITE_ROUTER_MAP[site];
        return {
            host: cfg.host,
            port: cfg.port,
            displayPort: cfg.displayPort,
            user: cfg.user,
            password: cfg.password,
            interface: ifaceOverride || cfg.interface,
            timeout: cfg.timeout || 3,
            routerModel: cfg.routerModel || 'Unknown'
        };
    }
    
    return {
        host: MIKROTIK_CONFIG.host,
        port: MIKROTIK_CONFIG.port,
        user: MIKROTIK_CONFIG.user,
        password: MIKROTIK_CONFIG.password,
        interface: ifaceOverride || MIKROTIK_CONFIG.interface,
        timeout: MIKROTIK_CONFIG.timeout,
        routerModel: 'Default'
    };
}

// Opsi TLS untuk koneksi RouterOS API (MikroTik pakai ADH cipher yang Node.js v24 matikan secara default)
const MIKROTIK_TLS_OPTIONS = {
    rejectUnauthorized: false,
    ciphers: 'ADH-AES128-SHA256:ADH-AES128-SHA:ADH-AES256-SHA256:ADH-AES256-SHA:@SECLEVEL=0',
    minVersion: 'TLSv1'
};

// Cache koneksi dan state traffic terakhir
let cachedTraffic = {
    source: 'initial',
    ip: MIKROTIK_CONFIG.host,
    interface: MIKROTIK_CONFIG.interface,
    txMbps: 0,
    rxMbps: 0,
    txBps: 0,
    rxBps: 0,
    timestamp: new Date()
};

// Tracking kegagalan berturut-turut untuk mencegah false-positive downtime
const siteFailureCounts = {};
const FAILURE_THRESHOLD = 5; // Ditingkatkan menjadi 5 (30 detik) agar tidak sensitif false-positive downtime

// Fungsi Helper untuk menarik data monitor-traffic via RouterOS API Port 8728
// Menerima routerConfig agar bisa connect ke router berbeda per-site
async function fetchMikrotikTraffic(routerConfig) {
    const iface = routerConfig.interface;
    const api = new RouterOSAPI({
        host: routerConfig.host,
        port: routerConfig.port,
        user: routerConfig.user,
        password: routerConfig.password,
        timeout: routerConfig.timeout || 3,
        tls: MIKROTIK_TLS_OPTIONS
    });

    // Mencegah uncaughtException pada socket error
    api.on('error', (err) => {
        // silent logger
    });

    try {
        await api.connect();
        const traffic = await api.write('/interface/monitor-traffic', [
            `=interface=${iface}`,
            '=once='
        ]);
        await api.close().catch(() => { });

        if (Array.isArray(traffic) && traffic.length > 0) {
            const data = traffic[0];
            const rxBps = parseInt(data['rx-bits-per-second'] || 0, 10);
            const txBps = parseInt(data['tx-bits-per-second'] || 0, 10);

            const displayIp = routerConfig.displayPort
                ? `${routerConfig.host}:${routerConfig.displayPort}`
                : routerConfig.host;

            return {
                connected: true,
                source: `live-mikrotik-${routerConfig.routerModel || 'unknown'}`,
                ip: displayIp,
                rawHost: routerConfig.host,
                interface: iface,
                txMbps: +(txBps / 1_000_000).toFixed(2),
                rxMbps: +(rxBps / 1_000_000).toFixed(2),
                txBps,
                rxBps,
                timestamp: new Date()
            };
        }
        throw new Error('No traffic data received from MikroTik');
    } catch (err) {
        try { await api.close(); } catch (e) { }
        throw err;
    }
}

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Nadi Monitoring Backend is running with Live MikroTik RB450Gx4 Integration'
    });
});

/**
 * Info Resource MikroTik (Model, Uptime, CPU Load, Versi)
 */
app.get('/api/router/info', async (req, res) => {
    const api = new RouterOSAPI({
        host: MIKROTIK_CONFIG.host,
        port: MIKROTIK_CONFIG.port,
        user: MIKROTIK_CONFIG.user,
        password: MIKROTIK_CONFIG.password,
        timeout: 4,
        tls: MIKROTIK_TLS_OPTIONS
    });
    api.on('error', () => { });

    try {
        await api.connect();
        const resources = await api.write('/system/resource/print');
        await api.close().catch(() => { });
        res.json({ success: true, data: resources[0] || {} });
    } catch (err) {
        try { await api.close(); } catch (e) { }
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Endpoint Monitoring Traffic Router MikroTik Real-time
 * Menerima query param: ?site=Gizi atau ?interface=ether5
 * Prioritas: interface (override manual) > site (mapping otomatis) > default
 */
app.get('/api/router/traffic', async (req, res) => {
    const site = req.query.site;
    const ifaceOverride = req.query.interface;
    const routerConfig = await resolveRouterConfig(site, ifaceOverride);

    // Cek apakah site ini sudah dikonfigurasi
    const siteConfigured = !!(site && SITE_ROUTER_MAP[site]);

    try {
        const liveData = await fetchMikrotikTraffic(routerConfig);
        liveData.site = site || 'Unknown';
        liveData.siteConfigured = siteConfigured;
        liveData.routerModel = routerConfig.routerModel;
        cachedTraffic = liveData;

        // Record sample in storage if site is configured
        if (siteConfigured) {
            siteFailureCounts[site] = 0;
            storage.recordTrafficSample({
                site,
                timestamp: liveData.timestamp,
                txMbps: liveData.txMbps,
                rxMbps: liveData.rxMbps
            });
            // If it was down, mark recovered
            storage.recordDowntimeEnd(site);
        }

        return res.json(liveData);
    } catch (err) {
        if (siteConfigured) {
            siteFailureCounts[site] = (siteFailureCounts[site] || 0) + 1;
            if (siteFailureCounts[site] >= FAILURE_THRESHOLD) {
                storage.recordDowntimeStart(site, err.message);
            }
        }

        // Jika sedang ada timeout singkat, kembalikan traffic cache terakhir dengan status offline notice
        return res.json({
            ...cachedTraffic,
            site: site || 'Unknown',
            siteConfigured,
            routerModel: routerConfig.routerModel,
            source: 'cached-fallback',
            error: err.message,
            timestamp: new Date()
        });
    }
});

/**
 * Endpoint: Daftar interface MikroTik beserta status
 * Berguna untuk mengetahui interface mana saja yang aktif di router
 */
app.get('/api/router/interfaces', async (req, res) => {
    const api = new RouterOSAPI({
        host: MIKROTIK_CONFIG.host,
        port: MIKROTIK_CONFIG.port,
        user: MIKROTIK_CONFIG.user,
        password: MIKROTIK_CONFIG.password,
        timeout: 4,
        tls: MIKROTIK_TLS_OPTIONS
    });
    api.on('error', () => { });

    try {
        await api.connect();
        const interfaces = await api.write('/interface/print');
        await api.close().catch(() => { });
        const result = interfaces.map(i => ({
            name: i.name,
            type: i.type,
            running: i.running === 'true',
            disabled: i.disabled === 'true',
            comment: i.comment || '',
            macAddress: i['mac-address'] || ''
        }));
        res.json({ success: true, data: result, siteMapping: SITE_INTERFACE_MAP });
    } catch (err) {
        try { await api.close(); } catch (e) { }
        res.status(500).json({ success: false, error: err.message });
    }
});
/**
 * Endpoint: Menghitung & Mengambil Daftar Klien Aktif dari MikroTik DHCP Leases & ARP Table
 * Mendukung filter ?site=Gizi atau ?subnet=192.168.104
 */
app.get('/api/router/clients', async (req, res) => {
    const site = req.query.site || 'Gizi';
    const subnetFilter = req.query.subnet; // misal '192.168.104'
    const routerConfig = await resolveRouterConfig(site);

    const api = new RouterOSAPI({
        host: routerConfig.host,
        port: routerConfig.port,
        user: routerConfig.user,
        password: routerConfig.password,
        timeout: 4,
        tls: MIKROTIK_TLS_OPTIONS
    });
    api.on('error', () => { });

    try {
        await api.connect();
        const [leases, arpList] = await Promise.all([
            api.write('/ip/dhcp-server/lease/print').catch(() => []),
            api.write('/ip/arp/print').catch(() => [])
        ]);
        await api.close().catch(() => { });

        // Filter AP / Router MACs agar tidak terhitung sebagai client
        const apMacs = new Set([
            '20:E1:5D:E3:D5:C0',
            '20:E1:5D:E3:6F:94',
            '20:E1:5D:E3:65:58',
            '20:E1:5D:E3:C9:A0',
            '20:E1:5D:E3:F0:7C',
            '20:E1:5D:E3:EF:0C',
            '20:E1:5D:E3:DF:14',
            '70:85:C4:F7:24:3E',
            '50:D4:F7:49:B3:D2',
            '18:FD:74:3A:73:CE',
            '18:FD:74:3A:73:CF'
        ]);

        const activeLeases = (leases || []).filter(l => l.status === 'bound' && !apMacs.has(l['mac-address']));
        const activeArp = (arpList || []).filter(a => a.complete === 'true' && a.disabled !== 'true' && !apMacs.has(a['mac-address']));

        // Hitung per subnet
        const subnetCounts = {};
        for (const a of activeArp) {
            if (a.address) {
                const prefix = a.address.split('.').slice(0, 3).join('.');
                subnetCounts[prefix] = (subnetCounts[prefix] || 0) + 1;
            }
        }

        let filteredClients = activeArp;
        if (subnetFilter) {
            filteredClients = filteredClients.filter(c => c.address && c.address.startsWith(subnetFilter));
        }

        res.json({
            success: true,
            site,
            totalClientLeases: activeLeases.length,
            totalClientArp: activeArp.length,
            subnetCounts,
            filteredCount: filteredClients.length,
            clients: filteredClients.slice(0, 50).map(c => ({
                ip: c.address,
                mac: c['mac-address'] || '',
                interface: c.interface || ''
            }))
        });
    } catch (err) {
        try { await api.close(); } catch (e) { }
        res.status(500).json({ success: false, error: err.message });
    }
});



/**
 * Endpoint: Mapping site-to-interface (untuk frontend)
 */
app.get('/api/router/site-mapping', (req, res) => {
    res.json({ success: true, mapping: SITE_INTERFACE_MAP });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Aggregasi samples ke format laporan per-periode (WIB = UTC+7)
// ─────────────────────────────────────────────────────────────────────────────
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

function toWIB(timestamp) {
    return new Date(new Date(timestamp).getTime() + WIB_OFFSET_MS);
}

function aggregateSamples(samples, period) {
    if (!samples || samples.length === 0) return [];

    const groups = {};

    for (const s of samples) {
        const wib = toWIB(s.timestamp);
        let key, label;

        switch (period) {
            case 'harian': {
                // Group per jam: 00, 01, ..., 23
                const h = wib.getUTCHours();
                key = `${String(h).padStart(2, '0')}`;
                label = `${String(h).padStart(2, '0')}:00`;
                break;
            }
            case 'mingguan': {
                // Group per hari (Mon=1 ... Sun=0 → kita map ke Senin–Minggu)
                const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun
                const dow = wib.getUTCDay(); // 0=Sun
                key = String(dow);
                label = dayNames[dow];
                break;
            }
            case 'bulanan': {
                // Group per minggu ke-1/2/3/4 dalam bulan
                const day = wib.getUTCDate();
                const weekNum = Math.min(4, Math.ceil(day / 7));
                key = `mg${weekNum}`;
                label = `Minggu ${weekNum}`;
                break;
            }
            case 'tahunan': {
                // Group per bulan
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                const m = wib.getUTCMonth();
                key = String(m);
                label = monthNames[m];
                break;
            }
            default: {
                // custom / raw → group per hari (YYYY-MM-DD)
                const d = wib;
                const y = d.getUTCFullYear();
                const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
                const da = String(d.getUTCDate()).padStart(2, '0');
                key = `${y}-${mo}-${da}`;
                label = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
                break;
            }
        }

        if (!groups[key]) {
            groups[key] = { key, label, txSum: 0, rxSum: 0, count: 0 };
        }
        groups[key].txSum += Number(s.txMbps) || 0;
        groups[key].rxSum += Number(s.rxMbps) || 0;
        groups[key].count++;
    }

    // Susun urutan yang benar
    let sortedKeys;
    switch (period) {
        case 'harian':
            sortedKeys = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
            break;
        case 'mingguan':
            sortedKeys = ['1', '2', '3', '4', '5', '6', '0']; // Mon–Sun
            break;
        case 'bulanan':
            sortedKeys = ['mg1', 'mg2', 'mg3', 'mg4'];
            break;
        case 'tahunan':
            sortedKeys = Array.from({ length: 12 }, (_, i) => String(i));
            break;
        default:
            sortedKeys = Object.keys(groups).sort();
            break;
    }

    const result = [];
    for (const k of sortedKeys) {
        if (groups[k]) {
            const g = groups[k];
            result.push({
                label: g.label,
                tx: +(g.txSum / g.count).toFixed(2),
                rx: +(g.rxSum / g.count).toFixed(2),
                samples: g.count
            });
        } else if (['harian', 'tahunan'].includes(period)) {
            // Tampilkan slot kosong untuk jam/bulan yang tidak ada data
            let label;
            if (period === 'harian') {
                label = `${k}:00`;
            } else {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                label = monthNames[parseInt(k)];
            }
            result.push({ label, tx: 0, rx: 0, samples: 0 });
        }
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Ambil raw samples dari MongoDB atau fallback ke JSON
// ─────────────────────────────────────────────────────────────────────────────
async function getRawSamples(site, startDate, endDate) {
    const startMs = startDate ? new Date(startDate + 'T00:00:00+07:00') : null;
    const endMs = endDate ? new Date(endDate + 'T23:59:59+07:00') : null;

    // Coba MongoDB
    if (mongoose.connection.readyState === 1) {
        try {
            const TrafficSample = require('./models/TrafficSample');
            const query = { site };
            if (startMs || endMs) {
                query.timestamp = {};
                if (startMs) query.timestamp.$gte = startMs;
                if (endMs) query.timestamp.$lte = endMs;
            }
            const docs = await TrafficSample.find(query).sort({ timestamp: 1 }).lean();
            if (docs.length > 0) return { source: 'mongodb', samples: docs };
        } catch (e) {
            console.warn('MongoDB query failed, fallback to JSON:', e.message);
        }
    }

    // Fallback ke JSON local
    let samples = storage.getTrafficHistory(site);
    if (startMs) samples = samples.filter(s => new Date(s.timestamp) >= startMs);
    if (endMs) samples = samples.filter(s => new Date(s.timestamp) <= endMs);
    return { source: 'json', samples };
}

/**
 * Endpoint: Riwayat & Agregasi traffic router per-site
 * Query params:
 *   ?site=Gizi
 *   ?period=harian|mingguan|bulanan|tahunan|custom
 *   ?startDate=YYYY-MM-DD
 *   ?endDate=YYYY-MM-DD
 */
app.get('/api/router/history', async (req, res) => {
    const site = req.query.site || 'Gizi';
    const period = req.query.period || 'harian';
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    try {
        const { source, samples } = await getRawSamples(site, startDate, endDate);
        const aggregated = aggregateSamples(samples, period);

        res.json({
            success: true,
            site,
            period,
            source,
            totalSamples: samples.length,
            data: aggregated
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Endpoint: Export laporan trafik (JSON atau CSV)
 * Query params:
 *   ?site=Gizi
 *   ?period=harian|mingguan|bulanan|tahunan|custom
 *   ?startDate=YYYY-MM-DD
 *   ?endDate=YYYY-MM-DD
 *   ?format=json|csv  (default: json)
 */
app.get('/api/router/history/export', async (req, res) => {
    const site = req.query.site || 'Gizi';
    const period = req.query.period || 'harian';
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const format = (req.query.format || 'json').toLowerCase();

    try {
        const { samples } = await getRawSamples(site, startDate, endDate);
        const aggregated = aggregateSamples(samples, period);

        const filename = `laporan-trafik_${site}_${period}_${startDate || 'all'}_${endDate || 'all'}`;

        if (format === 'csv') {
            const lines = ['Periode,Tx (Mbps),Rx (Mbps),Jumlah Sample'];
            for (const row of aggregated) {
                lines.push(`"${row.label}",${row.tx},${row.rx},${row.samples}`);
            }
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            return res.send('\uFEFF' + lines.join('\r\n')); // BOM untuk Excel
        }

        // Default: JSON
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        return res.json({
            site,
            period,
            startDate,
            endDate,
            exportedAt: new Date().toISOString(),
            data: aggregated
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Endpoint: Log downtime & incident events per-site
 * Query param: ?site=Gizi
 */
app.get('/api/router/downtime-events', (req, res) => {
    const site = req.query.site;
    const events = storage.getDowntimeEvents(site);
    const ongoing = site ? storage.getOngoingDowntime(site) : null;

    res.json({
        success: true,
        site: site || 'All',
        events,
        ongoing
    });
});

/**
 * Endpoint: Reset / bersihkan riwayat log downtime
 * Query param: ?site=Gizi (opsional, jika kosong bersihkan semua)
 */
app.delete('/api/router/downtime-events', (req, res) => {
    const site = req.query.site;
    const result = storage.clearDowntimeEvents(site);
    res.json({
        success: true,
        message: `Riwayat downtime ${site ? 'site ' + site : 'semua site'} berhasil dibersihkan.`,
        remainingEvents: result.count
    });
});

/**
 * Background polling worker untuk router yang sudah terkonfigurasi.
 * Mengumpulkan data berkala (setiap 6 detik) secara otomatis di backend
 * agar history tetap tercatat meskipun browser tidak dibuka.
 * Menggunakan failure threshold untuk mencegah false positive akibat jitter jaringan WAN.
 */
function startBackgroundTrafficCollector() {
    const INTERVAL_MS = 6000;

    setInterval(async () => {
        for (const [siteName, cfg] of Object.entries(SITE_ROUTER_MAP)) {
            try {
                const sample = await fetchMikrotikTraffic({
                    host: cfg.host,
                    port: cfg.port,
                    displayPort: cfg.displayPort,
                    user: cfg.user,
                    password: cfg.password,
                    interface: cfg.interface,
                    timeout: cfg.timeout || 5,
                    routerModel: cfg.routerModel
                });

                // Reset hitungan error jika berhasil connect
                siteFailureCounts[siteName] = 0;

                storage.recordTrafficSample({
                    site: siteName,
                    timestamp: sample.timestamp,
                    txMbps: sample.txMbps,
                    rxMbps: sample.rxMbps
                });

                // Jika sebelumnya ada downtime tercatat, pulihkan
                storage.recordDowntimeEnd(siteName);
                // Bagian sinkronisasi ARP telah dihapus untuk mengurangi beban API pada router MikroTik
                // yang menyebabkan timeout dan tercatat sebagai downtime palsu.

            } catch (err) {
                siteFailureCounts[siteName] = (siteFailureCounts[siteName] || 0) + 1;
                console.warn(`[Collector] ${siteName} poll failed (${siteFailureCounts[siteName]}/${FAILURE_THRESHOLD}): ${err.message}`);

                // Hanya catat downtime resmi jika sudah gagal >= 3 kali berturut-turut
                if (siteFailureCounts[siteName] >= FAILURE_THRESHOLD) {
                    storage.recordDowntimeStart(siteName, err.message || 'Koneksi router gagal');
                }
            }
        }
    }, INTERVAL_MS);
}

// Start background worker
startBackgroundTrafficCollector();

/**
 * Tracking status ping perangkat untuk menghindari spam notifikasi Telegram.
 * Map: deviceIP -> { fails: 0, status: 'Online'|'Offline' }
 */
const devicePingState = {};
const DEVICE_FAILURE_THRESHOLD = 3; // 3x gagal ping berturut-turut baru dianggap offline

async function startBackgroundDevicePinger() {
    const INTERVAL_MS = 30000; // Tiap 30 detik
    
    setInterval(async () => {
        try {
            // Ambil daftar devices dari Mongo (jika ready) atau fallback local
            let devices = [];
            if (mongoose.connection.readyState === 1) {
                devices = await Device.find({}).lean();
            } else {
                devices = storage.getLocalDevices();
            }

            // Loop ping untuk setiap device yang memiliki IP valid
            for (const d of devices) {
                if (!d.ip || d.ip === '—') continue;

                // Inisialisasi state jika belum ada
                if (!devicePingState[d.ip]) {
                    devicePingState[d.ip] = { fails: 0, status: 'Online' };
                }
                const state = devicePingState[d.ip];

                try {
                    const pingRes = await ping.promise.probe(d.ip, { timeout: 2 });
                    
                    if (pingRes.alive) {
                        state.fails = 0;
                        if (state.status === 'Offline') {
                            state.status = 'Online';
                            sendTelegramAlert(`✅ <b>[ONLINE]</b>\nPerangkat <b>${d.name || d.ip}</b> di site <b>${d.siteLocation || 'Unknown'}</b> sudah kembali normal.`);
                        }
                    } else {
                        throw new Error('Ping timeout');
                    }
                } catch (e) {
                    state.fails += 1;
                    if (state.fails >= DEVICE_FAILURE_THRESHOLD && state.status === 'Online') {
                        state.status = 'Offline';
                        sendTelegramAlert(`🚨 <b>[OFFLINE]</b>\nPerangkat <b>${d.name || d.ip}</b> di site <b>${d.siteLocation || 'Unknown'}</b> tidak dapat dijangkau!\n(Gagal ping ${DEVICE_FAILURE_THRESHOLD} kali berturut-turut).`);
                    }
                }
            }
        } catch (err) {
            console.error('Error in Background Device Pinger:', err.message);
        }
    }, INTERVAL_MS);
}

// Jalankan background pinger
startBackgroundDevicePinger();


/**
 * Universal Ping Monitoring (Support semua brand: Ruijie, TP-Link, UniFi, Cisco, Mikrotik, PC, dsb.)
 * Melakukan ICMP ping langsung ke IP target
 */
app.post('/api/ping', async (req, res) => {
    const { host } = req.body;
    if (!host || host === '—') {
        return res.status(400).json({ success: false, error: 'Host IP diperlukan' });
    }

    try {
        // Catatan: flag '-c 1' tidak valid di Windows (butuh admin), cukup gunakan timeout saja
        const pingRes = await ping.promise.probe(host, {
            timeout: 2
        });

        const isAlive = pingRes.alive;
        const timeMs = pingRes.time === 'unknown' ? null : parseFloat(pingRes.time);

        // Kategori status sinyal / ping:
        // < 20ms: Optimal / Excellent
        // 20ms - 80ms: Normal / Good
        // > 80ms: Degradasi / Warning
        // Offline / RTO: Critical / Offline
        let quality = 'offline';
        if (isAlive) {
            if (!timeMs || timeMs <= 25) quality = 'excellent';
            else if (timeMs <= 70) quality = 'good';
            else quality = 'warning';
        }

        res.json({
            success: true,
            host,
            alive: isAlive,
            time: timeMs !== null ? `${timeMs} ms` : '—',
            timeMs: timeMs,
            quality,
            output: pingRes.output
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            host,
            alive: false,
            error: error.message
        });
    }
});

/**
 * GET /api/devices/status
 * Mengambil semua device + enriched dengan real ping status (Online/Offline) dan client count terbaru.
 * Digunakan untuk auto-refresh status perangkat di frontend.
 */
app.get('/api/devices/status', async (req, res) => {
    const { site } = req.query;
    try {
        // 1. Ambil device list
        const filter = site && site !== 'All' ? { siteLocation: site } : {};
        let devices = [];
        if (mongoose.connection.readyState === 1) {
            devices = await Device.find(filter).sort({ createdAt: -1 }).lean();
        } else {
            devices = storage.getLocalDevices(site);
        }

        // 2. Batch ping semua device secara paralel
        const pingResults = await Promise.all(
            devices.map(async (d) => {
                if (!d.ip || d.ip === '—') return { host: d.ip, alive: false, timeMs: null };
                try {
                    const r = await ping.promise.probe(d.ip, { timeout: 1.5 });
                    const timeMs = r.time === 'unknown' ? null : parseFloat(r.time);
                    return { host: d.ip, alive: r.alive, timeMs };
                } catch (e) {
                    return { host: d.ip, alive: false, timeMs: null };
                }
            })
        );

        const pingMap = {};
        pingResults.forEach(p => { if (p.host) pingMap[p.host] = p; });

        // Client count dari MikroTik dihapus karena user meminta data murni dari AP atau N/A.
        // Karena TP-Link EAP110 & AX1500 tidak memiliki API terbuka tanpa controller, kita set N/A.

        // 4. Gabungkan hasil ping + client count ke tiap device
        const enriched = devices.map(d => {
            const pingInfo = pingMap[d.ip] || { alive: false, timeMs: null };
            const status = pingInfo.alive ? 'Online' : 'Offline';
            const pingTime = pingInfo.timeMs !== null ? `${pingInfo.timeMs} ms` : null;

            // Reset nilai client dan signal ke N/A karena tidak dapat diambil secara real langsung dari AP
            let client = 'N/A';
            let signal = 'N/A';

            return { ...d, status, pingTime, client, signal };
        });

        res.json({ success: true, count: enriched.length, devices: enriched, source: 'ping' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Batch Ping untuk memindai daftar perangkat sekaligus
 */
app.post('/api/ping-all', async (req, res) => {
    const { hosts } = req.body; // array string of IPs: ['172.16.10.2', '172.16.10.3']
    if (!Array.isArray(hosts) || hosts.length === 0) {
        return res.status(400).json({ success: false, error: 'Daftar host harus berupa array' });
    }

    const validHosts = hosts.filter(h => h && h !== '—');
    const results = await Promise.all(
        validHosts.map(async (host) => {
            try {
                const pingRes = await ping.promise.probe(host, { timeout: 1.5 });
                const timeMs = pingRes.time === 'unknown' ? null : parseFloat(pingRes.time);
                return {
                    host,
                    alive: pingRes.alive,
                    time: timeMs !== null ? `${timeMs} ms` : '—',
                    timeMs
                };
            } catch (e) {
                return { host, alive: false, time: '—', timeMs: null };
            }
        })
    );

    res.json({
        success: true,
        results
    });
});

// =========================================================
// CRUD ENDPOINTS FOR PROJECTS & SITES
// =========================================================

app.get('/api/projects', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const projects = await Project.find({}).lean();
            return res.json({ success: true, projects });
        } else {
            const projects = storage.getLocalProjects();
            return res.json({ success: true, projects });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/projects/tree', async (req, res) => {
    try {
        let projects = [];
        if (mongoose.connection.readyState === 1) {
            projects = await Project.find({}).lean();
        } else {
            projects = storage.getLocalProjects();
        }
        
        // Transform into SiteNode[] for site-dropdown
        const tree = projects.map(p => ({
            label: p.name,
            children: (p.sites || []).map(s => ({
                label: s.name,
                siteValue: s.name,
                children: (s.gedungList || []).map(g => ({
                    label: g.name,
                    siteValue: s.name,
                    buildingValue: g.name,
                    children: (g.floors || []).map(f => ({
                        label: f.name,
                        siteValue: s.name,
                        buildingValue: g.name
                    }))
                }))
            }))
        }));

        res.json({ success: true, tree });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/projects', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const newProject = new Project(req.body);
            await newProject.save();
            return res.json({ success: true, project: newProject });
        } else {
            const newProject = storage.saveLocalProject(req.body);
            return res.json({ success: true, project: newProject });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/projects/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const updated = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
            return res.json({ success: true, project: updated });
        } else {
            const updated = storage.updateLocalProject(req.params.id, req.body);
            return res.json({ success: true, project: updated });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            await Project.findByIdAndDelete(req.params.id);
        } else {
            storage.deleteLocalProject(req.params.id);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =========================================================
// CRUD ENDPOINTS FOR DEVICES
// =========================================================

app.get('/api/devices', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const devices = await Device.find({}).sort({ createdAt: -1 }).lean();
            return res.json({ success: true, count: devices.length, devices, source: 'mongodb' });
        } else {
            const devices = storage.getLocalDevices();
            return res.json({ success: true, count: devices.length, devices, source: 'local' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/devices', async (req, res) => {
    try {
        let newDevice;
        if (mongoose.connection.readyState === 1) {
            newDevice = new Device(req.body);
            await newDevice.save();
        } else {
            storage.saveLocalDevice(req.body);
            newDevice = req.body;
        }
        res.json({ success: true, message: 'Device added', device: newDevice });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/devices/:id', async (req, res) => {
    try {
        let updatedDevice;
        if (mongoose.connection.readyState === 1) {
            updatedDevice = await Device.findByIdAndUpdate(req.params.id, req.body, { new: true });
        } else {
            updatedDevice = storage.updateLocalDevice(req.params.id, req.body);
        }
        res.json({ success: true, message: 'Device updated', device: updatedDevice });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/devices/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            await Device.findByIdAndDelete(req.params.id);
        } else {
            storage.deleteLocalDevice(req.params.id);
        }
        res.json({ success: true, message: 'Device deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =========================================================
// CRUD ENDPOINTS FOR LAPORAN
// =========================================================

app.get('/api/laporan', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const laporans = await Laporan.find({}).sort({ createdAt: -1 }).lean();
            return res.json({ success: true, data: laporans });
        }
        return res.json({ success: true, data: [] }); // Fallback jika DB offline
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/laporan', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const newLaporan = new Laporan(req.body);
            await newLaporan.save();
            return res.json({ success: true, message: 'Laporan berhasil disimpan', data: newLaporan });
        }
        res.status(503).json({ success: false, error: 'Database offline, tidak bisa menyimpan laporan' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/laporan/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const updated = await Laporan.findByIdAndUpdate(req.params.id, req.body, { new: true });
            return res.json({ success: true, message: 'Laporan diupdate', data: updated });
        }
        res.status(503).json({ success: false, error: 'Database offline' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/laporan/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            await Laporan.findByIdAndDelete(req.params.id);
            return res.json({ success: true, message: 'Laporan dihapus' });
        }
        res.status(503).json({ success: false, error: 'Database offline' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Nadi Backend running on http://localhost:${PORT}`);
});




