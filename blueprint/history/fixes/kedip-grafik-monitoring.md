# Fix: Kedip grafik monitoring saat pindah site

**Type:** Fix
**Status:** verified
**Branch:** fix/kedip-grafik-monitoring

## Masalah

Saat pindah site (contoh: → Kebidanan) di halaman Monitoring, grafik trafik:

1. kosong ±0,4 dtk,
2. menampilkan **satu batang live** di ujung kanan (sumbu `t · t`, Puncak dari satu sample, contoh 222 Kbps),
3. lalu seluruh riwayat 45 sample menimpa sekaligus; Puncak/Rata-rata melompat (222 → 158 Kbps).

Bukti: rekaman 26 Sep 21:16 (`20260926-1316-14.1985318.mp4`) — frame 4,2–4,6 dtk satu batang, 4,7 dtk riwayat penuh.

**Akar masalah (kode):** `selectSite()` (`frontend/src/app/pages/monitoring/monitoring.component.ts:537-548`) menembak `prefillTrafficHistory()` (riwayat tersimpan, `raw=1`) dan `fetchRouterTraffic()` (live) **bersamaan tanpa urutan**. Poll live biasanya tiba lebih dulu → `updateTrafficMetrics()` (`:344-353`) langsung menggambar satu sample; prefill menyusul dan **menimpa** buffer (`:592`). Guard pindah-site sudah benar (`:289`); yang salah urutan rendrenya. Kelas kedipan ini pernah ditambal untuk site tanpa router config (`:576-578`), tapi race live-vs-prefill belum.

## Perbaikan

- Selama `prefillInFlight`, `updateTrafficMetrics` **menahan** sample live di `pendingLive` (maks `MAX_HISTORY`) dan hanya memperbarui legenda Tx/Rx; grafik + metrik tidak digambar.
- Selesai prefill: gabung `riwayat + pendingLive`, gambar **sekali** — Puncak/Rata-rata konsisten sejak frame pertama.
- Riwayat kosong / `!res.ok` / gagal: tahanan dilepas dan sample tertahan tetap digambar (`flushPendingLive()`), jadi perilaku fallback sekarang tidak hilang.
- Site tanpa router config: tidak ada prefill dan tidak ada tahanan — perilaku lama (live menggambar langsung).
- `resetTrafficHistory()` (dipakai saat pindah site / router berganti) ikut membersihkan state tahanan; respons prefill site lama tetap diabaikan guard yang sudah ada.
- Tanpa perubahan backend/API/dependency.

Yang tidak boleh rusak: site terkonfigurasi-tapi-terputus tetap menampilkan grafik riwayat + overlay error; site tanpa router tidak digambar dari riwayat; polling 2 dtk, legenda, dan badge live berjalan seperti sekarang.

## Build steps

- [x] **Step 1 - Tahan gambar saat prefill** - State `prefillInFlight` + `pendingLive` ditambahkan, dibersihkan di `resetTrafficHistory`; `updateTrafficMetrics` menahan saat prefill (legenda tetap update); `prefillTrafficHistory` menggabung riwayat + tahanan dan melepas tahanan lewat `flushPendingLive()` di `finally`. Spec baru `frontend/src/app/pages/monitoring/monitoring.component.spec.ts` (3 test) membuktikan: (a) live-duluan tidak menggambar selama prefill, (b) riwayat tiba → buffer = riwayat + live, digambar sekali, Puncak konsisten, (c) riwayat kosong → sample tertahan tetap digambar, (d) respons site lama tidak menimpa site baru.
- [x] **Step 2 - Verifikasi** - `npm run verify`: backend **195/195** (0 skipped, integrasi Mongo jalan), frontend **143/143** (140 + 3 baru), Angular build OK. Uji mutasi: blok penahanan dihapus sesaat → **2 test gagal**; dipulihkan → hijau lagi.

## Verify

- `npm --prefix frontend run test` — 14 file, 143 test hijau (termasuk 3 test baru).
- `npm run verify` dari akar repo hijau.
- Manual (pemilik): buka `/monitoring`, pindah-pindah site → tidak ada lagi satu batang lalu lompat; Puncak/Rata-rata konsisten saat riwayat tiba.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan di browser pengguna (manual di atas).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3479,"specSha256":"d4e2db11ce5bd19ad9d2c2ead7019a14342957bf6ea5c9859d1296aeef5746a1","branch":"refs/heads/fix/kedip-grafik-monitoring","head":"64a4613863717ffc00db029d5694b156ef4a5601","baseRef":"refs/heads/main","baseCommit":"64a4613863717ffc00db029d5694b156ef4a5601","sourceTree":"32bce60d48727fd4a0a5ee18aa30ec49e07d69dd","absentOptional":[]} -->
