# Fix: Skala grafik "Trend bandwidth" stabil

**Type:** Fix
**Status:** verified
**Branch:** fix/stabilkan-skala-trend

## Masalah

Bentuk grafik **Trend bandwidth** (Laporan Trafik) berubah-ubah dari waktu ke waktu (dua tangkapan layar pemilik: satu tampak rata/pucat, satu tampak berisi dengan hump besar). Penyebabnya:

- Skala Y dihitung ulang **setiap kali path digambar**, termasuk saat titik jam berjalan di-overwrite nilai **live** tiap 2 detik (`fetchLiveTraffic` → `generateChartPaths` menghitung `niceChartCeiling(dataMax)` dari seluruh data).
- Satu nilai live yang tinggi sesaat menaikkan batas sumbu → seluruh garis mengecil; poll berikutnya menurunkannya lagi → grafik tampak "bernafas"/berubah-ubah.

## Perbaikan

- Method baru `updateChartScale(riseOnly)`:
  - **Muat data** (ganti site/periode/refresh, lewat `processRealHistory`): hitung baru dari data — boleh naik **atau turun**.
  - **Poll live** (`fetchLiveTraffic`, `riseOnly = true`): skala hanya boleh **NAIK** (puncak baru), tidak turun mengikuti titik live.
  - Data kosong → 10.
- `generateChartPaths()` berhenti menghitung skala sendiri; ia memakai `this.chartMaxValue` yang sudah diputuskan (`|| 10`).
- `niceChartCeiling` tetap sumber langkah skala (rumus tidak berubah).
- Tanpa perubahan backend/API/dependency.

Yang tidak boleh rusak: pemetaan path, celah "tanpa data", hover (`max` yang sama), label sumbu, dan test yang ada.

## Build steps

- [x] **Step 1 - updateChartScale + test** - Method ditambah; `updateChartScale(false)` di `processRealHistory`, `updateChartScale(true)` di `fetchLiveTraffic`; `generateChartPaths` memakai `chartMaxValue`. Test baru: skala awal dari data (25 → 40); skala tidak turun saat live kecil (20 tetap 20); puncak baru menaikkan (50 → 100). *Hasil:* laporan-trafik spec 5 → **7 test** hijau.
- [x] **Step 2 - Verifikasi + mutasi** - `npm run verify` hijau; mutasi `riseOnly` diabaikan → test "tidak turun" gagal; dipulihkan.

## Bukti

- `npm run verify` (27 Sep): frontend **15 berkas lulus** (laporan-trafik 7 test), Angular build OK; backend **204 pass / 0 fail / 1 skipped** (integrasi Mongo ter-skip karena kondisi DNS lokal).
- Uji mutasi: `riseOnly` diabaikan (`chartMaxValue = next` selalu) sesaat → test "poll live tidak menurunkan skala" **gagal**; dipulihkan → hijau.
- Efek nyata: puncak live hanya bisa menaikkan skala sekali; setelah turun, skala tidak ikut turun sampai data dimuat ulang (ganti site/periode) — grafik tidak lagi "bernafas" tiap 2 detik.

## Verify

- `npm run verify` dari akar repo.
- Manual (pemilik): buka Laporan Trafik → bentuk grafik stabil antar poll 2 detik; puncak historis tetap tampil; ganti periode/site me-reset skala sesuai data baru (boleh turun).
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser pengguna (manual di atas).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2842,"specSha256":"b4c0956436f52b3cae34c358f1b9f85be655d7b5ba7dd4c6a40867cbb51ac889","branch":"refs/heads/fix/stabilkan-skala-trend","head":"ea5d66090836feeb3155ab07e916ad90a11733ce","baseRef":"refs/heads/main","baseCommit":"ea5d66090836feeb3155ab07e916ad90a11733ce","sourceTree":"6cda4c13b013ea2c5c387b571d744154e034967b","absentOptional":[]} -->
