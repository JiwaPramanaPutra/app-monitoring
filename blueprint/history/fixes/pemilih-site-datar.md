# Fix: Pemilih site jadi daftar datar + pencarian

**Type:** Fix
**Status:** verified
**Branch:** fix/pemilih-site-datar

## Masalah

Komponen pemilih site (`frontend/src/app/components/site-dropdown/`) menampilkan pohon bertingkat **Proyek → Site → Gedung → Lantai** dari `siteTree$`. Akibat yang dikeluhkan pemilik (video 27 Sep 07:06, modal "Tambah Laporan Baru"):

- Site yang punya gedung **tidak bisa diklik langsung** — harus ditelusuri sampai level gedung/lantai dulu (`(click)="!hasChildren(node) && select(node)"`).
- Level gedung/lantai memancarkan `buildingValue`, padahal **semua pemakai mengabaikannya** (`onLaporanSiteSelected` hanya memakai `siteValue`; begitu juga halaman Monitoring dan Laporan Trafik).
- Untuk sekadar memilih site, pengguna dipaksa melewati grup proyek.

Pemilik memutuskan: pemilih site menjadi **daftar datar + pencarian**; field Ruangan serta Gedung/Lantai di form Laporan tetap manual (tidak berubah).

## Perbaikan

Komponen `site-dropdown` (dipakai di 3 halaman: form Tambah/Edit Laporan, Monitoring, Laporan Trafik):

- Semua site ditampilkan **sekali klik**: daftar datar hasil flatten `siteTree$` level site saja (gedung/lantai tidak ikut).
- **Kotak pencarian** di dalam panel: menyaring berdasarkan nama site **atau** nama proyek (case-insensitive).
- Nama **proyek** tampil sebagai label kecil di kanan baris (konteks, bukan langkah navigasi).
- Pilih site → emit `{siteValue, label}` (bentuk event lama dipertahankan; `buildingValue` opsional tidak lagi dikirim) → panel menutup dan pencarian bersih.
- Klik di luar / toggle ulang menutup panel dan membersihkan pencarian.
- Level gedung/lantai dihapus dari pemilih; form perangkat tetap memakai `gedungOptions()`/`lantaiOptions()` seperti sekarang.
- CSS disederhanakan (panel + daftar scroll + kotak cari + label proyek).

Yang tidak boleh rusak: API komponen (`@Input selectedLabel`, `@Output siteSelected`), ketiga halaman pemakai, `buildSiteTree`/`extractSiteNames` di `ProjectService` (tetap dipakai service + form perangkat), dan klik-luar-menutup.

## Build steps

- [x] **Step 1 - Komponen datar + test** - `site-dropdown.component.ts/.html/.css` ditulis ulang; test baru `site-dropdown.component.spec.ts` (4 test): flatten hanya level site (bukan gedung/lantai), pencarian nama site & proyek, `select` memancarkan `siteValue`+`label` lalu menutup panel + membersihkan pencarian, `toggle` menutup + membersihkan pencarian. *Hasil:* hijau.
- [x] **Step 2 - Verifikasi + mutasi** - `npm run verify` hijau; mutasi `filteredSites` selalu mengembalikan semua site → **1 test gagal**; dipulihkan.

## Bukti

- `npm run verify` (27 Sep): backend **207/207** (0 fail), frontend **15 berkas / 148 test** (144 → +4 test pemilih site), Angular build OK.
- Uji mutasi: `filteredSites` dibuat selalu `allSites` sesaat → test "pencarian menyaring…" **gagal** (1 failure); dipulihkan → hijau.
- Spec pemilih: flatten terbukti hanya mengambil anak langsung proyek (site), bukan node gedung/lantai di bawahnya.

## Verify

- `npm run verify` dari akar repo.
- Manual (pemilik): buka **Tambah Laporan** → sekali klik pemilih langsung menampilkan semua site + kotak cari; pilih site → terisi tanpa menelusuri proyek/gedung. Cek juga pemilih di Monitoring dan Laporan Trafik.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser pengguna (manual di atas).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3389,"specSha256":"cfa4a8c57d9996db795d1f100e47d2b2d27b8b50ad01d02f0944ca9bb9d86aff","branch":"refs/heads/fix/pemilih-site-datar","head":"96c2a031364282cb0ae8ae6f81e58bdc30f8945b","baseRef":"refs/heads/main","baseCommit":"96c2a031364282cb0ae8ae6f81e58bdc30f8945b","sourceTree":"af96e121c4850ad1d8cb283d65b5c322f71af259","absentOptional":[]} -->
