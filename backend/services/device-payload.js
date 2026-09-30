// Body tulis perangkat dari klien.
//
// `status` perangkat adalah HASIL PENGUKURAN (pinger + `/api/devices/status`),
// bukan input pengguna. Model Device hanya menerima enum Online/Offline/
// Degraded, sedangkan nilai tampilan seperti "Tidak Terpantau" dihitung saat
// baca. Sebelum ini payload form ikut membawa "Tidak Terpantau" sehingga POST/
// PUT gagal 500 di mode MongoDB ("not a valid enum value for path `status`").
// Mode JSON lokal tidak memvalidasi apa pun, jadi kontraknya disatukan di sini:
// server mengabaikan `status` dari klien di kedua mode.

/** Salinan body tanpa `status`. Aman untuk null/non-objek; sumber tak diubah. */
function withoutMeasuredStatus(body) {
    const clean = { ...(body && typeof body === 'object' && !Array.isArray(body) ? body : {}) };
    delete clean.status;
    return clean;
}

module.exports = { withoutMeasuredStatus };
