# Fix: Kunci perangkat dan menu baris

**Type:** Fix
**Status:** verified
**Branch:** `fix/kunci-perangkat-dan-menu-baris`
**Fixes:** F-43, F-44, F-47

## Masalah

Dua temuan sisa dari review independen, keduanya akibat kunci identitas perangkat
yang tidak konsisten. Di deployment ini sumber datanya MongoDB, dan dokumen
`Device` **hanya punya `_id`** — `id` numerik tidak ada (dibuang schema).

- **F-43 [P2] - sekali klik membuka menu SEMUA baris.** `monitoring.component.html:202`
  memanggil `toggleDropdown(device.id, $event)` dan `:213` memakai
  `*ngIf="activeDropdown === device.id"`. Karena `device.id` selalu `undefined`,
  klik pertama menyetel `activeDropdown = undefined`, dan `undefined === undefined`
  bernilai benar untuk **setiap** baris — seluruh menu aksi terbuka bersamaan.
  Ini satu-satunya tempat di `frontend/src/app` yang masih memakai `id` saja.

- **F-44 [P2] - berpotensi kehilangan data di mode JSON lokal.** `nextId` dihitung
  dari `this.devices` (`monitoring.component.ts:1240-1242`), yang hanya berisi
  perangkat site yang sedang dilihat — padahal modal Tambah boleh menyimpan ke
  site lain. `storage.saveLocalDevice` memakai angka itu sebagai `_id` **tanpa
  memeriksa keunikan** (`storage.js:269-270`), sehingga perangkat baru di site B
  bisa berbagi `_id` dengan perangkat lama di site B. `deleteLocalDevice`
  mencocokkan `_id` **dan** `id` sekaligus (`storage.js:287`), jadi menghapus
  satu perangkat bisa ikut menghapus yang lain; `updateLocalDevice` hanya
  mengubah yang pertama cocok (`storage.js:277`). Di mode Mongo ini tidak
  berpengaruh karena `id` dibuang schema — tapi backend jatuh ke mode JSON
  setiap kali MongoDB tidak terjangkau, dan itu sudah pernah terjadi di sesi ini.

## Perbaikan

- **Satu sumber kunci identitas.** Tambahkan `deviceKey()` di
  `shared/device-identity.ts` (`_id` lebih dulu, lalu `id`) dan pakai di template
  serta `toggleDropdown()`, supaya pola `_id || id` tidak lagi ditulis ulang dan
  tidak bisa menyimpang. Ini akar penyebab tiga temuan (`F-39`, `F-41`, `F-43`).
- **Backend tidak memercayai kunci dari klien.** `saveLocalDevice` memakai
  `uniqueDeviceKey()`: kunci yang sudah terpakai diganti kunci baru, dan kunci
  ganda tidak pernah tersimpan.
- **Penghapusan memakai kunci sebenarnya.** `deleteLocalDevice` dan
  `updateLocalDevice` mencoba `_id` lebih dulu; `id` hanya dipakai bila tidak ada
  record yang `_id`-nya cocok. Jadi menghapus satu perangkat tidak pernah
  menghapus lebih dari satu.
- **Aman untuk data lama.** Record lama yang `_id` dan `id`-nya sama tetap
  bekerja karena `_id` dicoba lebih dulu, dan pemanggil sudah memakai `_id || id`.

Yang tidak boleh rusak: tambah/edit/hapus perangkat di mode Mongo **dan** mode
JSON, pengurutan tabel, paginasi, dan `GET /api/devices` yang sudah
menyembunyikan kredensial SSH.

## Build steps

- [x] **Step 1 - Menu baris memakai kunci yang konsisten (F-43)** - Tambah
  `deviceKey()` di `shared/device-identity.ts` beserta test-nya (record Mongo
  ber-`_id` saja, record lokal ber-`id` + `_id`, dan record tanpa keduanya),
  lalu pakai di `monitoring.component.html:202,213` dan `toggleDropdown()`.
  *Done when:* klik tombol aksi pada satu baris hanya membuka menu baris itu,
  termasuk untuk perangkat dari MongoDB yang tidak punya `id`; `npm run verify` lolos.

- [x] **Step 2 - Kunci perangkat tidak boleh bentrok di mode JSON (F-44)** - Tambah `uniqueDeviceKey()` dan `removeDeviceByKey()` di `backend/services/device-identity.js` beserta test-nya, lalu pakai di `storage.saveLocalDevice`, `deleteLocalDevice`, dan `updateLocalDevice`. *Done when:* menambah perangkat dengan `id` yang sudah terpakai menghasilkan `_id` baru yang unik, dan menghapus salah satu perangkat hanya menghapus satu record; `npm run verify` lolos.
- [x] **Step 3 - POST perangkat mengembalikan kunci yang benar-benar tersimpan (F-47)** - Ditemukan oleh review delta ini: di mode JSON lokal, `POST /api/devices` membuang nilai balik `storage.saveLocalDevice()` lalu memakai `req.body`, sehingga responsnya tidak membawa `_id` yang benar-benar tersimpan (bisa berbeda karena bentrok kunci diganti). Klien lalu memegang perangkat ber-`_id` kosong, dan DELETE/PUT berikutnya — yang memakai `_id` lebih dulu — mengenai record lain. Kini memakai nilai baliknya, dan `backend/test/storage-devices.test.js` mengunci kontrak `saveLocalDevice` lewat direktori data sementara (`DATA_DIR`) supaya tidak menyentuh `backend/data`. *Done when:* respons POST memuat `_id` yang ada di penyimpanan; menghapus atau mengubah satu perangkat tidak menyentuh perangkat lain yang ber-`id` sama.

## Verify

- `npm run verify`.
- Smoke F-43: buka Monitoring Jaringan dengan lebih dari satu perangkat -> klik
  tombol **⋮** pada satu baris -> **hanya** menu baris itu yang terbuka; klik
  baris lain -> menu pindah, yang lama tertutup.
- Smoke F-44 (mode JSON lokal): matikan MongoDB sehingga backend memakai
  `backend/data/devices.json` -> buka site A yang punya 1 perangkat -> Tambah
  Perangkat ke **site B** yang sudah punya perangkat ber-`id` sama -> cek
  `backend/data/devices.json`: dua record itu punya `_id` berbeda -> hapus salah
  satu -> **hanya satu** record yang hilang.
- Bukti tidak ada regresi: tambah, edit, dan hapus perangkat di mode Mongo tetap
  berjalan; tabel tetap urut dan paginasi utuh.

## Findings

### kunci-perangkat-dan-menu-baris/F-43 [P2] closed - Row action menu keys off `device.id`, which Mongo-backed devices do not have

**File:** frontend/src/app/pages/monitoring/monitoring.component.html:202,213; frontend/src/app/pages/monitoring/monitoring.component.ts:103,631-634
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `toggleDropdown(device.id, $event)` and `*ngIf="activeDropdown === device.id"` are now the only identity keys in `frontend/src/app` that use `id` alone. Devices from MongoDB have no `id` (`/api/devices/status` returns `.lean()` docs, `backend/server.js:916`), so `device.id` is `undefined` for every row on the primary deployment. After the first click `activeDropdown` becomes `undefined` and `undefined === device.id` is true for every row, so one click opens the action menu of all rows at once; the F-41 sweep fixed `confirmDelete` but missed this template pair.
**Suggested fix:** Use `device._id || device.id` in both the click handler and the `*ngIf`, and type the dropdown key so it can never be `undefined`. No behavior decision needed.
**Resolution:** Closed 2026-09-25 at target 1c472eb (independent automatic review). `monitoring.component.html:202,213` now call `deviceKey(device)` and `toggleDropdown` (`monitoring.component.ts:640-644`) ignores empty keys, so a Mongo record with only `_id` gets a real key and no keyless row can match another. The five new `deviceKey` tests (`frontend/src/app/shared/device-identity.spec.ts:4-32`) cover `_id`-only, local `id`, number/string normalization, and keyless records, and this pass's `npm run verify` ran all 16 tests in that file green. The original defect is gone; the separate duplicate-key local data case is F-48. Closing.
Re-examined at target 5c94633 (2026-09-25, independent automatic review): `monitoring.component.html:202,213` still call `deviceKey(device)` with the `activeDropdown &&` guard and `toggleDropdown` (`monitoring.component.ts:640-644`) still ignores empty keys; `device-identity.spec.ts` ran 16 tests green (5 `deviceKey` cases) and the full `npm run verify` passed. Status stays `closed` (P2).
Re-examined at target 37c6f44 (2026-09-25, independent automatic review): the same repair holds at this target - the template pair calls `deviceKey(device)` and requires a non-empty `activeDropdown`, `toggleDropdown` (`monitoring.component.ts:634-644`) still ignores empty keys, and this pass's `npm run verify` ran `device-identity.spec.ts` green (16 tests, 5 `deviceKey` cases). Status stays `closed` (P2).

### kunci-perangkat-dan-menu-baris/F-44 [P2] closed - Site-scoped `Math.max` next-id can collide across sites in local JSON mode, and deleting one device deletes both

**File:** frontend/src/app/pages/monitoring/monitoring.component.ts:1240-1242; backend/storage.js:268-293; backend/server.js:1169-1174
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `nextId` is computed from `this.devices`, which `initDevices` loads only for the selected site (`/api/devices/status?site=...`, `monitoring.component.ts:207-230`), while the Add modal lets the user save into a different site. In local JSON mode `saveLocalDevice` uses that number as `_id` (`storage.js:269-270`) without a uniqueness check, so a device added to site B while site A is selected can share `_id` with an existing B device (for example A has one device -> next id 2, and B already has an id-2 device). `deleteLocalDevice` then removes every record whose `_id` or `id` matches (`storage.js:287`), so deleting either device silently deletes both, and `updateLocalDevice` updates only the first match (`:277`). In Mongo mode the schema strips `id`, so this affects only the JSON fallback.
**Suggested fix:** Stop trusting a client-supplied numeric key: in `saveLocalDevice`, generate a fresh `dev_<timestamp>` `_id` when the requested key already exists (or derive `nextId` from the full inventory). The frontend already adopts `_id` from the POST response, so no API change is needed.
**Resolution:** Closed 2026-09-25 at target 1c472eb (independent automatic review). `saveLocalDevice` (`backend/storage.js:269-277`) now runs the client key through `uniqueDeviceKey` (`backend/services/device-identity.js:53-68`), so a colliding requested key is replaced by a fresh `dev_<ts>_<rand>` before storage; `deleteLocalDevice` (`:288-296`) removes exactly one record through `findDeviceIndexByKey`/`removeDeviceByKey` (`device-identity.js:78-96`), and `updateLocalDevice` (`:279-286`) uses the same `_id`-first index. This pass's `npm run verify` ran the 11 new backend tests green (90/90), and a read-only simulation using the real helpers against the working copy's `backend/data/devices.json` confirmed the collision stores a distinct `_id` and a delete removes one record. The original "one delete removes both" defect is gone. The fix's premise that the frontend adopts the stored `_id` from the POST response is false in local mode; that remaining wrong-record path is recorded separately as F-47 and does not keep this repaired defect open. Closing.
Re-examined at target 5c94633 (2026-09-25, independent automatic review): `saveLocalDevice` (`backend/storage.js:272-280`) still re-keys through `uniqueDeviceKey`, `deleteLocalDevice`/`updateLocalDevice` (`:282-299`) still use `findDeviceIndexByKey`/`removeDeviceByKey`, and the new `backend/test/storage-devices.test.js` locks that storage contract (6 tests). This pass's `npm run verify` ran all 96 backend tests green, including the collision and one-record-delete cases. Status stays `closed` (P2).
Re-examined at target 37c6f44 (2026-09-25, independent automatic review): the storage wiring is unchanged (`backend/storage.js:272-299`; `backend/services/device-identity.js:78-96`), and `backend/test/storage-devices.test.js` plus the new `uniqueDeviceKey`/`removeDeviceByKey` cases in `backend/test/device-identity.test.js` ran green in this pass's `npm run verify` (96/96 backend). Status stays `closed` (P2).

### kunci-perangkat-dan-menu-baris/F-47 [P1] closed - A local-mode key collision still deletes the wrong device: the POST response never carries the stored `_id`

**File:** backend/server.js:1143-1146; backend/storage.js:269-277; frontend/src/app/pages/monitoring/monitoring.component.ts:1000-1012,742-762,1281-1284
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** In local JSON mode `saveLocalDevice` now re-keys a colliding device (`uniqueDeviceKey`), but `POST /api/devices` discards that return value and responds with `stripDeviceSecrets(req.body)` (`server.js:1143-1146`), which has no `_id`. The frontend stores the response into `deviceToAdd._id` (`monitoring.component.ts:1282`) and keeps the new row with `_id: undefined` until a site switch refetches (`:1312-1314` only refreshes when the site differs). Its next delete/update sends `dev._id || dev.id` (`:1000-1012`, `:742-762`), i.e. the numeric `id`, and `findDeviceIndexByKey` (`storage.js:280,291` -> `device-identity.js:78-85`) prefers `_id`, so the request resolves to a different record whose `_id` equals that number. Reproduced with the real helpers and the working copy's `backend/data/devices.json` (8 records, all `_id=1,id=1`): add device A to site P (stored `_id=2`), then add device B to site G with the same client `id=2` (stored `_id='dev_...', id=2`); deleting B (key `2`) resolves to A's index and removes A while B survives. The user sees the delete appear to succeed and the device reappear on the next list refresh, while an unrelated device is lost. The F-44 Suggested-fix note ("the frontend already adopts `_id` from the POST response") holds only in Mongo mode. This is a pre-existing client-key gap that the F-44 repair does not close; it is the remaining half of the same destructive-semantics question.
**Suggested fix:** In the local branch of `POST /api/devices`, assign `newDevice = storage.saveLocalDevice(req.body);` - the function already returns the stored record - so the response carries the generated `_id` and the row becomes addressable. No behavior decision needed.
**Resolution:** Repaired 2026-09-25. `POST /api/devices` kini memakai nilai balik `storage.saveLocalDevice(req.body)`, jadi respons memuat `_id` yang benar-benar tersimpan (termasuk saat kunci diganti karena bentrok). Ditambah `backend/test/storage-devices.test.js` yang menjalankan penyimpanan lokal di direktori sementara (`DATA_DIR`) dan mengunci: record yang dikembalikan punya `_id` yang bisa ditemukan, kunci bentrok tidak dibagi, dan hapus/ubah tidak menyentuh perangkat lain ber-`id` sama. Awaiting re-review.
Closed 2026-09-25 at target 5c94633 (independent automatic review). `POST /api/devices` (`backend/server.js:1147`) now assigns `newDevice = storage.saveLocalDevice(req.body)`, so the response carries the stored record's `_id` - including a re-keyed value - through `stripDeviceSecrets` (`:1149`). This pass re-derived the contract with the real modules against a throwaway `DATA_DIR`: device A (client `id=2`) stored `_id=2`; device B (same client `id=2`, other site) stored `_id=dev_...`; the POST-shaped response's `_id` equalled B's stored `_id`; deleting by that key removed B only and left A. `backend/test/storage-devices.test.js:25-72` locks the same contract and ran green (96/96 backend). The original wrong-record delete is gone; the remaining exposure is pre-existing duplicate local data (F-48).
Re-examined at target 37c6f44 (2026-09-25, independent automatic review): `backend/server.js:1147` still assigns the `storage.saveLocalDevice(req.body)` return value and `:1149` returns that stored record through `stripDeviceSecrets`, which shallow-copies before deleting (`backend/services/redact.js:4-10`), so the stored record keeps its credentials. The frontend still adopts the response `_id` (`frontend/src/app/pages/monitoring/monitoring.component.ts:1282`), and `backend/test/storage-devices.test.js:23-39` ran green. Status stays `closed` (P1).

### kunci-perangkat-dan-menu-baris/F-53 [P3] closed - The spec's Step 2 text and Done-when were merged under Step 3

**File:** blueprint/context/current-feature.md:62-69
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The Step 3 edit inserted its paragraph between Step 2's heading and Step 2's body, so Step 2 ("Kunci perangkat tidak boleh bentrok di mode JSON (F-44)") has no description or Done-when, while Step 3 carries two paragraphs and two `Done when` clauses - the second one (`uniqueDeviceKey()`/`removeDeviceByKey()` plus its done-when) belongs to Step 2. `/complete` archives this file, so the malformed step record is what a later rollback or archaeology pass reads. No product behavior is affected.
**Suggested fix:** Move the `Tambah uniqueDeviceKey()... npm run verify lolos.` paragraph back under the Step 2 heading, leaving only the POST-response text under Step 3. Editing the spec changes `Spec hash`, so the next Phase A must prepare a new request against the same product HEAD; no behavior decision is needed.
**Resolution:** Closed 2026-09-25 at target 37c6f44 (independent automatic review). Commit `37c6f44` is spec-text only (`blueprint/context/current-feature.md` is its sole changed file) and moves the `uniqueDeviceKey()`/`removeDeviceByKey()` description plus its Done-when back under Step 2. At the reviewed target, lines 55-63 show each of the three steps carrying its own description and Done-when with no orphaned or merged paragraph, and each step matches the code and tests in this delta (Step 1: `deviceKey()` + template/`toggleDropdown` use + spec tests; Step 2: the two backend helpers + storage wiring + tests; Step 3: the `saveLocalDevice` return value at `backend/server.js:1147` + `backend/test/storage-devices.test.js` via `DATA_DIR`). The reviewed spec bytes hash to `23bbdb27f8ccc2fb668ca0e00e9939f28989e6cafc2f47f69a7f6359c4ada6f3`, which matches `review.md`. Closing.

## Independent review
# Independent Review

**Status:** passed
**Target commit:** 37c6f443010f525653065cf1c4ec77e3b0d22fac
**Base commit:** 3f0bc661ee0cb751a20a4b45c0c445d132143f60
**Base ref:** main
**Spec hash:** 23bbdb27f8ccc2fb668ca0e00e9939f28989e6cafc2f47f69a7f6359c4ada6f3
**Prepared by:** opencode
**Builder model:** deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-25T05:26:26Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-25T05:32:25Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `npm run verify` (backend `node --test test/*.test.js`, frontend `ng test --watch=false`, `ng build`): pass - 96/96 backend tests, 71/71 frontend tests in 7 files, Angular build OK (one pre-existing sweetalert2 CommonJS warning).
- Freshness gate (`git rev-parse HEAD`, `git merge-base main <target>`, SHA-256 of `blueprint/context/current-feature.md`, `git status --porcelain`, `git diff --name-status <target>`, `git diff --cached --name-status <target>`, `git ls-files --others --exclude-standard`): pass - only `blueprint/context/review.md` and `blueprint/context/findings.md` differ from the target.
- `node -e` read of `backend/data/devices.json` after verify: pass - 8 records, no test records present, so the temp `DATA_DIR` isolation held and the real local data was not touched.

### Evidence

- Scope and delta: base ref `main`, merge base `3f0bc661ee0cb751a20a4b45c0c445d132143f60`, target `37c6f443010f525653065cf1c4ec77e3b0d22fac`; three commits (`1c472eb`, `5c94633`, `37c6f44`), 10 files, +391/-33.
- Spec integrity (F-53): commit `37c6f44` is spec-text only (`blueprint/context/current-feature.md` is its sole changed file). At the target, each of the three build steps (lines 55-63) owns its description and Done-when with no orphaned or merged paragraph, and all three step texts match the code and tests in this delta.
- F-43 repair re-derived: `monitoring.component.html:202,213` use `deviceKey(device)` with a non-empty `activeDropdown` guard, `toggleDropdown` (`monitoring.component.ts:640-644`) ignores empty keys, and the 5 `deviceKey` cases in `device-identity.spec.ts` ran green.
- F-44 repair re-derived: `uniqueDeviceKey` plus `findDeviceIndexByKey`/`removeDeviceByKey` (`backend/services/device-identity.js:53-96`) are wired into `backend/storage.js:272-299`; collision re-key, exactly-one delete, and update isolation tests ran green.
- F-47 repair re-derived: `backend/server.js:1147` assigns the `storage.saveLocalDevice` return value and `:1149` returns it through `stripDeviceSecrets`, which shallow-copies before deleting (`backend/services/redact.js:4-10`), so the stored record keeps its credentials; the frontend adopts the response `_id` (`monitoring.component.ts:1282`); `backend/test/storage-devices.test.js:23-39` locks the contract.
- Ledger re-checks: F-48 remains true (the ignored `backend/data/devices.json` holds 8 records all with `_id` `1`); F-49, F-50, F-51, F-52 unchanged; new F-54 recorded from the local-mode response path.
- Tests lens: no `.only`, `.skip`, `xit`, or `xdescribe` under `backend/test` or `frontend/src`; the new tests assert behavior (stored-key contract, collision re-key, one-record delete/update) rather than mirroring implementation.
- No secrets reproduced; this review wrote only `blueprint/context/findings.md` and `blueprint/context/review.md`.

### Findings

- No blocking findings. New: F-54 [P3] open - local-mode device responses call a client-controlled `toObject` property (pre-existing, API-only). Re-examined closed: F-43 [P2], F-44 [P2], F-47 [P1] stay `closed`. Closed this pass: F-53 [P3]. Still open but non-blocking: F-48 [P2]; F-49, F-50, F-51, F-52 [P3]. No P0 or P1 finding is `open` or `fixed`.

### Remaining risk

- No live browser or running-server smoke was run (Check was not required): F-43 row-menu behavior and the F-44/F-47 local-mode add/delete flows were verified by reading the code, the committed tests, and the local data snapshot, not by clicking the UI.
- No MongoDB instance, router, or Docker is available: Mongo-mode paths and the JSON-fallback switch were reviewed by reading only (F-25 remains an unverified environment lead).
- `backend/server.js` POST/PUT wiring still has no automated test (F-49), and the F-54 response path has no HTTP-harness test, so a regression there stays invisible to `npm run verify`.
- Existing duplicate local data needs a user decision (F-48): until it is re-keyed, JSON-mode row identity and delete/update remain first-match.
- No declared lint, separate typecheck (beyond the Angular build), or security-scanner command exists in this project, so none was run.
