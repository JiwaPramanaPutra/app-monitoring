// Helper murni untuk membentuk balasan `/api/router/traffic` saat router tidak
// tersambung. Dipisah dari server.js agar kontrak "site yang gagal tidak pernah
// menampilkan angka milik site lain" bisa diuji langsung.

/**
 * Bentuk balasan offline untuk satu site.
 *
 * `cached` wajib berupa traffic terakhir MILIK SITE YANG SAMA. Dulu satu
 * variabel global dipakai untuk semua site, sehingga site yang putus koneksi
 * mewarisi ip/interface/angka site lain sambil tetap melapor `connected: true` —
 * persis terbaca sebagai "data dummy" di widget.
 *
 * `connected` selalu `false`: koneksi memang gagal, apa pun isi cache-nya.
 */
function buildOfflineFallback({ cached, site, routerModel, error } = {}) {
    const last = (cached && typeof cached === 'object') ? cached : {};

    return {
        ip: last.ip || '',
        interface: last.interface || '',
        source: 'cached-fallback',
        txMbps: Number(last.txMbps) || 0,
        rxMbps: Number(last.rxMbps) || 0,
        txBps: Number(last.txBps) || 0,
        rxBps: Number(last.rxBps) || 0,
        site: site || 'Unknown',
        siteConfigured: true,
        routerModel: routerModel || '',
        connected: false,
        error: error || 'Koneksi ke RouterOS API terputus.',
        timestamp: new Date()
    };
}

/**
 * Ubah sample riwayat tersimpan (Mbps) menjadi titik grafik (bps), sebanyak
 * `limit` sample TERBARU dan dikembalikan dalam urutan kronologis (paling lama
 * dulu) supaya grafik menggambar dari kiri ke kanan. Sumbernya tetap pengukuran
 * RouterOS — hanya satuannya yang dikembalikan ke bps seperti grafik live.
 */
function toChartSamples(samples, limit = 45) {
    if (!Array.isArray(samples) || samples.length === 0) return [];
    // Limit yang tidak masuk akal (bukan angka, 0, negatif) memakai default;
    // kelebihan besar dibatasi 500 agar tidak meminta seluruh riwayat sekaligus.
    const requested = Number(limit);
    const max = Number.isFinite(requested) && requested > 0
        ? Math.min(Math.floor(requested), 500)
        : 45;
    return samples.slice(-max).map(s => ({
        txBps: Math.round((Number(s && s.txMbps) || 0) * 1000000),
        rxBps: Math.round((Number(s && s.rxMbps) || 0) * 1000000),
        timestamp: (s && s.timestamp) || null
    }));
}

module.exports = { buildOfflineFallback, toChartSamples };
