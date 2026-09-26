// Model klaim status perangkat, sebagai fungsi murni.
//
// Dipisah dari server.js supaya keputusannya bisa diuji tanpa menyalakan server.
//
// Prinsipnya: ICMP yang gagal dari server hanya membuktikan SATU hal — server
// tidak bisa menjangkau perangkat. Itu bukan bukti perangkatnya mati; bisa jadi
// memang tidak ada jalur ke sub-jaringannya. Karena itu "Offline" hanya boleh
// diklaim kalau perangkat itu PERNAH terlihat hidup.

const ONLINE = 'Online';
const OFFLINE = 'Offline';
/** Belum ada bukti apa pun. Tidak mengklaim perangkat hidup maupun mati. */
const NOT_MONITORED = 'Tidak Terpantau';

/** Jumlah kegagalan berturut-turut sebelum perangkat boleh dicap Offline. */
const DEFAULT_FAILURE_THRESHOLD = 3;

/**
 * Status yang boleh ditampilkan untuk sebuah perangkat.
 *
 * @param {boolean} alive hasil ping terakhir
 * @param {string|null|undefined} lastKnown status yang pernah benar-benar terlihat
 * @returns {string} `Online`, `Offline`, atau `Tidak Terpantau`
 */
function claimableStatus(alive, lastKnown) {
    if (alive) return ONLINE;
    // Pernah terlihat hidup (atau sudah pernah dicap Offline) -> kegagalan
    // sekarang adalah klaim nyata. Belum pernah -> tidak mengklaim apa pun.
    return (lastKnown === ONLINE || lastKnown === OFFLINE) ? OFFLINE : NOT_MONITORED;
}

/**
 * Majukan state pinger untuk satu hasil ping.
 *
 * `notify` hanya berisi transisi yang layak diberitakan: perangkat yang terbukti
 * mati, atau yang pulih dari mati. Perangkat yang sejak awal tidak terjangkau
 * tidak pernah menghasilkan notifikasi — dulu ia menghasilkan `[OFFLINE]` palsu
 * karena state awalnya sudah `'Online'` tanpa bukti.
 *
 * @param {{fails: number, status: string}|null|undefined} previous
 * @param {boolean} alive
 * @param {number} [threshold]
 * @returns {{ fails: number, status: string, notify: ('offline'|'online'|null) }}
 */
function advancePingState(previous, alive, threshold = DEFAULT_FAILURE_THRESHOLD) {
    const prev = previous || { fails: 0, status: NOT_MONITORED };
    const limit = Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_FAILURE_THRESHOLD;

    if (alive) {
        // Hanya perangkat yang sebelumnya terbukti mati yang "pulih".
        const recovered = prev.status === OFFLINE;
        return { fails: 0, status: ONLINE, notify: recovered ? 'online' : null };
    }

    const fails = (Number(prev.fails) || 0) + 1;

    // Transisi ke Offline hanya sekali, dan hanya dari bukti pernah hidup.
    if (fails >= limit && prev.status === ONLINE) {
        return { fails, status: OFFLINE, notify: 'offline' };
    }

    return { fails, status: prev.status || NOT_MONITORED, notify: null };
}

module.exports = {
    ONLINE,
    OFFLINE,
    NOT_MONITORED,
    DEFAULT_FAILURE_THRESHOLD,
    claimableStatus,
    advancePingState
};
