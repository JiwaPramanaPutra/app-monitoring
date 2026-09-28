// Aritmetika jalur baca riwayat trafik, dipisah sebagai fungsi murni.
//
// `backend/server.js` langsung menyalakan HTTP server saat di-`require`, jadi
// tidak ada test yang bisa mengimpornya — keputusan di dalamnya dulu tidak
// terkunci apa pun: batas hari WIB, keputusan batas jumlah sample, dan dedup
// dua sumber. Ketiganya pindah ke sini supaya bisa diuji tanpa menyalakan server.

/**
 * Batas jumlah sample Mongo yang dimuat sekali jalan. Diambil terbaru dulu
 * supaya yang terpotong adalah yang paling lama, bukan yang paling baru.
 * Pada irama collector 6 detik, ini sekitar 14 hari riwayat satu site.
 */
const SAMPLE_LIMIT = 200000;

// WIB = UTC+7. Tetap dipakai oleh `toWIB` dan sebagai fallback default saat
// `tz` tidak dikirim atau tidak dikenal `Intl`; zona lain dihitung per tanggal.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const DEFAULT_TIME_ZONE = 'Asia/Jakarta';

// Opsi `formatToParts` untuk semua helper zona: `h23` supaya tengah malam
// terbaca `00`, bukan `24`.
const WALL_CLOCK_PARTS = {
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
};

// Satu formatter per zona: `Intl.DateTimeFormat` mahal dibuat ulang, dan
// agregasi memanggil offset ribuan kali per request.
const formatterByZone = new Map();

function formatterFor(zone) {
    let formatter = formatterByZone.get(zone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, ...WALL_CLOCK_PARTS });
        formatterByZone.set(zone, formatter);
    }
    return formatter;
}

/** Apakah `tz` nama zona IANA yang dikenal `Intl`? */
function isValidTimeZone(tz) {
    if (typeof tz !== 'string' || tz.trim() === '') return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch (e) {
        return false;
    }
}

/** `tz` yang benar-benar dipakai: input valid, selain itu WIB. */
function resolveTimeZone(tz) {
    return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

/**
 * Offset (ms) zona `tz` PADA INSTAN `date` — bukan offset tetap.
 *
 * Dihitung dari dinding jam `Intl` untuk tanggal itu supaya zona ber-DST tetap
 * benar, dan supaya Jakarta selalu sama dengan `WIB_OFFSET_MS`.
 */
function tzOffsetMs(date, tz = DEFAULT_TIME_ZONE) {
    const stamp = date instanceof Date ? date : new Date(date);
    const ms = stamp.getTime();
    if (isNaN(ms)) return 0;

    const parts = {};
    for (const part of formatterFor(resolveTimeZone(tz)).formatToParts(stamp)) {
        if (part.type !== 'literal') parts[part.type] = Number(part.value);
    }
    const wallMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    // Buang milidetik: `formatToParts` tidak mengembalikannya, dan sisanya akan
    // tampak sebagai offset yang bukan kelipatan detik.
    const wholeMs = ms - ((ms % 1000) + 1000) % 1000;
    return wallMs - wholeMs;
}

/** Awal hari `YYYY-MM-DD` menurut kalender zona `tz`, sebagai ms UTC. */
function tzDayStart(dateString, tz) {
    const [y, m, d] = String(dateString).split('-').map(Number);
    const utcDay = Date.UTC(y, m - 1, d);
    // Dua langkah: tebakan pertama memakai offset di UTC, tebakan kedua memakai
    // offset di instan hasil — cukup untuk batas DST tanpa iterasi tak berujung.
    const firstGuess = utcDay - tzOffsetMs(utcDay, tz);
    return utcDay - tzOffsetMs(firstGuess, tz);
}

/** Tanggal kalender berikutnya; normalisasi bulan/tahun dilakukan `Date.UTC`. */
function nextDay(dateString) {
    const [y, m, d] = String(dateString).split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const pad = (n) => String(n).padStart(2, '0');
    return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/**
 * Batas rentang dari tanggal `YYYY-MM-DD` yang dimaksudkan sebagai hari di zona
 * `tz` (default WIB). Hari terakhir inklusif sampai 23:59:59 zona itu.
 *
 * Offsetnya eksplisit per tanggal lewat `Intl` supaya hasilnya tidak bergantung
 * pada zona waktu mesin yang menjalankan backend — host UTC dan host WIB harus
 * memberi instan sama, dan WITA harus memberi batas yang bergeser satu jam.
 */
function rangeBounds(startDate, endDate, tz = DEFAULT_TIME_ZONE) {
    const zone = resolveTimeZone(tz);
    return {
        startMs: startDate ? new Date(tzDayStart(startDate, zone)) : null,
        endMs: endDate ? new Date(tzDayStart(nextDay(endDate), zone) - 1000) : null
    };
}

/**
 * Geser sebuah instan ke "kalender zona `tz`" supaya bagian `getUTC*`-nya
 * adalah dinding jam zona itu, bukan waktu mesin yang menjalankan backend.
 *
 * Inilah yang menentukan label bucket `harian` (jam) dan `tahunan` (bulan) di
 * `aggregateSamples`, jadi offsetnya harus sama dengan `rangeBounds` — kalau
 * tidak, sumbu X grafik tidak cocok dengan jam yang dihitung halaman.
 */
function toTZ(timestamp, tz = DEFAULT_TIME_ZONE) {
    const ms = new Date(timestamp).getTime();
    return new Date(ms + tzOffsetMs(ms, tz));
}

/** Alias lama: geser ke kalender WIB, zona default. */
function toWIB(timestamp) {
    return toTZ(timestamp, DEFAULT_TIME_ZONE);
}

/**
 * Potong daftar sample ke `limit` baris pertama dan laporkan apakah ada yang dibuang.
 *
 * Pemanggil mengambil `limit + 1` baris supaya keputusannya berbasis bukti:
 * riwayat yang isinya PERSIS `limit` bukan pemotongan, dan peringatan yang
 * menyala di situ mengikis makna peringatan itu sendiri. Karena querynya
 * berurutan menurun, `limit` baris pertama adalah yang terbaru.
 */
function capSamples(docs, limit = SAMPLE_LIMIT) {
    const list = Array.isArray(docs) ? docs : [];
    if (list.length > limit) {
        list.length = limit;
        return { docs: list, truncated: true };
    }
    return { docs: list, truncated: false };
}

/**
 * Bendera query gaya `?count=1` / `?raw=1`.
 *
 * `undefined` (tidak dikirim), `'0'`, dan `'false'` berarti mati; selain itu
 * hidup — termasuk string kosong, seperti perilaku lama.
 */
function isFlagOn(value) {
    return value !== undefined && value !== '0' && value !== 'false';
}

/**
 * Gabungkan sample dari beberapa sumber menjadi satu deret.
 *
 * Dua sumber menyimpan periode yang berbeda (JSON lokal sejak lebih dulu,
 * MongoDB sejak koneksinya hidup), jadi keduanya digabung; duplikat
 * `site`+`timestamp` dibuang karena `recordTrafficSample` menulis ke keduanya.
 * Baris tanpa timestamp yang bisa dibaca dibuang, dan hasilnya menaik secara
 * kronologis supaya grafik menggambar dari kiri ke kanan.
 */
function mergeSamples(collected, site) {
    const seen = new Set();
    return (Array.isArray(collected) ? collected : [])
        .filter((s) => {
            if (!s || !s.timestamp) return false;
            const stamp = new Date(s.timestamp);
            if (isNaN(stamp.getTime())) return false;
            const key = `${s.site || site}|${stamp.toISOString()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

module.exports = {
    SAMPLE_LIMIT,
    DEFAULT_TIME_ZONE,
    WIB_OFFSET_MS,
    isValidTimeZone,
    resolveTimeZone,
    tzOffsetMs,
    rangeBounds,
    toTZ,
    toWIB,
    capSamples,
    isFlagOn,
    mergeSamples
};
