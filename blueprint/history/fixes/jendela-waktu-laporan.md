# Fix: Satu jendela waktu untuk Laporan Trafik

**Type:** Fix
**Status:** verified
**Branch:** `fix/jendela-waktu-laporan`
**Fixes:** F-75, F-76, F-78, F-79

## Masalah

Empat sisa temuan di Laporan Trafik. Semuanya soal batas waktu yang belum seragam — perbaikan F-65 baru menyentuh sebagian.

**1. F-75 [P2] — log dan ringkasan masih bisa berbeda pendapat.**
Ringkasan uptime menyaring event dengan **tumpang tindih rentang** dan memotong durasinya (perbaikan F-65), tapi `filterDowntimeLog` masih menyaring dengan **waktu mulai** event saja. Gangguan yang melewati tengah malam — mis. 1 Sep 23:00 sampai 2 Sep 01:00 — ikut menurunkan uptime tanggal 2 September tapi **tidak muncul di log** hari itu. Sebaliknya, event yang baru mulai di ujung jendela tampil di log dengan durasi nol. Ini persis kelas "ringkasan dan log tidak boleh berbeda" yang jadi tujuan F-65.

**2. F-76 [P3] — kalender browser dipakai untuk waktu WIB.**
`periodWindow()` membentuk batas dengan `setHours(0,0,0,0)` pada waktu **lokal browser**, sementara endpoint riwayat menafsirkan `startDate`/`endDate` sebagai **hari WIB** (`+07:00`). Di mesin yang zona waktunya bukan WIB — apalagi di sebelah barat UTC — rentang kustom bisa bergeser satu hari: `2026-09-01` dilaporkan sebagai `2026-08-31` oleh `isoDate()`.

**3. F-78 [P3] — peringatan batas sample menyala terlalu cepat.**
`getRawSamples` mengambil `limit(SAMPLE_LIMIT)` lalu memperingatkan bila `docs.length >= SAMPLE_LIMIT`. Saat riwayat pas 200.000, peringatan mengklaim ada yang terpotong padahal tidak. Perlu satu baris ekstra untuk membuktikannya.

**4. F-79 [P3] — grafik dan ekspor masih memakai jendela yang berbeda.**
`fetchRealHistory` dan ekspor memakai `setDefaultDateRange()`, sementara ringkasan, log, dan probe sample memakai `periodWindow()`. Untuk `bulanan` dan `tahunan` keduanya mencakup himpunan hari yang **berbeda**, sehingga grafik dan tabel di halaman yang sama menampilkan periode yang tidak identik.

## Perbaikan

- **F-75:** `DowntimeEvent` membawa `startTimeIso`/`endTimeIso` apa adanya dari backend, dan log memakai **predikat tumpang tindih yang sama** dengan ringkasan. Durasi yang ditampilkan juga dipotong ke jendela, jadi angka di log dan sumbangan ke uptime tidak bisa berbeda. Event yang belum pulih tidak lagi tampil dengan durasi nol.
- **F-76:** jendela dibentuk dari **kalender WIB** (Asia/Makassar, UTC+8), bukan kalender browser. `periodWindow()` mengembalikan instan batas sekaligus tanggal `YYYY-MM-DD` dalam WIB, sehingga yang dikirim ke endpoint dan yang dipakai menyaring event berasal dari perhitungan yang sama.
- **F-78:** ambil `SAMPLE_LIMIT + 1`, dan peringatkan hanya bila baris ekstra itu benar-benar ada.
- **F-79:** `setDefaultDateRange()` diperbaiki agar memakai jendela yang sama, sehingga grafik, ekspor, ringkasan, dan log menampilkan periode yang identik untuk setiap pilihan periode.

Yang tidak boleh rusak: grafik trend dan celahnya, tooltip, ekspor CSV/JSON, filter periode, dan aturan "uptime `—` bila tidak terukur".

## Build steps

- [x] **Step 1 - Log memakai predikat yang sama dengan ringkasan (F-75)** - Bawa `startTimeIso`/`endTimeIso` ke `DowntimeEvent`, saring log dengan tumpang tindih rentang, dan potong durasinya ke jendela. *Done when:* gangguan yang melewati tengah malam muncul di log kedua hari yang bersinggungan dan sumbangannya ke uptime konsisten; event yang belum pulih tidak tampil berdurasi nol; `npm run verify` lolos.
- [x] **Step 2 - Jendela berbasis WIB (F-76)** - `periodWindow()` membentuk batas dari kalender Asia/Makassar dan mengembalikan tanggal WIB untuk dikirim ke endpoint. *Done when:* rentang kustom 1–10 September mengirim `2026-09-01`/`2026-09-10` apa pun zona waktu mesinnya; `npm run verify` lolos.
- [x] **Step 3 - Peringatan batas yang jujur + jendela grafik yang sama (F-78, F-79)** - Ambil `SAMPLE_LIMIT + 1` dan peringatkan hanya bila benar terpotong; `setDefaultDateRange()` memakai jendela yang sama dengan bagian lain halaman. *Done when:* riwayat tepat 200.000 tidak memunculkan peringatan; grafik, ekspor, ringkasan, dan log mencakup himpunan hari yang sama untuk setiap periode; `npm run verify` lolos.

## Verify

- `npm run verify`.
- Smoke F-75: dengan gangguan yang melewati tengah malam, bandingkan baris log dan angka uptime pada kedua tanggal -> keduanya menampilkan gangguan itu dan tidak saling bertentangan.
- Smoke F-76: pilih rentang kustom 1–10 September -> tanggal yang dikirim ke `/api/router/history` tetap September (bisa diperiksa dari Network tab atau log backend), bukan bergeser sehari.
- Smoke F-79: untuk `bulanan` dan `tahunan`, bandingkan rentang grafik dengan rentang tabel uptime -> sama.
- Bukti tidak ada regresi: ekspor CSV/JSON terunduh; tooltip dan celah grafik tetap benar; uptime `—` tetap muncul bila periode tidak terukur.
