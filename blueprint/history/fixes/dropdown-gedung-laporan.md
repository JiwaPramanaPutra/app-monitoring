# Fix: Dropdown Gedung & Lantai di form Laporan

**Type:** Fix
**Status:** verified
**Branch:** fix/dropdown-gedung-laporan

## Masalah

Form Tambah/Edit Laporan masih memakai **input teks bebas** untuk Gedung dan Lantai (`laporan.component.html`). Setelah pemilih site menjadi daftar datar (fix sebelumnya), tidak ada lagi cara melihat daftar gedung di form ini — pemilik bertanya "kok tidak ada pilihan dropdown gedung nya?".

Padahal datanya tersedia: setiap site punya `gedungList`/`floors` (terbukti dari API: Poltekkes Gizi → Gedung Baru/Lama; Kebidanan → A–D; dst), dan **form perangkat (Monitoring) sudah memakai dropdown bertingkat** dari sumber yang sama. Pemilik memutuskan: form Laporan ikut memakai dropdown; **Ruangan tetap manual**.

## Perbaikan

- `laporan.component.ts`:
  - Berlangganan `projectService.projects$` → field `projects` (pola sama dengan Monitoring).
  - Helper `siteOf`/`gedungOptions`/`lantaiOptions` (pola identik dengan Monitoring).
  - `gedungChoices`/`lantaiChoices`: menyertakan **nilai lama yang tidak ada di daftar** (laporan lama tetap tampil/diedit); `openEditModal` menormalkan placeholder `—` menjadi kosong.
  - `onGedungChange()` mengosongkan Lantai; `onSiteChange()` mengosongkan Gedung & Lantai (tidak terbawa dari site sebelumnya).
- `laporan.component.html`: Gedung & Lantai menjadi `<select>` dengan opsi `— Tidak ada —`; Ruangan tetap input teks.
- `saveReport` tidak berubah (`gedung/lantai/ruangan` kosong tetap tersimpan sebagai `—`).
- Tanpa perubahan backend/API/dependency.

Yang tidak boleh rusak: mode edit laporan lama (nilai bebas atau `—` tetap tampil), validasi wajib Masalah/Tindakan, filter & ekspor Excel, dan form perangkat.

## Build steps

- [x] **Step 1 - Komponen + template + test** - Field `projects` + subscription; helper opsi & choices; reset berjenjang; select di template; `openEditModal` menormalkan `—`. Test `laporan.component.spec.ts` 1 → **5 test** (opsi mengikuti hierarki; nilai lama tetap muncul; reset berjenjang; normalisasi edit). *Hasil:* hijau.
- [x] **Step 2 - Verifikasi + mutasi** - `npm run verify` lolos; mutasi `onGedungChange` no-op → **1 test gagal**; dipulihkan.

## Bukti

- `npm run verify` (27 Sep): backend **204 pass / 0 fail / 1 skipped**; frontend **15 berkas lulus** (termasuk 5 test laporan, 4 baru), Angular build OK.
- Uji mutasi: `onGedungChange` dikosongkan sesaat → test "onGedungChange mengosongkan lantai…" **gagal**; dipulihkan → hijau.
- **Catatan lingkungan (bukan akibat perubahan ini):** test integrasi `kesetaraan agregasi MongoDB` **ter-skip** karena resolver lokal `127.0.0.1` yang dipakai c-ares Node sedang mati (`querySrv ECONNREFUSED`); adapter Windows memakai DNS yang sehat dan backend yang berjalan masih tersambung ke Atlas. Perubahan ini murni frontend.

## Verify

- `npm run verify` dari akar repo.
- Manual (pemilik): Tambah Laporan → pilih site → dropdown Gedung berisi gedung site itu → pilih gedung → dropdown Lantai berisi lantainya; ganti site → gedung & lantai ikut kosong; Ruangan tetap diketik. Buka Edit pada laporan lama (gedung di luar daftar) → nilainya tetap tampil.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser pengguna (manual di atas), dan test integrasi Mongo selama resolver lokal masih mati.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3319,"specSha256":"fdfe4617e40a117a7f97e8ed08014d54a70a37d62ac7767eab9a87ef5710e784","branch":"refs/heads/fix/dropdown-gedung-laporan","head":"a4d5833e0eac576e091cc9874eae62f0f5eaa985","baseRef":"refs/heads/main","baseCommit":"a4d5833e0eac576e091cc9874eae62f0f5eaa985","sourceTree":"f0000a6eabae81531b22c4a65f17a717914997a5","absentOptional":[]} -->
