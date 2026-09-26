// Penyusunan operasi migrasi riwayat trafik.
//
// Dipisah dari skripnya supaya bentuk operasinya bisa diuji tanpa MongoDB —
// bentuk itulah yang menentukan apakah migrasi ini aman dijalankan ulang.

/**
 * Ubah daftar sample riwayat menjadi operasi `bulkWrite` yang **idempoten**.
 *
 * Setiap sample menjadi `updateOne` dengan filter `site`+`timestamp` dan
 * `upsert: true`, jadi baris yang sudah ada tidak disisipkan lagi. Sebelumnya
 * skrip migrasi memakai `insertMany` sambil menghitung jumlah dokumen yang ada
 * hanya untuk dicetak — tidak ada cabang yang memakainya — sehingga
 * menjalankannya dua kali menggandakan riwayat. `$setOnInsert` memastikan
 * dokumen yang sudah ada tidak pernah ditimpa.
 *
 * Baris tanpa timestamp yang bisa dibaca dibuang, sama seperti perilaku lama,
 * dan `site` kosong memakai `Unknown` agar filternya tetap stabil.
 */
function buildUpsertOps(samples) {
    const list = Array.isArray(samples) ? samples : [];
    const ops = [];
    // Satu batch bisa memuat dua baris dengan `site`+`timestamp` yang sama; dua
    // upsert berfilter identik di dalam satu `bulkWrite` ber-`ordered: false`
    // bisa sama-sama tidak menemukan pasangan lalu sama-sama menyisipkan. Jadi
    // kuncinya dibuang di sini juga, bukan hanya diandalkan pada filter.
    const seen = new Set();

    for (const s of list) {
        if (!s) continue;
        // Dijaga eksplisit seperti di `mergeSamples`: `new Date(null)` adalah
        // 1970-01-01, bukan tanggal tidak sah, jadi nilai kosong akan lolos
        // sebagai data zaman epoch kalau hanya mengandalkan `isNaN`.
        if (!s.timestamp) continue;

        const timestamp = new Date(s.timestamp);
        if (isNaN(timestamp.getTime())) continue;

        const site = s.site || 'Unknown';
        const key = `${site}|${timestamp.toISOString()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        ops.push({
            updateOne: {
                filter: { site, timestamp },
                update: {
                    $setOnInsert: {
                        site,
                        timestamp,
                        txMbps: Number(s.txMbps) || 0,
                        rxMbps: Number(s.rxMbps) || 0,
                        interface: s.interface || ''
                    }
                },
                upsert: true
            }
        });
    }

    return ops;
}

module.exports = { buildUpsertOps };
