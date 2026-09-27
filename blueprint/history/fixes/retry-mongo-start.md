# Fix: Retry koneksi Mongo saat start (F-25)

**Type:** Fix
**Status:** verified
**Branch:** fix/retry-mongo-start
**Fixes:** F-25

## Masalah

F-25 (ledger, P2): restart host/daemon Docker bisa membuat backend siap **sebelum** mongod menerima koneksi. Selama `mongoose.connection.readyState !== 1`, semua endpoint data memilih penyimpanan JSON lokal — data lama muncul, dan yang disimpan pada jendela itu tidak pernah masuk MongoDB. Kode lama melakukan `mongoose.connect` sekali dengan `serverSelectionTimeoutMS: 3000`, tanpa retry, sementara listener HTTP langsung menyala (`server.js`).

Bukti nyata (26 Sep): saat nodemon me-reload backend, UI sempat menampilkan proyek/perangkat lama dari fallback JSON (`POLTEKKES KEMENKES BALI`, "p"), lalu kembali sendiri setelah Mongo tersambung — persis jendela F-25. Satu laporan uji yang dibuat pada jendela itu hanya tersimpan di JSON (kini sudah dihapus atas keputusan pemilik).

## Perbaikan

- Modul baru `backend/services/mongo-startup.js`: `connectWithRetry({connect, timeoutMs, retryDelayMs, onRetry, onGiveUp, sleep, now})` — percobaan pertama selalu jalan; retry tiap 3 dtk sampai jendela 45 dtk habis; menyerah dengan log jelas. Murni (bisa dites tanpa Mongo & timer nyata).
- `backend/server.js`:
  - Koneksi awal memakai `connectWithRetry` (`MONGO_CONNECT_TIMEOUT_MS = 45000`, `MONGO_RETRY_DELAY_MS = 3000`).
  - **Listener HTTP dan kedua worker latar (collector trafik + pinger perangkat) baru dinyalakan setelah status Mongo jelas** lewat `bootstrap()`. Tidak ada lagi jendela "server menjawab tapi Mongo belum siap" yang menyajikan/menyimpan ke JSON lama.
  - Tanpa `MONGO_URI` (mode offline yang disengaja): perilaku lama — peringatan lalu langsung jalan, tanpa retry.
- Ledger: F-25 ditandai **fixed** dengan catatan resolusi (menunggu re-review `/audit`). P2 — tidak memblokir `/complete`, tetap tinggal di ledger.
- Tanpa dependency baru.

Yang tidak boleh rusak: mode offline tanpa `MONGO_URI`; endpoint dan worker yang ada; test lama.

## Build steps

- [x] **Step 1 - Helper + test** - `services/mongo-startup.js` + `test/mongo-startup.test.js` (4 test): sukses langsung tanpa jeda; gagal 2× lalu sukses (jeda & `onRetry` benar); menyerah saat jendela habis dengan jumlah percobaan/jeda benar; `timeoutMs 0` tetap satu percobaan. *Hasil:* hijau.
- [x] **Step 2 - Wiring bootstrap** - Import helper; blok connect diganti `initializeMongo()`; panggilan worker di tengah berkas dihapus; `bootstrap()` menjalankan `initializeMongo()` → worker → `app.listen`. *Hasil:* `node --check` lulus; smoke start terkendali membuktikan urutannya.
- [x] **Step 3 - Ledger F-25 fixed** - Status diubah + catatan resolusi ditambahkan.
- [x] **Step 4 - Verifikasi penuh + mutasi** - `npm run verify` hijau; mutasi retry dimatikan → 2 test gagal; dipulihkan.

## Bukti

- `npm run verify` (27 Sep): backend **207/207** (0 fail; 203 → +4 test retry), frontend **144/144** (14 berkas), Angular build OK.
- Smoke start terkendali (PORT 3999, `DATA_DIR` sementara, Telegram dimatikan lewat env kosong; proses dihentikan setelah 7 dtk): stdout berurutan `✅ MongoDB Connected successfully.` → `Nadi Backend running on http://localhost:3999`; proses hidup; stderr kosong. Inilah buktinya listener tidak lagi mendahului koneksi Mongo.
- Uji mutasi: `if (now() >= deadline)` diganti `if (true)` sesaat → **2 test gagal** ("gagal dua kali lalu sukses" dan "menyerah … jumlah percobaan"); dipulihkan → hijau.
- `node --check backend/server.js` dan `node --check backend/services/mongo-startup.js` lulus.
- Ledger: F-25 `fixed` + catatan resolusi.

## Verify

- `npm run verify` dari akar repo.
- Manual (pemilik): dengan MongoDB hidup, restart backend → tidak ada jendela data JSON lama (server baru menjawab setelah Mongo siap); dengan Mongo sengaja tak tersedia, log menunggu sampai ~45 dtk lalu menyatakan mode offline dengan jelas.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: restart race Docker/host sungguhan (Docker tidak terpasang).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4018,"specSha256":"c6037e2c2813ffaa8d010da109e60c72a203aebb3e3bb0a8205c5a9a97b19a7d","branch":"refs/heads/fix/retry-mongo-start","head":"3e689217acaa17e1991668664267f738d446e69f","baseRef":"refs/heads/main","baseCommit":"3e689217acaa17e1991668664267f738d446e69f","sourceTree":"c052481d087629e886d478568ee139916ff2ffdc","absentOptional":[]} -->
