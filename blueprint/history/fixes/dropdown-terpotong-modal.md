# Fix: Dropdown pemilih site terpotong di dalam modal

**Type:** Fix
**Status:** verified
**Branch:** fix/dropdown-terpotong-modal

## Masalah

Panel pemilih site selalu dibuka `left: 0` (melebar ke kanan) dengan lebar 260–340px. Di modal **Tambah Laporan**, field Site ada di kolom kanan, sehingga panel melewati tepi kanan `.modal-box`. Kotak modal punya `overflow-y: auto` (`frontend/src/styles.css:161-170`) — dengan satu sumbu non-visible, `overflow-x` ikut menjadi `auto` — jadi panel **terpotong** di tepi modal dan muncul scrollbar horizontal (terlihat di tangkapan layar pemilik, 27 Sep).

Permintaan pemilik: perbaiki tanpa menggeser (jangan memindahkan field/dropdown-nya).

## Perbaikan

- `site-dropdown.component.ts`:
  - Fungsi murni `choosePanelAlign(spaceRight, spaceLeft, panelWidth)`: `left` bila ruang kanan cukup; selain itu `right` bila kiri lebih lapang; default `left`.
  - Saat membuka panel, komponen mengukur ruang di dalam **kotak pemotong terdekat** (`.modal-box` yang `overflow-x !== visible`, atau viewport) lalu memilih sisi: `panelAlign: 'left' | 'right'`.
  - `SITE_PANEL_WIDTH = 340`.
- Template: `[class.align-right]="panelAlign === 'right'"` pada panel.
- CSS: `.dropdown-panel.align-right { left: auto; right: 0; }` — panel melebar ke kiri, tetap di dalam modal.
- Posisi trigger tidak berubah; halaman dengan ruang kanan cukup (Monitoring, Laporan Trafik) tetap membuka ke kanan.
- Tanpa perubahan backend/API/dependency.

Yang tidak boleh rusak: daftar datar + pencarian, emit `{siteValue, label}`, klik-luar menutup, dan perilaku pemilih di tiga halaman pemakai.

## Build steps

- [x] **Step 1 - Sisi buka adaptif + test** - `choosePanelAlign` + pengukuran kotak pemotong + `panelAlign` + template/CSS. Test `site-dropdown.component.spec.ts` 4 → **7 test** (`choosePanelAlign`: cukup kanan → left; kanan sempit & kiri lapang → right; keduanya sempit → left) dan test lama lulus dengan konstruktor `ElementRef`. *Hasil:* hijau.
- [x] **Step 2 - Verifikasi + mutasi** - `npm run verify` lolos; mutasi `choosePanelAlign` selalu `left` → test sisi kanan gagal; dipulihkan.

## Bukti

- `npm run verify` (27 Sep): frontend **15 berkas lulus** (7 test pemilih site), Angular build OK; backend **204 pass / 0 fail / 1 skipped** (integrasi Mongo ter-skip karena kondisi DNS lokal `127.0.0.1` — bukan akibat perubahan ini).
- Uji mutasi: `choosePanelAlign` dibuat selalu `'left'` sesaat → test "membuka ke kiri saat ruang kanan tidak cukup…" **gagal**; dipulihkan → hijau.
- Aritmetika kasus modal: lebar modal 560, kolom kanan mulai ±285 → ruang kanan ±275 < 340; ruang kiri ±435 > 275 → panel memilih `right`, membentang ±[95..435] di dalam modal.

## Verify

- `npm run verify` dari akar repo.
- Manual (pemilik): buka **Tambah Laporan** → dropdown site tampil utuh (label proyek tidak terpotong) dan modal tidak lagi punya scrollbar horizontal; cek juga pemilih di Monitoring & Laporan Trafik masih membuka ke kanan.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser pengguna (manual di atas).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3088,"specSha256":"d609e18163c6ea27be8a9912bc5a85ef69328d53be576fba99d7abcea6029877","branch":"refs/heads/fix/dropdown-terpotong-modal","head":"e8eb95f8426bc9de60ccabd8f0481d7fa4ce2dff","baseRef":"refs/heads/main","baseCommit":"e8eb95f8426bc9de60ccabd8f0481d7fa4ce2dff","sourceTree":"c5d98cc568d0efc4cc3c38e04ad6e9a9db8acdd4","absentOptional":[]} -->
