# Fix: Grafik monitoring — live dari kanan, bar besar, skala akar

**Type:** Fix
**Status:** verified
**Branch:** fix/tinggi-grafik-monitoring

## Masalah

1. **Riwayat lama langsung mengisi grafik.** Saat membuka Monitoring / pindah site, `prefillTrafficHistory()` menarik sampai 180 sample lama dan menggambarnya sekaligus penuh ke kiri ("grafik lama jalan lalu langsung full ke kiri"). Diinginkan: grafik mulai dari kanan lalu berjalan ke kiri mengikuti sample live.
2. **Bar terlalu kecil** (180 titik × bar 2 unit).
3. **Lonjakan menenggelamkan trafik normal.** Pada skala linear, puncak ~50 Mbps membuat bar 1 Mbps nyaris tak terlihat ("1 Mbps jadi kecil").

## Perbaikan

- **Mulai live dari kanan**: prefill + mesin tahanan (`prefillInFlight`/`pendingLive`) dihapus; grafik kosong saat pindah, sample live menempel kanan dan bergeser kiri (jendela `MAX_HISTORY = 90`).
- **Bar lebih besar & tinggi**: `slotWidth 5.5 → 11`; lebar bar `2 → 4` unit (offset Rx `+5`); tinggi plot `160 → 200` (`maxBarHeight 172`, baseline `200`); grid `0/50/100/150/199`.
- **Skala AKAR (baru)**: tinggi bar ∝ `√(nilai / batas)`.
  - Batas dari `niceSqrtCeiling(value)` di `shared/chart-math.ts` — tangga `[4, 8, 20, 40, 60, 100, 200, 300, 400, 600, 1000, …]`, **semua habis dibagi 4** supaya label tengah (batas ÷ 4) tetap bulat: 20 → 5; 60 → 15; 600 → 150.
  - Label sumbu = `batas × fraksi²` (posisi tengah = batas ÷ 4), dihitung `axisTickLabel`.
  - Contoh: puncak 17,5 Mbps → batas 20; bar 1 Mbps berada di 22% tinggi (linear hanya 5%); puncak 50 Mbps → batas 60, bar 1 Mbps tetap 13%.
- Skala tetap **tidak memotong** nilai (batas selalu ≥ data + 10%), dan `Puncak`/`Rata-rata` di legenda tetap angka sebenarnya.
- Tanpa perubahan backend/API/dependency.

Yang tidak boleh rusak: guard pindah-site, urutan kronologis kiri→kanan, legend/overlay, dan unit Kbps/Mbps.

## Build steps

- [x] **Step 1 - Hapus prefill + perbesar bar + test** - Prefill & mesin tahanan dihapus; `MAX_HISTORY 90`, slot 11, bar 4 unit, plot 200. Spec monitoring: tanpa `/api/router/history`, geser kanan→kiri (990 → 979), guard site, geometri. *Hasil:* hijau.
- [x] **Step 2 - Skala akar + label + test** - `niceSqrtCeiling` di `chart-math.ts` (+3 test); `calculateScale` memakai helper; `generateChartBars` memakai `√`; `axisTickLabel` memakai `fraksi²`. *Hasil:* chart-math 26 test, monitoring 5 test hijau.
- [x] **Step 3 - Verifikasi + mutasi** - `npm run verify` hijau; mutasi: `slotWidth 11 → 20` (2 test gagal) dan `√`‑ratio → linear (geometri gagal); dipulihkan.

## Bukti

- `npm run verify` (27 Sep): frontend **15 berkas lulus** (chart-math 26 test; monitoring 5 test), Angular build OK; backend **204 pass / 0 fail / 1 skipped** (integrasi Mongo ter-skip karena kondisi DNS lokal).
- Uji mutasi: slot 20 sesaat → 2 test gagal; ratio linear sesaat → test geometri gagal; keduanya dipulihkan.
- Angka kunci: puncak 17,5 Mbps → batas **20** (label 20/5/0); bar 1 Mbps = **38 unit** (~22% tinggi, dulu 5%); bar 2 Mbps = 54 unit; bar terbaru `x = 990`, tetangga `979`.

## Verify

- `npm run verify` dari akar repo.
- Manual (pemilik): buka Monitoring → grafik mulai dari kanan lalu jalan kiri; saat ada puncak besar, bar trafik kecil (≈1 Mbps) tetap terlihat; label sumbu bulat (mis. 20 Mbps / 5 / 0); legend Puncak/Rata-rata tetap angka asli.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser pengguna (manual di atas).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3478,"specSha256":"139e078ebf6b3fe34850404f36469017fbe2107229814ef81f628bd780b374e3","branch":"refs/heads/fix/tinggi-grafik-monitoring","head":"708308e12e73d7438d26297a28ba5ddc01ba9179","baseRef":"refs/heads/main","baseCommit":"708308e12e73d7438d26297a28ba5ddc01ba9179","sourceTree":"5312069f4a85cac05fa386233e9feda9eb18a67b","absentOptional":[]} -->
