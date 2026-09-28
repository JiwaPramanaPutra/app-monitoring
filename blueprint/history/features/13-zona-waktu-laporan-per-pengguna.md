# Feature: Zona Waktu Laporan per Pengguna

**From build-plan:** feature 13
**Build attempt:** 1
**Branch:** `feature/zona-waktu-laporan-per-pengguna`

## Goal

Laporan trafik (grafik historis, jendela waktu, label sumbu, rentang manual) dan log downtime ditampilkan dalam **zona waktu pengguna** — IANA dari browser (`Asia/Jakarta`, `Asia/Makassar`, …) dengan fallback aman ke WIB. Bucket Mongo dan agregator Node harus menghasilkan hasil yang identik per zona, tanpa mengubah data tersimpan (tetap UTC/ISO).

## In scope

- Backend: resolver zona tz-aware (`resolveTimeZone`, offset per tanggal via `Intl`), `rangeBounds`/`toTZ`/bucket per zona, pipeline Mongo (`$dateToParts` + `timezone`) dan agregator Node yang setara, parameter `tz` di `GET /api/router/history`, field `timeZone` di response.
- Frontend: `shared/period-window.ts` menerima tz; halaman Laporan Trafik & Monitoring mengirim tz dan memakai tz untuk jendela, `today`, label; log downtime diformat dari ISO per tz; badge zona kecil di header.
- Tes parity Mongo vs Node untuk beberapa zona; tes batas hari per zona.
- Ekspor: PDF/print mengikuti label halaman (client-side); `.xlsx` laporan tidak terikat tz (tanggal input pengguna) — tidak ada perubahan format.

## Out of scope

- Preferensi zona per akun (akun v1 dari env; post-v1).
- Zona per site (config) — alternatif yang dicatat, bukan fitur ini.
- Perubahan skema/data tersimpan dan format string downtime lama di backend.
- Zona untuk Laporan Gangguan (tanggalnya string input pengguna, tanpa jam).

## Build loop

- `workflow.stepReview: feature` → satu paket review di akhir; `checkpointCommits: disabled` → tanpa commit per langkah; `/complete` yang membuat commit akhir.
- Tiap langkah meninggalkan aplikasi dalam keadaan jalan dan diuji fokus.

## Build steps

- [x] **1. Helper waktu tz-aware + resolver** - `backend/services/traffic-range.js`: `resolveTimeZone(tz)` (validasi IANA via `Intl`, fallback `Asia/Jakarta`), offset per tanggal (`tzOffsetMs(date, tz)` dari `formatToParts`), `rangeBounds(start, end, tz)`, `toTZ(stamp, tz)`; `WIB_OFFSET_MS` tetap untuk fallback. *Done when:* test baru lulus — batas harian `Asia/Makassar` bergeser +1 jam vs `Asia/Jakarta`; tz tidak valid → fallback; `toTZ` konsisten dengan `rangeBounds`; test lama tetap hijau. — hasil: `node --test test/traffic-range.test.js` 31/31 lulus.
- [x] **2. Agregasi setara per zona (Mongo & Node)** - `backend/services/traffic-aggregate.js`: pipeline Mongo membentuk kunci bucket dari `$dateToParts { timezone: tz }` (bukan `$dateAdd` offset tetap); `groupSamplesInNode` memakai parts `Intl`; `traffic-history.getAggregatedHistory(site, start, end, period, tz)`. *Done when:* parity murni + integrasi Mongo (`$documents`) lulus untuk `Asia/Jakarta`, `Asia/Makassar`, `Asia/Jayapura`, `UTC` pada semua periode; fuzz kesetaraan lama tetap hijau. — hasil: parity murni/struktural + fuzz deterministik tertulis; `node --test` = 68 lulus, 1 skip (Mongo tak terjangkau: `querySrv ECONNREFUSED` — parity Mongo **belum terbukti lokal**).
- [x] **3. API `/history` menerima `tz`** - `backend/server.js`: baca `?tz`, validasi via resolver (fallback senyap), teruskan ke `getAggregatedHistory`, tambah `timeZone` di response. *Done when:* unit test resolver lulus; grep menunjukkan tidak ada pemanggilan `getAggregatedHistory` tanpa tz; test backend hijau. — hasil: `npm --prefix backend test` 240 lulus / 1 skip (Mongo) / 0 gagal; `getAggregatedHistory` hanya dipanggil dengan `tz` eksplisit (`git grep`).
- [x] **4. Frontend: jendela, label, log, badge** - `shared/period-window.ts` menerima tz (default `browserTimeZone()`); `laporan-trafik.component.ts` mengirim `tz` pada request history dan memakai tz untuk `periodWindow`/`today`/label rentang; `monitoring.component.ts` label waktu per tz; log downtime diformat dari `startTimeIso`/`endTimeIso`; badge `zona: <IANA>` di header grafik. *Done when:* `period-window.spec.ts` per zona lulus; test komponen membuktikan URL memuat `tz`; verify hijau. — hasil: `ng test` 185/185 lulus (period-window 37 test per zona; spec komponen memeriksa `tz=Asia%2FMakassar`/`tz=Asia%2FJakarta` di URL dan format log ISO per tz); badge juga ikut header cetak PDF.
- [x] **5. Verifikasi penuh + bukti** - `npm run verify`; catatan satu baris di README tentang perilaku zona (fallback WIB); ringkasan bukti per zona. *Done when:* verify hijau dan bukti dicatat. — hasil: `npm run verify` exit 0 — backend 240 lulus / 1 skip (Mongo tak terjangkau, DNS lokal) / 0 gagal; frontend 15 file, 185 tes lulus; build produksi sukses (warning `sweetalert2` CommonJS sudah ada sebelumnya). Bukti mutasi: offset `tzOffsetMs` dikonstankan WIB → 10 tes backend gagal (antar lain `harian: jam bucket mengikuti tz`); `$dateToParts` dipaksa `UTC` → 3 tes pipeline gagal; offset frontend dikonstankan WIB → 6 tes `period-window` gagal. Parity **Mongo vs Node per zona belum terbukti lokal** (skrip `$documents` siap, menunggu Mongo terjangkau). Bukti per zona (Node): Jakarta/Makassar/Jayapura/UTC × semua periode = bucket setara jalur lama; batas hari bergeser 1 jam Jakarta→Makassar; DST 23 jam ditutup benar.

## Files / areas

- `backend/services/traffic-range.js`, `traffic-aggregate.js`, `traffic-history.js`, `backend/server.js` (route `/api/router/history`).
- `backend/test/traffic-range.test.js`, `traffic-aggregate.test.js`, `traffic-aggregate.mongo.test.js`.
- `frontend/src/app/shared/period-window.ts` (+spec), `pages/laporan-trafik/laporan-trafik.component.ts`, `pages/monitoring/monitoring.component.ts`, `README.md`.

## Data / contracts

- `tz`: nama IANA opsional pada `GET /api/router/history`; divalidasi `Intl`; absen/tidak valid → `Asia/Jakarta`; response menambah `timeZone` (nilai yang benar-benar dipakai).
- Data tersimpan **tidak berubah** (UTC/ISO). Bucket/label dihitung dalam tz; `$dateToParts` mendukung `timezone` IANA (Mongo ≥3.6; lingkungan uji ≥5.1).
- Log downtime: field ISO yang ada (`startTimeIso`/`endTimeIso`) menjadi sumber tampilan; string lama tetap dikirim untuk kompatibilitas.
- Tidak ada perubahan auth/otorisasi; `tz` bukan data sensitif dan tidak tersimpan.

## Testing

- Backend: unit resolver/boundary; parity Mongo vs Node per zona; fuzz lama; `npm run verify`.
- Frontend: `period-window` per zona; komponen mengirim `tz`; `npm run verify`.
- Browser harness tidak ada — bukti visual adalah manual pemilik (ganti zona OS/browser lalu lihat label); catat sebagai risiko tersisa.

## Notes for the AI

- Jangan menambah dependency tz (mis. `luxon`/`date-fns-tz`): `Intl` + `$dateToParts` sudah cukup (proportional engineering).
- Pertahankan invarian lama: satu sumber offset per request; Node & Mongo harus identik (parity test adalah kontraknya).
- Zona dengan DST tidak ada di Indonesia, tetapi implementasi harus tetap benar untuk IANA mana pun (pakai offset per tanggal, bukan offset konstan).
- Jangan mengubah format tanggal tersimpan; hanya perhitungan & tampilan.

## Open questions

1. Label zona: cukup `zona: Asia/Makassar` di header Laporan Trafik & Monitoring, atau juga dicetak di header PDF? (usulan: ya, ikut header PDF karena PDF adalah laporan).
2. Tanggal "Rentang manual" ditafsirkan sebagai hari di zona pengguna (usulan: ya) — mohon konfirmasi.
3. Bila tz browser tidak dikenal `Intl`, fallback senyap ke WIB + badge menampilkan WIB (usulan) — atau tampilkan peringatan kecil?

## Catatan pasca-review (2026-09-28)

- **F-99 [P1] fixed** — Ringkasan uptime kini memakai instan ISO (`startTimeIso`/`endTimeIso`) seperti log downtime: filter tumpang tindih dan `clipSeconds` tidak lagi menafsirkan string lama (waktu dinding server) dengan zona browser. Test regresi ditambahkan. Menunggu re-review pada checkpoint baru.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":7768,"specSha256":"7acedaecc2f1258ef6ee9eef6aacb136755378a68d7e0b934b2bd9b4e2746f6b","branch":"refs/heads/feature/zona-waktu-laporan-per-pengguna","head":"2e3b14bf6042bcddb362c82cde7f1db862e3851a","baseRef":"refs/heads/main","baseCommit":"14ad8bcefbbe1fe2af6c3b209858c803adefc1af","sourceTree":"6a816576d2a835e864244b4a4df814408e60e1fe","absentOptional":[]} -->

## Findings

### 13/F-99 [P1] closed - The uptime summary still parses legacy server-wall-clock strings, so summary and log disagree whenever the browser zone differs from the server zone

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:510-518,615-618; backend/storage.js:179-182,250,271
**Found:** 2026-09-28 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `generateUptimeData` filters and clips events with `new Date(e.start)` / `new Date(e.end)` (`:510-518`) - the legacy wall-clock strings `formatDateTimeIndo` writes from the SERVER's local getters (`storage.js:179-182`) - while the log (`:615-618`) and the new display (`:529-530` via `eventTimeText` `:293-297`) use the ISO instants (`startTimeIso`/`endTimeIso`). `new Date('YYYY-MM-DD HH:mm:ss')` is parsed in the BROWSER's zone, so for any user whose zone differs from the server's - the exact case this feature exists for, and every Indonesian user on the planned UTC Render deployment - the two predicates land on different instants. Read-only probe (server WITA, browser WIB, event 2026-09-26T16:30Z-17:00Z, daily window 26 Sep WIB): the server-written string `2026-09-27 00:30:00` parses as 17:30Z, so the summary reports no overlap, while the log sees the ISO 16:30Z and lists it. The function's own comment claims summary and log "tidak bisa berbeda pendapat", and the spec's one-window contract is broken for the users the feature targets.
**Suggested fix:** Use the same ISO-first source in the arithmetic as in the log: `new Date(e.startTimeIso || e.start)` and `e.endTimeIso || e.end` for the overlap filter and the `clipSeconds` call, so display, log, and summary share one instant. No behavior decision needed; legacy events without ISO keep the old fallback.
**Resolution:** Recorded `open` this pass (P1); reproduced by arithmetic probe against the current code. See F-81 for the storage-string half.
Repaired 2026-09-28 on `feature/zona-waktu-laporan-per-pengguna`. The uptime summary now reads the same ISO instants as the log: the overlap filter and the `clipSeconds` call use `new Date(e.startTimeIso || e.start)` and `(e.endTimeIso || e.end)`, so legacy events without ISO keep the old fallback while display, log, and summary share one instant. Regression test added: a 5-minute `interface-down` event placed at 00:01-00:06 local (early in the day, so it does not depend on the hour the suite runs) with `timeZone = 'Asia/Makassar'` is still counted from its ISO instants while its legacy strings name `2001-01-01`; reverting to the legacy strings yields `0s`. Awaiting re-review.
Re-examined and closed at target 2e3b14b (2026-09-28, independent automatic review). The reviewed set covered this file and the repair genuinely closes the defect: `generateUptimeData` derives both the overlap filter and the `clipSeconds` call from `new Date(e.startTimeIso || e.start)` / `new Date(e.endTimeIso || e.end)` (`laporan-trafik.component.ts:510-528`), the same instants the log maps at `:234-242`, and the legacy fallback still covers events without ISO exactly as the log does. The new regression test (`laporan-trafik.component.spec.ts:258-305`) computes its expectation from the same window (clock-independent except for a negligible millisecond edge in the 6 minutes after local midnight, where `Math.max(0, ...)` still holds); reverted ISO-first parsing yields `0s` against the ISO-derived expectation, so the test bites. This pass's `npm run verify` ran the spec green (186 frontend tests, 11 in that file), and the repair introduced no new defect in this function. The storage-string half this finding referenced remains recorded as F-81. Closing.

## Independent review

**Status:** passed
**Target commit:** 2e3b14bf6042bcddb362c82cde7f1db862e3851a
**Base commit:** 14ad8bcefbbe1fe2af6c3b209858c803adefc1af
**Base ref:** main
**Spec hash:** 7acedaecc2f1258ef6ee9eef6aacb136755378a68d7e0b934b2bd9b4e2746f6b
**Prepared by:** opencode
**Builder model:** deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-28T08:36:13.997Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** opencode-go/deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-28T08:50:39.838Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `14ad8bcefbbe1fe2af6c3b209858c803adefc1af..2e3b14bf6042bcddb362c82cde7f1db862e3851a` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `npm run verify` (repo root): pass — backend 241 tests: 240 pass, 1 skip (`kesetaraan agregasi MongoDB vs cara lama`: `querySrv ECONNREFUSED`, local DNS), 0 fail; frontend 15 files / 186 tests pass; production build succeeded (pre-existing `sweetalert2` CommonJS warning).
- `node --require <dns-patch> --test test/*.test.js` (from `backend/`, read-only): pass — 244 tests, 244 pass, 0 skip, 0 fail, ~74 s.
- `node --require <dns-patch> --test test/traffic-aggregate.mongo.test.js` (from `backend/`, read-only): pass — 4 tests (parent + 3 subtests), 0 skip; diagnostics: fuzz 240 samples x 4 zones; real data Poltekkes Gizi 40,107 samples x 4 zones x 5 periods.
- `git rev-parse HEAD`, `git merge-base main HEAD`, `git status --porcelain=v1 -uall`: pass — target/base SHAs match the request and only the request/findings evidence paths are dirty.
- Raw-byte SHA-256 of `blueprint/context/current-feature.md`: pass — `7acedaecc2f1258ef6ee9eef6aacb136755378a68d7e0b934b2bd9b4e2746f6b`, LF, identical to `HEAD`.

### Evidence

- F-99 repair: `generateUptimeData` derives the overlap filter and the `clipSeconds` call from `new Date(e.startTimeIso || e.start)` / `new Date(e.endTimeIso || e.end)` (`frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:510-528`), the same instants the log maps (`:234-242`), with legacy strings still the documented fallback. The regression test (`laporan-trafik.component.spec.ts:258-305`) fails if ISO-first parsing is reverted: the legacy `2001-01-01` strings yield `0s` against the ISO-derived expectation.
- Timezone parity (core contract): the read-only synthetic `$documents`, deterministic-fuzz, and real-data subtests all passed for `Asia/Jakarta`, `Asia/Makassar`, `Asia/Jayapura`, and `UTC` across all five periods (`deepStrictEqual` on `data`/`totalSamples`/`source`); weekly keys use `isoDayOfWeek` (`backend/services/traffic-aggregate.js:224-236`); per-date offsets are pinned by `toTZ` vs `$dateToParts` and DST unit cases.
- API contract: absent/invalid `tz` resolves to `Asia/Jakarta` (`backend/server.js:492`); `timeZone` is present on the count, raw, and aggregate responses; all three service call sites pass tz (`server.js:503,515,528`). A read-only `$documents` probe confirmed Mongo accepts a UTC-offset timezone (`+07:00`) consistently with `Intl`.
- Frontend: `browserTimeZone()` validates through `Intl`; window/`today`/custom range use the user tz (`shared/period-window.ts`, `laporan-trafik.component.ts:151-153,481-483`); the downtime log renders ISO-first (`:234-242,618-637`); the zone badge appears on screen and in the print header (`laporan-trafik.component.html:18,118-121`); the Monitoring chart range formats in the user tz (`monitoring.component.ts:456-470`).
- Scope coverage: the complete `14ad8bce..2e3b14b` diff was reviewed under all four lenses (backend services/server/tests, frontend shared/pages/specs, README, plans); `blueprint/context/review.md` and `blueprint/context/findings.md` were excluded from the code scope.
- Ledger: F-99 [P1] closed (repair re-examined, defect gone, no new defect); F-81, F-90, F-91, F-92, F-93, F-94, F-95, F-96, F-97, F-100, F-101 re-examined with statuses/severities unchanged; no new findings.

### Findings

- F-99 [P1] closed by this pass — repair verified and the regression test bites without reverting the code. No new findings. Re-examined, unchanged: F-81, F-90, F-91, F-92, F-93, F-94, F-95, F-96, F-97, F-100, F-101.

### Remaining risk

- Browser/visual and print-path evidence is unavailable (no browser harness in this session), so F-96's print-snapshot timing stays unexercised.
- No router or Docker available; router-dependent behavior was not exercised.
- The default `npm run verify` still self-skips the Mongo parity suite (F-94); the equality proof needs a local DNS preload, and ranges over `SAMPLE_LIMIT` remain unproven (F-95).
- F-101's Node-path `Intl` cost (P2) and F-100's DST window-boundary drift (P3) remain recorded and unchanged.
- Ongoing (`Belum pulih`) interface-down events are excluded from the uptime duration totals while the log shows their elapsed duration — long-standing, previously reviewed behavior (`blueprint/history/fixes/riwayat-dan-jendela-waktu.md:74`), not reopened as a finding this pass.
