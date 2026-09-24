# Fix: Live update daftar di mode zoneless

**Type:** Fix
**Status:** verified
**Branch:** `fix/live-update-daftar-di-mode-zoneless`

## Masalah

Aplikasi berjalan zoneless (tanpa `zone.js`): callback async tidak otomatis memicu render, jadi komponen harus memanggil `ChangeDetectorRef.markForCheck()`. Tiga subscription observable `ProjectService` mengubah state komponen tanpa memanggilnya:

- `frontend/src/app/pages/project-site/project-site.component.ts:44` (`projects$`)
- `frontend/src/app/pages/laporan/laporan.component.ts:60` (`sites$`)
- `frontend/src/app/components/site-dropdown/site-dropdown.component.ts:39` (`siteTree$`)

Gejala saat dipakai (dilaporkan user):
- Setelah menyimpan project/site, item baru tidak muncul di daftar sampai ada klik lain (mis. membuka modal "Tambah Project" lagi).
- Setelah reload halaman, daftar project/site/gedung tampak kosong sampai ada klik — seperti data hilang, padahal datanya tersimpan di server.

Lolos dari test karena suite yang ada hanya unit test (fungsi murni + service), bukan test rendering komponen.

## Perbaikan

Panggil `this.cdr.markForCheck()` di dalam tiap subscription di atas — pola yang sudah dipakai di `monitoring.component.ts` dan `laporan-trafik.component.ts`. Tidak ada dependency baru, perubahan `ProjectService`, atau perubahan kontrak API.

Yang tidak boleh rusak: alur simpan/hapus project, site, gedung, lantai (modal tetap tertutup, pesan error tetap tampil), pemuatan awal halaman, filter laporan, dan dropdown site.

## Build steps

- [x] **Step 1 - Tambah markForCheck di subscription yang mengubah state** - project-site, laporan, site-dropdown; sekalian sweep memastikan tidak ada subscription komponen lain dengan pola sama di luar yang sudah aman (`monitoring`, `laporan-trafik`, handler `queryParams`, dan handler simpan/hapus project-site yang memanggil `detectChanges()`). *Done when:* simpan project/site langsung tampil di daftar tanpa klik tambahan; reload `/project-site` langsung menampilkan daftar; `npm run verify` lolos.

## Verify

- `npm run verify` (backend + frontend test + build).
- Smoke manual: (1) buka `/project-site` -> daftar terisi tanpa klik apa pun; (2) tambah project -> langsung muncul; (3) tambah site -> langsung muncul; (4) reload halaman -> daftar tetap terisi; (5) buka halaman Laporan -> pilihan site terisi; (6) dropdown site di halaman Monitoring -> pohon site terisi saat dibuka.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2412,"specSha256":"84a0833d101dee5a083c3b5f3459ce45fdf17c5e5bd6a4886ecf5e6ffb4a7350","branch":"refs/heads/fix/live-update-daftar-di-mode-zoneless","head":"5e3d111cf99d01f4a0592f1482f9056e3551c6b9","baseRef":"refs/heads/main","baseCommit":"5e3d111cf99d01f4a0592f1482f9056e3551c6b9","sourceTree":"c2f8951b4777953a646ff994aa2a0697163b998f","absentOptional":[]} -->
