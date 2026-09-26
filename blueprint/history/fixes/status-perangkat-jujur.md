# Fix: Status perangkat jangan mengklaim "Offline" tanpa bukti

**Type:** Fix
**Status:** verified
**Branch:** `fix/status-perangkat-jujur`
**Fixes:** temuan baru dari pemakaian nyata (tanpa ID di ledger; belum pernah diaudit)

## Masalah

`AP-Akademik-Lt1` (Access Point, `192.168.104.5`, site Poltekkes Gizi) tampil **Offline** di tabel perangkat padahal perangkatnya hidup. Bukti yang sudah dikumpulkan:

| Pemeriksaan | Hasil |
|---|---|
| `POST /api/ping` dari backend | `alive=false`, `Request timed out`, `Sent = 1, Received = 0, Lost = 1 (100%)`, menunggu penuh 1593 ms |
| Ping langsung dari mesin ini | tidak menjawab juga |
| Jaringan mesin ini | **`192.168.10.73/24`**, sedangkan AP di `192.168.104.5` |

Jadi yang gagal bukan perangkatnya, melainkan **kemampuan server menjangkaunya** — beda sub-jaringan, tidak ada jalur. Bukan karena timeout terlalu pendek: paketnya menunggu penuh 1,6 detik, dan perangkat LAN akan menjawab dalam milidetik. Semua perangkat lain di aplikasi memakai alamat **publik** (`223.27.147.x`, `223.27.155.x`, `116.66.205.x`), jadi hanya yang privat ini yang bermasalah.

**Akar masalah di kode — dua tempat, dua-duanya mengarang:**

1. `server.js:1100` — `const status = pingInfo.alive ? 'Online' : 'Offline'`. Tabel menyimpulkan "mati" dari satu paket ICMP yang tidak dijawab.
2. `server.js:976` — pinger menginisialisasi `devicePingState[d.ip] = { fails: 0, status: 'Online' }` **tanpa bukti apa pun**. Karena status awalnya sudah `'Online'`, syarat di `:994` (`fails >= 3 && status === 'Online'`) lolos, sehingga perangkat yang **belum pernah** terlihat hidup dicap Offline **dan** memicu notifikasi Telegram `[OFFLINE]`.

Ini kelas yang sama dengan yang sudah diperbaiki di widget trafik: di sana **"Tidak Terpantau"** (aplikasi kehilangan visibilitas) sudah dipisahkan dari **"Interface down"** (gangguan sungguhan), dan yang pertama tidak menurunkan uptime. Tabel perangkat belum punya pemisahan itu.

Prinsipnya: ICMP yang gagal dari server hanya membuktikan **satu** hal — server tidak bisa menjangkau perangkat. Itu bukan bukti perangkatnya mati.

## Perbaikan

Model klaim yang dipakai, sesuai keputusan pemilik aplikasi:

- ping **berhasil** → `Online` (bukti langsung)
- ping **gagal**, tapi perangkat **pernah** terlihat hidup → `Offline` (klaim nyata, berbasis bukti)
- ping **gagal** dan perangkat **belum pernah** terlihat hidup → **`Tidak Terpantau`** (tidak mengklaim apa pun)

Yang dikerjakan:

- **Ekstrak keputusannya jadi fungsi murni** di `backend/services/device-status.js` supaya bisa diuji tanpa server: satu fungsi untuk status yang boleh ditampilkan, satu untuk memajukan state pinger (ambang gagal + kapan notifikasi layak dikirim).
- **Pinger memakai state awal yang jujur** (belum tahu), sehingga notifikasi Telegram hanya dikirim saat perangkat **benar-benar** berpindah dari terlihat-hidup ke tidak menjawab — bukan untuk perangkat yang sejak awal tidak terjangkau.
- **`/api/devices/status` memakai fungsi yang sama**, bukan perhitungan sendiri, sehingga tabel dan pinger tidak bisa berbeda pendapat.
- **UI mengenali status ketiga**: titik dan teksnya abu-abu (`#9AA0A6`, warna "tanpa data" yang sudah dipakai aplikasi), bukan merah. Baris berlatar merah tetap hanya untuk `Offline` yang terbukti. Filter "Perangkat Down / Offline" **tidak** ikut menampilkan `Tidak Terpantau` — itu bukan perangkat down.

Yang tidak boleh berubah: perangkat yang benar-benar pernah Online lalu mati tetap tampil `Offline` merah dan tetap memicu notifikasi; perangkat yang pulih tetap memicu notifikasi `[ONLINE]`; filter down tetap bekerja untuk `Offline`.

**Batasan yang diketahui:** bukti "pernah terlihat hidup" disimpan di memori pinger (`devicePingState`), jadi **restart backend menghapusnya** — perangkat yang mati sebelum restart akan tampil `Tidak Terpantau` sampai ia terlihat hidup lagi, bukan langsung `Offline`. Itu disengaja: menyimpannya ke dokumen perangkat berarti memakai field `status` yang default-nya `'Online'`, dan default itulah sumber kebohongan yang sedang diperbaiki. Karena pinger berjalan tiap 30 detik, perangkat yang hidup kembali normal dalam satu siklus.

## Build steps

- [x] **Step 1 - Fungsi murni + test (model klaimnya)** - `backend/services/device-status.js` berisi `claimableStatus(alive, lastKnown)` dan `advancePingState(previous, alive, threshold)`, dengan test yang menutup ketiga status, ambang gagal, dan kapan notifikasi layak dikirim. *Done when:* "gagal ping tanpa riwayat hidup" menghasilkan `Tidak Terpantau` dan `notify: false`; `npm run verify` lolos.
- [x] **Step 2 - Backend memakai fungsi itu (dua tempat)** - Pinger memakai `advancePingState` (state awal jujur, notifikasi hanya saat transisi nyata); `/api/devices/status` memakai `claimableStatus`. *Done when:* perangkat yang belum pernah terjangkau tidak lagi tampil `Offline` dan tidak mengirim notifikasi; perangkat yang pernah Online lalu gagal tetap `Offline` + notifikasi; `npm run verify` lolos.
- [x] **Step 3 - UI mengenali status ketiga** - Perluas tipe di komponen dan beri cabang ketiga pada titik/teks status (tabel, panel detail). *Done when:* `Tidak Terpantau` tampil abu-abu, tidak merah, dan tidak masuk filter down; `npm run verify` lolos.

## Verify

- `npm run verify`.
- **Bukti nyata yang sudah ada:** perangkat `AP-Akademik-Lt1` (`192.168.104.5`) adalah kasus uji hidup — dari mesin ini ia memang tidak terjangkau, jadi setelah perbaikan ia harus tampil **`Tidak Terpantau`**, bukan `Offline`. Periksa lewat `/api/devices/status` dan di tabel.
- Periksa log/notifikasi: tidak ada notifikasi `[OFFLINE]` lagi untuk perangkat itu.
- Regresi yang harus dibuktikan tidak terjadi: perangkat yang **pernah** Online lalu berhenti menjawab tetap `Offline` + notifikasi. Bisa diuji dengan menghentikan ping ke perangkat yang saat ini Online (mis. cabut salah satu yang memang bisa diakses) tanpa mengubah data.
- Bukti test menggigit: buat `claimableStatus(false, 'Online')` mengembalikan `Tidak Terpantau` (model lama) dan pastikan test gagal.

## Bukti yang sudah dikumpulkan saat implementasi

Kasus nyata yang dilaporkan pengguna, diukur langsung lewat `/api/devices/status`:

| Perangkat | IP | Sebelum | Sesudah |
|---|---|---|---|
| **AP-Akademik-Lt1** | `192.168.104.5` | `Offline` (salah) | **`Tidak Terpantau`** |
| Access Point RB450 | `223.27.147.18` | Online | Online, 6 ms |
| Router Gigi | `116.66.205.246` | Online | Online, 5 ms |
| Router Gigi | `223.27.155.58` | Online | Online, 5 ms |
| Router Kebidanan | `223.27.155.162` | Offline (ECONNREFUSED) | Online, 11 ms |

Semua perangkat beralamat publik tetap menjawab dan tetap `Online`, jadi model barunya tidak mematikan sinyal Offline yang asli.

**Belum dibuktikan secara langsung:** transisi `Online` -> `Offline` pada perangkat nyata (butuh mematikan salah satu router, tidak dilakukan). Itu ditutup oleh test `advancePingState`: ambang tiga kegagalan, notifikasi hanya saat transisi, dan status `Tidak Terpantau` yang tidak pernah berubah menjadi `Offline` tanpa riwayat hidup.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":7061,"specSha256":"1c6d71c67395ea10ec25423b7c78bb5b5334a8ca77554fd9e2e22683f7ee34b4","branch":"refs/heads/fix/status-perangkat-jujur","head":"6d04b22a9d5d86c594a28c05a2a9af4898827cbe","baseRef":"refs/heads/main","baseCommit":"6d04b22a9d5d86c594a28c05a2a9af4898827cbe","sourceTree":"46e7450bbfcd53839414108398937b6d07e19cac","absentOptional":[]} -->
