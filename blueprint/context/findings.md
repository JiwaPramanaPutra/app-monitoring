# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-07 [P2] open - Add-device and add-report forms accept an empty site when no site exists

**File:** frontend/src/app/pages/monitoring/monitoring.component.ts:834,885-887; frontend/src/app/pages/laporan/laporan.component.ts:131,176
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The feature removed the hardcoded `'Direktorat'` defaults, so with zero projects `getEmptyDevice()` returns `siteLocation: ''` and `saveDevice()` posts an empty site. The "Tambah Perangkat" button is hidden only for `Client`, not when `sites.length === 0`, and the modal's Site Location select has no options in that state. In the default offline (JSON) mode `POST /api/devices` succeeds and persists a device with `siteLocation: ''`; once the user creates a project and site, every per-site view filters the device out (`storage.getLocalDevices(site)` and the `filteredDevices` getter), so it becomes invisible and unmanageable in the UI while still present in `backend/data/devices.json`. With MongoDB connected, the same request fails Mongoose `required` validation and the UI surfaces the raw server error. The report form has the same missing guard (`saveReport()` validates only masalah/tindakan) against the required `Laporan.site`. Confirmed by code reading; the offline path was not executed against a running server.
**Suggested fix:** Guard both forms when `sites.length === 0`: hide or disable the add buttons next to the existing empty-state guidance, and validate `site` in `saveDevice()`/`saveReport()` before posting (same pattern as the `nama` check).
**Resolution:** Re-examined at checkpoint b4877ee (2026-09-23): `saveDevice()` (monitoring.component.ts:812-816) still validates only `nama`, and `saveReport()` (laporan.component.ts:158-167) still validates only masalah/tindakan; this delta added no `sites.length === 0` guard. Status stays open (P2). Re-confirmed at checkpoint 809ce428 (2026-09-23): the same two validations remain unchanged and `Laporan.site` is still required (backend/models/Laporan.js:23-27). Status stays open (P2).

### F-08 [P3] open - Tracked blueprint docs still present the institution's fixed site list

**File:** blueprint/context/project-overview.md:64; blueprint/project-plan.md:4
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** This delta re-baselined both documents for a public, self-hosted release and made sites data-driven, but the Site data-model section and the project-plan problem statement still describe the five institution site names (`Direktorat, Gigi, Keperawatan, Gizi, Kebidanan`) as the model. A fresh install now starts with zero sites, so the overview - the source of truth agents read - contradicts the shipped behavior and keeps the old institution-specific example set in a published repo.
**Suggested fix:** Reword the Site section to describe sites as records from the Project collection with an empty fresh install, and update the project-plan sentence the same way (or clearly mark the old names as generic examples).
**Resolution:** Re-examined at checkpoint acfb1a1 by the independent review of the current delta (2026-09-23): `blueprint/context/project-overview.md:64` and `blueprint/project-plan.md:4` still name the institution sites. Status stays open (P3). Re-confirmed at checkpoint b4877ee (2026-09-23): both lines still name the five sites; this delta only revised the User section and the `/pengguna` line. Status stays open (P3). Re-confirmed at checkpoint 809ce428 (2026-09-23): `blueprint/context/project-overview.md:64` and `blueprint/project-plan.md:4` still name the five institution sites. Status stays open (P3).

### F-09 [P3] open - Root `package.json` still declares the now-unused `ssh2` dependency

**File:** package.json:5-7
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** This delta removed the last `require('ssh2')` from `backend/server.js` and dropped `ssh2`/`routeros-client` from `backend/package.json`, but the repository root manifest (added in the base commit) still declares `ssh2`. Nothing in the repo requires it (grep finds only the root manifest, root lockfile, and docs), so a root `npm install` keeps pulling an unused dependency into the published repo. The reboot endpoint that will need it is deferred to feature 10, where the dependency belongs in `backend/package.json`.
**Suggested fix:** Remove `ssh2` from the root `package.json` and lockfile, or move the declaration to `backend/package.json` when feature 10 implements the reboot endpoint.
**Resolution:** Re-examined at checkpoint acfb1a1 by the independent review of the current delta (2026-09-23): root `package.json:5-7` still declares `ssh2` and nothing in the repository requires it. Status stays open (P3). Re-confirmed at checkpoint 809ce428 (2026-09-23): root `package.json:5-7` still declares `ssh2`; this delta did not touch the root manifest. Status stays open (P3).

### F-16 [P3] open - Security-critical backend helpers have no durable regression tests

**File:** backend/package.json:6-10; backend/services/redact.js; backend/services/project-utils.js; backend/services/auth.js
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: tests)
**Why it matters:** The feature's security core - router-password preservation, nested-id normalization, the login throttle, and the auth/role middleware - is verified only by ad-hoc reviewer scripts. `backend/package.json` declares no test script, no `*.test.js`/`*.spec.js` exists under `backend/`, and the project Verify command (`package.json:3` -> `frontend/package.json:10`) runs only the frontend vitest suite plus the Angular build. The ledger shows the cost: the F-10 repair regressed a stored temp-id password (F-14) and the next review pass caught it, not a test. A committed test for `preserveRouterPasswords`/`normalizeNestedIds`/`checkLoginThrottle` would lock the repaired behavior and the F-10/F-14/F-15 edge cases.
**Suggested fix:** When backend test tooling is next touched (or via `/tests`), add focused tests for the pure helpers with Node's built-in `node:test` runner - no new dependency - covering rename, missing `routerConfig`, persisted temp id, unknown temp id, both normalization modes, and the 11th-attempt throttle block. The frontend specs already cover `AuthService`/`ApiService`.
**Resolution:** Re-examined at checkpoint 809ce428 (2026-09-23): `backend/package.json` still declares no test script, no `*.test.js`/`*.spec.js` file exists under `backend/`, and this delta only added the `jsonwebtoken` dependency. The backend security helpers are still covered only by reviewer scripts, not committed tests. Status stays open (P3).
