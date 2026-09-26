# Fix: Penanda `hasPassword` tidak boleh ikut tersimpan

**Type:** Fix
**Status:** verified
**Branch:** `fix/penanda-password`
**Fixes:** F-45

## Masalah

**F-45 [P3] — `hasPassword` bisa tersimpan untuk site baru atau yang berganti nama, dan `POST /api/projects` tidak menyaring sama sekali.**

`GET /api/projects` membuang `routerConfig.password` dan menggantinya dengan penanda baca `hasPassword` (`services/redact.js:22-23`) supaya form perangkat tahu ada password tersimpan dan tidak menuntut pengetikan ulang. Penanda itu **hanya untuk dibaca** — `preserveRouterPasswords` bermaksud menghapusnya saat payload dikirim balik, dan barisnya memang ada (`redact.js:55`).

Masalahnya urutannya: `delete site.routerConfig.hasPassword` berada **setelah** pencarian site pasangannya, dan pencarian itu `continue` lebih dulu kalau tidak ketemu (`redact.js:46`). Jadi setiap site yang tidak punya padanan tersimpan — site yang baru ditambahkan, atau site yang diganti namanya sehingga tidak lagi cocok — melewati penghapusan itu. Marker-nya lalu ikut tersimpan.

Akibatnya bisa ditelusuri sampai ujung: `GET` berikutnya melaporkan `hasPassword: true` untuk router yang **tidak punya** password tersimpan, `bridgeDraftError` menerima kolom password yang kosong (`router-traffic-link.ts:188,193`), dan `routerConfig` yang tersimpan tidak akan pernah bisa connect — tanpa pesan yang menjelaskan kenapa. Persis kelas "sudah disimpan tapi tidak jalan" yang paling membingungkan.

Pintu kedua: `POST /api/projects` (`server.js:1208-1221`) tidak memanggil `preserveRouterPasswords` sama sekali, jadi project baru menyimpan apa pun yang dikirim klien — termasuk `hasPassword`, dan termasuk `_id` sementara `temp_` pada site/gedung/lantai yang bisa membuat Mongoose melempar CastError.

Jangkauannya API-only karena UI tidak pernah mengirim bentuk itu, dan itu sebabnya ini P3, bukan P1.

## Perbaikan

- **Pindahkan penghapusan marker ke sebelum pencarian padanan**, di dalam cabang `if (site.routerConfig)` yang sudah ada, sehingga ia berjalan untuk **setiap** site yang membawa `routerConfig` — cocok maupun tidak. Pencarian padanan tetap dipakai hanya untuk mewarisi password.
- **Pakai jalur penyaringan yang sama di `POST /api/projects`**: panggil `preserveRouterPasswords(req.body, null)` (tanpa padanan, fungsinya menjadi penyaring murni) lalu `normalizeNestedIds(payload, 'mongo' | 'local')`, sama seperti PUT.
- **Test yang mengunci:** `redact.test.js` menutup site tanpa padanan, site baru, dan payload `POST`; `project-utils` sudah menutup normalisasi id.

Yang tidak boleh berubah: password tersimpan tetap dipertahankan saat site di-rename atau payload tidak menyertakan `routerConfig`, `GET /api/projects` tetap melaporkan `hasPassword: true` hanya untuk router yang benar-benar punya password, dan `routerConfig` yang sudah ada tidak boleh berubah karena pemanggilan penyaring baru di jalur POST.

## Build steps

- [x] **Step 1 - Marker dihapus untuk setiap site (F-45)** - Pindahkan `delete site.routerConfig.hasPassword` ke sebelum pencarian padanan di `services/redact.js`. *Done when:* site tanpa padanan, site baru, dan site hasil rename tidak lagi membawa `hasPassword` setelah diproses; pemeliharaan password untuk site yang cocok tetap jalan; `npm run verify` lolos.
- [x] **Step 2 - Jalur POST ikut menyaring (F-45)** - `POST /api/projects` memakai `preserveRouterPasswords(req.body, null)` dan `normalizeNestedIds`, di kedua mode penyimpanan. *Done when:* membuat project lewat API dengan `hasPassword` dan `_id` bertanda `temp_` menghasilkan dokumen tersimpan yang bersih; `npm run verify` lolos.
- [x] **Step 3 - Test yang menjaganya** - Tambahkan kasus di `backend/test/redact.test.js` untuk ketiga bentuk payload. *Done when:* mengembalikan urutan lama (delete setelah pencarian) menggagalkan test; `npm run verify` lolos.

## Verify

- `npm run verify`.
- Bukti test menggigit: uji lokal untuk site tanpa padanan yang membawa `hasPassword: true`; dengan urutan lama ia bertahan, dengan urutan baru ia hilang.
- Smoke lewat API: `POST /api/projects` dengan payload ber-`hasPassword` dan `_id: 'temp_...'`, lalu `GET /api/projects` -> tidak ada `hasPassword` yang bocor ke dokumen dan tidak ada error cast.
- Bukti tidak ada regresi: rename site yang punya password router tetap mempertahankan passwordnya (tidak dituntut mengetik ulang), dan form perangkat tetap mengenali site yang benar-benar menyimpan password.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4447,"specSha256":"b139507343d28fc4e9035342ec07fbe9a3bce896742c945b28ef84c5abd56858","branch":"refs/heads/fix/penanda-password","head":"afaae5d8ba0426a8a9b1acf8fa53c7fcf6970006","baseRef":"refs/heads/main","baseCommit":"020c688993dc8f924bdd5f921497106c288a4c68","sourceTree":"e60af53d0e00e67740bd6a96a3dde688b9b88721","absentOptional":[]} -->

## Findings

### penanda-password/F-45 [P3] closed - `hasPassword` read-only marker can still be persisted for unmatched sites and on project create

**File:** backend/services/redact.js:43-55; backend/server.js:1050-1053
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: security)
**Why it matters:** `preserveRouterPasswords` deletes the read-only marker only after a site has matched a stored counterpart (the `if (!previous) continue;` at `redact.js:46` skips the delete at `:55`), and `POST /api/projects` does not call the helper at all (`server.js:1050-1053`). A payload carrying `hasPassword: true` for a new or renamed site therefore stores the marker; a later GET then reports a stored router password that does not exist, `bridgeDraftError` accepts an empty password, and the saved `routerConfig` can never connect. The UI never produces that shape, so reachability is limited to non-UI clients, but it makes the "marker never persisted" statement in F-27/F-42's closure evidence not absolute.
**Suggested fix:** Delete `site.routerConfig.hasPassword` for every incoming site while iterating (before the `previous` lookup), and reuse the same sanitizing step on the project-create path. No current requirement is lost.
**Resolution:** Repaired 2026-09-26 on `fix/penanda-password`. In `services/redact.js` the `delete site.routerConfig.hasPassword` moved above the counterpart lookup, inside an `if (site.routerConfig)` guard, so it now runs for every incoming site that carries a `routerConfig` - matching or not. The "keep the stored configuration" branch copies the stored config (`{ ...previous.routerConfig }`) and strips the marker again, so a document written before this repair cannot re-introduce it. `POST /api/projects` now runs the same sanitizing path as PUT (`preserveRouterPasswords(req.body, null)` plus `normalizeNestedIds`), so a client-supplied `hasPassword` no longer reaches storage and temp `_id`s are normalized instead of reaching Mongoose. Six new cases in `backend/test/redact.test.js` cover a brand-new site, a renamed site with no matching `_id`, a POST-style payload with no existing project, a stale marker in the stored document, the GET-then-PUT round trip, and sites with no `routerConfig`. Evidence that they bite: moving the delete back below the lookup fails 3 of them. `npm run verify` green: 154/154 backend, 112/112 frontend, Angular build OK. Awaiting independent review.
Re-examined at target 12c994b (2026-09-25): `preserveRouterPasswords` still `continue`s before the `delete site.routerConfig.hasPassword` when a site has no stored counterpart (`backend/services/redact.js:46,55`), and `POST /api/projects` (`backend/server.js:1118-1131`) still does not call the helper. Status stays `open` (P3).
Re-examined at 901504f (2026-09-25, /audit scope: full; lens: security): `preserveRouterPasswords` still `continue`s before the `delete site.routerConfig.hasPassword` when a site has no stored counterpart (`backend/services/redact.js:46,55`), and `POST /api/projects` (`backend/server.js:1208-1221`) still neither calls the helper nor normalizes nested ids. Status stays `open` (P3).
Closed at target afaae5d (2026-09-26, independent automatic review; scope: current; lens: security). Re-read the repaired code: the marker delete now runs before the counterpart lookup for every incoming site that carries a `routerConfig` (`backend/services/redact.js:38-46`), and the "keep the stored configuration" branch copies the stored config and strips the marker again (`:58-66`), so neither a new/renamed site nor a pre-fix stored marker can be persisted by a later save. `POST /api/projects` runs the same sanitizer plus `normalizeNestedIds` in both storage modes (`backend/server.js:1209-1216`), and the response still goes through `stripProjectSecrets`. The `existing` argument is a plain object on both PUT paths (`.lean()` at `server.js:1228`; the local JSON record at `:1234-1236`), so the new `{ ...previous.routerConfig }` copy cannot spread Mongoose internals, and `preserveRouterPasswords` keeps its non-array `sites` guard (`redact.js:35`). The six new cases (`backend/test/redact.test.js:96-163`) cover a new site, a renamed site with no `_id` match, a POST-style payload with `existing = null`, a stale stored marker, the GET-to-PUT round trip, and sites without `routerConfig`; all passed in this pass's `npm run verify` (154/154 backend). No new defect found in the repaired paths. Pre-fix stored markers are not migrated; tracked separately as F-89.

## Independent review

**Status:** passed
**Target commit:** afaae5d8ba0426a8a9b1acf8fa53c7fcf6970006
**Base commit:** 020c688993dc8f924bdd5f921497106c288a4c68
**Base ref:** main
**Spec hash:** b139507343d28fc4e9035342ec07fbe9a3bce896742c945b28ef84c5abd56858
**Prepared by:** opencode
**Builder model:** deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-26T01:09:02.704Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-26T01:15:06.029Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `npm run verify` (backend `node --test`, frontend `ng test --watch=false`, frontend `ng build`): pass — backend 154/154, frontend 112/112, Angular build OK.
- Precondition re-derivation (`git rev-parse HEAD`, `git merge-base main <target>`, SHA-256 of `blueprint/context/current-feature.md`, `git status --porcelain`, `git ls-files --others --exclude-standard`): pass — target, base, spec hash, and worktree all matched the pending request.
- Check (`/check`): not run — the request says Check is not required.

## Evidence

- Reviewed the complete `020c688993dc8f924bdd5f921497106c288a4c68..afaae5d8ba0426a8a9b1acf8fa53c7fcf6970006` delta from scratch: `backend/services/redact.js` (+19/-6), `backend/server.js` (+13/-2), `backend/test/redact.test.js` (+71); the spec and findings changes in the same commit are workflow records, not code.
- `backend/services/redact.js:38-46` deletes `hasPassword` before the counterpart lookup for every incoming site that carries a `routerConfig` — matching, new, or renamed; `:58-66` copies the stored configuration and strips the marker again on the "keep stored configuration" path.
- `backend/server.js:1209-1216` (`POST /api/projects`, Mongo and local branches) runs `preserveRouterPasswords(req.body, null)` then `normalizeNestedIds`, mirroring PUT at `:1229-1238`; both responses keep `stripProjectSecrets`.
- The `existing` argument is a plain object on both PUT paths (`.lean()` at `backend/server.js:1228`; the local JSON record at `:1234-1236`), so the new `{ ...previous.routerConfig }` copy cannot spread Mongoose internals; the helper keeps its non-array `sites` guard (`redact.js:35`), so a POST body without `sites` still stores an empty-sites project instead of throwing.
- The six new cases at `backend/test/redact.test.js:96-163` cover a brand-new site, a renamed site with no `_id` match, a POST-style payload with `existing = null`, a stale stored marker, the GET-then-PUT round trip, and sites without `routerConfig`; they passed in this pass's verify. The pre-existing `redact.test.js:81-92` case still pins the matched-site marker drop.
- GET still sets the marker only when a stored password exists (`redact.js:22-23`, `server.js:1153-1165`); the frontend consumers (`frontend/src/app/pages/monitoring/monitoring.component.ts:1175`, `frontend/src/app/shared/router-traffic-link.ts:188`) read it only as a credential-presence hint, and POST/PUT responses never include the password.
- `backend/data/projects.json` inspected 2026-09-26: no stored `hasPassword` marker in any site.
- No backend suite imports `backend/server.js`, so the endpoint-level composition is covered by helper tests only.

## Findings

- F-45 [P3] closed: the marker can no longer be persisted for unmatched, new, or renamed sites, and `POST /api/projects` now runs the same sanitize-and-normalize path as PUT; the six new tests pass, and no new defect was found in the repaired paths.
- F-89 [P3] unverified (new): `hasPassword` markers written before this fix are not migrated and still surface through GET until the affected site is next saved; no affected document confirmed.
- No new P0/P1 findings; no other new findings.

## Remaining risk

- F-89: MongoDB contents were not inspected (no Mongo access from this session); the local store is clean, and the corruption path itself is API-only.
- `POST /api/projects` composition (`backend/server.js:1209-1216`) has no automated endpoint test because no backend suite imports `server.js`; the same server-wiring coverage class already tracked as F-61 and F-49.
- Marker consumers `frontend/src/app/pages/monitoring/monitoring.component.ts:1175` and `frontend/src/app/shared/router-traffic-link.ts:188` are exercised only by helper tests, not by a component harness (F-30); no browser harness is declared.
- No lint, typecheck, security scanner, or browser test command exists in this project; only `npm run verify` was available and run.
- The Angular build prints a pre-existing `sweetalert2` CommonJS warning; it is not introduced by this delta.
