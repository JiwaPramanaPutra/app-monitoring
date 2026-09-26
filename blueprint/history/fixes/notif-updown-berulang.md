# Fix: Notifikasi up/down berulang

**Type:** Fix
**Status:** verified
**Branch:** fix/notif-updown-berulang

## Masalah

Bot Telegram mengirim banyak notifikasi `[OFFLINE]`/`[ONLINE]` berulang padahal jaringan kampus aman. Bukti (26 Sep, chat bot, 119 pesan belum dibaca): AP-Akademik-Lt1 (site Poltekkes Gizi) `[OFFLINE]` di 10:37, 11:05, 11:26, 12:08, 12:52, 12:59, 13:13; diselingi `[ONLINE]` perangkat lain.

Akar masalah (kode + pengukuran):

1. **Histeresis hilang**: satu paket balasan sudah cukup menjadikan perangkat "Online" (`backend/services/device-status.js:49-52`). Perangkat dengan jalur buruk — AP `192.168.104.5` diping dari server saat ini: **tidak terjangkau**; lima IP lain terjangkau — akan "Online" oleh satu balasan nyasar, lalu 3 gagal → `[OFFLINE]`; berpasangan tiap flap.
2. **State hanya di memori** (`backend/server.js:708`, key per IP). Hari ini backend restart berkali-kali (setiap edit backend memicu nodemon), memori kosong, dan siklus yang sama mengirim ulang pesan yang sama.
3. **Key per IP, bukan per perangkat**: dua device berbagi `223.27.147.18` ("Access Point RB450" Poltekkes Gizi dan "Gizi") berbagi satu state.
4. Tidak ada jarak minimum antar notifikasi per perangkat. `"Server Teknik"/"Fakultas Teknik"` di riwayat adalah pesan lama — tidak ada di data saat ini.

## Perbaikan

- `advancePingState(previous, alive, {failThreshold, okThreshold})` dengan histeresis: `Online` baru setelah **2 sukses berturut-turut**; satu balasan nyasar tidak lagi mengarm Offline. `Offline` tetap setelah 3 gagal, dan hanya dari status `Online`.
- `shouldNotify(previousMs, nowMs, cooldownMs)` baru: jarak minimum **30 menit** antar notifikasi per perangkat; pesan tetap satu per transisi.
- State **persisten**: `backend/data/device_ping_state.json` via `storage.getDevicePingState()`/`saveDevicePingState()`, dimuat saat start; `lastNotifyAt` ikut tersimpan sehingga restart tidak memutar ulang.
- State di-key per identitas perangkat (`deviceStateKey`: `_id` → `id` → `ip`) di pinger dan di `/api/devices/status`.
- Format pesan, `claimableStatus`, aturan "yang belum pernah hidup tidak pernah Offline", dan mode JSON lokal tidak berubah. Tanpa dependency baru.

## Build steps

- [x] **Step 1 - Helper murni + test** - Histeresis/`shouldNotify`/`deviceStateKey` di `services/device-status.js`; `test/device-status.test.js` diperbarui (pulih butuh 2 sukses; 1 balasan nyasar tidak mengarm Offline; cooldown; key per identitas). *Hasil:* test hijau.
- [x] **Step 2 - Persistensi state** - `storage.js` memuat/menyimpan `device_ping_state.json`; test baru `test/storage-ping-state.test.js` membuktikan muat-saat-start dan simpan-ke-disk. *Hasil:* hijau.
- [x] **Step 3 - Wiring server** - Pinger memakai `deviceStateKey` + opsi histeresis + cooldown `lastNotifyAt` + simpan tiap siklus; `/api/devices/status` memakai key yang sama.
- [x] **Step 4 - Verifikasi penuh + bukti** - `npm run verify` hijau; uji mutasi 4 test gagal. Rincian di bawah.

## Bukti

- `npm run verify` (26 Sep): backend **203/203** (0 skipped, integrasi Mongo jalan; 195 → +8 test baru), frontend **144/144**, Angular build OK.
- Uji mutasi ganda (sesaat): `DEFAULT_SUCCESS_THRESHOLD = 1` **dan** `shouldNotify` dibuat selalu `true` → **4 test gagal** (histeresis ×3, cooldown ×1); dipulihkan → hijau.
- Bukti live (opsional, saat backend berjalan): `backend/data/device_ping_state.json` terisi — state lintas-restart tidak lagi kosong.

## Verify

- `npm run verify` dari akar repo.
- Manual (pemilik): pantau chat bot setelah deploy — tidak ada lagi OFFLINE/ONLINE berulang untuk AP yang flaky; minimal 30 menit antar pesan per perangkat; restart backend tidak memicu pesan ulang.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: perilaku ping nyata di jaringan pengguna.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3806,"specSha256":"6a56509274b6e021d39d0273fceff2728c6cbbe419c37abbd5db64ddbd58fed5","branch":"refs/heads/fix/notif-updown-berulang","head":"b115bffece7df175f95b854256b1cea791aeef39","baseRef":"refs/heads/main","baseCommit":"b115bffece7df175f95b854256b1cea791aeef39","sourceTree":"7ef453f781a299290f9acf40067b200beb2e3f22","absentOptional":[]} -->
