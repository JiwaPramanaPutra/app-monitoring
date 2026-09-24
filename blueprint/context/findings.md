# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-16 [P3] fixed - Security-critical backend helpers have no durable regression tests

**File:** backend/package.json:6-10; backend/services/redact.js; backend/services/project-utils.js; backend/services/auth.js
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: tests)
**Why it matters:** The feature's security core - router-password preservation, nested-id normalization, the login throttle, and the auth/role middleware - is verified only by ad-hoc reviewer scripts. `backend/package.json` declares no test script, no `*.test.js`/`*.spec.js` exists under `backend/`, and the project Verify command (`package.json:3` -> `frontend/package.json:10`) runs only the frontend vitest suite plus the Angular build. The ledger shows the cost: the F-10 repair regressed a stored temp-id password (F-14) and the next review pass caught it, not a test. A committed test for `preserveRouterPasswords`/`normalizeNestedIds`/`checkLoginThrottle` would lock the repaired behavior and the F-10/F-14/F-15 edge cases.
**Suggested fix:** When backend test tooling is next touched (or via `/tests`), add focused tests for the pure helpers with Node's built-in `node:test` runner - no new dependency - covering rename, missing `routerConfig`, persisted temp id, unknown temp id, both normalization modes, and the 11th-attempt throttle block. The frontend specs already cover `AuthService`/`ApiService`.
**Resolution:** Re-examined at checkpoint 809ce428 (2026-09-23): `backend/package.json` still declares no test script, no `*.test.js`/`*.spec.js` file exists under `backend/`, and this delta only added the `jsonwebtoken` dependency. The backend security helpers are still covered only by reviewer scripts, not committed tests. Status stays open (P3).
Re-examined at checkpoint 3615c4c (2026-09-23): `backend/package.json:6-11` still declares no `test` script and no backend test file exists. This delta added new pure logic with no committed coverage - `filterLaporan` and `csvCell` (`backend/server.js:1080-1096`) and the local laporan CRUD (`backend/storage.js:325-354`) - which a `node:test` suite could cover alongside the existing helpers. Status stays open (P3). Re-confirmed at checkpoint 7581c0e (2026-09-23): still no backend test script or test files. Status stays open (P3).
**Fixed in the `/tests` setup (2026-09-23):** backend now has `npm test` (`node --test test/*.test.js`, no new dependency) with 25 focused tests covering `redact.js` (password preservation cases), `project-utils.js` (both normalization modes), `auth.js` (authenticate roles, JWT middleware, EOS-for-mutations, login throttle), and the extracted `backend/services/laporan-utils.js` (filter, csvCell formula neutralization, CSV builder). The project `verify` command now runs backend tests before the frontend gate, and the CI workflow installs backend dependencies. Awaiting re-review.
Re-examined at checkpoint cd9c095 (2026-09-24) by the independent review of the current delta: `backend/test/{auth,redact,project-utils,laporan-utils}.test.js` exist at the target and this pass's `npm run verify` ran them green (25/25 backend, 11/11 frontend, Angular build OK); the suite covers every case listed above. The repair's files are outside this delta (committed at base `f0c3161`), so this pass records the confirmation but leaves the status `fixed`; closure belongs to a review pass that covers that checkpoint.
Re-confirmed at target 6cf1407 (2026-09-24, independent automatic review): `npm run verify` ran the four backend suites green (25/25). The repair files are still outside the reviewed delta (`f0c3161..6cf1407`), so the status stays `fixed`; since the fix landed directly on `main`, closure needs a full-project or `backend/`-scoped audit pass.

### F-25 [P2] unverified - Restart-policy starts can still bypass Mongo readiness and silently use JSON storage

**File:** docker-compose.yml:4,15,24-28; backend/server.js:27-33,73
**Found:** 2026-09-24 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The F-23 repair only covers compose-initiated starts, where compose honors `depends_on: condition: service_healthy`. After a Docker daemon or host restart, containers with `restart: unless-stopped` (`docker-compose.yml:4,15`) are restarted by the daemon without compose's dependency ordering, so `backend` can start before `mongod` accepts connections. The initial connect still has only `serverSelectionTimeoutMS: 3000` and merely logs the failure (`backend/server.js:27-33`), and storage selection keys off `mongoose.connection.readyState === 1` (`backend/server.js:73` and many other call sites; `backend/storage.js:167`), so the process can serve from JSON in `backend/data` while the bundled MongoDB becomes healthy seconds later - the same silent-storage divergence F-23 described. Docker is not installed here, so the restart race was not reproduced; the startup code path is confirmed by reading.
**Suggested fix:** Decide whether a bounded initial-connect retry (for example wait/retry ~30-60s before declaring offline mode) is worth the added startup delay; otherwise document that after a host or daemon restart the backend may need one restart once MongoDB is healthy. This changes startup behavior, so it needs the user's explicit decision and is not an automatic repair.
**Resolution:** Not yet repaired; recorded `unverified` this pass (no Docker available to reproduce the restart race).

### F-26 [P3] open - Backend package metadata still declares the ISC license

**File:** backend/package.json:15; README.md:128; LICENSE:1
**Found:** 2026-09-24 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The delta ships an MIT `LICENSE` and `README.md:128` states "MIT", but `backend/package.json:15` still declares `"license": "ISC"` (the npm-init default) and the lockfile root entry mirrors it (`backend/package-lock.json:10`). For a packaging feature whose goal is that others can pick the repo up without guessing, the package metadata contradicts the shipped license.
**Suggested fix:** Set `"license": "MIT"` in `backend/package.json` and refresh the root entry in `backend/package-lock.json` (for example `npm install --package-lock-only` in `backend/`); no current requirement is lost.
**Resolution:** Not yet repaired (recorded `open` this pass).
