// Model klaim status perangkat, sebagai fungsi murni.
//
// Dipisah dari server.js supaya keputusannya bisa diuji tanpa menyalakan server.
//
// Prinsipnya: ICMP yang gagal dari server hanya membuktikan SATU hal — server
// tidak bisa menjangkau perangkat. Itu bukan bukti perangkatnya mati; bisa jadi
// memang tidak ada jalur ke sub-jaringannya. Karena itu "Offline" hanya boleh
// diklaim kalau perangkat itu PERNAH terlihat hidup.
//
// Satu paket balasan juga bukan bukti koneksi yang stabil, jadi "Online" baru
// diklaim setelah beberapa sukses berturut-turut (lihat `advancePingState`).

const ONLINE = 'Online';
const OFFLINE = 'Offline';
/** Belum ada bukti apa pun. Tidak mengklaim perangkat hidup maupun mati. */
const NOT_MONITORED = 'Tidak Terpantau';

/** Jumlah kegagalan berturut-turut sebelum perangkat boleh dicap Offline. */
const DEFAULT_FAILURE_THRESHOLD = 3;
/** Jumlah sukses berturut-turut sebelum perangkat boleh dicap Online lagi. */
const DEFAULT_SUCCESS_THRESHOLD = 2;

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

function positiveOr(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Majukan state pinger untuk satu hasil ping.
 *
 * `notify` hanya berisi transisi yang layak diberitakan: perangkat yang terbukti
 * mati, atau yang pulih dari mati. Perangkat yang sejak awal tidak terjangkau
 * tidak pernah menghasilkan notifikasi — dulu ia menghasilkan `[OFFLINE]` palsu
 * karena state awalnya sudah `'Online'` tanpa bukti.
 *
 * Histeresis: `Online` butuh `okThreshold` sukses berturut-turut. Satu balasan
 * nyasar dari jalur yang buruk tidak lagi "mengarm" notifikasi Offline pada tiga
 * kegagalan berikutnya — akar notifikasi up/down berulang di lapangan.
 *
 * @param {{fails?: number, oks?: number, status?: string}|null|undefined} previous
 * @param {boolean} alive
 * @param {{failThreshold?: number, okThreshold?: number}} [options]
 * @returns {{ fails: number, oks: number, status: string, notify: ('offline'|'online'|null) }}
 */
function advancePingState(previous, alive, options = {}) {
    const prev = previous || {};
    const prevStatus = prev.status || NOT_MONITORED;
    const failLimit = positiveOr(options && options.failThreshold, DEFAULT_FAILURE_THRESHOLD);
    const okLimit = positiveOr(options && options.okThreshold, DEFAULT_SUCCESS_THRESHOLD);

    if (alive) {
        const oks = (Number(prev.oks) || 0) + 1;

        if (oks >= okLimit) {
            // Hanya perangkat yang sebelumnya terbukti mati yang "pulih".
            return { fails: 0, oks, status: ONLINE, notify: prevStatus === OFFLINE ? 'online' : null };
        }

        // Belum cukup bukti: status lama dipertahankan, hitungan gagal direset.
        return { fails: 0, oks, status: prevStatus, notify: null };
    }

    const fails = (Number(prev.fails) || 0) + 1;

    // Transisi ke Offline hanya sekali, dan hanya dari bukti pernah hidup.
    if (fails >= failLimit && prevStatus === ONLINE) {
        return { fails, oks: 0, status: OFFLINE, notify: 'offline' };
    }

    return { fails, oks: 0, status: prevStatus, notify: null };
}

/**
 * Boleh mengirim notifikasi perangkat sekarang?
 *
 * Menahan pesan beruntun untuk perangkat yang flapping: satu pesan per
 * `cooldownMs` per perangkat. Waktu/cooldown yang tidak masuk akal dianggap
 * boleh kirim supaya notifikasi tidak hilang diam-diam.
 *
 * @param {number} previousMs waktu kirim terakhir (epoch ms), 0/null bila belum pernah
 * @param {number} nowMs waktu sekarang (epoch ms)
 * @param {number} cooldownMs jarak minimum antar notifikasi
 * @returns {boolean}
 */
function shouldNotify(previousMs, nowMs, cooldownMs) {
    if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) return true;
    if (!Number.isFinite(previousMs) || previousMs <= 0) return true;
    if (!Number.isFinite(nowMs)) return true;
    return nowMs - previousMs >= cooldownMs;
}

/**
 * Kunci state pinger per perangkat: identitas dulu (`_id`, lalu `id`), IP hanya
 * cadangan. Dua perangkat berbeda yang kebetulan ber-IP sama tidak boleh saling
 * menimpa state.
 *
 * @param {{_id?: any, id?: any, ip?: any}|null|undefined} device
 * @returns {string}
 */
function deviceStateKey(device) {
    if (!device) return '';
    if (device._id !== undefined && device._id !== null) return String(device._id);
    if (device.id !== undefined && device.id !== null) return String(device.id);
    if (device.ip !== undefined && device.ip !== null) return String(device.ip);
    return '';
}

module.exports = {
    ONLINE,
    OFFLINE,
    NOT_MONITORED,
    DEFAULT_FAILURE_THRESHOLD,
    DEFAULT_SUCCESS_THRESHOLD,
    claimableStatus,
    advancePingState,
    shouldNotify,
    deviceStateKey
};
