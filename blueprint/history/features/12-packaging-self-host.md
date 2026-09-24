# Feature: Packaging Self-Host

**From build-plan:** feature 12
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/packaging-self-host`

## Goal

Membuat repo ini bisa dipakai orang lain tanpa menebak-nebak: README setup yang jelas, `.env.example` yang lengkap, lisensi, dan paket Docker Compose (backend + frontend + MongoDB) untuk self-host. Sekalian menutup doc drift F-08 dan F-21.

## In scope

- `README.md` root: gambaran produk, prasyarat, setup `.env` dari `.env.example`, cara jalan (dev + Docker), akun auth dari env, demo seed, test/verify, verifikasi Telegram, backlog roadmap, lisensi.
- `backend/.env.example`: semua env var yang dipakai kode (nama, wajib/opsional, contoh nilai aman) - tanpa nilai nyata. `DEFAULT_SSH_*` tidak didokumentasikan (tidak dipakai kode).
- `LICENSE`: sesuai pilihan user (rekomendasi MIT).
- Docker: `backend/Dockerfile`, `frontend/Dockerfile` + `nginx.conf` (SPA + proxy `/api`), `docker-compose.yml` (backend + frontend + mongo + volume data), `.dockerignore` di kedua folder, dan bagian Docker di README.
- `frontend/README.md`: ganti boilerplate Angular dengan pointer ke README root.
- Doc drift: F-08 (nama site institusi di project-plan §1 + overview Site) dan F-21 (`ssh2` di project-plan §5 + overview tech) - sudah diperbaiki di fase spec; fingerprint overview di-regenerate.

## Out of scope

- CI/deploy otomatis (workflow Verify sudah ada; deploy tetap manual), Render/Vercel (`/release`), HTTPS/domain, Kubernetes.
- F-16 (sudah ditangani `/tests`; menunggu audit untuk `closed`), item 7 (post-v1), remote reboot (backlog).

## Build loop

Ikuti `workflow.stepReview: "feature"`: satu review packet setelah semua step selesai. Checkpoint commit disabled; `/complete` yang membuat commit fitur. Setiap step harus meninggalkan project dalam keadaan jalan.

## Build steps

- [x] **Step 1 - Env example + README root** - Buat `backend/.env.example` (semua var + penanda wajib/opsional) dan `README.md` root: gambaran, prasyarat (Node 24, npm; Docker opsional), setup, cara jalan dev, akun auth dari env, `seed:demo`, `telegram:test`, `npm test`/`npm run verify`, roadmap backlog, lisensi. *Done when:* README bisa diikuti dari nol tanpa info tambahan dari chat; `.env.example` tidak memuat nilai nyata.

- [x] **Step 2 - LICENSE** - Tambah file LICENSE sesuai pilihan user. *Done when:* file ada dan nama pemegang lisensi terisi.

- [x] **Step 3 - Docker backend** - `backend/Dockerfile` (node:24-alpine, `npm ci --omit=dev`, CMD `node server.js`) + `backend/.dockerignore`. *Done when:* syntax/logic review konsisten dengan cara start backend saat ini (env-based).

- [x] **Step 4 - Docker frontend** - `frontend/Dockerfile` multi-stage (build Angular -> nginx) + `frontend/nginx.conf` (SPA fallback + proxy `/api` ke `backend:3000`) + `frontend/.dockerignore`. *Done when:* output build yang disalin sesuai (`dist/frontend/browser`), proxy `/api` terdefinisi.

- [x] **Step 5 - docker-compose.yml** - Service `backend` (env_file `.env`, volume `backend/data`, healthcheck `/api/health`), `frontend` (port host 80:80, depends_on backend), `mongo` (volume `mongo-data`); dokumentasi cara menunjuk `MONGO_URI` ke mongo/local/Atlas. *Done when:* compose valid secara struktur; README menjelaskan `docker compose up --build`.

- [x] **Step 6 - Rapikan dokumen** - Ganti `frontend/README.md` boilerplate dengan pointer ke README root; pastikan F-08/F-21 tidak menyisakan referensi lama di plan/overview. *Done when:* grep nama site institusi + `ssh2` di plan/overview bersih.

- [x] **Step 7 - Verifikasi + ledger** - Jalankan `npm run verify`; siapkan smoke manual (ikuti README dari nol); tandai F-08 dan F-21 `fixed` di ledger. *Done when:* Verify lolos; smoke checklist tercatat; checkpoint siap direview.

- [x] **Step 8 - Perbaikan temuan review** - Perbaiki F-22 (`.gitignore`: `!backend/.env.example` supaya file ikut ter-commit), F-23 (healthcheck mongo + `condition: service_healthy`), F-24 (`JWT_SECRET`/`ADMIN_PASSWORD` kosong di `.env.example` agar fail-closed benar-benar aktif). *Done when:* `git check-ignore` bersih untuk `.env.example`, `npm run verify` lolos, checkpoint baru siap direview.

## Files / areas

- `README.md`, `backend/.env.example`, `LICENSE`, `docker-compose.yml` (baru)
- `backend/Dockerfile`, `backend/.dockerignore` (baru)
- `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/.dockerignore` (baru)
- `frontend/README.md`, `blueprint/project-plan.md`, `blueprint/context/project-overview.md`, `blueprint/context/findings.md`

## Data / contracts

- Env var yang didokumentasikan: `PORT` (default 3000), `MONGO_URI` (opsional; kosong = mode JSON lokal), `JWT_SECRET` (wajib), `ADMIN_USERNAME`/`ADMIN_PASSWORD` (wajib), `VIEWER_USERNAME`/`VIEWER_PASSWORD` (opsional), `MIKROTIK_HOST/PORT/USER/PASSWORD/INTERFACE/TIMEOUT/DISPLAY_PORT` (opsional, fallback global), `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (opsional).
- Docker: container frontend menyajikan SPA + proxy `/api` -> `backend:3000`; backend memakai `backend/data` sebagai volume; service mongo memakai volume `mongo-data`.
- Tidak ada perubahan kontrak API atau model data.

## Testing

- Verify: `npm run verify` (backend + frontend tests + build).
- Docker tidak terinstal di mesin ini: verifikasi Docker = review syntax dan instruksi README; user memverifikasi dengan `docker compose up --build` saat Docker tersedia.
- Smoke manual: ikuti README dari nol (copy `.env.example` -> isi -> `npm run dev` -> login) dan jalankan `npm run seed:demo` + `npm run telegram:test`.

## Notes for the AI

- Jangan pernah menulis nilai kredensial nyata di `.env.example` atau README (placeholder yang jelas).
- README berbahasa Indonesia (konsisten dengan dokumen dan UI proyek); versi Inggris bisa jadi follow-up terpisah.
- Lisensi: tunggu keputusan user sebelum menulis file (rekomendasi MIT).
- Jangan tambah dependency baru; jangan sentuh item 7 atau F-16.
- Ikuti konvensi commit project: tanpa atribusi AI.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":5970,"specSha256":"ef9c5f88dd11d8dfd1d401004e8941c6de192535920ed149017eefc48cd42e8d","branch":"refs/heads/feature/packaging-self-host","head":"6cf1407578093a2dbb82fb460094c9bc7b447254","baseRef":"refs/heads/main","baseCommit":"f0c316110f075276252368c607d5e39d77a03567","sourceTree":"19962e3b923058ce8deaf855ac58c4bce67f6c13","absentOptional":[]} -->

## Findings

### 12/F-08 [P3] closed - Tracked blueprint docs still present the institution's fixed site list

**File:** blueprint/context/project-overview.md:64; blueprint/project-plan.md:4
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** This delta re-baselined both documents for a public, self-hosted release and made sites data-driven, but the Site data-model section and the project-plan problem statement still describe the five institution site names (`Direktorat, Gigi, Keperawatan, Gizi, Kebidanan`) as the model. A fresh install now starts with zero sites, so the overview - the source of truth agents read - contradicts the shipped behavior and keeps the old institution-specific example set in a published repo.
**Suggested fix:** Reword the Site section to describe sites as records from the Project collection with an empty fresh install, and update the project-plan sentence the same way (or clearly mark the old names as generic examples).
**Resolution:** Re-examined at checkpoint acfb1a1 by the independent review of the current delta (2026-09-23): `blueprint/context/project-overview.md:64` and `blueprint/project-plan.md:4` still name the institution sites. Status stays open (P3). Re-confirmed at checkpoint b4877ee (2026-09-23): both lines still name the five sites; this delta only revised the User section and the `/pengguna` line. Status stays open (P3). Re-confirmed at checkpoint 809ce428 (2026-09-23): `blueprint/context/project-overview.md:64` and `blueprint/project-plan.md:4` still name the five institution sites. Status stays open (P3).
Re-confirmed at checkpoint 3615c4c (2026-09-23): the delta reworded the Device Management line (`project-overview.md:31`, `project-plan.md:17`) and added the reboot backlog note, but `project-overview.md:64` and `project-plan.md:4` still name the five institution sites. Status stays open (P3); explicitly out of scope for feature 10. Re-confirmed at checkpoint 7581c0e (2026-09-23): both lines still name the five institution sites. Status stays open (P3).
**Fixed in feature 12 (2026-09-23):** `blueprint/project-plan.md` §1 no longer names the institution sites, and the overview's Site section now describes sites as Project records with an empty fresh install (created through the Project & Site page). A grep for the five names across both files returns nothing. Awaiting re-review.
**Closed on re-review (checkpoint cd9c095, 2026-09-24):** `blueprint/context/project-overview.md:64` now reads "Site adalah record di koleksi Project; instance baru mulai kosong dan site dibuat lewat halaman Project & Site", and `blueprint/project-plan.md:4` names no institution site. Neither file mentions any of the five names; the repair introduced no new defect.

### 12/F-21 [P3] closed - Blueprint docs still list ssh2 (reboot) as current network integration after the reboot deferral

**File:** blueprint/context/project-overview.md:85; blueprint/project-plan.md:37
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** This work item removed remote reboot from v1, deleted the reboot UI and the `/api/device/reboot` route, and dropped `ssh2` from the root and backend manifests; the new backlog entries in `blueprint/build-plan.md` and `project-overview.md` say reboot is post-v1. But the agent-facing source of truth still presents `ssh2` as part of the current stack: `project-overview.md:85` reads "MikroTik RouterOS API (port 8728), ssh2 (reboot), ICMP ping" and `project-plan.md:37` reads "... / ssh2 / ping". Nothing in the repo declares or requires `ssh2` any more, so both lines contradict the shipped state and the docs this same delta added.
**Suggested fix:** Drop `ssh2` from both network-integration lines (or mark remote reboot as a post-v1 backlog item there), matching the wording already used in `build-plan.md` and `project-overview.md`'s backlog line.
**Resolution:** Carried forward from feature 10 (not repaired there); the doc drift is recorded for the next docs/packaging work item.
**Fixed in feature 12 (2026-09-23):** `ssh2` dropped from `blueprint/project-plan.md` §5 (now "MikroTik RouterOS API (port 8728) / ICMP ping") and from the overview's network-integration line (now "MikroTik RouterOS API (port 8728), ICMP ping (remote reboot post-v1)"). Remote reboot remains in the backlog. Awaiting re-review.
**Closed on re-review (checkpoint cd9c095, 2026-09-24):** both lines read as described (`project-overview.md:85`, `project-plan.md:37`); `git grep ssh2` over the target finds no code, manifest, or plan/overview reference outside this ledger, the work-item spec, and history archives, and remote reboot stays in the backlog. The regenerated overview fingerprint (`dac2eb4b...`, recomputed from the current `project-plan.md` bytes plus checkbox-normalized `build-plan.md` bytes and matching the marker) confirms the doc edit propagated. The repair introduced no new defect.

### 12/F-22 [P1] closed - `backend/.env.example` is not in the checkpoint, so the documented setup fails on a fresh clone

**File:** .gitignore:40; README.md:30; README.md:58; backend/.env.example:2
**Found:** 2026-09-24 by /audit independent current (scope: current; lens: quality)
**Why it matters:** Both README setup paths start with `cp backend/.env.example backend/.env` (`README.md:30` for development, `README.md:58` for Docker), and `README.md:87` points readers to the file for the full variable list. The file is not part of checkpoint cd9c095: `.gitignore:40` (`.env.*`) matches it, `git check-ignore -v backend/.env.example` reports `.gitignore:40:.env.*`, `git ls-files --stage -- backend/.env.example` and `git ls-tree -r HEAD` contain no `.env*` path, and `git status --ignored` shows `!! backend/.env.example`. Its content is correct, but it exists only as an ignored, untracked local artifact, and its own header (`backend/.env.example:2`) claims it is the file that goes to the repo. A fresh clone therefore cannot follow the first step of either setup path - the exact "repo bisa dipakai orang lain tanpa menebak-nebak" goal this feature exists for.
**Suggested fix:** Add `!backend/.env.example` after `.gitignore:40` (or narrow the pattern so `*.example` survives), then commit the existing file in a new approved checkpoint through `/implement`. The content needs no changes, so no current requirement is lost.
**Resolution:** Fixed in the repair pass: `.gitignore` now carries `!backend/.env.example` after the `.env.*` pattern; `git check-ignore` no longer reports the file as ignored and `git status` lists it untracked, so it is included in the next checkpoint and `cp backend/.env.example backend/.env` works on a fresh clone. Awaiting re-review.
**Closed on re-review (target 6cf1407, 2026-09-24):** The target tree now contains `backend/.env.example` (`git ls-tree -r 6cf1407 -- backend/.env.example`) and the index tracks it (`git ls-files --stage`). `.gitignore:39-43` keeps `.env`/`.env.*` and adds `!backend/.env.example`; `git check-ignore -v backend/.env.example` exits 1 with no output, so the file is no longer ignored and a fresh clone can run `cp backend/.env.example backend/.env`. The repair introduced no new defect.

### 12/F-23 [P2] closed - Compose backend can silently fall back to JSON storage when MongoDB is not ready at startup

**File:** docker-compose.yml:19-20; backend/server.js:27-33,73
**Found:** 2026-09-24 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The compose backend uses plain `depends_on: mongo` with no readiness condition (`docker-compose.yml:19-20`), while `backend/server.js:27-30` gives the initial Mongoose connection only `serverSelectionTimeoutMS: 3000` and merely logs a failure. The process does not exit or retry, and every storage branch selects Mongo only when `mongoose.connection.readyState === 1` (`backend/server.js:73` and 18 other sites; `backend/storage.js:167`), so the app permanently uses the JSON store in `backend/data` while the bundled MongoDB it was pointed at comes up seconds later. `README.md:66` promises the bundled MongoDB as the default, so a first `docker compose up --build` on a slow or initializing volume can produce an apparently healthy stack whose writes silently bypass Mongo. Docker is not installed in this environment, so the startup-timing trigger was not observed; the code path and the missing readiness gate are confirmed by reading.
**Suggested fix:** Give the `mongo` service a healthcheck and make the backend wait for it (`depends_on: { mongo: { condition: service_healthy } }`), or retry the initial connect before declaring offline mode. No current requirement is lost.
**Resolution:** Fixed in the repair pass: the `mongo` service now has a healthcheck (`mongosh --quiet --eval db.adminCommand('ping').ok`) and the backend uses `depends_on: mongo: condition: service_healthy`, so the first Mongoose connect happens only after MongoDB is ready. The startup-timing trigger still cannot be executed here (Docker is not installed). Awaiting re-review.
**Closed on re-review (target 6cf1407, 2026-09-24):** `docker-compose.yml:7-11` gives `mongo` the healthcheck and `:24-28` makes `backend` wait with `condition: service_healthy`, which is valid for the compose format in use (no `version` key, Compose spec); the backend healthcheck (`:29-33`) uses `wget` against the public `/api/health` route (`backend/server.js:186`, public via `backend/services/auth.js:9`), and the frontend proxy target (`frontend/nginx.conf:15`) matches the service name and port. Docker could not be executed here, so the schema and wiring were validated by reading. The compose-startup defect is gone and the repair added no new defect. Residual: daemon/host-restart starts can still bypass the readiness ordering because restart policies do not honor `depends_on` conditions - tracked as F-25.

### 12/F-24 [P2] closed - `.env.example` auth placeholders defeat the fail-closed check and ship a publicly known signing key

**File:** backend/.env.example:17,20; backend/services/auth.js:19-24; README.md:80
**Found:** 2026-09-24 by /audit independent current (scope: current; lens: security)
**Why it matters:** `backend/.env.example:17` ships `JWT_SECRET=ganti-dengan-string-acak-panjang` and `backend/.env.example:20` ships `ADMIN_PASSWORD=ganti-dengan-password-kuat` (placeholders, not real credentials; no value is reproduced from a real environment). Because both are truthy, copying the example and filling nothing else passes `auth.assertAuthConfig()` (`backend/services/auth.js:19-24`), so the backend starts instead of refusing as `README.md:80` promises ("backend menolak start tanpanya"). Once the example is tracked (F-22), every self-hoster shares a publicly known JWT signing key, and tokens can be forged by anyone who can reach the login page.
**Suggested fix:** Leave `JWT_SECRET=` and `ADMIN_PASSWORD=` empty in the example so the existing fail-closed check rejects an unfilled `.env`, keeping their generate/choose comments. No current requirement is lost.
**Resolution:** Fixed in the repair pass: `JWT_SECRET=` and `ADMIN_PASSWORD=` are now empty in `.env.example` (the comments keep the generate/choose guidance), so an unfilled copy fails `assertAuthConfig()` and the backend refuses to start with the documented message instead of running on a publicly known key. Awaiting re-review.
**Closed on re-review (target 6cf1407, 2026-09-24):** `backend/.env.example:17,20` ship empty `JWT_SECRET=` and `ADMIN_PASSWORD=` with the guidance comments kept (`:14-16,19`). `require('dotenv').config()` (`backend/server.js:1`) loads the copied `.env`, both values are falsy, and `assertAuthConfig()` (`backend/services/auth.js:17-25`) collects them and exits 1, so `README.md:80` ("backend menolak start tanpanya") is now true and no publicly known signing key ships. No new defect.

## Independent review

# Independent Review

**Status:** passed
**Target commit:** 6cf1407578093a2dbb82fb460094c9bc7b447254
**Base commit:** f0c316110f075276252368c607d5e39d77a03567
**Base ref:** main
**Spec hash:** ef9c5f88dd11d8dfd1d401004e8941c6de192535920ed149017eefc48cd42e8d
**Prepared by:** opencode
**Builder model:** opencode-go/deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-24T00:58:58.245Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** opencode-go/deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-24T01:07:42.258Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `npm run verify`: pass - backend 25/25 tests, frontend 11/11 tests, Angular production build OK (`frontend/dist/frontend`)
- `git rev-parse HEAD`, `git rev-parse main`, `git merge-base main 6cf1407`: pass - HEAD equals the Target commit, `main` equals the Base commit, and the merge base equals the Base commit
- Node SHA-256 of `blueprint/context/current-feature.md` raw bytes: pass - `ef9c5f88...cd42e8d` matches the recorded Spec hash
- `git status --porcelain=v1 --untracked-files=all`: pass - only `blueprint/context/review.md` modified before this pass; this pass also updated `blueprint/context/findings.md`
- `git check-ignore -v backend/.env.example`, `git ls-files --stage`, `git ls-tree -r 6cf1407`: pass - the example is not ignored, is tracked in the index, and is present in the target tree (F-22)
- `git diff f0c3161..6cf1407` full read plus `git grep` for `ssh2` / `DEFAULT_SSH` / `process.env` and the env-coverage cross-check: pass - no stale references; `.env.example` documents exactly the variables read under `backend/`
- Secret-shaped string scan over the delta diff: pass - only the ledger's description of the old placeholder values matched; no real secret values in the delta
- Skip/focus scan (`.skip(`, `.only(`, `test.todo`) over `backend/test` and `frontend/src`: pass - none found
- `docker compose config`, `docker build`, `docker compose up --build`: unavailable - Docker is not installed and no local YAML parser is available; compose, Dockerfiles, and nginx were validated by reading only

## Evidence

- Freshness: `HEAD` = `6cf1407`, `main` = `f0c3161`, merge base = `f0c3161`, spec hash matched, and the only working-tree difference was `blueprint/context/review.md`; `backend/.env.example` is tracked in the target (`git ls-tree -r 6cf1407 -- backend/.env.example`).
- Reviewer identity: `opencode` adapter matches `Requested reviewer`, and the request's runtime-default sentinel is replaced by the exact model `opencode-go/deepseek-v4.1-flash`; context is a fresh subagent without the builder transcript.
- F-22 closed: `.gitignore:39-43` keeps `.env`/`.env.*` and adds `!backend/.env.example`; `git check-ignore -v backend/.env.example` exits 1 (not ignored); index and target tree both contain the file; `cp backend/.env.example backend/.env` works on a fresh clone.
- F-23 closed: `docker-compose.yml:7-11` adds the `mongo` healthcheck (`mongosh --quiet --eval db.adminCommand('ping').ok`) and `:24-28` adds `depends_on: mongo: condition: service_healthy`; the backend healthcheck `:29-33` (`wget` against `/api/health`) matches the public route (`backend/server.js:186`, `backend/services/auth.js:9`); nginx upstream `frontend/nginx.conf:15` matches service `backend:3000`. Docker not executable here.
- F-24 closed: `backend/.env.example:17,20` are empty at the target; `assertAuthConfig()` (`backend/services/auth.js:17-25`) exits 1 when `JWT_SECRET`/`ADMIN_USERNAME`/`ADMIN_PASSWORD` are falsy, so an unfilled copy fails closed as `README.md:80` promises; no publicly known signing key ships.
- F-25 new (unverified): restart policies (`docker-compose.yml:4,15`) are not governed by `depends_on` conditions on daemon/host restart, and the initial connect still has no retry (`backend/server.js:27-33`, `:73`), so the F-23 divergence class can recur; not reproduced (no Docker).
- F-26 new (open): `backend/package.json:15` declares `"license": "ISC"` while `LICENSE:1` and `README.md:128` state MIT.
- Env coverage: `.env.example` names exactly the variables read via `process.env` under `backend/` (PORT, MONGO_URI, JWT_SECRET, JWT_EXPIRES_IN, ADMIN/VIEWER credentials, seven MIKROTIK_* names, TELEGRAM_BOT_TOKEN/CHAT_ID); `DEFAULT_SSH_*` is absent from code, and no real credential value appears anywhere in the delta (all placeholders or empty).
- README and docs: commands (`dev`, `start`, `test`, `seed:demo`, `telegram:test`, `verify`), the auth fail-closed claim, public paths, EOS-only mutations, the `/api` dev proxy, and the JSON fallback all match the code; `frontend/README.md` points to the root README; `project-overview.md`/`project-plan.md` no longer name the institution sites or `ssh2`, and the regenerated overview fingerprint marker is present.
- Docker wiring by reading: frontend build output `dist/frontend/browser` matches `angular.json` project `frontend` and this pass's build output (`frontend/dist/frontend`); both Dockerfiles `npm ci` against tracked lockfiles; the `.dockerignore` files exclude `node_modules`, `dist`, `data`, and `.env*` so no secret is baked into an image.
- Tests: the delta adds no tests (packaging files); the existing suites stay green and no skipped, focused, or placeholder tests were found. Docker-based verification is the outstanding gap.

## Findings

- Closed this pass: F-22 [P1], F-23 [P2], F-24 [P2] - repairs re-reviewed against the target code, no new defect introduced.
- New: F-25 [P2] unverified - restart-policy starts can still bypass Mongo readiness (Docker unavailable to reproduce); F-26 [P3] open - backend package metadata still declares ISC while the repo ships MIT.
- F-16 [P3] stays `fixed`: its repaired suites run green at the target, but the repair files live at base `f0c3161`, outside this delta.
- No P0 or P1 finding is `open` or `fixed`.

## Remaining risk

- Docker is not installed: `docker compose config`, `docker build`, and `docker compose up --build` could not run; the `mongosh` healthcheck in `mongo:7`, the `wget` healthcheck on `node:24-alpine`, the nginx `/api/` proxy, and both image builds were validated by reading only.
- F-25's restart race was not reproduced; a Docker-equipped host-restart run is needed to confirm or dismiss it.
- The README quick start and Docker flow were not executed end-to-end (no servers started), and `npm ci` inside either image was not exercised.
- The compose healthcheck and nginx upstream hardcode backend port 3000 while `PORT` is documented as configurable (`.env.example:5`, `README.md:78`); changing `PORT` for the Docker stack would break readiness and the proxy (not exercised).

