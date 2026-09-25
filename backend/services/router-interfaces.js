// Helper murni untuk memetakan balasan RouterOS `/interface/print` dan
// `/interface/monitor-traffic` ke bentuk API. Dipisah dari server.js agar bisa
// diuji tanpa router sungguhan.
//
// Nama field RouterOS penuh jebakan: `monitor-traffic` mengembalikan baik
// `rx-bits-per-second` maupun `fp-rx-bits-per-second` (fastpath) sekaligus, dan
// `/interface/print` memakai `rx-byte` sementara `/interface/ethernet/print`
// memakai `rx-bytes`. Pembacaan yang salah membuat trafik selalu 0.

const toInt = (value, fallback = 0) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * Ambil rate bps dari satu baris balasan `monitor-traffic once`.
 * Hanya `rx-bits-per-second` / `tx-bits-per-second` yang dihitung — bukan yang
 * ber-prefix `fp-` (counter fastpath, bukan rate).
 */
function parseMonitorRates(reply) {
    if (!reply || typeof reply !== 'object') return { rxBps: 0, txBps: 0 };
    return {
        rxBps: toInt(reply['rx-bits-per-second'], 0),
        txBps: toInt(reply['tx-bits-per-second'], 0)
    };
}

/**
 * Gabungkan baris `/interface/print` dengan rate per nama interface.
 * @param {Array} rawInterfaces balasan `/interface/print`
 * @param {Object} ratesByName  { [namaInterface]: { rxBps, txBps } }
 */
function mapInterfaces(rawInterfaces, ratesByName = {}) {
    if (!Array.isArray(rawInterfaces)) return [];
    return rawInterfaces.map(i => {
        const name = String(i.name || '');
        const rate = (ratesByName && ratesByName[name]) || { rxBps: 0, txBps: 0 };
        return {
            name,
            type: i.type || '',
            running: i.running === 'true',
            disabled: i.disabled === 'true',
            comment: i.comment || '',
            macAddress: i['mac-address'] || '',
            rxBps: toInt(rate.rxBps, 0),
            txBps: toInt(rate.txBps, 0)
        };
    });
}

/**
 * Gabungkan kredensial dari form dengan `routerConfig` site yang tersimpan.
 *
 * Form perangkat membiarkan password kosong dengan maksud "pakai yang tersimpan".
 * Tanpa penggabungan ini percobaan connect selalu gagal dengan "Username or
 * password is invalid", karena endpoint tidak pernah membuka `routerConfig`.
 * Nilai yang diisi pengguna selalu menang atas yang tersimpan.
 */
function mergeProbeCredentials(probe, stored) {
    const p = (probe && typeof probe === 'object') ? probe : {};
    const s = (stored && typeof stored === 'object') ? stored : {};

    const pick = (...values) => {
        for (const v of values) {
            const t = (typeof v === 'string') ? v.trim() : v;
            if (t !== undefined && t !== null && t !== '') return v;
        }
        return undefined;
    };

    return {
        host: pick(p.host, s.host) || '',
        port: toInt(pick(p.port, s.port), 8728) || 8728,
        user: pick(p.user, s.user) || '',
        password: pick(p.password, s.password) || '',
        timeout: toInt(pick(p.timeout, s.timeout), 3) || 3,
        routerModel: pick(p.routerModel, s.routerModel) || ''
    };
}

module.exports = { parseMonitorRates, mapInterfaces, mergeProbeCredentials };
