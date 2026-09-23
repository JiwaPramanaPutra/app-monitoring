# Feature: Rampungkan Fitur Setengah Jadi

**From build-plan:** feature 10
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/rampungkan-fitur-setengah-jadi`

## Goal

Menutup janji setengah jadi sebelum publikasi: endpoint export CSV laporan yang dipanggil frontend tapi tidak ada, keputusan tegas untuk remote reboot (dihapus dari v1) dan notifikasi Telegram (dipertahankan + diverifikasi), serta perilaku laporan yang konsisten saat MongoDB offline. Sekalian membereskan temuan carried F-07 dan F-09.

## In scope

- Endpoint `GET /api/laporan/export/csv` dengan filter sama seperti `GET /api/laporan` (`search`, `type`), CSV + BOM + `Content-Disposition`; dapat diakses EOS dan Client (GET).
- Laporan tetap bisa dipakai saat MongoDB offline: fallback JSON `backend/data/laporan.json` mengikuti pola devices/projects; hapus balasan 503.
- Remote reboot dihapus dari UI untuk v1 (tombolnya mati; implementasi SSH/HTTP post-v1). Build plan item 4 + project plan disesuaikan, backlog note ditambahkan.
- Telegram #8 dipertahankan: tambah `backend/scripts/test_telegram.js` + script `telegram:test`; bila pengiriman terverifikasi saat smoke, item #8 ditandai selesai di build plan.
- F-07 (P2): guard form tambah perangkat & tambah laporan saat belum ada site.
- F-09 (P3): hapus `ssh2` dari root `package.json` + `package-lock.json`.

## Out of scope

- Implementasi remote reboot (post-v1), audit log/user management (#7), packaging (#12), backend test runner (F-16 - `/tests`), F-08 (docs).

## Build loop

Ikuti `workflow.stepReview: "feature"` di `blueprint/config.json`: satu review packet setelah semua step selesai. Checkpoint commit disabled; `/complete` yang membuat commit fitur. Setiap step harus meninggalkan project dalam keadaan jalan.

## Build steps

- [x] **Step 1 - Backend: export CSV laporan + filter yang benar** - Buat `GET /api/laporan/export/csv` (dual-mode Mongo/JSON) dengan filter `search` + `type`; sekalian buat `GET /api/laporan` benar-benar menerapkan filter `search`/`type` (saat ini parameter dari UI diabaikan); kolom: Tanggal,Jenis,Site,Gedung,Lantai,Ruangan,Perangkat,Masalah,Tindakan,Teknisi; BOM untuk Excel; filename `laporan_<YYYY-MM-DD>.csv`. *Done when:* endpoint mengembalikan CSV terfilter dengan header dan `Content-Disposition` benar; `GET /api/laporan?type=...` hanya mengembalikan jenis itu; akses GET tetap boleh Client.

- [x] **Step 2 - Backend + storage: fallback laporan offline** - Tambah `data/laporan.json` + fungsi CRUD lokal di `storage.js` (id stabil `lap_<ts>_<rand>`); route `/api/laporan` GET/POST/PUT/DELETE memakai pola dual-mode; hapus balasan 503. *Done when:* dengan `MONGO_URI` kosong, create/read/update/delete laporan jalan dan persisten di JSON; dengan Mongo hidup perilaku lama tidak berubah.

- [x] **Step 3 - Frontend: hapus UI reboot** - Hapus modal reboot, aksi dropdown, `rebootDevice()`, `confirmReboot()`, `rebootPollTimer`, dan state terkait di `monitoring.component.*`; hapus capability `reboot` dari `getEmptyDevice()`. *Done when:* tidak ada referensi reboot/ssh di `frontend/src`; `npm run verify` lolos.

- [x] **Step 4 - Telegram: script verifikasi** - `backend/scripts/test_telegram.js` + `telegram:test` di `backend/package.json` yang mengirim satu pesan uji; gagal dengan pesan jelas bila token/chat id belum diset. *Done when:* script jalan dan melaporkan sukses/gagal dengan jelas (pengiriman nyata diverifikasi saat smoke dengan persetujuan user).

- [x] **Step 5 - Repair F-07 + F-09** - Guard `saveDevice()`/`saveReport()` saat `sites.length === 0` (blokir + pesan), tombol tambah disembunyikan/di-disable saat belum ada site; hapus `ssh2` dari root `package.json` + `package-lock.json`. *Done when:* form tidak bisa submit tanpa site; root manifest bersih; ledger F-07/F-09 -> `fixed`.

- [x] **Step 6 - Verifikasi + plan bookkeeping** - Jalankan `npm run verify`; siapkan smoke; tandai #8 di build plan bila Telegram terverifikasi. *Done when:* Verify lolos; bukti smoke tercatat; plan #8 sesuai bukti.

- [x] **Step 7 - Perbaikan temuan review** - Perbaiki F-18 (hapus CSS `.spinner` + komentar reboot), F-19 (netralkan formula injection di `csvCell`), F-20 (strip `_id`/`createdAt`/`updatedAt` di update lokal laporan + devices/projects). *Done when:* cek script lolos, `npm run verify` lolos, checkpoint baru siap direview.

## Files / areas

- `backend/server.js` (export CSV + laporan dual-mode), `backend/storage.js` (laporan lokal), `backend/scripts/test_telegram.js` (baru), `backend/package.json`
- `frontend/src/app/pages/monitoring/monitoring.component.ts` + `.html` (hapus reboot), `frontend/src/app/pages/monitoring/monitoring.component.ts` + `frontend/src/app/pages/laporan/laporan.component.ts` (guard F-07)
- `package.json` + `package-lock.json` (root, F-09)
- `blueprint/build-plan.md` (item #8 bila terverifikasi)

## Data / contracts

- `GET /api/laporan/export/csv?search=&type=` -> `text/csv; charset=utf-8` + BOM, `Content-Disposition: attachment; filename="laporan_<YYYY-MM-DD>.csv"`; kolom: Tanggal, Jenis, Site, Gedung, Lantai, Ruangan, Perangkat, Masalah, Tindakan, Teknisi.
- `data/laporan.json`: array laporan dengan `_id` stabil (`lap_<ts>_<rand>`) dan `createdAt`; struktur field sama dengan model `Laporan`.
- `npm run telegram:test` (backend) mengirim satu pesan uji ke `TELEGRAM_CHAT_ID`.
- `POST /api/device/reboot` tetap tidak ada; UI-nya dihapus.

## Testing

- Verify: `npm run verify` (test + build frontend).
- Smoke manual: (1) export CSV dari halaman Laporan dengan filter; (2) dengan `MONGO_URI` kosong: buat/edit/hapus laporan lalu refresh; (3) `npm run telegram:test` (dengan persetujuan) -> pesan masuk; (4) form tambah perangkat tanpa site -> diblokir dengan pesan; (5) monitoring tanpa tombol/aksi reboot.

## Notes for the AI

- Jangan tambahkan kembali `ssh2` ke `backend/package.json` (reboot post-v1).
- Ikuti pola dual-mode yang sudah ada di `storage.js`/`server.js` untuk laporan; jangan bikin pola baru.
- Hapus hanya yang benar-benar terkait reboot; `sshPort`/`sshUsername`/`sshPassword` di model Device tetap (dipakai fitur reboot post-v1; sudah tidak pernah dikirim ke frontend).
- Jangan sentuh item 12, F-16, atau F-08.
- Ikuti konvensi commit project: tanpa atribusi AI.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":6240,"specSha256":"cd6f3c0a284f550cee82187e9bbe066389dcc5385f47763009c378618bce5ef6","branch":"refs/heads/feature/rampungkan-fitur-setengah-jadi","head":"7581c0e53952c024885a74d40b2e220ac4e85f98","baseRef":"refs/heads/main","baseCommit":"b98761dd32c19641cff87935d7273e6db3ae4f55","sourceTree":"6a4e09422812f7458d63be06e878722214688afe","absentOptional":[]} -->

## Findings

### 10/F-07 [P2] closed - Add-device and add-report forms accept an empty site when no site exists

**File:** frontend/src/app/pages/monitoring/monitoring.component.ts:834,885-887; frontend/src/app/pages/laporan/laporan.component.ts:131,176
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The feature removed the hardcoded `'Direktorat'` defaults, so with zero projects `getEmptyDevice()` returns `siteLocation: ''` and `saveDevice()` posts an empty site. The "Tambah Perangkat" button is hidden only for `Client`, not when `sites.length === 0`, and the modal's Site Location select has no options in that state. In the default offline (JSON) mode `POST /api/devices` succeeds and persists a device with `siteLocation: ''`; once the user creates a project and site, every per-site view filters the device out (`storage.getLocalDevices(site)` and the `filteredDevices` getter), so it becomes invisible and unmanageable in the UI while still present in `backend/data/devices.json`. With MongoDB connected, the same request fails Mongoose `required` validation and the UI surfaces the raw server error. The report form has the same missing guard (`saveReport()` validates only masalah/tindakan) against the required `Laporan.site`. Confirmed by code reading; the offline path was not executed against a running server.
**Suggested fix:** Guard both forms when `sites.length === 0`: hide or disable the add buttons next to the existing empty-state guidance, and validate `site` in `saveDevice()`/`saveReport()` before posting (same pattern as the `nama` check).
**Resolution:** Re-examined at checkpoint b4877ee (2026-09-23): `saveDevice()` (monitoring.component.ts:812-816) still validates only `nama`, and `saveReport()` (laporan.component.ts:158-167) still validates only masalah/tindakan; this delta added no `sites.length === 0` guard. Status stays open (P2). Re-confirmed at checkpoint 809ce428 (2026-09-23): the same two validations remain unchanged and `Laporan.site` is still required (backend/models/Laporan.js:23-27). Status stays open (P2).
**Fixed in feature 10 (2026-09-23):** `saveDevice()` now rejects an empty `siteLocation` with a toast, and the add-device button is hidden while `sites.length === 0`; `saveReport()` rejects an empty `site` with a Swal error, and the add-report button is hidden likewise. Awaiting re-review.
**Closed on re-review (checkpoint 3615c4c, 2026-09-23):** Both repairs confirmed against the new code. `saveDevice()` rejects an empty `siteLocation` before posting (`monitoring.component.ts:693-696`) and the "Tambah Perangkat" button renders only when `!isClient && sites.length > 0` (`monitoring.component.html:22`); `saveReport()` rejects an empty `site` (`laporan.component.ts:169-177`) and the "Tambah laporan" button is gated the same way (`laporan.component.html:12`). Both pages keep their "Belum ada site" guidance banners. The guards return before any request, so no new defect is introduced.

### 10/F-09 [P3] closed - Root `package.json` still declares the now-unused `ssh2` dependency

**File:** package.json:5-7
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** This delta removed the last `require('ssh2')` from `backend/server.js` and dropped `ssh2`/`routeros-client` from `backend/package.json`, but the repository root manifest (added in the base commit) still declares `ssh2`. Nothing in the repo requires it (grep finds only the root manifest, root lockfile, and docs), so a root `npm install` keeps pulling an unused dependency into the published repo. The reboot endpoint that will need it is deferred to feature 10, where the dependency belongs in `backend/package.json`.
**Suggested fix:** Remove `ssh2` from the root `package.json` and lockfile, or move the declaration to `backend/package.json` when feature 10 implements the reboot endpoint.
**Resolution:** Re-examined at checkpoint acfb1a1 by the independent review of the current delta (2026-09-23): root `package.json:5-7` still declares `ssh2` and nothing in the repository requires it. Status stays open (P3). Re-confirmed at checkpoint 809ce428 (2026-09-23): root `package.json:5-7` still declares `ssh2`; this delta did not touch the root manifest. Status stays open (P3).
**Fixed in feature 10 (2026-09-23):** `ssh2` removed from the root `package.json`; the root lockfile was regenerated (`npm install` removed 6 packages). Awaiting re-review.
**Closed on re-review (checkpoint 3615c4c, 2026-09-23):** Root `package.json` now has no `dependencies` block and root `package-lock.json` is `"packages": {}`. `git grep -i ssh2` finds it only in the spec, this ledger, and blueprint docs; `backend/package.json` does not declare it and no code requires it. The `project-overview.md:85` mention is documentation drift tracked by open F-08.

### 10/F-18 [P3] closed - Dead `.spinner` CSS and stale "Reboot" comment remain after the reboot UI removal

**File:** frontend/src/app/pages/monitoring/monitoring.component.css:8-21
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** Feature 10's Step 3 done-when says "tidak ada referensi reboot/ssh di `frontend/src`", but the monitoring stylesheet still carries `/* Spinner Animation for Reboot */` and the `.spinner` rule plus its `@keyframes spin` that it describes. Nothing in `frontend/src` uses `class="spinner"` or `[class.spinner]` anymore (the deleted reboot modal was the only consumer), so the rule is dead code and the comment keeps a reboot reference in the tree, misleading future readers into thinking the class is live.
**Suggested fix:** Delete the comment and the `.spinner`/`@keyframes spin` block (or, if a spinner is wanted for a later feature, give it a purpose-based name and comment at that time).
**Resolution:** Fixed in the repair pass: the `/* Spinner Animation for Reboot */` comment and the `.spinner`/`@keyframes spin` block were deleted from `monitoring.component.css`; a grep for `reboot|ssh` across `frontend/src` (all file types) now returns nothing. Awaiting re-review.
**Closed on re-review (checkpoint 7581c0e, 2026-09-23):** The repair is present in the new code (`monitoring.component.css` now opens with the `.device-name` link rule) and a case-insensitive search for `reboot|ssh|spinner` across all of `frontend/src` returns no matches; `npm run verify` compiles the templates. No new defect introduced.

### 10/F-19 [P3] closed - CSV export does not neutralize spreadsheet formula injection

**File:** backend/server.js:1093-1096,1119-1139
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: security)
**Why it matters:** `csvCell` quotes every field and doubles embedded quotes, but it leaves values that start with `=`, `+`, `-`, or `@` unchanged. A laporan field (for example `masalah` or `tindakan`) stored as `=HYPERLINK(...)` or a DDE payload is exported verbatim, so Excel/LibreOffice may evaluate it as a formula when a user opens `laporan_<YYYY-MM-DD>.csv`. Only EOS accounts can create or edit laporan (`POST`/`PUT` require EOS through `requireEosForMutations`, `backend/services/auth.js:131-138`), so this is not privilege escalation from a lower-trust role; it is a client-side execution risk for whoever opens the export, including Client-role users who are allowed to download it. Confirmed by executing the shipped `csvCell` extracted from `backend/server.js` (see review Evidence); no spreadsheet runtime was executed.
**Suggested fix:** Neutralize formula-leading values inside `csvCell` before quoting, for example prefix a single quote when the string matches `/^[=+\-@\t\r]/`. The pre-existing `/api/router/history/export` CSV writer (`backend/server.js:586`) has the same weakness, but it is outside this delta and should be handled separately.
**Resolution:** Fixed in the repair pass: `csvCell` now prefixes a single quote when a value starts with `=`, `+`, `-`, `@`, tab, or CR, then quotes it. A scripted check confirms `=HYPERLINK(...)` is neutralized while normal values are unchanged. The pre-existing `/api/router/history/export` writer remains unaddressed (separate work item). Awaiting re-review.
**Closed on re-review (checkpoint 7581c0e, 2026-09-23):** The shipped `csvCell` (`backend/server.js:1093-1098`) was extracted verbatim and executed in `vm`: `=HYPERLINK("...")`, `+1+1`, `-2-2`, `@SUM(A1)`, a leading tab, and a leading CR all gain the `'` prefix before quoting, while `normal`, `a"b,c`, and ` spaced =x` are unchanged. No new defect introduced.

### 10/F-20 [P3] closed - Local laporan update lets the request body overwrite `_id` and `createdAt`

**File:** backend/server.js:1161; backend/storage.js:338-344
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** In offline mode `PUT /api/laporan/:id` passes `req.body` straight to `storage.updateLocalLaporan`, which spreads it over the stored record (`{ ...localLaporans[index], ...updateData, updatedAt: ... }`). A body containing `_id` or `createdAt` silently rewrites the record's identity and creation time in `backend/data/laporan.json`; the next `PUT`/`DELETE` against the original id then reports success with no effect (`updateLocalLaporan` returns `null`, `deleteLocalLaporan` returns `false`), leaving the record unreachable by its old id. The spec's contract requires a stable `_id` (`lap_<ts>_<rand>`), and the MongoDB path rejects `_id` mutation, so the two modes disagree. Not reachable from the UI (`saveReport` builds an explicit payload without `_id`), but an authenticated EOS client can trigger it with a crafted request. The same spread pattern already exists for devices/projects (`backend/storage.js:279,310`); this entry records the laporan instance added by this delta.
**Suggested fix:** Strip `_id`, `createdAt`, and `updatedAt` from `updateData` before spreading in `updateLocalLaporan` (and consider the same guard in the device/project variants for consistency).
**Resolution:** Fixed in the repair pass: `updateLocalLaporan` strips `_id`, `createdAt`, and `updatedAt` from the payload before merging; the same guard was applied to `updateLocalDevice` and `updateLocalProject` for consistency. Awaiting re-review.
**Closed on re-review (checkpoint 7581c0e, 2026-09-23):** A read-only probe requiring `backend/storage.js` (with `backend/data/laporan.json` absent before and restored to absent after) confirmed the guard: an update carrying `_id: 'HACKED'`, a 1999 `createdAt`, and an `updatedAt` left the record's `_id` and `createdAt` unchanged in memory and in the persisted JSON, and `updateLocalLaporan('HACKED', ...)` returned `null`. The same guard is present in `updateLocalDevice`/`updateLocalProject` (`backend/storage.js:279,311`). No new defect introduced.

## Independent review

# Independent Review

**Status:** passed
**Target commit:** 7581c0e53952c024885a74d40b2e220ac4e85f98
**Base commit:** b98761dd32c19641cff87935d7273e6db3ae4f55
**Base ref:** main
**Spec hash:** cd6f3c0a284f550cee82187e9bbe066389dcc5385f47763009c378618bce5ef6
**Prepared by:** opencode
**Builder model:** opencode-go/deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-23T16:41:52.501Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** opencode-go/deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-23T16:49:09.256Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `npm run verify` (root -> frontend `ng test --watch=false && ng build`): pass - 5 test files / 11 tests passed; production build completed (only the pre-existing sweetalert2 CommonJS warning).
- `node --check` on `backend/server.js`, `backend/storage.js`, `backend/scripts/test_telegram.js`, `backend/services/telegram.js`, `backend/services/auth.js`: pass.
- Freshness checks (`git rev-parse HEAD`, `git merge-base main HEAD`, raw spec SHA-256, `git status --porcelain --untracked-files=all`): pass - see Evidence.
- Read-only helper probe (shipped `csvCell` and `filterLaporan` extracted verbatim from `backend/server.js` and executed in `vm`): pass - formula-leading `=`, `+`, `-`, `@`, tab, and CR values are neutralized; normal and quoted values unchanged; filter semantics match the UI placeholder.
- Read-only storage probe (temporary `node -` script requiring `backend/storage.js`, with `backend/data/laporan.json` absent before and restored to absent after): pass - create/read/update/delete, `lap_<ts>_<rand>` id, and `_id`/`createdAt` stability confirmed.
- Backend unit tests: unavailable - `backend/package.json` declares no `test` script.
- Browser/E2E harness: unavailable - none declared in the project.
- Backend server start and `npm run telegram:test` delivery: unavailable by design - auth env vars are absent and this review must not send external messages.

## Evidence

- Freshness: `HEAD` = `7581c0e53952c024885a74d40b2e220ac4e85f98` equals Target commit; `git merge-base main HEAD` = `b98761dd32c19641cff87935d7273e6db3ae4f55` equals Base commit and `main` still resolves to it; raw spec SHA-256 `cd6f3c0a...5ef6` matches the recorded hash; before this review wrote the ledger, `git status --porcelain --untracked-files=all` showed only ` M blueprint/context/review.md` (the pending request), with no staged, unstaged, or untracked difference other than that allowed evidence path; no `Spec snapshot` field present.
- Reviewed the complete `b98761dd32c19641cff87935d7273e6db3ae4f55..7581c0e53952c024885a74d40b2e220ac4e85f98` delta (17 files, +345/-373) from scratch across all four lenses, covering both commits (`3615c4c` feature work and `7581c0e` F-18..F-20 repairs), plus nearby context: `backend/models/Laporan.js`, `backend/models/Device.js`, `backend/services/auth.js`, `backend/services/telegram.js`, `frontend/src/app/services/api.service.ts`, root `package.json`/`package-lock.json`, and the blueprint docs.
- CSV export contract: `GET /api/laporan/export/csv` (`backend/server.js:1121-1141`) shares `getAllLaporan`/`filterLaporan` (`backend/server.js:1080-1105`) with `GET /api/laporan`; returns `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="laporan_<YYYY-MM-DD>.csv"`, a UTF-8 BOM, CRLF, and the exact 10-column header; no `GET /api/laporan/:id` route exists to shadow it; `requireAuth` (`backend/server.js:40`, `backend/services/auth.js:115-128`) still requires a token while `requireEosForMutations` (`backend/services/auth.js:131-138`) leaves GET open to Client, as the spec requires.
- CSV formula neutralization (F-19 repair): executing the shipped `csvCell` (`backend/server.js:1093-1098`) yields `"'=HYPERLINK(""http://evil"")"`, `"'+1+1"`, `"'-2-2"`, `"'@SUM(A1)"`, a tab-prefixed and a CR-prefixed value each gaining `'`, while `"normal"`, `"a""b,c"`, and `" spaced =x"` are unchanged.
- Laporan local fallback: GET/POST/PUT/DELETE all use the dual-mode pattern with no remaining 503 (`backend/server.js:1107-1181`); the probe confirmed `saveLocalLaporan` generates `lap_<ts>_<rand>` and persists JSON, and `updateLocalLaporan` (`backend/storage.js:340-347`) strips `_id`/`createdAt`/`updatedAt` so a crafted payload cannot rewrite identity (F-20 repair); `updateLocalDevice`/`updateLocalProject` (`backend/storage.js:279,311`) carry the same guard.
- Reboot removal: a case-insensitive search for `reboot|ssh|spinner` across all of `frontend/src` returns no matches; the reboot modal, dropdown action, detail action, capability checkboxes, `rebootDevice`/`confirmReboot`/`rebootPollTimer` state, and the `.spinner` CSS block are gone; `git grep "device/reboot"` finds only the spec and archived history; `npm run verify` compiles the templates, so no dangling TS/template reference remains.
- Telegram script: `backend/scripts/test_telegram.js` reads `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` from env, fails fast with a clear message when unset or placeholder, prints only success/failure text, and never logs the token; `backend/services/telegram.js:27-29` logs only Telegram's response body or the axios message, never the request URL containing the token; a grep for token-like literals (`bot[0-9]{6,}`) across tracked files finds none.
- F-07 and F-09 closures still hold: `saveDevice()` rejects an empty `siteLocation` (`monitoring.component.ts:693-696`) and the add-device button is hidden while `sites.length === 0` (`monitoring.component.html:22`); `saveReport()` rejects an empty `site` (`laporan.component.ts:169-177`) and the add-report button is hidden likewise (`laporan.component.html:12`); root `package.json` has no `dependencies` block and root `package-lock.json` is `"packages": {}`; `git grep -i ssh2` outside `blueprint/` returns nothing.
- Tests lens: `npm run verify` passes (5 files / 11 tests); no `.skip(`, `.only(`, focused, or placeholder tests found in `frontend/src`; the new `filterLaporan`/`csvCell` helpers and the local laporan CRUD still ship no committed tests (F-16).
- Docs: F-08 re-confirmed (`project-overview.md:64`, `project-plan.md:4` still name the five institution sites); new F-21 records that `project-overview.md:85` and `project-plan.md:37` still list `ssh2` as current network integration although reboot is deferred and no manifest declares `ssh2`.

## Findings

- F-07 [P2] closed - Empty-site add forms remain guarded; buttons hidden without sites.
- F-08 [P3] open - Blueprint docs still present the institution's fixed site list (out of scope).
- F-09 [P3] closed - Root `ssh2` dependency and lockfile entries remain removed; no code references.
- F-16 [P3] open - Backend and the laporan helpers still have no committed regression tests.
- F-18 [P3] closed - Dead `.spinner` CSS and stale reboot comment removed; repair verified against the new code.
- F-19 [P3] closed - CSV export formula injection neutralized; repair verified by executing the shipped code.
- F-20 [P3] closed - Local laporan update can no longer rewrite `_id`/`createdAt`; repair verified by probe.
- F-21 [P3] open - Docs still list `ssh2`/reboot as current stack after the reboot deferral.
- No P0 or P1 findings; no finding blocks this receipt.

## Remaining risk

- No backend unit-test command exists (`backend/package.json` has no `test` script), so `filterLaporan`, `csvCell`, and the local laporan CRUD were exercised only by reviewer probes, not committed tests (F-16).
- The backend server was not started and no Telegram message was sent (auth env vars intentionally absent; external sends prohibited), so the CSV endpoint, the local laporan routes, and `telegram:test` were verified by code reading plus extracted-function execution, not end-to-end.
- No browser/E2E harness is declared, so the UI guards and the removed reboot UI were verified by build, grep, and code reading, not a live browser run.
- Build-plan #8 is marked complete, but Telegram delivery cannot be independently verified from the repository; the marking rests on the user-approved smoke and leaves no in-repo evidence trail.
- The local JSON fallback stores `req.body` without Mongoose-style required-field validation (same pattern as devices/projects), so a crafted EOS request can persist a laporan that MongoDB would reject; impact is limited to self-inflicted bad data in offline mode.
- Laporan written to `backend/data/laporan.json` while MongoDB is offline become invisible once Mongo reconnects (dual-mode read switch, same as devices/projects and mandated by the spec).
- `GET /api/laporan` and the CSV export load and filter the whole laporan collection in memory with no pagination; expected negligible at this scale but unverified.
- F-08 and F-21 documentation drift remain open and do not block (P3).

