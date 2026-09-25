# Fix: Grafik trend yang bisa dipercaya

**Type:** Fix
**Status:** verified
**Branch:** `fix/grafik-trend-akurat`
**Fixes:** F-69, F-70, F-71, F-72

## Masalah

Empat hal pada grafik trend Laporan Trafik, semuanya di grafik yang sama. Tiga pertama terlihat langsung di layar.

**1. F-69 [P2] — tooltip terpotong di tepi kiri.** Pembungkus grafik memakai `overflow-x:auto`, dan tooltip diposisikan `left: <n>%` dengan `transform: translateX(-50%)`. Untuk titik di dekat tepi kiri (jam 00:00–01:00), setengah lebar tooltip berada di luar kotak dan **terpotong** — tepi kanan sudah ditangani lewat `flip`, tepi kiri belum.

**2. Label sumbu Y tidak mengikuti skala grafik.** Kelima label (`300/225/150/75/0`) masih **hardcoded**, padahal `generateChartPaths` memakai skala dinamis `max(data, 300)`. Kalau ada titik di atas 300 Mbps, labelnya salah. Sebelum ada tooltip ini tidak kentara; sekarang tooltip bisa menampilkan `420.00 Mbps` di grafik yang sumbunya berhenti di `300`, jadi ketidakcocokannya justru terlihat.

**3. F-70 [P3] — titik penanda berbentuk elips.** SVG memakai `preserveAspectRatio="none"` sehingga `<circle r="2.5">` di viewBox `0 0 100 150` tergambar sebagai elips pipih (~50×5 px). `vector-effect` hanya melindungi garis, bukan bentuk.

**4. F-71 [P2] — badge "titik tanpa data" sekarang KURANG hitung.** Perbaikan F-68 menghentikan hitungan di bucket terakhir yang punya data. Akibatnya celah **setelah** sample terakhir tidak lagi terhitung: gangguan siang ini yang menghentikan sample, atau hari yang bolong total, tampil **`0` titik tanpa data** — padahal justru itu yang paling perlu terlihat.

**5. F-72 [P3] — aritmetika grafik belum teruji.** Test "legacy" yang ditulis untuk F-66 ternyata duplikat kasus F-55, dan pemetaan kursor→titik serta hitungan celah tidak punya test sama sekali.

## Perbaikan

- **F-69:** posisi tooltip memakai tiga mode perataan, bukan hanya `translateX(-50%)`: titik di dekat tepi kiri menempel kiri, di dekat tepi kanan menempel kanan, sisanya di tengah. Jadi tooltip selalu utuh di dalam kotak, termasuk untuk rentang kustom satu titik.
- **Label sumbu Y mengikuti `chartMaxValue`** sehingga sumbu dan kurva selalu sepakat; label dibulatkan agar tetap terbaca.
- **F-70:** penanda dipindah ke overlay HTML sebagai elemen berukuran tetap — titiknya bulat di layar berapa pun lebarnya, dan garis penanda tetap putus-putus.
- **F-71:** batas hitung celah menjadi **yang lebih jauh** antara bucket terakhir yang punya data dan slot waktu "sekarang" — jam/bulan yang belum lewat tetap dikecualikan, tapi celah setelah sample terakhir kembali terhitung.
- **F-72:** aritmetika grafik (pemetaan kursor→indeks, perataan tooltip, dan hitungan celah) diekstrak ke `shared/chart-math.ts` sebagai fungsi murni, lalu diuji dengan vitest.

Yang tidak boleh rusak: celah pada grafik, tooltip untuk bucket kosong, ekspor CSV/JSON, filter periode, dan perhitungan uptime.

## Build steps

- [x] **Step 1 - Tooltip tidak terpotong, titik bulat, sumbu Y sinkron (F-69, F-70)** - Tiga mode perataan tooltip; penanda dipindah ke overlay HTML dengan ukuran tetap; label sumbu Y dihitung dari `chartMaxValue`. *Done when:* arahkan kursor ke jam 00:00 -> tooltip utuh (tidak terpotong); titik penanda bulat; label sumbu cocok dengan nilai tertinggi di grafik; `npm run verify` lolos.
- [x] **Step 2 - Badge celah menghitung sampai "sekarang" (F-71) dan aritmetikanya teruji (F-72)** - Batas hitung memakai max(bucket terakhir berisi, slot sekarang); pemetaan kursor, perataan tooltip, dan hitungan celah dipindah ke `shared/chart-math.ts` beserta test vitest. *Done when:* hari yang terukur penuh -> `0`; celah setelah sample terakhir -> terhitung; hari bolong total -> terhitung; test membantu semua kasus itu; `npm run verify` lolos.

## Verify

- `npm run verify`.
- Smoke tooltip: arahkan kursor ke **00:00** -> tooltip utuh di dalam kotak; ke **23:00** -> utuh juga; ke tengah -> tetap di tengah. Titik penanda terlihat bulat. Bandingkan angka tooltip dengan ringkasan "Current / Average / Maximum" di bawah grafik.
- Smoke sumbu: pada site dengan trafik di atas 300 Mbps, label sumbu Y tertinggi mengikuti nilai puncak, bukan tetap `300`.
- Smoke celah: hari yang sedang berjalan dan terukur penuh menampilkan **0 titik tanpa data**; kalau ada jam yang bolong setelah sample terakhir, angkanya bertambah.
- Bukti tidak ada regresi: ekspor CSV/JSON tetap terunduh; filter periode tetap bekerja; celah pada grafik tetap tampak.
