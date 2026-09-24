# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-08 [P3] open - Tracked blueprint docs still present the institution's fixed site list

**File:** blueprint/context/project-overview.md:64; blueprint/project-plan.md:4
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** This delta re-baselined both documents for a public, self-hosted release and made sites data-driven, but the Site data-model section and the project-plan problem statement still describe the five institution site names (`Direktorat, Gigi, Keperawatan, Gizi, Kebidanan`) as the model. A fresh install now starts with zero sites, so the overview - the source of truth agents read - contradicts the shipped behavior and keeps the old institution-specific example set in a published repo.
**Suggested fix:** Reword the Site section to describe sites as records from the Project collection with an empty fresh install, and update the project-plan sentence the same way (or clearly mark the old names as generic examples).
**Resolution:** Re-examined at checkpoint acfb1a1 by the independent review of the current delta (2026-09-23): `blueprint/context/project-overview.md:64` and `blueprint/project-plan.md:4` still name the institution sites. Status stays open (P3). Re-confirmed at checkpoint b4877ee (2026-09-23): both lines still name the five sites; this delta only revised the User section and the `/pengguna` line. Status stays open (P3). Re-confirmed at checkpoint 809ce428 (2026-09-23): `blueprint/context/project-overview.md:64` and `blueprint/project-plan.md:4` still name the five institution sites. Status stays open (P3).
Re-confirmed at checkpoint 3615c4c (2026-09-23): the delta reworded the Device Management line (`project-overview.md:31`, `project-plan.md:17`) and added the reboot backlog note, but `project-overview.md:64` and `project-plan.md:4` still name the five institution sites. Status stays open (P3); explicitly out of scope for feature 10. Re-confirmed at checkpoint 7581c0e (2026-09-23): both lines still name the five institution sites. Status stays open (P3).

### F-16 [P3] fixed - Security-critical backend helpers have no durable regression tests

**File:** backend/package.json:6-10; backend/services/redact.js; backend/services/project-utils.js; backend/services/auth.js
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: tests)
**Why it matters:** The feature's security core - router-password preservation, nested-id normalization, the login throttle, and the auth/role middleware - is verified only by ad-hoc reviewer scripts. `backend/package.json` declares no test script, no `*.test.js`/`*.spec.js` exists under `backend/`, and the project Verify command (`package.json:3` -> `frontend/package.json:10`) runs only the frontend vitest suite plus the Angular build. The ledger shows the cost: the F-10 repair regressed a stored temp-id password (F-14) and the next review pass caught it, not a test. A committed test for `preserveRouterPasswords`/`normalizeNestedIds`/`checkLoginThrottle` would lock the repaired behavior and the F-10/F-14/F-15 edge cases.
**Suggested fix:** When backend test tooling is next touched (or via `/tests`), add focused tests for the pure helpers with Node's built-in `node:test` runner - no new dependency - covering rename, missing `routerConfig`, persisted temp id, unknown temp id, both normalization modes, and the 11th-attempt throttle block. The frontend specs already cover `AuthService`/`ApiService`.
**Resolution:** Re-examined at checkpoint 809ce428 (2026-09-23): `backend/package.json` still declares no test script, no `*.test.js`/`*.spec.js` file exists under `backend/`, and this delta only added the `jsonwebtoken` dependency. The backend security helpers are still covered only by reviewer scripts, not committed tests. Status stays open (P3).
Re-examined at checkpoint 3615c4c (2026-09-23): `backend/package.json:6-11` still declares no `test` script and no backend test file exists. This delta added new pure logic with no committed coverage - `filterLaporan` and `csvCell` (`backend/server.js:1080-1096`) and the local laporan CRUD (`backend/storage.js:325-354`) - which a `node:test` suite could cover alongside the existing helpers. Status stays open (P3). Re-confirmed at checkpoint 7581c0e (2026-09-23): still no backend test script or test files. Status stays open (P3).
**Fixed in the `/tests` setup (2026-09-23):** backend now has `npm test` (`node --test test/*.test.js`, no new dependency) with 25 focused tests covering `redact.js` (password preservation cases), `project-utils.js` (both normalization modes), `auth.js` (authenticate roles, JWT middleware, EOS-for-mutations, login throttle), and the extracted `backend/services/laporan-utils.js` (filter, csvCell formula neutralization, CSV builder). The project `verify` command now runs backend tests before the frontend gate, and the CI workflow installs backend dependencies. Awaiting re-review.

### F-21 [P3] open - Blueprint docs still list ssh2 (reboot) as current network integration after the reboot deferral

**File:** blueprint/context/project-overview.md:85; blueprint/project-plan.md:37
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: quality)
**Why it matters:** This work item removed remote reboot from v1, deleted the reboot UI and the `/api/device/reboot` route, and dropped `ssh2` from the root and backend manifests; the new backlog entries in `blueprint/build-plan.md` and `project-overview.md` say reboot is post-v1. But the agent-facing source of truth still presents `ssh2` as part of the current stack: `project-overview.md:85` reads "MikroTik RouterOS API (port 8728), ssh2 (reboot), ICMP ping" and `project-plan.md:37` reads "... / ssh2 / ping". Nothing in the repo declares or requires `ssh2` any more, so both lines contradict the shipped state and the docs this same delta added.
**Suggested fix:** Drop `ssh2` from both network-integration lines (or mark remote reboot as a post-v1 backlog item there), matching the wording already used in `build-plan.md` and `project-overview.md`'s backlog line.
**Resolution:** Carried forward from feature 10 (not repaired there); the doc drift is recorded for the next docs/packaging work item.
