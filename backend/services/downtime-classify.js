// Keputusan ledger downtime untuk satu hasil polling, sebagai fungsi murni.
//
// Dipisah dari collector supaya urutan yang mudah salah — terutama membedakan
// "gangguan yang masih berlangsung" dari "gangguan baru" — bisa diuji tanpa
// router sungguhan.

/**
 * @param {object} input
 * @param {number} input.txBps      bit/detik terukur
 * @param {number} input.rxBps      bit/detik terukur
 * @param {boolean|null} input.running  status link interface (null = tidak tahu)
 * @param {string|null} input.ongoingKind  `kind` kejadian yang sedang terbuka
 * @returns {{ closeOpen: boolean, open: 'interface-down'|null }}
 */
function decideDowntimeAction({ txBps, rxBps, running, ongoingKind } = {}) {
    const idle = (Number(txBps) || 0) === 0 && (Number(rxBps) || 0) === 0;

    // Kejadian lama (sebelum klasifikasi) tidak punya `kind`; isinya kegagalan
    // koneksi, jadi diperlakukan sebagai `unreachable`.
    const ongoing = ongoingKind == null
        ? null
        : (ongoingKind === 'interface-down' ? 'interface-down' : 'unreachable');

    // Trafik mengalir -> router terjangkau dan link hidup.
    if (!idle) return { closeOpen: true, open: null };

    if (running === false) {
        // Hanya tutup kalau kejadian yang terbuka BUKAN gangguan link. Kalau
        // sama, ini gangguan yang sedang berlangsung dan harus tetap SATU
        // kejadian — menutupnya tiap polling akan memecah satu gangguan menjadi
        // ribuan baris (dan `recordDowntimeStart` toh mengembalikan yang lama).
        return { closeOpen: ongoing !== null && ongoing !== 'interface-down', open: 'interface-down' };
    }

    if (running === true) return { closeOpen: true, open: null };

    // running === null: status tidak bisa dipastikan. Jangan menutup apa pun —
    // kegagalan membaca status bukan bukti link kembali hidup.
    return { closeOpen: false, open: null };
}

module.exports = { decideDowntimeAction };
