// Keputusan ledger downtime untuk satu hasil polling, sebagai fungsi murni.
//
// Dipisah dari collector supaya urutan yang mudah salah — terutama membedakan
// "gangguan yang masih berlangsung" dari "gangguan baru" — bisa diuji tanpa
// router sungguhan.

/**
 * Sample dianggap sepi bila kedua rate-nya nol. Nilai yang tidak bisa dibaca
 * (`NaN`, `null`, `undefined`) juga dihitung sepi, dan predikat ini dipakai
 * bersama oleh collector maupun `decideDowntimeAction` supaya keduanya tidak
 * berbeda pendapat.
 */
function isIdleSample(txBps, rxBps) {
    return (Number(txBps) || 0) === 0 && (Number(rxBps) || 0) === 0;
}

/**
 * @param {object} input
 * @param {number} input.txBps      bit/detik terukur
 * @param {number} input.rxBps      bit/detik terukur
 * @param {boolean|null} input.running  status link interface (null = tidak tahu)
 * @param {string|null} input.ongoingKind  `kind` kejadian yang sedang terbuka.
 *   `null` berarti TIDAK ADA kejadian terbuka; selain itu harus sudah berupa
 *   string (pemanggil menormalkan `kind` yang kosong menjadi `'unreachable'`).
 * @returns {{ closeOpen: boolean, open: 'interface-down'|null }}
 */
function decideDowntimeAction({ txBps, rxBps, running, ongoingKind } = {}) {
    const idle = isIdleSample(txBps, rxBps);

    const ongoing = (ongoingKind === null || ongoingKind === undefined)
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

/**
 * Apakah kegagalan polling ke-`fails` perlu ditulis ke log?
 *
 * Satu site yang router-nya putus gagal tiap beberapa detik selama berhari-hari.
 * Satu baris per kegagalan berarti puluhan ribu baris yang isinya sama dan
 * menenggelamkan pesan lain — terukur dari pemakaian nyata: pencacah mencapai
 * 176 dalam ~18 menit, dan setiap baris ditulis. Lapor saat **melewati** ambang
 * (kapan gangguannya mulai), lalu hanya tiap `every` kegagalan sebagai penanda
 * masih berlangsung.
 *
 * @param {number} fails  jumlah kegagalan berturut-turut, termasuk yang ini
 * @param {number} threshold  ambang yang sama dengan yang memulai pencatatan downtime
 * @param {number} every  jarak antar peringatan lanjutan
 */
function shouldLogFailure(fails, threshold, every) {
    if (!Number.isFinite(fails) || fails <= 0) return false;
    if (!Number.isFinite(threshold) || threshold <= 0) return true;
    if (fails === threshold) return true;
    if (!Number.isFinite(every) || every <= 0) return false;
    return fails > threshold && fails % every === 0;
}

module.exports = { decideDowntimeAction, isIdleSample, shouldLogFailure };
