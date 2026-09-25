# Fix: Satu definisi WIB untuk seluruh backend

**Type:** Fix
**Status:** verified
**Branch:** `fix/satu-konstanta-wib`
**Fixes:** F-84

## Masalah

**F-84 [P3] — backend masih menyimpan definisi WIB yang kedua.**
`services/traffic-range.js` sengaja menurunkan sufiks `+07:00` dari konstanta UTC+7-nya supaya tidak ada dua tempat yang sama-sama mengklaim "WIB". Tapi `server.js:437` masih punya `const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;` sendiri untuk `toWIB`.

Keduanya benar hari ini — dan justru itu masalahnya. `server.js` tidak diimpor test mana pun (modulnya langsung menyalakan HTTP server), jadi mengembalikan **hanya baris 437** ke 8 jam tetap lolos `npm run verify`, sambil menggeser setiap label bucket `harian` dan `tahunan` satu jam: jam pada sumbu X grafik tidak lagi cocok dengan jam yang dihitung halaman. Reviewer independen menemukannya tepat setelah perbaikan yang menghapus kelas duplikasi yang sama di frontend.

## Perbaikan

- **`toWIB` pindah ke `services/traffic-range.js`** dan memakai konstanta UTC+7 yang sudah ada di sana, lalu diimpor `server.js`. Fungsinya yang memutuskan label jam dan bulan, jadi ia memang bagian dari aritmetika jendela.
- **Literal `WIB_OFFSET_MS` di `server.js` dihapus**, sehingga backend hanya punya satu definisi offset.
- **Test mengunci konversinya:** `toWIB` harus menghasilkan instan yang bagian UTC-nya adalah WIB, bukan waktu lokal mesin tempat test berjalan.

Yang tidak boleh berubah: label bucket `aggregateSamples` untuk semua periode, hasil `rangeBounds`, dan hasil `npm run verify` selain test yang bertambah.

## Build steps

- [x] **Step 1 - `toWIB` pindah, literal dihapus (F-84)** - Pindahkan `toWIB` ke `services/traffic-range.js`, impor di `server.js`, hapus konstanta lokalnya. *Done when:* `backend/server.js` tidak lagi memuat literal offset jam; label bucket tetap sama; `npm run verify` lolos.
- [x] **Step 2 - Test mengunci konversinya (F-84)** - Test `toWIB` untuk tengah malam WIB, tengah hari, dan pergantian hari. *Done when:* mengubah konstanta ke 8 jam menggagalkan test; `npm run verify` lolos.

## Verify

- `npm run verify`.
- Smoke tidak ada regresi: buka Laporan Trafik periode `harian` dan `tahunan` -> label jam pada sumbu X dan label bulan tetap sama seperti sebelum perubahan.
- Test menggigit: ubah konstanta ke 8 jam sementara dan pastikan test `toWIB` gagal.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2362,"specSha256":"9b23e7c1283168c29f38a864ca2b546a1519d0e1cb6081eeffb8ccb82f733dc4","branch":"refs/heads/fix/satu-konstanta-wib","head":"2d5933fe95800717c790b6591f087930fe80cc51","baseRef":"refs/heads/main","baseCommit":"2d5933fe95800717c790b6591f087930fe80cc51","sourceTree":"d9a04a12ea16b8bd5c1b66a27a45efeb3edf5511","absentOptional":[]} -->
