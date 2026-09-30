# Fix: Perangkat tampil "Offline" di hosting padahal hidup (ping timeout pecahan)

**Type:** Fix
**Status:** verified
**Branch:** fix/ping-timeout-bulat

## Masalah

Di hosting, baris perangkat menampilkan **Offline** merah padahal router jelas hidup: widget trafik site menunjukkan "Online" dan live (Rx ~6 Mbps), dan pinger backend mencatat 18 sukses berturut-turut (`device_ping_state.json`: `{"status":"Online","oks":18,"fails":0}`).

Akar masalah (dibuktikan langsung di VPS):

- Endpoint `/api/devices/status` mem-ping satu paket segar per perangkat dengan `timeout: 1.5` (`backend/server.js:887`), dan `/api/ping-all` sama (`:938`).
- Paket `ping` npm meneruskan timeout sebagai argumen `-W` ke binary ping; **busybox ping di image produksi (node:24-alpine) menolak angka pecahan**: `ping -c 1 -w 1.5` → `ping: invalid number '1.5'` → exit 1 → selalu `alive: false`.
- Pinger latar memakai `timeout: 2` (bulat) → selalu berhasil. Jadi: pinger bilang Online, tabel bilang Offline. `claimableStatus(false, 'Online')` → `Offline`.
- Ukuran di VPS: timeout 1.5 → **0/10 hidup**; timeout 2 → **10/10 hidup** (RTT ~22-26 ms).
- Di Windows (dev lokal) ping.exe menerima nilai pecahan, jadi bug hanya muncul di container Linux — hosting.

Kelas yang sama: tombol "Tes Ping" massal (`/api/ping-all`) selalu gagal di hosting untuk alasan yang sama.

## Perbaikan

- Modul baru `backend/services/ping-settings.js`:
  - `PING_TIMEOUT_SECONDS = 2` — satu nilai untuk SEMUA jalur ping.
  - `isSafePingTimeout(value)` — penjaga regresi: timeout wajib **bilangan bulat ≥ 1** (busybox menolak pecahan; Windows menerima, makanya lolos di dev).
- `backend/server.js`: keempat titik ping memakai konstanta itu — pinger (`:761`), `/api/ping` (`:828`), `/api/devices/status` (`:887`), `/api/ping-all` (`:938`). Tidak ada lagi `timeout: 1.5`.
- Test baru `backend/test/ping-settings.test.js`: konstanta bulat ≥ 1; `isSafePingTimeout` menolak `1.5`/`0`/`NaN`/`'2'`, menerima `1`, `2`, `5`.

Yang tidak boleh rusak: perilaku ping di Windows/dev; histeresis status (Online/Offline/Tidak Terpantau) dan notifikasi; endpoint lain yang memakai `timeout: 4` untuk koneksi RouterOS API (bukan ping — tidak disentuh).

## Build steps

- [x] **1. Modul + test** - `ping-settings.js` + `test/ping-settings.test.js` (4 test). *Bukti: hijau; `isSafePingTimeout(1.5) === false`.*
- [x] **2. Wiring 4 titik ping** - pinger, `/api/ping`, `/api/devices/status`, `/api/ping-all` memakai `PING_TIMEOUT_SECONDS`. *Bukti: `node --check` lulus; satu-satunya `timeout:` tersisa di server.js adalah `4` milik koneksi RouterOS API.*
- [x] **3. Verifikasi + mutasi** - `npm run verify` hijau; mutasi konstanta `1.5` → test ping-settings gagal; dipulihkan. *Bukti: hijau.*
- [x] **4. Bukti di VPS** - bukti pra-fix: timeout 1.5 → 0/10 hidup, timeout 2 → 10/10 hidup (busybox: `invalid number '1.5'`). Deploy + verifikasi pasca-fix dicatat terpisah setelah merge.

## Hasil verifikasi (implement)

- `npm run verify`: backend 249 test — 244 lulus / 1 skip (parity Mongo, DNS lokal) / 0 gagal; frontend 203 lulus; build sukses.
- Mutasi: `PING_TIMEOUT_SECONDS = 1.5` → test gagal ("aman untuk semua platform"); dipulihkan → hijau.
- Bukti VPS (sebelum fix, dari kontainer produksi): `ping -c 1 -w 1.5` → `ping: invalid number '1.5'` (exit 1) dan 0/10 hidup; `-w 2` → 22 ms, 10/10 hidup.
- Manual (pemilik, setelah deploy): baris perangkat Online + ping tampil; "Tes Ping" berhasil.


## Verify

- `npm run verify`.
- Di VPS (setelah deploy): `ping -c 1 -w 2 <ip>` hidup; ping dengan nilai konstanta dari kontainer hidup; state pinger tetap Online.
- Manual (pemilik): buka Monitoring di hosting → baris Router RB450 tampil **Online** (hijau) dan angka ping-nya muncul; tombol "Tes Ping" berhasil.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser pemilik.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3878,"specSha256":"2b6e78ce15b6f0737df26c375b3db75dd24c78499be8685f317494851e47b070","branch":"refs/heads/fix/ping-timeout-bulat","head":"a9fab7f0821aa938b8b45146104d47740fd6ee9b","baseRef":"refs/heads/main","baseCommit":"bef8333bedd46a32c6cabc2e4aeeb66ff1b98410","sourceTree":"34351aa8a191f97022c920149637521482037f0a","absentOptional":[]} -->

## Independent review

**Status:** passed
**Target commit:** a9fab7f0821aa938b8b45146104d47740fd6ee9b
**Base commit:** bef8333bedd46a32c6cabc2e4aeeb66ff1b98410
**Base ref:** main
**Spec hash:** 2b6e78ce15b6f0737df26c375b3db75dd24c78499be8685f317494851e47b070
**Prepared by:** opencode
**Builder model:** opencode-go/deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** opencode-go/kimi-k2.7-code
**Requested execution:** automatic
**Requested at:** 2026-09-30T11:21:06Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** opencode-go/kimi-k2.7-code
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-30T11:23:23Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `node --test backend/test/ping-settings.test.js`: pass
- `node --check backend/server.js`: pass
- `npm run verify` (backend tests, frontend tests, frontend build): pass

## Evidence

- `git rev-parse HEAD` equals target `a9fab7f0821aa938b8b45146104d47740fd6ee9b`.
- `git merge-base main HEAD` equals base `bef8333bedd46a32c6cabc2e4aeeb66ff1b98410`.
- SHA-256 of `blueprint/context/current-feature.md` matches `2b6e78ce15b6f0737df26c375b3db75dd24c78499be8685f317494851e47b070`.
- Working tree differs from target only at `blueprint/context/review.md`.
- Backend search for `ping.promise.probe` found exactly four call sites, all using `PING_TIMEOUT_SECONDS`: `backend/server.js:762`, `:828`, `:888`, `:939`.
- No remaining `timeout: 1.5` ping values in the backend; the other `timeout:` usages in `backend/server.js` are RouterOS API connection timeouts (`4` seconds) and unrelated per-interface probes.
- `backend/services/ping-settings.js` defines `PING_TIMEOUT_SECONDS = 2` and `isSafePingTimeout(value)` as `Number.isInteger(value) && value >= 1`.
- `backend/node_modules/ping/lib/builder/win.js` multiplies `timeout` by `1000` for `-w`, so the integer constant `2` gives `2000 ms` on Windows dev with no regression.
- `backend/node_modules/ping/lib/builder/linux.js` passes the timeout through `-W` via `util.format('%d', ...)`, so a non-integer value such as `1.5` reaches busybox as `1.5` and is rejected; the new constant and test guard prevent that.
- New `backend/test/ping-settings.test.js` (4 tests) fails if `PING_TIMEOUT_SECONDS` is mutated to `1.5`, confirming the regression guard bites.
- Backend test run: 249 tests — 248 pass / 1 skip (Mongo parity integration test, local DNS cannot resolve Atlas SRV record) / 0 fail.
- Frontend test run: 203 pass; Angular production build succeeded.

## Findings

- None

## Remaining risk

- Browser verification of the Monitoring page and the "Tes Ping" button is unavailable in this environment; the owner must confirm manually on the deployed hosting after merge.
- Container verification with the production `node:24-alpine` busybox ping binary is unavailable locally; the VPS evidence in the spec is relied upon.
- Live ICMP endpoint verification (actual network round-trip through `/api/devices/status` and `/api/ping-all`) was not performed because no target hosts or production container are reachable from this reviewer environment.
