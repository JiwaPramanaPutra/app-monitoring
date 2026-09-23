# Feature: Autentikasi & RBAC

**From build-plan:** feature 1
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/autentikasi-rbac`

## Goal

Ganti login mock di frontend dengan autentikasi backend sungguhan (JWT), pisahkan akses EOS vs Client di API dan UI, dan hentikan pengiriman kredensial perangkat/router ke frontend. Ini menutup gap keamanan terbesar yang tersisa: saat ini semua endpoint terbuka dan login hanya kosmetik di browser.

## In scope

- Akun dari environment: `ADMIN_USERNAME`/`ADMIN_PASSWORD` (EOS, wajib), `VIEWER_USERNAME`/`VIEWER_PASSWORD` (Client, opsional), `JWT_SECRET` (wajib), `JWT_EXPIRES_IN` (opsional, default `12h`). Backend fail-closed dengan pesan jelas bila env wajib tidak ada.
- `POST /api/auth/login` (publik) yang mengembalikan JWT + data user; throttle percobaan login in-memory per IP+username.
- Middleware global fail-closed: semua `/api/*` butuh JWT kecuali `/api/health` dan `/api/auth/login`.
- Otorisasi: request non-GET (mutasi, termasuk `POST /api/ping` dan `/api/ping-all`) wajib role EOS; GET untuk EOS dan Client.
- Redaksi kredensial: response device tidak memuat `sshPassword`/`sshUsername`; response project tidak memuat `routerConfig.password`; `PUT /api/projects/:id` tanpa password (kosong/absen) mempertahankan password tersimpan.
- Frontend: `AuthService` (login/logout/token/user/role), `ApiService.fetch` (Bearer + penanganan 401), interceptor HttpClient (untuk `ProjectService`), route guard, halaman login memanggil API, sidebar/monitoring/laporan membaca role dari AuthService.
- Unit test frontend untuk `AuthService` dan `ApiService`.

## Out of scope

- User management CRUD, penyimpanan user, akses per-site, `lastLogin` (post-v1, item 7)
- Audit log (post-v1)
- Refresh token, httpOnly cookie/CSRF, reset password, rate limit terdistribusi
- Endpoint reboot/export laporan (item 10) dan packaging/`.env.example` (item 12)
- History rewrite dan publikasi repo

## Build loop

Ikuti `workflow.stepReview: "feature"` di `blueprint/config.json`: satu review packet setelah semua step selesai. Checkpoint commit disabled; `/complete` yang membuat commit fitur. Setiap step harus meninggalkan project dalam keadaan jalan.

## Build steps

- [x] **Step 1 - Backend: auth core + proteksi endpoint** - Buat `backend/services/auth.js`: config env fail-closed, sign/verify JWT, middleware `requireAuth` + `requireEosForMutations`, throttle login in-memory; wire `POST /api/auth/login` + middleware global di `server.js`; tambah `jsonwebtoken` ke `backend/package.json`. *Done when:* server berhenti dengan pesan jelas tanpa env wajib; login benar mengembalikan token; `/api/*` tanpa token → 401; viewer non-GET → 403; viewer GET → 200.

- [x] **Step 2 - Backend: redaksi kredensial** - Strip `sshPassword`/`sshUsername` dari `/api/devices` dan `/api/devices/status`; strip `routerConfig.password` dari `/api/projects` dan `/api/projects/tree`; `PUT /api/projects/:id` mempertahankan password lama bila field kosong/absen. *Done when:* response builder tidak menyertakan field kredensial; update project tanpa password tidak menghapus password tersimpan.

- [x] **Step 3 - Frontend: auth core** - Buat `services/auth.service.ts`, `services/api.service.ts`, `services/auth.interceptor.ts`, `authGuard` di `app.routes.ts`, registrasi interceptor di `app.config.ts`. *Done when:* buka `/monitoring` tanpa token → redirect `/login`; build lolos.

- [x] **Step 4 - Frontend: migrasi call sites + project-site** - Ganti semua `fetch(` di pages dengan `ApiService.fetch`; project-site menampilkan hint "kosongkan untuk mempertahankan password" pada field password router. *Done when:* tidak ada `fetch(` mentah di pages; build lolos.

- [x] **Step 5 - Frontend: login/logout/role** - Halaman login memanggil API (loading + error), sidebar/monitoring/laporan memakai AuthService untuk role, aksi khusus EOS (termasuk Management/ping) tersembunyi untuk Client, logout membersihkan sesi. *Done when:* kredensial salah menampilkan error; sukses menyimpan sesi dan navigasi; Client tidak melihat aksi EOS; logout redirect ke `/login`.

- [x] **Step 6 - Test + verifikasi** - Unit test `AuthService` dan `ApiService`; jalankan `npm run verify`; siapkan smoke manual. *Done when:* test baru lolos di Verify; bukti smoke tercatat di ringkasan review.

- [x] **Step 7 - Perbaikan temuan independent review** - Perbaiki F-10 (preserve password berdasarkan `_id` + payload tanpa `routerConfig`), F-11 (batas map throttle), F-12 (hapus `fetchJson`), F-13 (`download` melempar error + feedback UI), plus normalisasi trailing slash path publik. Helper redaksi dipindah ke `backend/services/redact.js` agar bisa dites langsung. *Done when:* semua temuan berstatus `fixed` di ledger, cek redact lolos, `npm run verify` lolos, checkpoint baru siap direview.

- [x] **Step 8 - Perbaikan temuan review kedua** - Perbaiki F-14 (preserve password untuk site ber-id sementara yang tersimpan) dan F-15 (normalisasi `_id` nested sebelum update: buang id sementara di mode Mongo agar tidak CastError, ganti dengan id stabil di mode lokal). *Done when:* cek redact/project-utils lolos, `npm run verify` lolos, checkpoint baru siap direview.

- [x] **Step 9 - Perbaikan temuan review ketiga** - Perbaiki F-17: route `/project-site` dijaga `eosGuard` (Client dialihkan ke dashboard), link sidebar disembunyikan untuk Client, dan kegagalan simpan/hapus project-site menampilkan pesan error (403 eksplisit) alih-alih menutup modal diam-diam. *Done when:* `npm run verify` lolos, checkpoint baru siap direview.

## Files / areas

- `backend/services/auth.js` (baru), `backend/server.js`, `backend/package.json`
- `frontend/src/app/services/auth.service.ts` (baru), `services/api.service.ts` (baru), `services/auth.interceptor.ts` (baru), `services/auth.service.spec.ts` (baru), `services/api.service.spec.ts` (baru)
- `frontend/src/app/app.routes.ts`, `app.config.ts`
- `frontend/src/app/pages/login/*`, `components/sidebar/*`, `pages/monitoring/*`, `pages/laporan/*`, `pages/laporan-trafik/*`, `pages/project-site/*`, `pages/dashboard/*` (bila memanggil API)

## Data / contracts

- **Env:** `JWT_SECRET` (wajib), `ADMIN_USERNAME`/`ADMIN_PASSWORD` (wajib), `VIEWER_USERNAME`/`VIEWER_PASSWORD` (opsional), `JWT_EXPIRES_IN` (opsional, default `12h`).
- **`POST /api/auth/login`:** body `{username, password}` -> `200 {success:true, token, user:{username,name,role}}`; `401 {success:false,error}` untuk kredensial salah; `429 {success:false,error}` saat throttle.
- **Auth:** header `Authorization: Bearer <token>`; payload token `{sub, name, role, iat, exp}`; `401 {success:false,error}` untuk token absen/invalid/kedaluwarsa; `403 {success:false,error}` untuk role kurang.
- **Redaksi:** response device/project tidak pernah memuat field kredensial; `PUT /api/projects/:id` dengan `routerConfig.password` kosong/absen mempertahankan nilai tersimpan.
- **Penyimpanan token (frontend):** `localStorage` key `auth_token` + `auth_user` (mengikuti PRD). Risiko XSS dicatat; cookie httpOnly di luar scope v1.
- Tidak ada perubahan schema model.

## Testing

- Unit (vitest): `AuthService` - login sukses/gagal, logout membersihkan sesi, getter role; `ApiService` - header Bearer terpasang, 401 membersihkan sesi + redirect.
- Verify: `npm run verify` (test + build frontend).
- Smoke manual: login salah/benar; request tanpa token -> 401; viewer POST -> 403; GET devices tanpa field ssh; edit site tanpa password tidak menghapus password lama.

## Notes for the AI

- Fail-closed: endpoint `/api` baru otomatis terproteksi; jangan tambahkan pengecualian tanpa alasan.
- Hapus `DUMMY_USERS` dan `localStorage.currentUser` lama; ganti dengan sesi AuthService.
- Jangan sentuh item 10/12 atau ubah kontrak lain di luar yang tercatat.
- User perlu menambahkan `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` ke `backend/.env` sebelum smoke - jangan commit `.env`.
- Ikuti konvensi commit project: tanpa atribusi AI.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":7947,"specSha256":"68b29f5d5a956adc46db0dee8ce4a928d99b61db7853161c76eae8740dfc4af1","branch":"refs/heads/feature/autentikasi-rbac","head":"809ce42858e1f35ed4ae97564a7e2e69b1fcf880","baseRef":"refs/heads/main","baseCommit":"a2a5cce2c1f2a8df05d6833a2e4ed5f0e6bf7ac8","sourceTree":"cca4d2e56841e05f93fc5289fd0471df4b456e21","absentOptional":[]} -->

## Findings

### 1/F-10 [P1] closed - Renaming a site silently clears its stored router password

**File:** backend/server.js:933-944; frontend/src/app/pages/project-site/project-site.component.ts:140-161
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: security)
**Why it matters:** `preserveRouterPasswords()` matches the incoming site to the stored one by `name` only. The site modal lets the user edit `siteForm.name` (project-site.component.html:212-213) while the payload keeps the site's stable `_id` (project-site.component.ts:144), and since the GET response is now redacted the PUT body carries that site without `routerConfig.password`. The name lookup misses, the password is not restored, and the schema default `''` (backend/models/Project.js:46) overwrites the stored value. The result is silent loss of a stored router credential and a broken traffic collector for that site until an operator re-enters the password, contradicting the spec contract "PUT /api/projects/:id tanpa password (kosong/absen) mempertahankan password tersimpan". The same miss occurs when a payload site omits `routerConfig` entirely (the loop skips it), which additionally drops host/user. A simulation of the exact function body confirmed rename -> password `undefined`, unchanged name -> password preserved.
**Suggested fix:** Match the previous site by `_id` first (present in both the payload and the stored sites) and fall back to `name` for legacy records without `_id`; treat a missing `routerConfig` on an existing site as "keep the stored routerConfig" instead of dropping it.
**Resolution:** Re-reviewed at checkpoint 0096f5dd by the independent review of the complete delta (2026-09-23). The `_id`-first match, the `name` fallback, and the missing-`routerConfig` restoration are confirmed against the real module (rename preserves, explicit new password wins, stored config restored). Not closed: the added `temp_`-prefix skip (redact.js:34) introduced a regression for sites persisted with a `temp_` id in local JSON mode, tracked as F-14. The original rename case for a real `_id` is fixed. Re-reviewed at checkpoint b4877ee (2026-09-23): the real module preserves the password on rename by `_id`, restores the stored `routerConfig` when the payload omits it, and keeps an explicitly supplied new password; the regression it introduced is repaired and verified under F-14. Closed.

### 1/F-11 [P2] closed - Login throttle map grows without bound for distinct usernames

**File:** backend/services/auth.js:75-98
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: performance)
**Why it matters:** The in-memory `loginAttempts` map is only swept when `size > 500`, and the sweep deletes expired entries only. Every new `req.ip:username` pair creates an entry that lives for the full 15-minute window, and `/api/auth/login` is public, so an unauthenticated caller can create unlimited keys (rotating usernames) at request rate. Memory grows with request volume rather than with the number of real users, and a sustained flood can push the process toward OOM. The throttle itself is correct: attempts 1-10 are allowed and the 11th is blocked with `retryAfterSec` (verified against the module).
**Suggested fix:** Bound the structure: cap the map size (for example evict the oldest entry when the limit is exceeded) or bucket unknown usernames under the client IP so the key space stays bounded by client addresses.
**Resolution:** Re-reviewed at checkpoint 0096f5dd (2026-09-23). Exercising the real module confirms the 11th attempt in a window is blocked with `retryAfterSec`, and that after 2000 distinct keys the map stays bounded (oldest entries evicted). Tradeoff: an evicted key's counter resets, so a sustained flood of more than 1000 distinct keys can restart its own window; recorded in the receipt's Remaining risk. Closed. Re-confirmed at checkpoint b4877ee (2026-09-23): 11th attempt blocked, `clearLoginThrottle` resets after success, and an old key's counter is evicted after 2500 distinct keys.

### 1/F-12 [P3] closed - `ApiService.fetchJson` is unused dead code

**File:** frontend/src/app/services/api.service.ts:30-33
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `fetchJson` was added in this delta but has no caller anywhere in `frontend/src` (search finds only the definition). It is untested, unused API surface that a future reader may mistake for the preferred call path.
**Suggested fix:** Delete the method, or migrate call sites if it was meant to standardize JSON parsing; if kept, cover it with a test.
**Resolution:** Re-reviewed at checkpoint 0096f5dd (2026-09-23). `fetchJson` is absent from `frontend/src/app/services/api.service.ts`, and a search for `fetchJson` across `frontend/src` returns no matches. Closed. Re-confirmed at checkpoint b4877ee (2026-09-23): no reference exists in `frontend/src`.

### 1/F-13 [P3] closed - `ApiService.download` silently discards failed downloads

**File:** frontend/src/app/services/api.service.ts:36-39
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `if (!res.ok) return;` swallows every non-OK response with no user feedback and no error signal to the caller. For the working export (`/api/router/history/export`) a 500 or 503 now shows nothing at all, where the previous `window.open` at least surfaced the server response. The 401 case is handled by `fetch` (logout + redirect), so the gap is 4xx/5xx.
**Suggested fix:** Return a success/failure result or throw on non-OK so callers can show an error; leave the 401 path unchanged.
**Resolution:** Re-reviewed at checkpoint 0096f5dd (2026-09-23). `ApiService.download` throws `Gagal mengunduh (HTTP <status>)` on non-OK (api.service.ts:33-35); both export callers catch it and show a Swal error (`laporan.component.ts:274-286`, `laporan-trafik.component.ts:260-270`); the 401 path stays in `fetch`. No new defect. Closed. Re-confirmed at checkpoint b4877ee (2026-09-23): `api.service.ts:31-35` throws on non-OK and both callers show the Swal error.

### 1/F-14 [P1] closed - Editing a locally created site clears its stored router password

**File:** backend/services/redact.js:34; frontend/src/app/pages/project-site/project-site.component.ts:146; backend/storage.js:289
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: security)
**Why it matters:** In local JSON mode a site created through the UI is persisted with `_id: 'temp_<timestamp>'` (project-site.component.ts:146) and `updateLocalProject` stores the incoming `sites` array verbatim (storage.js:289). The F-10 repair skips every incoming site whose `_id` starts with `temp_` (redact.js:34) before it checks the stored sites, so the normal edit flow - the redacted GET leaves `routerConfig.password` absent, the UI hint says to leave the field empty to keep the stored password, and the PUT carries the persisted `temp_` id - drops the stored password and replaces the site's `routerConfig` with the payload. Exercising the real module: a persisted temp-id site lost its password (`undefined`) on edit while the same payload against an ObjectId site preserved `stored-pw`. This is the same silent credential loss and broken traffic collector as F-10, and it contradicts the spec contract "PUT /api/projects/:id tanpa password (kosong/absen) mempertahankan password tersimpan".
**Suggested fix:** Match the stored site by `_id` first regardless of prefix; only skip the `name` fallback when the incoming id starts with `temp_` and no stored site has that id. See F-15 for the related Mongo-mode temp-id handling.
**Resolution:** Fixed in the repair pass: `preserveRouterPasswords` now matches the stored site by `_id` whenever the payload carries one — including persisted `temp_` ids — and falls back to `name` only for payloads without `_id`. A genuinely new temp id with no stored match inherits nothing. Scripted checks against the real module: rename preserves, a stored temp-id site preserves, an unknown temp-id site does not inherit. Re-reviewed at checkpoint b4877ee (2026-09-23): against the real module, a persisted `temp_`-id site keeps its stored password on edit, a genuinely new temp id inherits nothing, and rename/missing-`routerConfig`/explicit-password cases behave. No new defect. Closed.

### 1/F-15 [P1] closed - Adding a new site fails with a CastError in MongoDB mode

**File:** backend/server.js:983; frontend/src/app/pages/project-site/project-site.component.ts:146
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: security)
**Why it matters:** New sites are sent with `_id: 'temp_<timestamp>'`. In MongoDB mode `Project.findByIdAndUpdate(req.params.id, payload, ...)` casts the update through the real schema; exercising the installed Mongoose model shows the cast throws `CastError: Cast to embedded failed ... sites.0._id: Cast to ObjectId failed for value "temp_..."`, so the route's catch returns 500 and the site is never saved while the frontend error handler silently closes the modal. Pre-existing at base commit a2a5cce (same update call and payload), not introduced by this delta. Missing validation: a live MongoDB round-trip; no DB or server could be started in this review.
**Suggested fix:** Strip `_id` from incoming sites that are not found in the stored project before `findByIdAndUpdate` so Mongoose assigns ObjectIds, or assign ObjectIds server-side for new sites. Repair together with F-14 so one temp-id normalization serves both modes.
**Resolution:** Fixed in the repair pass together with F-14: `normalizeNestedIds` (`backend/services/project-utils.js`) runs on the PUT payload before the update — in Mongo mode it removes temp ids from sites/gedung/floors so Mongoose assigns ObjectIds, and in local mode it replaces temp/absent ids with stable ids. Scripted checks: `Query.prototype._castUpdate` throws for the temp-id payload and does not throw for the normalized payload; local/mongo normalization verified for all three nesting levels. A live MongoDB round-trip was still not executed (no DB available); the cast simulation is the strongest available evidence. Re-reviewed at checkpoint b4877ee (2026-09-23): `normalizeNestedIds` removes temp ids at site/gedung/floor level in Mongo mode; the installed Mongoose `_castUpdate` still throws `CastError` for the raw temp-id payload and casts the normalized payload cleanly, assigning real ObjectIds to new nested entities. Local-mode normalization verified. No live MongoDB round-trip was available. Closed.

### 1/F-17 [P2] closed - Project & Site mutation controls stay visible to Client and fail silently

**File:** frontend/src/app/pages/project-site/project-site.component.html:13,41,44,64,91,94,112,136,139,149,155; frontend/src/app/pages/project-site/project-site.component.ts:104-107,156-159; frontend/src/app/app.routes.ts:28
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: security)
**Why it matters:** The verified spec's step-5 done-when is "Client tidak melihat aksi EOS", and the feature goal separates EOS and Client access in the UI. Monitoring and Laporan hide their EOS controls with `*ngIf="!isClient"` (monitoring.component.html:22,142,177,403; laporan.component.html:12,47,60), but `/project-site` renders every project/site/gedung/lantai add, edit, and delete control unconditionally and its route uses only `authGuard` (app.routes.ts:28), with no `isClient` handling in the component. The backend correctly returns 403 for Client mutations, so there is no privilege escalation, but the component's error callbacks only close the modal (`finish()` at project-site.component.ts:104-107 and 156-159, plus the same pattern in the gedung/lantai saves), and `deleteProject` has no error handler at all - so a Client sees working-looking controls whose actions are silently discarded. This template was not modified by this delta, but the new backend 403 makes the gap reachable in the shipped UI.
**Suggested fix:** Hide the mutation controls for Client (or make the page read-only / role-guard the route) using the existing `AuthService.isClient` pattern from monitoring and laporan, and surface a 403 message instead of closing silently. Backend enforcement stays unchanged.
**Resolution:** Re-reviewed at checkpoint 809ce428 (2026-09-23). Repair confirmed against the new code: `/project-site` is guarded by `eosGuard` (app.routes.ts:21-27,36) so an authenticated Client is redirected to `/dashboard`; the sidebar link is hidden for Client (sidebar.component.html:27); every project/site/gedung/lantai save and delete error callback now calls `notifyError` (project-site.component.ts:105-108,127,163,184,226,248,285,305), which shows the explicit 403 message "Akses ditolak. Aksi ini hanya untuk role EOS." instead of closing the modal silently (project-site.component.ts:319-329). Backend enforcement is unchanged. `npm run verify` passed (11 tests + build) and the repair introduced no new defect. Closed.

## Independent review

# Independent Review

**Status:** passed
**Target commit:** 809ce42858e1f35ed4ae97564a7e2e69b1fcf880
**Base commit:** a2a5cce2c1f2a8df05d6833a2e4ed5f0e6bf7ac8
**Base ref:** main
**Spec hash:** 68b29f5d5a956adc46db0dee8ce4a928d99b61db7853161c76eae8740dfc4af1
**Prepared by:** opencode
**Builder model:** opencode-go/deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-23T15:42:10.067Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** opencode-go/deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-23T15:51:12.617Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `git rev-parse HEAD`; `git rev-parse main`; `git merge-base main HEAD`; `git status --porcelain --untracked-files=all`: pass (HEAD = target, merge base = base commit, only `blueprint/context/review.md` differed)
- `npm run verify`: pass (5 test files, 11 tests; Angular production build completed)
- `node --check backend/server.js` and `backend/services/{auth,redact,project-utils}.js`, `backend/storage.js`: pass
- Inline `node` checks of `backend/services/redact.js` (rename by `_id`, persisted temp id, unknown temp id, missing `routerConfig`, explicit new password, name fallback, no existing project, device/project stripping): pass
- Inline `node` checks of `backend/services/project-utils.js` (Mongo temp-id removal at site/gedung/floor, real-id retention, local stable ids, non-array guard): pass
- Inline `node` checks of `backend/services/auth.js` (10 attempts allowed / 11th blocked with `retryAfterSec`, clear on success, eviction bound, role authentication, token accept/reject, public-path skip, 401/403 middleware): pass
- Mongoose cast simulation (`Project.findByIdAndUpdate` + `Query.prototype._castUpdate`): pass (raw temp-id payload throws `CastError`; normalized payload casts)

## Evidence

- Freshness: `HEAD` = `809ce42858e1f35ed4ae97564a7e2e69b1fcf880`; merge-base(`main`, `HEAD`) = `a2a5cce2c1f2a8df05d6833a2e4ed5f0e6bf7ac8`; spec SHA-256 = `68b29f5d5a956adc46db0dee8ce4a928d99b61db7853161c76eae8740dfc4af1`; no path differed from the target except `blueprint/context/review.md` and `blueprint/context/findings.md`.
- Public allowlist: `backend/services/auth.js:9-15,116`; every route is under `/api` (`backend/server.js:185-1126`) and only health/login skip the guard.
- Role enforcement: `backend/services/auth.js:131-139`; `/project-site` guarded by `eosGuard` (`frontend/src/app/app.routes.ts:21-27,36`); sidebar link hidden for Client (`frontend/src/app/components/sidebar/sidebar.component.html:27`); Client controls hidden in monitoring/laporan templates.
- Credential redaction wiring: `backend/services/redact.js:4-19`; used at `backend/server.js:870,920,923,969,972,986,994,1022,1025,1042,1056`.
- Router-password preservation: `backend/services/redact.js:27-52`; used at `backend/server.js:983,991`.
- Nested-id normalization: `backend/services/project-utils.js:16-39`; used at `backend/server.js:984,992`.
- Login throttle: `backend/services/auth.js:81-113`; used at `backend/server.js:202-217`.
- Frontend auth: `auth.service.ts` (localStorage `auth_token`/`auth_user`), `api.service.ts` (Bearer header, 401 logout + redirect, throwing `download`), `auth.interceptor.ts` (HttpClient), route guards; raw `fetch(` remains only in `auth.service.ts:40` and inside `api.service.ts`, never in pages.
- F-17 repair: `eosGuard` (`app.routes.ts:22-27,36`), hidden sidebar link (`sidebar.component.html:27`), and every save/delete error callback surfacing the 403 message (`project-site.component.ts:105-108,127,163,184,226,248,285,305,319-329`).
- Tests: `frontend/src/app/services/auth.service.spec.ts` and `api.service.spec.ts` cover login success/failure/logout and Bearer/401; no skipped, focused, or placeholder tests found.
- Ledger: F-17 moved to `closed`; F-07, F-08, F-09, F-16 re-confirmed open (P2/P3); no new findings added.

## Findings

- None. No new confirmed finding this pass; F-17 closed; F-07 (P2), F-08 (P3), F-09 (P3), F-16 (P3) remain open and do not block.

## Remaining risk

- Login-throttle eviction tradeoff carried from F-11: more than 1000 distinct `ip:username` keys evict the oldest counters, so a sustained rotating-username flood can reset a target key's window.
- No live MongoDB round-trip and no running-server smoke: `/api` middleware mounting, Mongo persistence, and browser behavior were verified by code reading plus pure-module and cast simulations only.
- No committed backend regression tests for the auth/redact/normalization helpers (F-16, P3).
- Mongo-mode `PUT /api/projects/:id` returns a 500 when the project no longer exists (`updated.toObject()` on null, `backend/server.js:986`) while local mode returns 200 with `project: null`; user-visible as a generic save error.

