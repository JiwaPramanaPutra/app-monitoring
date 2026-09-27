# Fix: Lebar pemilih site sama dengan kolom form

**Type:** Fix
**Status:** verified
**Branch:** fix/pemilih-site-selebar-kolom

## Masalah

Di modal **Tambah Laporan**, trigger pemilih site menyusut mengikuti panjang teksnya (mis. "Poltekkes Gizi"), sedangkan field **Gedung** dan **Lantai** di bawahnya selebar kolom. Hasilnya baris form tampak tidak rata (tangkapan layar pemilik).

## Perbaikan

- `site-dropdown.component.ts`: `@Input() fullWidth = false`.
- `site-dropdown.component.html`: wrapper memakai `[class.full-width]="fullWidth"`.
- `site-dropdown.component.css`:
  - `.site-dropdown-wrapper.full-width { display: block; width: 100%; }`
  - `.site-dropdown-wrapper.full-width .site-dropdown-trigger { width: 100%; }`
  - `.site-dropdown-wrapper.full-width .chevron { margin-left: auto; }` (panah tetap di ujung kanan seperti select).
- `laporan.component.html`: pemilih site di modal memakai `[fullWidth]="true"`.
- Toolbar di **Monitoring** dan **Laporan Trafik** tidak berubah (tetap auto-width).
- Tanpa perubahan backend/API/dependency; murni presentasional (tanpa logika perhitungan baru).

Yang tidak boleh rusak: daftar datar + pencarian, sisi buka panel adaptif (kiri/kanan), emit `{siteValue, label}`, dan 7 test pemilih site tetap lulus.

## Build steps

- [x] **Step 1 - Input fullWidth + pemakaian di modal** - Input, kelas CSS, dan `[fullWidth]="true"` di `laporan.component.html`. *Hasil:* test yang ada tetap lulus.
- [x] **Step 2 - Verifikasi** - `npm run verify` hijau (rincian di Bukti).

## Bukti

- `npm run verify` (27 Sep): frontend **15 berkas lulus** (7 test pemilih site tetap hijau), Angular build OK; backend **204 pass / 0 fail / 1 skipped** (integrasi Mongo ter-skip karena kondisi DNS lokal `127.0.0.1` — bukan akibat perubahan ini).
- Perubahan presentasional murni: tidak ada logika baru untuk diuji mutasi; perilaku (daftar/pencarian/sisi panel) tetap dijaga test yang sudah ada.
- Tidak ada perubahan posisi field/panel — hanya lebar trigger di dalam form.

## Verify

- `npm run verify` dari akar repo.
- Manual (pemilik): buka **Tambah Laporan** → trigger Site selebar field Gedung/Lantai, panah di ujung kanan; posisi tidak bergeser; panel dropdown tetap tampil utuh (kiri/kanan sesuai ruang).
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser pengguna (manual di atas).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2350,"specSha256":"530850adafdf459d8b7b768e71510bb34644a47ad8ee3130baa0396bba36e091","branch":"refs/heads/fix/pemilih-site-selebar-kolom","head":"98408464bf46c3148afb25469d1c0a8deaa41873","baseRef":"refs/heads/main","baseCommit":"98408464bf46c3148afb25469d1c0a8deaa41873","sourceTree":"1c7d8a2cd3adfe77bb2001cc95318e50afe98324","absentOptional":[]} -->
