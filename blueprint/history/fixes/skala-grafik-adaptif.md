# Fix: Grafik trend berskala otomatis (tidak lagi mentok 300 Mbps)

**Type:** Fix
**Status:** verified
**Branch:** fix/skala-grafik-adaptif

## Masalah

Grafik **Trend bandwidth** di Laporan Trafik memakai lantai skala keras **300 Mbps**:

```ts
const maxValue = Math.max(...tx, ...rx, 300);   // generateChartPaths()
```

Akibatnya, saat pemakaian kecil (contoh nyata: Tx max 0,41 Mbps; Rx max 1,89 Mbps) garisnya menempel di dasar grafik dan praktis tidak terlihat (tangkapan layar pemilik, 27 Sep).

## Perbaikan

- `shared/chart-math.ts`: fungsi murni **`niceChartCeiling(maxValue)`**:
  - `target = maxValue × 1.1` (ruang kepala kecil), lalu pilih **langkah grid bulat** terkecil dari tangga `[0.05 … 1000]` yang `langkah × 4` (5 garis grid) menutup target;
  - nilai ≤ 0 / tidak masuk akal → **10 Mbps**; nilai sangat besar → dibulatkan ke ribuan berikutnya;
  - contoh: 0,41 → 0,8; 1,89 → 4; 25 → 40; 280 → 400. Hasil selalu ≥ data (tidak memotong).
- `laporan-trafik.component.ts`:
  - `generateChartPaths()` menghitung `dataMax` dari data lalu `maxValue = niceChartCeiling(dataMax)` (bukan `max(..., 300)`).
  - Fallback label/hover `|| 300` → `|| 10`, konsisten dengan skala kosong; `chartMaxValue` awal 10.
- Skala tetap satu untuk Tx & Rx (perbandingan jujur); label sumbu, area, garis, dan posisi tooltip otomatis ikut karena semuanya memakai `chartMaxValue` yang sama.
- Tanpa perubahan backend/API/dependency.

Yang tidak boleh rusak: pemetaan path (`y = (1 − nilai/skala)`), celah "tanpa data", perataan tooltip, hover, dan seluruh test laporan-trafik/chart-math yang ada.

## Build steps

- [x] **Step 1 - Helper + test** - `niceChartCeiling` + 3 test di `chart-math.spec.ts` (contoh kecil; anti-potong untuk 9 nilai; fallback 10). *Hasil:* 23 test chart-math hijau.
- [x] **Step 2 - Pakai di komponen + verifikasi** - `generateChartPaths` memakai helper; fallback 10 (label, hover, nilai awal). `npm run verify` hijau; mutasi: helper dikembalikan ke "minimal 300" → **3 test gagal**; dipulihkan.

## Bukti

- `npm run verify` (27 Sep): frontend **15 berkas lulus** (chart-math 23 test, +3 baru), Angular build OK; backend **204 pass / 0 fail / 1 skipped** (integrasi Mongo ter-skip karena kondisi DNS lokal `127.0.0.1`).
- Uji mutasi: `niceChartCeiling` dibuat berperilaku `max(nilai, 300)` sesaat → **3 test gagal**; dipulihkan → hijau.
- Efek pada data nyata pemilik: dataMax 1,89 Mbps → batas sumbu **4 Mbps** (label 0/1/2/3/4); garis Rx ±47% tinggi grafik, Tx ±10% — terlihat tanpa kehilangan nilai.

## Verify

- `npm run verify` dari akar repo.
- Manual (pemilik): buka Laporan Trafik (Poltekkes Gizi, harian) → sumbu Y kini mis. 0–4 Mbps; garis Tx/Rx terlihat jelas; nilai Current/Average/Maximum tidak berubah; periode lain ikut menyesuaikan.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser pengguna (manual di atas).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2907,"specSha256":"4b3d0cb1e0896d1ae7304b9919c7e93dc879b2f4e674d361f0d97bbc166d736a","branch":"refs/heads/fix/skala-grafik-adaptif","head":"697133f7dcb14b03b46d7e53fd35d875c70c94d3","baseRef":"refs/heads/main","baseCommit":"697133f7dcb14b03b46d7e53fd35d875c70c94d3","sourceTree":"fd52d070a3c562ffed396779fd3cd75e5aefcb80","absentOptional":[]} -->
