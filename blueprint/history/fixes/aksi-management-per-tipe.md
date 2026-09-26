# Fix: "Buka Management" menawarkan aksi yang benar per tipe perangkat

**Type:** Fix
**Status:** verified
**Branch:** `fix/aksi-management-per-tipe`
**Fixes:** lanjutan dari `url-management` (Buka Management), temuan baru tanpa ID

## Masalah

Setelah `4f395be`, tombol "Buka Management" sudah membuka URL yang benar, tapi masih **satu aksi untuk semua tipe**. Pemilik aplikasi benar: router MikroTik idealnya langsung ke Winbox, AP TP-Link ke browser, AP Ruijie yang terdaftar di cloud ke portal cloud-nya.

**Hasil audit — dan ini yang menentukan desain:**

| Skema | Handler di Windows mesin ini |
|---|---|
| `winbox` | **tidak terdaftar** |
| `winbox64` | **tidak terdaftar** |
| `ssh` | tidak terdaftar |
| `telnet` | terdaftar (bawaan Windows) |

Padahal **Winbox terpasang** (`C:\Users\Jiwa Pramana\Downloads\winbox64.exe`). Jadi "direct ke Winbox" hari ini berarti tombol yang **tidak melakukan apa-apa** — browser menolak skema yang tidak dikenali. Itu kelas yang sama dengan yang sudah kita hapus berulang kali: tombol yang terlihat bekerja, padahal tidak.

Fakta kedua: **Ruijie Cloud tidak bisa ditebak** — tautannya butuh ID perangkat yang hanya diketahui dari dashboard cloud. Aplikasi ini tidak punya datanya dan tidak bisa menebaknya.

## Perbaikan

- **`managementActions(device)`** di `shared/management-url.ts` mengembalikan **daftar aksi**, bukan satu URL:
  - **Aksi utama selalu web** — URL yang diisi pengguna, atau turunan merek. Labelnya menyesuaikan: kalau URL-nya host IP → **"Buka Web Console"**, kalau bukan (mis. domain cloud) → **"Buka Portal Cloud"**. Ini yang menjawab kasus Ruijie Cloud tanpa menebak apa pun.
  - **Winbox hanya untuk merek MikroTik**, sebagai aksi **kedua**, dengan catatan wajib bahwa ia butuh handler `winbox://` terpasang. Tidak disembunyikan, tidak juga dijadikan satu-satunya jalan.
- **Modal Management menampilkan aksi-aksi itu sebagai tombol**, masing-masing dengan catatannya. Tidak ada tombol yang ditawarkan kalau URL-nya tidak bisa ditentukan.
- `openExternalManagement` menjadi `openManagementAction(action)` yang membuka URL aksi mana pun.

Yang tidak boleh berubah: `managementUrlFor` (dipakai label modal), tes ping ICMP, dan perilaku perangkat tanpa URL Management.

## Build steps

- [x] **Step 1 - `managementActions` + test** - Daftar aksi per perangkat, label web-vs-cloud dari host URL, Winbox hanya untuk MikroTik, dan catatannya ada. *Done when:* `npm run verify` lolos.
- [x] **Step 2 - Modal memakai daftar itu** - Tombol per aksi, bukan satu tombol tetap. *Done when:* MikroTik menampilkan dua aksi, non-MikroTik satu, dan perangkat tanpa URL/ IP tidak menampilkan tombol; `npm run verify` lolos.

## Verify

- `npm run verify`.
- Bukti test menggigit: paksa `managementActions` menawarkan Winbox untuk semua merek dan pastikan test gagal.
- Bukti nyata: perangkat `Access Point RB450` (MikroTik, `223.27.147.18`) harus menampilkan **dua** aksi; `AP-Akademik-Lt1` (TP-Link) **satu**, tanpa tombol Winbox.
- Catatan jujur yang harus tetap ada di UI: Winbox hanya berfungsi bila handler `winbox://` terpasang — di komputer ini ia **tidak** terpasang meski Winbox terpasang, dan itu sudah diverifikasi dari registri Windows.

## Bukti saat implementasi

- `managementActions` + 7 test baru (19 total di berkas itu). `npm run verify`: backend 168/168, frontend 135/135, Angular build OK.
- Handler `winbox://` **tidak ada di HKCR** meski Winbox terpasang — diverifikasi langsung dari registri Windows, jadi aksi Winbox ditawarkan sebagai aksi KEDUA dengan catatan wajib, bukan sebagai satu-satunya jalan.
- Uji mutasi sudah dijalankan: menghapus gerbang merek MikroTik menggagalkan **2 test**, termasuk "merek non-MikroTik tidak pernah mendapat aksi Winbox". Gerbangnya benar-benar terkunci.
- **Belum:** bukti di UI hidup — hanya build yang membuktikan template-nya kompilasi.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3873,"specSha256":"72fe6e59f7ce92460583f0ade574a2ccbb57db2c0955e910c49d6787fe4949ca","branch":"refs/heads/fix/aksi-management-per-tipe","head":"4f395bece72ac4b44678aee73d67c22d228fefa7","baseRef":"refs/heads/main","baseCommit":"4f395bece72ac4b44678aee73d67c22d228fefa7","sourceTree":"eb5b64ceb597f829da12e08d0f61c15e0870ac9a","absentOptional":[]} -->
