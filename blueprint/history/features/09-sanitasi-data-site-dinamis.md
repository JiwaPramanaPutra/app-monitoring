# Feature: Sanitasi Data & Site Dinamis

**From build-plan:** feature 9
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/sanitasi-data-site-dinamis`

## Goal

Menghapus seluruh data institusi nyata (kredensial, IP, MAC, nama) dari kode dan seed, serta menjadikan daftar site sebagai data dari koleksi Project, supaya organisasi mana pun bisa self-host dengan datanya sendiri. Fitur ini adalah prasyarat publikasi: tanpa ini, repo publik = kebocoran kredensial dan kode yang hanya cocok untuk satu institusi.

## In scope

- Hapus kredensial/IP/user MikroTik hardcoded dari `server.js` (fallback `MIKROTIK_CONFIG`, `SITE_ROUTER_MAP`) dan `storage.js` (seed project).
- Router config fail-closed: urutan resolusi `Project.sites[].routerConfig` -> env `MIKROTIK_*` (hanya jika host+user+password lengkap) -> "not configured" tanpa percobaan koneksi.
- Hapus endpoint yang tidak dipakai frontend dan memuat data institusi: `/api/router/clients` (MAC AP hardcoded) dan `/api/router/site-mapping`. Pertahankan `/api/router/interfaces` (generik) dengan config env + fail-closed.
- Background traffic collector membaca site ber-`routerConfig` dari data Project, bukan `SITE_ROUTER_MAP`.
- Seed lokal jadi kosong; tambah script `seed:demo` dengan data fiktif.
- Frontend: API base URL jadi relatif (`/api`) + dev proxy ke `localhost:3000`; hapus semua URL hardcoded.
- Frontend: daftar site dinamis dari ProjectService di monitoring, laporan-trafik, laporan; hapus asumsi `'Gizi'`; deteksi live dari `siteConfigured`; empty state saat belum ada site.
- Frontend: hapus data institusi & mock (login dummy, teks "Poltekkes Kemenkes Semarang", halaman Pengguna, data statis `site-hierarchy.ts`).
- Repo: `NEXUS_PRD.md` di-untrack + di-gitignore (file tetap ada di lokal, tidak masuk repo publik).
- Unit test untuk pembentukan site tree dari data Project.

## Out of scope

- Auth/JWT dan penyembunyian kredensial perangkat dari response API (item 1).
- Export CSV laporan, keputusan reboot & Telegram #8 (item 10).
- README, LICENSE, Docker, `.env.example` (item 12).
- Penulisan ulang Git history dan push publik (langkah publish terpisah, butuh approval).
- Fitur AI troubleshooting (backlog).

## Build loop

Ikuti `workflow.stepReview: "feature"` di `blueprint/config.json`: satu review packet setelah semua step selesai, bukan per step. Checkpoint commit disabled; `/complete` yang membuat commit fitur. Setiap step harus meninggalkan project dalam keadaan jalan.

## Build steps

- [x] **Step 1 - Backend: router config fail-closed + hapus kredensial hardcoded** - Hapus literal host/user/password di `MIKROTIK_CONFIG`, hapus `SITE_ROUTER_MAP`/`SITE_INTERFACE_MAP`, hapus `/api/router/clients` + `/api/router/site-mapping`, ubah `resolveRouterConfig` ke urutan Project -> env -> not-configured, ubah collector membaca site ber-`routerConfig` dari data. *Done when:* backend start tanpa `.env` dan tanpa site ber-config tidak melakukan percobaan koneksi; `/api/router/traffic` mengembalikan `siteConfigured: false` dengan pesan jelas; grep IP/password/user literal di `backend/` kosong.

- [x] **Step 2 - Backend: seed kosong + script demo** - Hapus seeding project nyata dari `storage.js`/`server.js`; tambah `backend/scripts/seed_demo.js` dan script `seed:demo` di `backend/package.json` yang membuat project/site/device fiktif (tanpa `routerConfig`) ke JSON lokal, dan ke MongoDB bila koneksi tersedia. *Done when:* start dengan `data/` kosong menghasilkan nol project; `npm run seed:demo` (di `backend/`) mengisi data fiktif yang tampil di UI; tidak ada nama/kredensial nyata di script.

- [x] **Step 3 - Repo: untrack NEXUS_PRD.md** - `git rm --cached NEXUS_PRD.md`, tambah entri `.gitignore` dengan komentar "dokumen internal". *Done when:* `git ls-files` tidak memuat `NEXUS_PRD.md`; file masih ada di disk; `git status` bersih setelah commit fitur.

- [x] **Step 4 - Frontend: API base relatif + dev proxy** - Buat `frontend/proxy.conf.json` (`/api` -> `http://localhost:3000`), wire di `angular.json` serve options, ganti semua `http://localhost:3000/api/...` jadi `/api/...` (23 lokasi di services + pages). *Done when:* `npm run verify` lolos; tidak ada string `localhost:3000` di `frontend/src`; alur dev via proxy berfungsi (bukti smoke).

- [x] **Step 5 - Frontend: site dinamis** - monitoring, laporan-trafik, laporan mengambil daftar site dari ProjectService; default = site pertama yang ada; empty state "belum ada site" dengan tautan ke `/project-site`; hapus array site hardcoded, default `'Direktorat'`, dan asumsi `=== 'Gizi'` (pakai `siteConfigured`); hapus data statis di `shared/site-hierarchy.ts` (pertahankan tipe `SiteNode`). *Done when:* dengan nol project, halaman menampilkan empty state; setelah membuat project+site di `/project-site`, site muncul di semua selector halaman; grep nama site hardcoded di `frontend/src` kosong.

- [x] **Step 6 - Frontend: hapus data institusi & mock** - Login dummy pakai nama generik (username `admin`/`client` tetap, digantikan item 1); ganti teks "Poltekkes Kemenkes Semarang"; hapus halaman `pengguna` (file, route, link sidebar); set `<title>` `index.html` ke nama aplikasi yang dipakai UI. *Done when:* grep `Poltekkes|POLTEKKES|Jiwa|Denpasar|Semarang` di `frontend/src` dan `index.html` kosong; route `/pengguna` hilang; build lolos.

- [x] **Step 7 - Test + verifikasi** - Ekstrak fungsi murni `buildSiteTree(projects)` di `shared/site-hierarchy.ts` dan pakai di ProjectService; tambah unit test (happy path + list kosong); jalankan `npm run verify`; catat bukti smoke manual (not-configured, empty state, demo seed). *Done when:* test baru lolos di Verify; bukti smoke tercatat di ringkasan review.

- [x] **Step 8 - Perbaikan temuan independent review** - Perbaiki F-01..F-06: placeholder host institusi + placeholder institusi lain di UI, default `siteLocation` di model Device, fallback interface collector, referensi item plan, file list spec, dan dead code `seedLocalDevices`; tambah test `ProjectService`. *Done when:* semua temuan berstatus `fixed` di ledger, `npm run verify` lolos, checkpoint baru siap direview.

## Files / areas

- `backend/server.js`, `backend/storage.js`, `backend/package.json`, `backend/scripts/seed_demo.js` (baru)
- `frontend/proxy.conf.json` (baru), `frontend/angular.json`
- `frontend/src/app/services/project.service.ts`, `frontend/src/app/services/project.service.spec.ts` (baru)
- `frontend/src/app/shared/site-hierarchy.ts`, `frontend/src/app/shared/site-hierarchy.spec.ts` (baru)
- `frontend/src/app/pages/monitoring/*`, `pages/laporan-trafik/*`, `pages/laporan/*`, `pages/login/*`, `pages/pengguna/*` (hapus), `components/sidebar/*`, `app.routes.ts`, `src/index.html`
- `.gitignore`, `NEXUS_PRD.md` (untracked)

## Data / contracts

- **Resolusi router config:** `Project.sites[].routerConfig` -> env `MIKROTIK_HOST/PORT/USER/PASSWORD/INTERFACE` (dipakai hanya bila host+user+password terisi) -> `{ configured: false }`. Tidak ada percobaan koneksi saat unconfigured.
- **Response `/api/router/traffic`:** pertahankan key yang sudah dipakai frontend: `connected`, `siteConfigured`, `txMbps`, `rxMbps`, `source`, `error`.
- **API base:** same-origin relatif `/api`; dev memakai proxy ke `localhost:3000`.
- **Demo seed:** project/site/device fiktif, tanpa `routerConfig`; ditulis ke JSON lokal dan ke MongoDB bila terkoneksi.
- Tidak ada perubahan schema model. Data existing (JSON/Mongo) tidak dihapus; konfigurasi router lama tetap dipakai sampai user memperbaruinya via UI.

## Testing

- Unit test (vitest, sudah terkonfigurasi): `buildSiteTree` - mapping project/site/gedung ke `SiteNode`, dan list kosong menghasilkan tree kosong; `ProjectService` - `sites$` dan `siteTree$` terisi dari respons `/api/projects` yang sukses.
- Verify: `npm run verify` (test + build frontend).
- Smoke manual: (1) backend tanpa env -> traffic endpoint not-configured tanpa koneksi; (2) UI tanpa project -> empty state; (3) `seed:demo` -> data fiktif tampil di dashboard/monitoring/laporan.

## Notes for the AI

- Jangan sentuh auth, packaging, atau history rewrite di fitur ini.
- Jangan ubah nama brand di UI; keputusan nama final menyusul (lihat Open questions).
- Pertahankan bentuk response API yang sudah dipakai frontend; jangan ubah kontrak di luar yang tercatat.
- Data runtime user (`backend/data/*.json` dan MongoDB) tidak boleh dihapus atau ditimpa.
- `site-dropdown` tetap bersumber dari ProjectService; hapus sisa data statis bila ada.
- Ikuti konvensi commit project: tanpa atribusi AI.

## Open questions

> - Nama brand final (UI memakai "Nadi", dokumen memakai "NEXUS") belum diputuskan. Tidak memblokir fitur ini, tapi dibutuhkan sebelum item 12 (Packaging).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":8688,"specSha256":"33d5c818bf5121be480b251c8844927e28ec0e95c414bbfecb73d8fd9594f6bc","branch":"refs/heads/feature/sanitasi-data-site-dinamis","head":"a7e5bac1e852582ceb5c161af9ba56020e876a07","baseRef":"refs/heads/main","baseCommit":"1240e133d1fb1474ea19d19dc036b461705daec5","sourceTree":"0c212ca7548288b5c4af91fe1b066c3067f96474","absentOptional":[]} -->

## Findings

### 9/F-01 [P1] closed - Real institutional router host retained as a site-form placeholder

**File:** frontend/src/app/pages/project-site/project-site.component.html:226
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: security)
**Why it matters:** The feature goal is to remove all real institutional data (credentials, IPs, MACs, names) from the code before the repository is published. This delta removed the hardcoded router host literal from `backend/server.js` and `backend/storage.js`, but the same real router address is still shipped as the `Host / IP` placeholder in the site configuration form. A public repository would still expose the institution's router address, and the placeholder value is included in the built frontend bundle.
**Suggested fix:** Replace the placeholder with a documentation-range example, for example `misal: 192.0.2.1` (RFC 5737, the range already used by `backend/scripts/seed_demo.js`) or `misal: 10.0.0.1`. Do not quote the current value in commits or issues.
**Resolution:** Closed on re-review 2026-09-23: `frontend/src/app/pages/project-site/project-site.component.html:226` now uses the RFC 5737 example `misal: 192.0.2.1`, and the same repair pass replaced the other institutional UI placeholders (`admin`, `Gedung A`, `SW-Lt2-Dist`, `sw-lt2-dist-01`, `AP-Lab-Lt2`, `Kantor Pusat`/`KP`). A repo-wide grep for the old institution strings (Poltekkes, Semarang, Denpasar, the old host/IP, MAC prefixes, `noccni`, `TLM`, `UNUD`) found no matches in `frontend/src` or `backend/`. No new defect introduced.

### 9/F-02 [P2] closed - Device model still defaults `siteLocation` to the institutional site name `Direktorat`

**File:** backend/models/Device.js:46
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** Step 5 removed the `'Direktorat'` default from the frontend, but the Mongoose model still uses that institution-specific site name as the default for every device created without an explicit `siteLocation`. A self-hosting organization therefore inherits a site name from the original institution, and a device created by an API caller that omits the field is silently tagged to a site that does not exist in a fresh install. The sanitization goal ("hapus nama institusi") is incomplete.
**Suggested fix:** Remove the institutional default, for example `siteLocation: { type: String, required: true, default: '' }`, so callers must send the site (the UI already sends the first available site). This changes the shipped default for API callers that omit `siteLocation`, so it needs the user's explicit decision rather than an automatic repair.
**Resolution:** Closed on re-review 2026-09-23: `backend/models/Device.js:43-46` now has `siteLocation: { type: String, required: true }` with no default, and no `'Direktorat'` default remains anywhere. The removal itself introduced no defect; the related missing UI guard for adding devices when no site exists is tracked separately as F-07.

### 9/F-03 [P2] closed - Background collector omits the interface default used by the live endpoint

**File:** backend/server.js:643
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `resolveRouterConfig` falls back to `'ether1'` when a site's `routerConfig.interface` is missing (`backend/server.js:84`), but the background collector passes `interface: cfg.interface` unchanged. The site form allows clearing the Monitor Interface input, and `saveSite` persists the empty string (`frontend/src/app/pages/project-site/project-site.component.ts:144-146`). For such a site, the collector polls the router with an empty interface, fails repeatedly, and after five failures records a false downtime event, while `/api/router/traffic` for the same site succeeds on `ether1`. Local JSON storage does not apply Mongoose defaults, so this is reachable in the default offline mode as well.
**Suggested fix:** Mirror the resolver in the collector: `interface: cfg.interface || 'ether1'` (and consider aligning the collector's `timeout` fallback with the resolver's `|| 3`).
**Resolution:** Closed on re-review 2026-09-23: the collector now mirrors the resolver at `backend/server.js:643-644` (`interface: cfg.interface || 'ether1'`, `timeout: cfg.timeout || 3`) and also defaults `port` (`cfg.port || 8728`). No new defect introduced.

### 9/F-04 [P3] closed - Build plan has no item 11 while the verified spec references it

**File:** blueprint/build-plan.md:5-15
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `blueprint/context/current-feature.md:27` and `:49` reference `(item 11)` for Auth/JWT and credential hiding, and item 12 exists, but the build plan skips from 10 to 12 and the only auth item is number 1. Any `/feature 11` lookup or plan-to-spec cross-reference cannot be resolved, and the intended target of "item 11" is ambiguous.
**Suggested fix:** Add the auth/RBAC item as number 11 in `blueprint/build-plan.md` (or renumber the two spec references to the existing feature 1) and keep `blueprint/context/project-overview.md`'s feature list consistent.
**Resolution:** Closed on re-review 2026-09-23: `blueprint/context/current-feature.md:27` and `:49` now point to feature 1, and `blueprint/build-plan.md` and `blueprint/context/project-overview.md` list the same feature set (1-10, 12). No unresolved plan reference remains.

### 9/F-05 [P3] closed - Spec file list names a ProjectService test that does not exist

**File:** blueprint/context/current-feature.md:57
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: tests)
**Why it matters:** The spec lists `frontend/src/app/services/project.service.spec.ts` as a new file, but no such file or test exists in the delta. The `sites$` emission path - the new integration point that monitoring, laporan-trafik, and laporan all depend on - is untested; only the pure `buildSiteTree`/`extractSiteNames` helpers are covered.
**Suggested fix:** Add a small `ProjectService` test with an `HttpClient` stub asserting that a successful `/api/projects` response emits both `siteTree$` and `sites$`, or correct the spec's file list if the pure-function tests are the intended coverage.
**Resolution:** Closed on re-review 2026-09-23: `frontend/src/app/services/project.service.spec.ts` exists and passes in `npm run verify` (asserts `sites$` and `siteTree$` from a successful `/api/projects` response). The spec's Files and Testing sections name it.

### 9/F-06 [P3] closed - `seedLocalDevices` is now dead code

**File:** backend/storage.js:255
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** This delta deleted `seedLocalProjects` and its call site; `seedLocalDevices` now has no callers anywhere in the repository. It was already unused before this change, but it is the last piece of the removed seed machinery, and leaving unused seed helpers invites future callers to reintroduce hardcoded sample data.
**Suggested fix:** Delete `seedLocalDevices` (or use it from `seed:demo` for the local device path if the demo script should seed atomically).
**Resolution:** Closed on re-review 2026-09-23: `seedLocalDevices` and `seedLocalProjects` are both gone from `backend/storage.js`, and no reference remains in the repository.

## Independent review

# Independent Review

**Status:** passed
**Target commit:** a7e5bac1e852582ceb5c161af9ba56020e876a07
**Base commit:** 1240e133d1fb1474ea19d19dc036b461705daec5
**Base ref:** main
**Spec hash:** 33d5c818bf5121be480b251c8844927e28ec0e95c414bbfecb73d8fd9594f6bc
**Prepared by:** opencode
**Builder model:** opencode-go/deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-23T13:38:11.485Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** opencode-go/deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-23T13:46:03.561Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `npm run verify` (frontend `ng test --watch=false && ng build`): pass - 3 test files / 6 tests passed (site-hierarchy 3, project.service 1, app 2); production build completed (336.35 kB main, 15.08 kB styles).
- `node --check` on `server.js`, `storage.js`, `scripts/seed_demo.js`, `scripts/migrate_traffic.js`, `models/Device.js`, `models/Project.js`, `models/Laporan.js`, `test-laporan.js` (backend syntax): pass.
- `npm ls --depth=0` (backend): pass - installed tree matches `backend/package.json` (node-routeros@1.6.8 present; ssh2 and routeros-client absent).
- Freshness checks (`git rev-parse HEAD`, `git merge-base main HEAD`, raw spec SHA-256, `git status --porcelain`): pass - see Evidence.
- Backend unit tests: unavailable - no `test` script in `backend/package.json`.
- Browser/E2E harness: unavailable - none declared in the project.

## Evidence

- Freshness: `HEAD` = `a7e5bac...` equals Target commit; `git merge-base main HEAD` = `1240e13...` equals Base commit and `main` still resolves to it; raw spec SHA-256 `33d5c818...94f6bc` matches; `git status --porcelain` shows only ` M blueprint/context/review.md` before this pass, and the target commit contains the findings ledger unchanged.
- Reviewed the complete `1240e133d1fb1474ea19d19dc036b461705daec5..a7e5bac1e852582ceb5c161af9ba56020e876a07` delta (38 files, +746/-1139), including the repair commit `309386e..a7e5bac` (10 files), across all four lenses, plus nearby context: `backend/models/Project.js`, `backend/models/Laporan.js`, `frontend/src/app/pages/monitoring/monitoring.component.ts`, `frontend/src/app/pages/laporan/laporan.component.ts`, `frontend/src/app/pages/project-site/project-site.component.ts`, `frontend/src/app/components/site-dropdown/site-dropdown.component.ts`, `.github/workflows/verify.yml`.
- Repaired F-01..F-06 confirmed against the new code: RFC 5737 host placeholder (`project-site.component.html:226`); `Device.siteLocation` required with no default (`backend/models/Device.js:43-46`); collector fallbacks mirror the resolver (`backend/server.js:643-644`); spec references now resolve to feature 1 (`current-feature.md:27,49`); `project.service.spec.ts` exists and passes; `seedLocalDevices`/`seedLocalProjects` removed from `backend/storage.js`.
- Sanitization sweeps over tracked files: no `Poltekkes|Kemenkes|Semarang|Denpasar|Udayana|UNUD|noccni|TLM|223.27.147.18|Denpasar2026|20:E1:5D` in `frontend/src` or `backend/`; no `localhost:3000` under `frontend/src` (only `frontend/proxy.conf.json:3`, intended); no `Gizi`/`Direktorat`/`SITE_HIERARCHY`/`router/clients`/`site-mapping`/`pengguna` references left in `frontend/src`; no hardcoded credential literals in `backend/`; `NEXUS_PRD.md` present on disk, ignored via `.gitignore:49`, and untracked.
- Endpoint contracts: `/api/router/clients` and `/api/router/site-mapping` are gone; `/api/router/info` and `/api/router/interfaces` fail closed with HTTP 503 without env config; `/api/router/history` and `/api/router/history/export` require `site` (HTTP 400 when missing); no frontend caller uses the two 503 endpoints.
- No skipped or focused tests (`git grep` for `.only(`, `.skip(`, `xit(`, `fdescribe(`, `xdescribe(`, `it.todo` returned nothing).
- New findings recorded: F-07 [P2] open, F-08 [P3] open, F-09 [P3] open.

## Findings

- F-01 [P1] closed - Real institutional router host retained as a site-form placeholder.
- F-02 [P2] closed - `Device.siteLocation` institutional default removed; repair confirmed.
- F-03 [P2] closed - Collector interface/timeout fallbacks now mirror the resolver.
- F-04 [P3] closed - Spec/plan references now resolve to feature 1.
- F-05 [P3] closed - `ProjectService` test added and passing.
- F-06 [P3] closed - Dead seed helpers removed.
- F-07 [P2] open - Add-device and add-report forms accept an empty site when no site exists.
- F-08 [P3] open - Tracked blueprint docs still present the institution's fixed site list.
- F-09 [P3] open - Root `package.json` still declares the now-unused `ssh2` dependency.

## Remaining risk

- No backend unit-test command exists (`backend/package.json` has no `test` script), so `resolveRouterConfig`, the traffic collector, and `seed:demo` were only syntax-checked (`node --check`), not executed; F-07's MongoDB-mode failure was derived from the Mongoose schema, not run against a live MongoDB.
- No browser/E2E harness is declared, so the spec's manual smoke evidence (backend not-configured, empty-state UI, `seed:demo` rendering) was not reproduced in this review; Check was not required for this request.
- `/api/projects` still returns `sites[].routerConfig.password` to clients; hiding device credentials from API responses is explicitly out of scope (feature 1).
- The frontend still calls `/api/device/reboot` and `/api/laporan/export/csv`, which have no backend route; both flows are explicitly deferred to feature 10.
- No runtime profiling was performed for the collector's new `Project.find({})` read every 6 s; at this project's scale the cost is expected to be negligible (unverified).

