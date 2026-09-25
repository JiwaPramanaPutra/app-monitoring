require('dotenv').config();
const dns = require('dns');
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) { }

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const ping = require('ping');
const { RouterOSAPI } = require('node-routeros');
const storage = require('./storage');
const Device = require('./models/Device');
const Project = require('./models/Project');
const Laporan = require('./models/Laporan');
const { sendTelegramAlert } = require('./services/telegram');
const auth = require('./services/auth');
const { stripDeviceSecrets, stripProjectSecrets, preserveRouterPasswords } = require('./services/redact');
const { parseMonitorRates, mapInterfaces, mergeProbeCredentials } = require('./services/router-interfaces');
const { buildOfflineFallback, toChartSamples } = require('./services/traffic-response');
const { describeRouterError } = require('./services/router-errors');
const { isUsableDeviceIp, findDeviceIpClash, deviceIpClashMessage } = require('./services/device-identity');
const { decideDowntimeAction } = require('./services/downtime-classify');
const { normalizeNestedIds } = require('./services/project-utils');
const { filterLaporan, buildLaporanCsv } = require('./services/laporan-utils');

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

// Auth fail-closed: server tidak jalan tanpa konfigurasi auth lengkap,
// dan semua endpoint /api selain health + login wajib token.
auth.assertAuthConfig();
app.use('/api', auth.requireAuth);
app.use('/api', auth.requireEosForMutations);

// Konfigurasi router default dari environment (opsional).
// Hanya dipakai untuk request yang TIDAK menyebut site (router default).
// Site yang dinamai wajib punya routerConfig sendiri — lihat resolveRouterConfig.
// Tidak ada nilai default hardcoded: tanpa env lengkap, router dianggap belum dikonfigurasi.
function getEnvRouterConfig() {
    const host = process.env.MIKROTIK_HOST;
    const user = process.env.MIKROTIK_USER;
    const password = process.env.MIKROTIK_PASSWORD;
    if (!host || !user || !password) return null;

    return {
        host,
        port: parseInt(process.env.MIKROTIK_PORT || '8728', 10),
        displayPort: parseInt(process.env.MIKROTIK_DISPLAY_PORT || '0', 10) || null,
        user,
        password,
        interface: process.env.MIKROTIK_INTERFACE || 'ether1',
        timeout: parseInt(process.env.MIKROTIK_TIMEOUT || '3', 10),
        routerModel: 'Environment default'
    };
}

// Resolve konfigurasi router berdasarkan site
async function resolveRouterConfig(site, ifaceOverride) {
    if (!site) {
        const envCfg = getEnvRouterConfig();
        return envCfg ? { ...envCfg, interface: ifaceOverride || envCfg.interface } : null;
    }

    const projectSite = await findProjectSite(site);

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

    // Site memang diminta tapi belum punya routerConfig sendiri -> JANGAN diam-diam
    // meminjam config env. Itu membuat `siteConfigured` selalu `true` dan site
    // menampilkan angka router lain (terbaca sebagai data dummy), padahal yang benar
    // adalah "Belum Dikonfigurasi" + tautan ke Project & Site.
    return null;
}

// Cari record site berdasarkan nama, dari Mongo bila tersambung, selain itu dari
// storage lokal. Dipisah supaya arah fallback `resolveRouterConfig` bisa diuji.
async function findProjectSite(site) {
    if (mongoose.connection.readyState === 1) {
        const proj = await Project.findOne({ 'sites.name': site }).lean();
        return proj ? (proj.sites.find(s => s.name === site) || null) : null;
    }

    const projects = storage.getLocalProjects();
    for (const p of projects) {
        const s = (p.sites || []).find(s => s.name === site);
        if (s) return s;
    }
    return null;
}

// Opsi TLS untuk koneksi RouterOS API.
// - ciphers DEFAULT + SECLEVEL=0: tetap kompatibel dengan router lama (cipher warisan),
//   tapi juga menerima router ber-sertifikat (ECDHE). Daftar ADH-only lama ditolak
//   router ber-sertifikat dengan "TLS alert handshake failure".
const MIKROTIK_TLS_OPTIONS = {
    rejectUnauthorized: false,
    ciphers: 'DEFAULT@SECLEVEL=0',
    minVersion: 'TLSv1'
};

// Pesan gagal koneksi RouterOS yang selalu informatif kini ada di
// `services/router-errors.js` — library sering melempar error tanpa `message`,
// hanya `errno` numerik, sehingga pengguna sempat melihat keluaran mentah
// `{"name":"RosException","errno":-4078}` tanpa tahu harus berbuat apa.

// Cache traffic terakhir PER SITE.
// Sebelumnya satu variabel global untuk semua site, sehingga site yang gagal
// koneksi mewarisi ip/interface/angka site lain sambil tetap `connected: true` —
// persis terbaca sebagai data dummy di widget.
const cachedTrafficBySite = {};

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
        throw new Error(describeRouterError(err, routerConfig));
    }
}

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Nadi Monitoring Backend is running with Live MikroTik RB450Gx4 Integration'
    });
});

/**
 * Endpoint: Login - menukar kredensial environment dengan JWT.
 */
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username dan password wajib diisi.' });
    }

    const key = `${req.ip}:${username}`;
    const throttle = auth.checkLoginThrottle(key);
    if (!throttle.allowed) {
        return res.status(429).json({
            success: false,
            error: `Terlalu banyak percobaan login. Coba lagi dalam ${throttle.retryAfterSec} detik.`
        });
    }

    const user = auth.authenticate(username, password);
    if (!user) {
        return res.status(401).json({ success: false, error: 'Nama pengguna atau kata sandi salah.' });
    }

    auth.clearLoginThrottle(key);
    res.json({ success: true, token: auth.signToken(user), user });
});

/**
 * Info Resource MikroTik (Model, Uptime, CPU Load, Versi)
 */
app.get('/api/router/info', async (req, res) => {
    const routerConfig = getEnvRouterConfig();
    if (!routerConfig) {
        return res.status(503).json({
            success: false,
            error: 'Router default belum dikonfigurasi. Atur MIKROTIK_HOST, MIKROTIK_USER, dan MIKROTIK_PASSWORD, atau konfigurasi router per site.'
        });
    }

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
        const resources = await api.write('/system/resource/print');
        await api.close().catch(() => { });
        res.json({ success: true, data: resources[0] || {} });
    } catch (err) {
        try { await api.close(); } catch (e) { }
        res.status(500).json({ success: false, error: describeRouterError(err, routerConfig) });
    }
});

/**
 * Endpoint Monitoring Traffic Router MikroTik Real-time
 * Menerima query param: ?site=<nama-site> atau ?interface=<nama-interface>
 * Prioritas: interface (override manual) > site (mapping otomatis) > default
 */
app.get('/api/router/traffic', async (req, res) => {
    const site = req.query.site;
    const ifaceOverride = req.query.interface;
    const routerConfig = await resolveRouterConfig(site, ifaceOverride);

    // Site dianggap terkonfigurasi hanya jika ada routerConfig yang bisa dipakai
    if (!routerConfig) {
        return res.json({
            connected: false,
            siteConfigured: false,
            site: site || 'Unknown',
            ip: '',
            interface: '',
            routerModel: '',
            txMbps: 0,
            rxMbps: 0,
            txBps: 0,
            rxBps: 0,
            source: 'not-configured',
            error: site
                ? `Site "${site}" belum memiliki konfigurasi router.`
                : 'Belum ada konfigurasi router default.',
            timestamp: new Date()
        });
    }

    try {
        const liveData = await fetchMikrotikTraffic(routerConfig);
        liveData.site = site || 'Unknown';
        liveData.siteConfigured = true;
        liveData.routerModel = routerConfig.routerModel;
        cachedTrafficBySite[site || '_default'] = liveData;

        // Pencatatan downtime sengaja HANYA di collector (satu penulis, satu
        // irama 6 detik). Endpoint ini dipanggil browser tiap 2 detik, dan kalau
        // ia juga menulis ledger, hitungan gagal dan durasi downtime jadi
        // bergantung pada ada-tidaknya halaman dibuka.
        if (site) {
            storage.recordTrafficSample({
                site,
                timestamp: liveData.timestamp,
                txMbps: liveData.txMbps,
                rxMbps: liveData.rxMbps
            });
        }

        return res.json(liveData);
    } catch (err) {
        // Ledger downtime hanya ditulis collector, supaya durasinya tidak
        // bergantung pada ada-tidaknya halaman Monitoring dibuka.

        // Koneksi gagal: laporkan apa adanya (`connected: false`) sambil tetap
        // menampilkan identitas dan angka terakhir MILIK SITE INI sebagai kenangan.
        // Jangan pernah mengambil cache site lain — itu yang terbaca sebagai data dummy.
        return res.json(buildOfflineFallback({
            cached: cachedTrafficBySite[site || '_default'],
            site,
            routerModel: routerConfig.routerModel,
            error: err.message
        }));
    }
});

/**
 * Daftar interface router beserta status link dan rate live sekali jalan.
 * Rate hanya diambil untuk interface yang link-up (satu `monitor-traffic once`
 * per interface) supaya tetap ringan dipakai oleh form perangkat.
 */
async function listRouterInterfaces(routerConfig) {
    const api = new RouterOSAPI({
        host: routerConfig.host,
        port: routerConfig.port,
        user: routerConfig.user,
        password: routerConfig.password,
        timeout: routerConfig.timeout || 4,
        tls: MIKROTIK_TLS_OPTIONS
    });
    api.on('error', () => { });

    try {
        await api.connect();
        const rawInterfaces = await api.write('/interface/print');

        const ratesByName = {};
        for (const i of rawInterfaces) {
            if (i.running !== 'true' || !i.name) continue;
            try {
                const reply = await api.write('/interface/monitor-traffic', [
                    `=interface=${i.name}`,
                    '=once='
                ]);
                if (Array.isArray(reply) && reply[0]) {
                    ratesByName[i.name] = parseMonitorRates(reply[0]);
                }
            } catch (e) {
                // Interface yang gagal dimonitor dibiarkan tanpa rate, bukan gagal semua.
            }
        }

        await api.close().catch(() => { });
        return mapInterfaces(rawInterfaces, ratesByName);
    } catch (err) {
        try { await api.close(); } catch (e) { }
        throw new Error(describeRouterError(err, routerConfig));
    }
}

/**
 * Endpoint: Daftar interface MikroTik beserta status link + rate live.
 * Dipakai form perangkat supaya nama interface dipilih dari router, bukan diketik.
 *
 * - GET  ?site=<nama-site>  -> dari routerConfig site, fallback config env
 * - POST { host, port, user, password } -> dari kredensial yang BELUM tersimpan
 *   (dipakai form Tambah Perangkat, sebelum routerConfig site terbentuk).
 */
app.get('/api/router/interfaces', async (req, res) => {
    const routerConfig = await resolveRouterConfig(req.query.site);
    if (!routerConfig) {
        return res.status(503).json({
            success: false,
            error: req.query.site
                ? `Site "${req.query.site}" belum memiliki konfigurasi router. Atur router trafik site-nya di Project & Site.`
                : 'Router default belum dikonfigurasi. Atur MIKROTIK_HOST, MIKROTIK_USER, dan MIKROTIK_PASSWORD, atau konfigurasi router per site.'
        });
    }
    try {
        res.json({ success: true, data: await listRouterInterfaces(routerConfig) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/router/interfaces', async (req, res) => {
    const { site, host, port, user, password, timeout } = req.body || {};

    // Form perangkat membiarkan field kosong dengan maksud "pakai yang tersimpan",
    // jadi gabungkan dulu dengan `routerConfig` site-nya. Nilai yang diisi
    // pengguna selalu menang atas yang tersimpan.
    let stored = null;
    if (site) {
        const projectSite = await findProjectSite(site);
        stored = (projectSite && projectSite.routerConfig) || null;
    }

    const routerConfig = mergeProbeCredentials({ host, port, user, password, timeout }, stored);
    if (!routerConfig.host || !routerConfig.user) {
        return res.status(400).json({
            success: false,
            error: 'Host dan username RouterOS wajib diisi, atau sudah tersimpan pada site tersebut.'
        });
    }

    try {
        res.json({ success: true, data: await listRouterInterfaces(routerConfig) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
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

    const collected = [];
    const sources = [];

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
            collected.push(...docs);
            sources.push('mongodb');
        } catch (e) {
            console.warn('MongoDB query failed, memakai JSON saja:', e.message);
        }
    }

    let jsonSamples = storage.getTrafficHistory(site);
    if (startMs) jsonSamples = jsonSamples.filter(s => new Date(s.timestamp) >= startMs);
    if (endMs) jsonSamples = jsonSamples.filter(s => new Date(s.timestamp) <= endMs);
    collected.push(...jsonSamples);
    sources.push('json');

    // Kedua sumber menyimpan periode yang berbeda (JSON sejak 14/9, MongoDB
    // hanya sejak koneksinya hidup). Dulu fungsi ini memilih salah satu, dan
    // akibatnya grafik riwayat terpotong. Sekarang keduanya digabung, dengan
    // duplikat `site`+`timestamp` dibuang.
    const seen = new Set();
    const samples = collected.filter(s => {
        if (!s || !s.timestamp) return false;
        const stamp = new Date(s.timestamp);
        if (isNaN(stamp.getTime())) return false;
        const key = `${s.site || site}|${stamp.toISOString()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return { source: sources.join('+'), samples };
}

/**
 * Endpoint: Riwayat & Agregasi traffic router per-site
 * Query params:
 *   ?site=<nama-site> (wajib)
 *   ?period=harian|mingguan|bulanan|tahunan|custom
 *   ?startDate=YYYY-MM-DD
 *   ?endDate=YYYY-MM-DD
 */
app.get('/api/router/history', async (req, res) => {
    const site = req.query.site;
    const period = req.query.period || 'harian';
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    if (!site) {
        return res.status(400).json({ success: false, error: 'Parameter site wajib diisi.' });
    }

    try {
        const { source, samples } = await getRawSamples(site, startDate, endDate);

        // Mode raw: sample apa adanya, tanpa agregasi — `limit` sample terbaru
        // dalam urutan kronologis. Dipakai widget grafik supaya langsung terisi
        // dari riwayat saat site dipilih.
        const raw = req.query.raw;
        if (raw !== undefined && raw !== '0' && raw !== 'false') {
            const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 45, 500));
            return res.json({
                success: true,
                site,
                raw: true,
                source,
                totalSamples: samples.length,
                data: toChartSamples(samples, limit)
            });
        }

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
 *   ?site=<nama-site> (wajib)
 *   ?period=harian|mingguan|bulanan|tahunan|custom
 *   ?startDate=YYYY-MM-DD
 *   ?endDate=YYYY-MM-DD
 *   ?format=json|csv  (default: json)
 */
app.get('/api/router/history/export', async (req, res) => {
    const site = req.query.site;
    const period = req.query.period || 'harian';
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const format = (req.query.format || 'json').toLowerCase();

    if (!site) {
        return res.status(400).json({ success: false, error: 'Parameter site wajib diisi.' });
    }

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
 * Query param: ?site=<nama-site>
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
 * Query param: ?site=<nama-site> (opsional, jika kosong bersihkan semua)
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
 * Apakah interface yang dipantau sedang link-up?
 *
 * Mengembalikan `null` bila statusnya tidak bisa dipastikan. Pemanggil WAJIB
 * memperlakukan `null` sebagai "tidak tahu" dan tidak menuduh downtime —
 * kegagalan membaca status bukan bukti link putus.
 */
async function isInterfaceRunning(routerConfig) {
    const api = new RouterOSAPI({
        host: routerConfig.host,
        port: routerConfig.port,
        user: routerConfig.user,
        password: routerConfig.password,
        timeout: routerConfig.timeout || 3,
        tls: MIKROTIK_TLS_OPTIONS
    });
    api.on('error', () => { });

    try {
        await api.connect();
        const rows = await api.write('/interface/print', [
            `?name=${routerConfig.interface}`,
            '=.proplist=name,running'
        ]);
        await api.close().catch(() => { });
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rows[0].running === 'true';
    } catch (err) {
        try { await api.close(); } catch (e) { }
        return null;
    }
}

/**
 * Background polling worker untuk site yang punya routerConfig.
 * Mengumpulkan data berkala (setiap 6 detik) secara otomatis di backend
 * agar history tetap tercatat meskipun browser tidak dibuka.
 * Menggunakan failure threshold untuk mencegah false positive akibat jitter jaringan WAN.
 */
function startBackgroundTrafficCollector() {
    const INTERVAL_MS = 6000;

    setInterval(async () => {
        let configuredSites = [];
        try {
            let projects = [];
            if (mongoose.connection.readyState === 1) {
                projects = await Project.find({}).lean();
            } else {
                projects = storage.getLocalProjects();
            }

            for (const p of projects) {
                for (const s of (p.sites || [])) {
                    if (s.routerConfig && s.routerConfig.host) {
                        configuredSites.push({ siteName: s.name, cfg: s.routerConfig });
                    }
                }
            }
        } catch (err) {
            console.error('[Collector] Gagal memuat daftar site:', err.message);
            return;
        }

        for (const { siteName, cfg } of configuredSites) {
            const routerConfig = {
                host: cfg.host,
                port: cfg.port || 8728,
                displayPort: cfg.displayPort,
                user: cfg.user,
                password: cfg.password,
                interface: cfg.interface || 'ether1',
                timeout: cfg.timeout || 3,
                routerModel: cfg.routerModel
            };

            try {
                const sample = await fetchMikrotikTraffic(routerConfig);

                // Reset hitungan error jika berhasil connect
                siteFailureCounts[siteName] = 0;

                storage.recordTrafficSample({
                    site: siteName,
                    timestamp: sample.timestamp,
                    txMbps: sample.txMbps,
                    rxMbps: sample.rxMbps
                });

                // Rate 0 bisa berarti interface-nya benar-benar link-down, atau
                // memang sedang sepi. Bedakan supaya hanya gangguan sungguhan
                // yang tercatat — dan cek link hanya saat angkanya 0, sehingga
                // site yang ramai tidak membayar satu panggilan ekstra.
                const idle = sample.txBps === 0 && sample.rxBps === 0;
                const running = idle ? await isInterfaceRunning(routerConfig) : true;
                const ongoing = storage.getOngoingDowntime(siteName);

                const action = decideDowntimeAction({
                    txBps: sample.txBps,
                    rxBps: sample.rxBps,
                    running,
                    ongoingKind: ongoing ? ongoing.kind : null
                });

                // Urutan penting: tutup dulu, baru buka. `recordDowntimeStart`
                // mengembalikan kejadian yang sedang terbuka apa adanya, jadi
                // tanpa ini gangguan link tenggelam di dalam event "tidak
                // terpantau" dan tidak pernah menurunkan uptime. Namun kalau
                // kejadian yang terbuka SUDAH `interface-down`, jangan ditutup:
                // itu gangguan yang sama, dan menutupnya tiap polling akan
                // memecahnya menjadi ribuan baris.
                if (action.closeOpen) storage.recordDowntimeEnd(siteName);
                if (action.open) {
                    storage.recordDowntimeStart(
                        siteName,
                        `Interface ${routerConfig.interface} link-down`,
                        action.open
                    );
                }

            } catch (err) {
                siteFailureCounts[siteName] = (siteFailureCounts[siteName] || 0) + 1;
                console.warn(`[Collector] ${siteName} poll failed (${siteFailureCounts[siteName]}/${FAILURE_THRESHOLD}): ${err.message}`);

                // Gagal menyambung = aplikasi kehilangan visibilitas, bukan
                // situsnya mati. Hanya dicatat setelah beberapa kegagalan
                // berturut-turut, dan dengan `kind` yang benar.
                if (siteFailureCounts[siteName] >= FAILURE_THRESHOLD) {
                    storage.recordDowntimeStart(
                        siteName,
                        err.message || 'Koneksi router gagal',
                        'unreachable'
                    );
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

            return stripDeviceSecrets({ ...d, status, pingTime, client, signal });
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
            return res.json({ success: true, projects: projects.map(stripProjectSecrets) });
        } else {
            const projects = storage.getLocalProjects();
            return res.json({ success: true, projects: projects.map(stripProjectSecrets) });
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
            return res.json({ success: true, project: stripProjectSecrets(newProject.toObject()) });
        } else {
            const newProject = storage.saveLocalProject(req.body);
            return res.json({ success: true, project: stripProjectSecrets(newProject) });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/projects/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const existing = await Project.findById(req.params.id).lean();
            const payload = preserveRouterPasswords(req.body, existing);
            normalizeNestedIds(payload, 'mongo');
            const updated = await Project.findByIdAndUpdate(req.params.id, payload, { new: true });
            return res.json({ success: true, project: stripProjectSecrets(updated.toObject()) });
        } else {
            const existing = storage.getLocalProjects().find(
                p => String(p._id) === String(req.params.id) || String(p.id) === String(req.params.id)
            );
            const payload = preserveRouterPasswords(req.body, existing);
            normalizeNestedIds(payload, 'local');
            const updated = storage.updateLocalProject(req.params.id, payload);
            return res.json({ success: true, project: stripProjectSecrets(updated) });
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
            return res.json({ success: true, count: devices.length, devices: devices.map(stripDeviceSecrets), source: 'mongodb' });
        } else {
            const devices = storage.getLocalDevices();
            return res.json({ success: true, count: devices.length, devices: devices.map(stripDeviceSecrets), source: 'local' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Tolak IP yang sudah dipakai perangkat lain di site yang sama.
 *
 * Dijaga di backend juga, bukan hanya di form: form hanya memuat perangkat satu
 * site, sehingga memilih site lain di dalam modal membuat pemeriksaan di UI tidak
 * melihat inventaris site tujuan. Mengembalikan pesan konflik, atau `null` bila aman.
 */
async function deviceIpClashError(body, excludeId) {
    const ip = body && body.ip;
    const site = body && body.siteLocation;
    if (!isUsableDeviceIp(ip) || !site) return null;

    const devices = mongoose.connection.readyState === 1
        ? await Device.find({}).lean()
        : storage.getLocalDevices();

    const clash = findDeviceIpClash(devices, ip, site, excludeId);
    return clash ? deviceIpClashMessage(clash, ip) : null;
}

app.post('/api/devices', async (req, res) => {
    try {
        const clashError = await deviceIpClashError(req.body);
        if (clashError) return res.status(409).json({ success: false, error: clashError });

        let newDevice;
        if (mongoose.connection.readyState === 1) {
            newDevice = new Device(req.body);
            await newDevice.save();
        } else {
            // Pakai nilai balik `saveLocalDevice`: di mode lokal kunci yang
            // tersimpan bisa berbeda dari yang dikirim klien (bentrok kunci
            // diganti), dan tanpa `_id` itu klien memegang perangkat dengan
            // kunci kosong sehingga DELETE/PUT berikutnya mengenai record lain.
            newDevice = storage.saveLocalDevice(req.body);
        }
        res.json({ success: true, message: 'Device added', device: stripDeviceSecrets(newDevice.toObject ? newDevice.toObject() : newDevice) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/devices/:id', async (req, res) => {
    try {
        const clashError = await deviceIpClashError(req.body, req.params.id);
        if (clashError) return res.status(409).json({ success: false, error: clashError });

        let updatedDevice;
        if (mongoose.connection.readyState === 1) {
            updatedDevice = await Device.findByIdAndUpdate(req.params.id, req.body, { new: true });
        } else {
            updatedDevice = storage.updateLocalDevice(req.params.id, req.body);
        }
        res.json({ success: true, message: 'Device updated', device: stripDeviceSecrets(updatedDevice && updatedDevice.toObject ? updatedDevice.toObject() : updatedDevice) });
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

// Filter laporan dan pembentukan CSV ada di services/laporan-utils.js (mudah dites).

async function getAllLaporan() {
    if (mongoose.connection.readyState === 1) {
        return await Laporan.find({}).sort({ createdAt: -1 }).lean();
    }
    return storage.getLocalLaporan();
}

app.get('/api/laporan', async (req, res) => {
    try {
        const laporans = await getAllLaporan();
        const filtered = filterLaporan(laporans, req.query.search, req.query.type);
        return res.json({ success: true, data: filtered });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Endpoint: Export laporan ke CSV (mengikuti filter GET /api/laporan)
 * Query params: ?search=...&type=...
 */
app.get('/api/laporan/export/csv', async (req, res) => {
    try {
        const laporans = await getAllLaporan();
        const filtered = filterLaporan(laporans, req.query.search, req.query.type);

        const csv = buildLaporanCsv(filtered);

        const filename = `laporan_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send('\uFEFF' + csv);
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
        const newLaporan = storage.saveLocalLaporan(req.body);
        return res.json({ success: true, message: 'Laporan berhasil disimpan (penyimpanan lokal)', data: newLaporan });
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
        const updated = storage.updateLocalLaporan(req.params.id, req.body);
        return res.json({ success: true, message: 'Laporan diupdate', data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/laporan/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            await Laporan.findByIdAndDelete(req.params.id);
        } else {
            storage.deleteLocalLaporan(req.params.id);
        }
        return res.json({ success: true, message: 'Laporan dihapus' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Nadi Backend running on http://localhost:${PORT}`);
});




