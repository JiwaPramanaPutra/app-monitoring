# Fix: Default port router 8728 → 8729

**Type:** Fix
**Status:** verified
**Branch:** `fix/default-port-tls`
**Fixes:** F-46

## Masalah

Setiap koneksi RouterOS dari backend memakai TLS (`tls: MIKROTIK_TLS_OPTIONS`, `server.js`), yang di RouterOS berarti **api-ssl di port 8729**. Tapi default port untuk router baru masih **8728** (api biasa) di enam tempat:

| Tempat | Bentuk |
|---|---|
| `project-site.component.ts:34,139,142` | `routerConfig: { port: 8728, ... }` pada form site |
| `backend/models/Project.js:43` | `port: { type: Number, default: 8728 }` |
| `backend/server.js` (`resolveRouterConfig`) | `port: cfg.port || 8728` |
| `backend/server.js` (`getEnvRouterConfig`) | `parseInt(process.env.MIKROTIK_PORT \|\| '8728', 10)` |
| `backend/services/router-interfaces.js:73` | `toInt(pick(p.port, s.port), 8728) \|\| 8728` |

Akibatnya sebuah site yang dibuat dari form disimpan dengan port yang **tidak akan pernah bisa connect**, dan pengguna baru tahu dari pesan kegagalan di widget trafik. Ini persis kebalikan dari janji "tambah router langsung jalan".

Datanya mendukung: **kelima site yang ada memakai `8729`** (`223.27.147.18`, `223.27.155.58`, `223.27.155.162`, `116.66.205.246`), dan tidak ada satu pun yang memakai 8728.

**Ini perubahan default yang sudah dikirim, dan pemilik aplikasi memberi keputusan eksplisit: pakai 8729.**

## Perbaikan

- Ganti default 8728 menjadi 8729 di keenam tempat, dengan komentar singkat bahwa backend selalu memakai TLS sehingga api-ssl (8729) yang benar.
- Simpan sebagai beberapa nilai, bukan satu konstanta bersama: frontend dan backend tidak berbagi modul, dan menambah lapisan konfigurasi untuk satu angka tidak sebanding. Yang mengunci kebenarannya adalah test, bukan konstanta.
- Test: `mergeProbeCredentials` (murni, sudah teruji) harus memakai 8729 saat port tidak dikirim, dan tetap menghormati port yang dikirim. `getEnvRouterConfig` tidak dapat diuji tanpa server, jadi tidak diklaim.

Yang tidak boleh berubah: port yang **tersimpan** pada site yang sudah ada (semuanya 8729) tidak tersentuh; `displayPort` (8291, halaman web router) tetap; site yang sengaja memakai port lain tetap dihormati.

## Build steps

- [x] **Step 1 - Default jadi 8729 di keenam tempat** - Form site, model Project, dua tempat di `server.js`, dan `router-interfaces.js`. *Done when:* grep tidak menemukan lagi default 8728 sebagai port koneksi; `npm run verify` lolos.
- [x] **Step 2 - Test mengunci 8729** - Kasus untuk `mergeProbeCredentials` tanpa port dan dengan port eksplisit. *Done when:* mengembalikan default ke 8728 menggagalkan test; `npm run verify` lolos.

## Verify

- `npm run verify`.
- Bukti test menggigit: kembalikan default `mergeProbeCredentials` ke 8728 dan pastikan test gagal.
- Bukti tidak ada regresi: kelima site yang ada tetap memakai `8729` (tidak ada data yang berubah), dan form site baru menampilkan `8729` di kolom port.

## Catatan jujur soal proses

Perubahan ini tujuh baris. Siklus penuh `/fix` → `/implement` → `/complete` untuk tujuh baris itu adalah upacara yang lebih besar daripada perubahannya. Yang benar-benar berharga di sini cuma dua: nilainya diubah konsisten, dan ada test yang menahan orang mengembalikannya. Selebihnya biaya. Tetap dijalankan supaya riwayatnya tidak berlubang, tapi jangan dianggap proporsional.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3319,"specSha256":"5e0b342b4ac460ff8e3fb43f39456041474665daecdced8c7d32b681e1c5ed07","branch":"refs/heads/fix/default-port-tls","head":"c0f66424da2836f7012db0eeb400c0d85e381a11","baseRef":"refs/heads/main","baseCommit":"c0f66424da2836f7012db0eeb400c0d85e381a11","sourceTree":"bc6c12f408db764a16907b5f5219cb326efa6b4f","absentOptional":[]} -->
