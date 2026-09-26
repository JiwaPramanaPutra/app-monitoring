# Fix: Sisa P3 — label rentang kustom berbasis WIB + peringatan collector yang tidak berulang

**Type:** Fix
**Status:** verified
**Branch:** `fix/label-wib-dan-log-collector`
**Fixes:** F-85, ditambah temuan baru tanpa ID (peringatan collector berulang)

## Masalah

Dua sisa P3 yang sama-sama ketahuan dari pemakaian nyata. Saling tidak berhubungan — sengaja digabung karena keduanya kecil dan tidak menyentuh berkas yang sama.

**1. F-85 [P3] — label rentang kustom dan batas input tanggal masih kalender browser.**
`getPeriodLabel()` membentuk `new Date('YYYY-MM-DD')` — yang ditafsirkan sebagai **UTC tengah malam** — lalu memformatnya dengan `formatDate()` yang memakai `getDate()`, `getMonth()`, dan `getFullYear()`, yaitu waktu **lokal browser**. Di browser barat UTC keduanya saling meniadakan arahnya: tengah malam UTC tanggal 1 September adalah 31 Agustus sore di New York, jadi labelnya terbaca **31 Agu** padahal isinya 1 September. Label ini tampil di dua kepala halaman.

Hal yang sama terjadi pada `[max]="today"` (`html:53,59`): `today` diisi `formatDateForInput(now)` dari kalender browser, sehingga di browser barat UTC hari WIB yang sedang berjalan **tidak bisa dipilih** — padahal itu justru tanggal yang datanya baru masuk.

Sekalian: `applyQuickPreset(days)` tidak punya pemanggil satu pun di `frontend/src`, dan begitu fungsi itu hilang, `formatDateForInput` ikut menjadi kode mati.

**2. Peringatan collector berulang tanpa batas.**
`startBackgroundTrafficCollector` menulis `console.warn` pada **setiap** kegagalan polling, tiap 6 detik, selamanya. Terukur dari pemakaian nyata saat router Kebidanan putus: pencacahnya mencapai `(176/5)` dalam sekitar 18 menit, dan **setiap** baris ditulis — satu site yang mati sehari menghasilkan sekitar **14.400 baris log** yang isinya sama. Ambang `FAILURE_THRESHOLD` seharusnya menjadi pintu masuk peringatan, bukan setiap baris sesudahnya. Ini juga menenggelamkan pesan lain di log.

## Perbaikan

- **Label dan batas tanggal tidak lagi menyentuh zona waktu.** Tambahkan `formatWibDay(value)` di `frontend/src/app/shared/period-window.ts`: ia memformat `YYYY-MM-DD` langsung dari bagian stringnya memakai `MONTH_LABELS` yang sudah ada, tanpa objek `Date` sama sekali — jadi mustahil bergeser sehari. `today` diisi `wibDateString(new Date())`.
- **Hapus kode mati:** `applyQuickPreset`, lalu `formatDateForInput` dan `formatDate` yang tidak lagi dipakai.
- **Peringatan collector dibatasi:** tulis satu baris saat kegagalan **melewati** ambang, lalu hanya tiap `FAILURE_LOG_EVERY` (50) kegagalan berikutnya. `siteFailureCounts` tetap direset saat berhasil, jadi gangguan berikutnya tetap melapor dari awal.

Yang tidak boleh berubah: label pada sumbu X dan nama bulan, seluruh perilaku grafik, ekspor, ringkasan, dan log downtime; serta keputusan kapan sebuah gangguan mulai dicatat (`FAILURE_THRESHOLD`).

## Build steps

- [x] **Step 1 - Label rentang & batas tanggal dari WIB (F-85)** - Tambahkan `formatWibDay` + test; pakai untuk `getPeriodLabel` dan `today`; hapus `applyQuickPreset`, `formatDateForInput`, dan `formatDate`. *Done when:* label rentang kustom 1–10 September berbunyi `1 Sep 2026 - 10 Sep 2026` apa pun zona waktu mesinnya; `npm run verify` lolos.
- [x] **Step 2 - Peringatan collector tidak berulang** - Batasi `console.warn` ke ambang dan kelipatannya. *Done when:* dengan satu site yang router-nya putus, log collector bertambah paling banyak satu baris per 50 kegagalan (≈5 menit) alih-alih tiap 6 detik; `npm run verify` lolos.

## Verify

- `npm run verify`.
- **F-85, tanpa menyentuh zona waktu:** test `formatWibDay` harus lulus dengan `TZ=America/New_York` **dan** `TZ=Asia/Jakarta`. Buktikan menggigit dengan menjalankan test lama (`new Date('2026-09-01')` + getter lokal) di `TZ=America/New_York` dan memastikan hasilnya `31 Agu`, bukan `1 Sep`.
- **F-85, di aplikasi:** buka Laporan Trafik -> rentang kustom 1–10 September -> label di kepala halaman berbunyi `1 Sep 2026 - 10 Sep 2026`, dan input tanggal tidak menawarkan hari WIB berikutnya sebagai batas atas.
- **Collector:** router Kebidanan sedang putus, jadi ini bisa diamati langsung — hitung baris `[Collector] Kebidanan poll failed` selama satu menit sebelum dan sesudah perubahan. Sebelumnya 10 baris, sesudahnya paling banyak 1.
- Bukti tidak ada regresi: label jam/bulan pada grafik, tooltip, ekspor CSV/JSON, dan baris "Tidak Terpantau" tetap seperti sebelumnya.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4449,"specSha256":"3269811e137fca9020d715b2940b624d5f85caec56f16250e84a8c9db4cb6caf","branch":"refs/heads/fix/label-wib-dan-log-collector","head":"a24a1c1f149704ad4cc833f106587efb1a0d5109","baseRef":"refs/heads/main","baseCommit":"a24a1c1f149704ad4cc833f106587efb1a0d5109","sourceTree":"48689fdd2e9f91ebdb8cd1b355ffcf21b0f1a6d7","absentOptional":[]} -->
