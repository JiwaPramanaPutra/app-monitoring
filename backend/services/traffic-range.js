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

// WIB = UTC+7. Bukan WITA (UTC+8) dan bukan zona waktu server.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Sufiks offset untuk parsing tanggal, diturunkan dari `WIB_OFFSET_MS`.
 *
 * Diturunkan, bukan ditulis ulang sebagai `'+07:00'`: dua tempat yang sama-sama
 * mengklaim "WIB" adalah persis cara satu jam hilang tanpa ada yang sadar.
 */
const WIB_SUFFIX = (() => {
    const totalMinutes = WIB_OFFSET_MS / 60000;
    const sign = totalMinutes < 0 ? '-' : '+';
    const hh = String(Math.floor(Math.abs(totalMinutes) / 60)).padStart(2, '0');
    const mm = String(Math.abs(totalMinutes) % 60).padStart(2, '0');
    return `${sign}${hh}:${mm}`;
})();

/**
 * Batas rentang dari tanggal `YYYY-MM-DD` yang dimaksudkan sebagai hari WIB.
 *
 * Offsetnya eksplisit supaya hasilnya tidak bergantung pada zona waktu mesin
 * yang menjalankan backend — host UTC dan host WIB harus memberi instan sama.
 */
function rangeBounds(startDate, endDate) {
    return {
        startMs: startDate ? new Date(`${startDate}T00:00:00${WIB_SUFFIX}`) : null,
        endMs: endDate ? new Date(`${endDate}T23:59:59${WIB_SUFFIX}`) : null
    };
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
    WIB_OFFSET_MS,
    rangeBounds,
    capSamples,
    isFlagOn,
    mergeSamples
};
