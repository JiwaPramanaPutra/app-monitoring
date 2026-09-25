# Fix: Riwayat dan jendela waktu Laporan Trafik

**Type:** Fix
**Status:** verified
**Branch:** `fix/riwayat-dan-jendela-waktu`
**Fixes:** F-58, F-59, F-65

## Masalah

Tiga sisa temuan di Laporan Trafik. Ketiganya soal rentang waktu dan data yang dibaca.

**1. F-58 [P2] — sumber MongoDB bisa hilang diam-diam saat riwayat membesar.**
`getRawSamples` menggabungkan hasil Mongo dengan `collected.push(...docs)`. Penyebaran argumen punya batas mesin: di Node proyek ini `push(...array)` berhasil pada 131.072 elemen dan melempar `RangeError` di 131.073. Karena panggilan itu berada **di dalam `try` yang menangkap error Mongo**, `RangeError` tersebut tertangkap dan dicatat sebagai *"MongoDB query failed, memakai JSON saja"* — endpoint lalu melayani JSON saja. Jadi begitu riwayat satu site melewati batas itu, grafiknya terpotong lagi persis seperti sebelum penggabungan ditambahkan.

**2. F-59 [P2] — probe uptime membaca seluruh riwayat hanya untuk satu angka.**
Ringkasan uptime memanggil `/api/router/history?raw=1&limit=1` **per site, berurutan**, setiap kali riwayat dimuat atau filter diubah. Backend menjalankan `find({site, rentang}).lean()` tanpa batas, menyaring riwayat JSON di memori, menggabung, membuang duplikat, dan mengurutkan — lalu memotong hasilnya menjadi **satu** sample. Pekerjaannya tumbuh mengikuti total riwayat tersimpan, padahal yang dibutuhkan cuma "ada sample atau tidak".

**3. F-65 [P2] — ringkasan uptime dan log memakai jendela waktu yang berbeda.**
`generateUptimeData` memilih event dengan `eventTime >= now - periodMs` dan **tidak membatasi ujungnya**, sementara probe sample memakai `startDate..endDate` dan `filterDowntimeLog` memakai batas kalender yang sama. Untuk rentang kustom di masa lalu (mis. 1–10 September yang dilihat pada 25 September), semua gangguan `interface-down` di rentang itu **tidak ikut terhitung** sehingga uptime tampil 100% sementara log di bawahnya menampilkan gangguannya. `periodMs` juga dihitung satu hari lebih pendek dari yang dimaksud.

## Perbaikan

- **F-58:** ganti penyebaran argumen dengan perulangan biasa, dan batasi query Mongo dengan urutan terbaru lebih dulu (lalu dibalik) disertai peringatan yang tercatat saat batasnya tersentuh — supaya pemotongan tidak pernah lagi terjadi diam-diam.
- **F-59:** tambah mode hitung di `/api/router/history` (`?count=1`) yang hanya menjawab **apakah ada sample** di rentang itu: Mongo memakai `countDocuments` (murah, terindeks) dan JSON memakai panjang hasil saring. Karena yang dibutuhkan cuma boolean, penggabungan dan pembuangan duplikat tidak perlu dijalankan sama sekali. Semantik `totalSamples` pada mode lain tidak berubah.
- **F-65:** satu **jendela periode** dihitung sekali per penyegaran dan dipakai bersama oleh pemilihan event, probe sample, penyebut `totalPeriodSeconds`, dan log. Event disaring dengan **tumpang tindih rentang**, dan durasinya **dipotong ke dalam jendela** supaya gangguan yang melewati batas tidak dihitung penuh.
- **Data kecil:** device `AP-Akademik-Lt1` masih ber-`siteLocation: "Gizi"` — site itu tidak ada lagi di Project & Site, sehingga perangkatnya tidak muncul di filter site mana pun. Dipindahkan ke site yang benar setelah dikonfirmasi.

Yang tidak boleh rusak: ekspor CSV/JSON, filter periode (`harian`/`mingguan`/`bulanan`/`tahunan`/`custom`), grafik trend dan celahnya, tooltip, serta perhitungan `totalSamples`.

## Build steps

- [x] **Step 1 - Penggabungan riwayat tidak bisa hilang diam-diam (F-58)** - Penyebaran argumen diganti perulangan; query Mongo diurutkan terbaru dulu, dibatasi `SAMPLE_LIMIT`, lalu dibalik; batas yang tersentuh dicatat sebagai peringatan. *Done when:* riwayat satu site yang melebihi 131.072 dokumen tetap tersaji dari kedua sumber (bukan JSON saja); `npm run verify` lolos.
- [x] **Step 2 - Mode hitung untuk probe uptime (F-59)** - `/api/router/history?count=1&startDate=&endDate=` menjawab `hasSamples` tanpa memuat riwayat; ringkasan uptime memakainya alih-alih `raw=1&limit=1`. *Done when:* tabel uptime tidak lagi memuat seluruh riwayat per site; angka "uptime `—` bila tak terukur" tetap benar; `npm run verify` lolos.
- [x] **Step 3 - Satu jendela periode untuk ringkasan dan log (F-65)** - `periodWindow()` dipakai bersama oleh pemilihan event (dengan tumpang tindih rentang dan durasi terpotong), probe sample, penyebut uptime, dan log. *Done when:* rentang kustom di masa lalu menampilkan uptime yang **tidak** 100% jika ada `interface-down` di dalamnya, dan angkanya konsisten dengan log; `npm run verify` lolos.
- [x] **Step 4 - Perangkat dengan site yang sudah tidak ada (data)** - Pindahkan `AP-Akademik-Lt1` dari `siteLocation: "Gizi"` ke site yang benar. *Done when:* perangkat itu muncul saat site tujuannya dipilih.

## Verify

- `npm run verify`.
- Smoke F-59: buka Laporan Trafik dengan beberapa site -> tabel uptime terisi tanpa jeda panjang; pindah periode tetap responsif.
- Smoke F-65: pilih rentang kustom yang mengandung gangguan `interface-down` di masa lalu -> uptime mencerminkan gangguan itu dan cocok dengan kolom di log; rentang tanpa gangguan tetap 100% (atau `—` bila tidak ada sample).
- Smoke F-58: bandingkan jumlah sample mentah sebelum dan sesudah pada site dengan riwayat besar -> tidak ada penurunan mendadak; tidak ada peringatan batas di log saat riwayat masih di bawah batas.
- Bukti tidak ada regresi: ekspor CSV/JSON terunduh; grafik trend dan celahnya utuh; tooltip tetap benar.

## Findings

### riwayat-dan-jendela-waktu/F-58 [P2] closed - `getRawSamples` uses `collected.push(...docs)`, which throws above 131,072 documents and silently drops the whole MongoDB source

**File:** backend/server.js:571, 588-597
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The spread call sits inside the Mongo `try`, so when a site's in-range Mongo history exceeds the engine's spread-argument limit the `RangeError` is caught and logged as "MongoDB query failed, memakai JSON saja", and the endpoint serves JSON-only - the exact truncation the merge was added to remove. Measured on this project's Node: `push(...array)` succeeds at 131,072 elements and throws `RangeError` at 131,073. The collector alone writes 14,400 samples/day/site (`INTERVAL_MS = 6000`), so a multi-day range crosses the limit as history grows. The current data (about 13k Mongo docs) does not trigger it yet, so this is a latent defect, not a live one.
**Suggested fix:** Replace the spread with a loop (`for (const doc of docs) collected.push(doc)`) or `concat`, and bound or page the query if history can grow without limit.
**Resolution:** Repaired 2026-09-25. `getRawSamples` memakai perulangan biasa, bukan `push(...docs)`, sehingga penyebaran argumen tidak lagi bisa melempar `RangeError` yang tertangkap sebagai "MongoDB gagal". Query Mongo kini juga diurutkan terbaru dulu, dibatasi `SAMPLE_LIMIT` (200.000), lalu dibalik, dengan peringatan tercatat saat batasnya tersentuh — jadi pemotongan tidak pernah terjadi diam-diam lagi.
Re-confirmed at target dd43d25 (2026-09-25, independent automatic review): the spread is now `backend/server.js:572` (inside the Mongo `try` at `:562-576`); the JSON push at `:582` has the same shape but is bounded by `MAX_TRAFFIC_SAMPLES = 25000` (`backend/storage.js:25`). The Mongo source remains unbounded and the failure mode is unchanged. Status stays `open` (P2).
Re-reviewed at target 46e3bac (2026-09-25, independent automatic review of the repair): the spread is gone. The Mongo docs are read with `.sort({ timestamp: -1 }).limit(SAMPLE_LIMIT).lean()` (`backend/server.js:615-618`) and pushed through a plain reverse loop (`:628`), the JSON source through a plain loop (`:638`), and the final `.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))` (`:654`) restores the ascending order every consumer saw before. `aggregateSamples`, `toChartSamples`, raw mode, and the export all consume that ascending, deduped list unchanged. `SAMPLE_LIMIT = 200000` is reachable in practice: the collector writes every 6 s (14,400 samples/day/site), so about 14 days of continuous history per site; when the cap is hit the newest 200,000 rows are served and the oldest are dropped. `hasSamplesInRange` uses `countDocuments`, so the new count mode is not affected by the cap. The only issue found in the repair is the warning's exact-cap wording, recorded separately as F-78. Closing.

### riwayat-dan-jendela-waktu/F-59 [P2] closed - Every site's uptime probe materialises and sorts both history sources to read one count

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:529-540; backend/server.js:554-599, 626-637
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: performance)
**Why it matters:** `raw=1&limit=1` still runs the unbounded Mongo `find({site, range}).lean()`, filters the in-memory JSON history, merges, dedupes and sorts the union; `totalSamples` is computed from the full array and only then is the response sliced to one sample. `generateUptimeData` issues this once per site, sequentially, on every history load and filter change, so page work grows with total stored history and site count. `totalSamples` itself is the full merged count, not the limited slice, so the "uptime has evidence" check is not misled - the cost is the finding. No measurement was taken; the cost is read from the code.
**Suggested fix:** Add a count-only mode to `/api/router/history` (Mongo `countDocuments` plus filtered JSON length) and call it from the uptime table; keep `totalSamples` semantics unchanged.
**Resolution:** Repaired 2026-09-25. `/api/router/history?count=1` menjawab `hasSamples` lewat `countDocuments` (Mongo) dan panjang hasil saring (JSON) tanpa memuat riwayatnya. Ringkasan uptime memakai mode ini, bukan lagi `raw=1&limit=1` yang menjalankan `find().lean()` tanpa batas, menggabungkan, membuang duplikat, dan mengurutkan seluruh riwayat per site pada setiap penyegaran. Semantik `totalSamples` di mode lain tidak berubah (diverifikasi: mode lama tetap melaporkan `totalSamples=8846`, `source=mongodb+json`).
Re-confirmed at target dd43d25 (2026-09-25, independent automatic review): the probe is now `laporan-trafik.component.ts:535-543` and the merge now always loads BOTH sources (`backend/server.js:559-600`), so the per-site cost is at least as large. Status stays `open` (P2).
Re-reviewed at target 46e3bac (2026-09-25, independent automatic review of the repair): `hasSamplesInRange` (`backend/server.js:587-603`) answers with an indexed `countDocuments` on the `{site, timestamp}` compound index plus the same in-memory JSON filter, and the uptime table calls `?count=1` with the period-window dates (`laporan-trafik.component.ts:590-598`). No caller of the old `raw=1&limit=1` probe remains. The boolean is true exactly when the old merged `totalSamples` would have been > 0 for the same range and sources: both sources are consulted, the Mongo query range is built by the same `rangeBounds`/`mongoSampleQuery` helpers, and the count path cannot throw for a range the old path handled. The `count` guard treats `'0'` and `'false'` as off, matching the existing `raw` guard; `count=` and a repeated `count` param enable it (harmless, read-only). The only semantic widening is that preset `bulanan`/`tahunan` now query the calendar window instead of the chart's default range, recorded as F-79. Closing.

### riwayat-dan-jendela-waktu/F-65 [P2] closed - Uptime summary scores events on a rolling `now - periodMs` window and ignores `endDate`, so a back-dated custom range can show 100% while its log shows real downtime

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:505-527 (event filter), 536-543 (sample probe), 548-555 (uptime math), 594-636 (log window)
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `generateUptimeData` selects events with `eventTime >= new Date(now.getTime() - periodMs)` and never bounds the end, while the evidence probe and `getRawSamples` use `startDate..endDate` and `filterDowntimeLog` uses the same calendar bounds (`:599-636`). For a custom range in the past (for example 1-10 Sept selected on 25 Sept) every `interface-down` event inside the selected range is excluded from `downtimeTotal`, so the summary computes 100% while the log below renders the outage - the same page contradicting itself. For `harian`/`mingguan` the rolling window also subtracts events that fall outside the calendar day and ignores events that started before it. In addition, `periodMs` for `custom` is `endDate - startDate` at local midnight (`:481-485`), one day shorter than the inclusive WIB window the backend queries, so `totalPeriodSeconds` is understated even when the events match. The F-60 repair (reviewed in the same commit) only removed the no-sample path (`hasEvidence = measuredSamples > 0`); this half of the window mismatch is untouched, and `hasEvidence` now makes it reachable without any event in the rolling window to trigger the old symptom. Confirmed by reading; no runtime repro.
**Suggested fix:** Derive one window per refresh from the selected period (`startDate` 00:00 WIB through `endDate` 23:59:59 WIB, or the same instants the probe sends), filter events by interval overlap and clip each event's duration to the window, and compute `totalPeriodSeconds` from those same instants so the summary and the log cannot disagree.
**Resolution:** Repaired 2026-09-25. Satu `periodWindow()` dipakai bersama oleh pemilihan event, probe sample, penyebut `totalPeriodSeconds`, dan log — batasnya kalender (00:00 sampai 23:59:59). Event kini disaring dengan TUMPANG TINDIH rentang dan durasinya DIPOTONG ke dalam jendela, sehingga rentang kustom di masa lalu tidak lagi menampilkan 100% sementara log di bawahnya menampilkan gangguannya.
Re-reviewed at target 46e3bac (2026-09-25, independent automatic review of the repair): `periodWindow()` (`laporan-trafik.component.ts:487-525`) is the single window for the event overlap filter (`:555-568`), the `?count=1` probe dates (`:591-593`), `totalPeriodSeconds` (`:603`), and `filterDowntimeLog` (`:650`). The reported repro is fixed: an `interface-down` event inside a back-dated custom range is now counted (clipped to the window) instead of being hidden by the rolling `now - periodMs` filter, and `totalPeriodSeconds` is clamped to `Math.max(0, …)` so it is never negative. The overlap predicate is correct for events that start before and end inside/after the window and for zero-length events (skipped by `seconds <= 0`); open events are included in `relevantEvents` for `lastDown` but excluded from the duration totals by the pre-existing `if (!ev.end) continue`. Two residuals were found outside the repaired mainline and recorded separately: the log still selects by event start while the summary counts overlap (F-75), and the window is browser-local against a `+07:00` API (F-76). Closing for the original defect.

## Independent review

# Independent Review

**Status:** passed
**Target commit:** 46e3bac82498c01e7f253d41dba9fbadb1207392
**Base commit:** 83399622345744a98ae0f8b3926fa0387ee16e6f
**Base ref:** main
**Spec hash:** b627d4985dadab09259ea3e9c863efb137fa7127d6ebf971fb665836e6ad4079
**Prepared by:** opencode
**Builder model:** deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-25T12:14:30Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-25T12:24:33Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `83399622345744a98ae0f8b3926fa0387ee16e6f..46e3bac82498c01e7f253d41dba9fbadb1207392` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- Freshness (`git rev-parse HEAD`, `git merge-base main <target>`, `git status --porcelain -uall`): pass — HEAD = `46e3bac…`, merge base = `8339962…`, only `blueprint/context/review.md` differed from the target before this review's own writes; `blueprint/context/findings.md` was clean at the target and is written by this pass.
- SHA-256 of the raw `blueprint/context/current-feature.md` bytes (PowerShell `Get-FileHash -Algorithm SHA256`): pass — `b627d49…ad079`, matches `Spec hash`.
- `npm run verify` (backend `node --test` + frontend vitest + `ng build`): pass — backend 116/116, frontend 91/91 across 8 spec files, Angular build OK (one pre-existing `sweetalert2` CommonJS warning).
- Predicate arithmetic (read-only Node evaluation of the window/overlap/log predicates): pass — a 1 Sept 23:00 → 2 Sept 01:00 event against window 2 Sept 00:00–23:59:59 yields `summary overlap: true clippedSec: 3600` and `log start-in-window: false` (evidence for F-75).
- Timezone arithmetic (`TZ=Asia/Jakarta` and `TZ=America/New_York` Node evaluation of `new Date('2026-09-01')` + `setHours(0,0,0,0)`): pass — WIB yields `2026-09-01`, New York yields `2026-08-31` (evidence for F-76).
- Express 5 default query parser inspection and `querystring.parse` evaluation (`count=1&count=0`, `count=`, `count[$ne]=0`): pass — repeated keys become an array, `count[$ne]` stays a literal key, so the new `count` guard behaves like the existing `raw` guard.
- `git diff 8339962..46e3bac` plus targeted reads of the changed files, their callers, and the storage/model contracts: pass (review evidence, not a check).
- Browser harness: unavailable — none exists in this project, and Check was not required. No rendered/visual verification was performed.
- `/check`: not run — `Check required: no`.

### Evidence

- Reviewed the complete delta `8339962234…6e6f..46e3bac824…7392` (4 files, +217/−84). Code scope: `backend/server.js` and `frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts`; `blueprint/context/current-feature.md` and `blueprint/context/findings.md` are spec/ledger context, excluded from the code review.
- **F-58.** The Mongo docs are fetched with `.sort({ timestamp: -1 }).limit(SAMPLE_LIMIT).lean()` (`backend/server.js:615-618`), pushed by a reverse loop (`:628`), and the final `.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))` (`:654`) re-establishes ascending order, so `aggregateSamples`, `toChartSamples` (`slice(-max)`), raw mode, and the export see the same order and set as before for every range below the cap. `SAMPLE_LIMIT = 200000` is reachable at ~14 days of continuous history per site at the collector's 6 s cadence; at the cap the newest 200,000 rows are served and the oldest dropped with a warning. The new `count=1` path uses `countDocuments` and is unaffected by the cap. The warning is conservative at exactly the cap (F-78). No remaining `push(...array)` spread exists under `backend/`.
- **F-59.** `hasSamplesInRange` (`backend/server.js:587-603`) returns true if `countDocuments` on the `{site, timestamp}` compound index is non-zero, otherwise if the filtered in-memory JSON has any row — this is exactly the presence test the old merged `totalSamples > 0` provided for the same range and sources, so the "uptime `—` when unmeasured" rule cannot regress: there is no range where the old probe reported samples and the count path reports none. Dates are parsed by the same `rangeBounds` (`+07:00`, `T23:59:59`) as before, so boundary parsing is unchanged; the same is true for a site whose samples exist only in JSON. The `count` guard treats `'0'` and `'false'` as off and `count=`/repeated keys as on, matching the existing `raw` guard and behind `auth.requireAuth`; `count[$ne]=0` is not interpreted as an operator under Express 5's simple parser. The only semantic widening is that preset `bulanan`/`tahunan` probes now use the calendar window instead of the chart's default range (F-79).
- **F-65.** `periodWindow()` (`laporan-trafik.component.ts:487-525`) is the single window for the event overlap filter (`:555-568`), the probe dates (`:591-593`), `totalPeriodSeconds` (`:603`), and `filterDowntimeLog` (`:650`). The overlap predicate is correct for events that start before and end inside/after the window; open events are included for `lastDown`/`lastRecover` but excluded from the duration totals by the pre-existing `if (!ev.end) continue`; zero-length events are skipped by `seconds <= 0`; `totalPeriodSeconds` is clamped with `Math.max(0, …)` so it is never negative and `uptimePct` is null when it is zero. The back-dated custom-range defect from F-65 is fixed. The log still selects by event start while the summary counts overlap (F-75), and the window is browser-local against a `+07:00` API (F-76).
- **Data edit (step 4).** `PUT /api/devices/:id` cannot drop absent fields: in Mongo mode Mongoose 9.9.5 casts a plain-object update into `$set` sugar (`backend/node_modules/mongoose/lib/helpers/query/castUpdate.js:113-134`), so only fields present in the body are written and a body built from a redacted GET cannot clear stored credentials; `createdAt` is immutable and stripped (`handleImmutable`). In local mode `updateLocalDevice` merges `{...existing, ...safeUpdate}` after stripping `_id`/`createdAt`/`updatedAt` (`backend/storage.js:293-300`). The live MongoDB record itself could not be inspected offline (see Remaining risk); `backend/data/devices.json` is non-authoritative local fallback state and still shows `siteLocation: "Gizi"`.
- **Security lens.** No new trust boundary, authorization path, injection surface, secret, or unsafe default in the delta; the count endpoint sits behind the same `auth.requireAuth`/`requireEosForMutations` middleware, the site string is cast to a `String` path, and the 500 handler reuses the file's existing `err.message` pattern (pre-existing, not new).
- **Performance lens.** The delta removes the per-site unbounded `find().lean()` + merge + dedupe + sort from the uptime probe and replaces it with an indexed `countDocuments`; `getRawSamples` is now bounded by `SAMPLE_LIMIT` and uses the `{site, timestamp}` index, though a full-range request still materializes up to 200,000 docs in memory (no runtime measurement was possible without the database).
- **Tests lens.** `npm run verify` is green; no skipped, focused, or placeholder tests were found (`backend/test`, `frontend/src`). The delta's new logic has no committed coverage: `backend/server.js` is not imported by any backend suite, and no frontend spec covers `laporan-trafik.component.ts` (the 8 spec files cover `chart-math`, `device-identity`, `router-traffic-link`, `site-hierarchy`, and services). Recorded as F-77, with F-61 remaining open for the backend half.

### Findings

- F-75 [P2] open — the downtime log still selects by event start while the summary counts interval overlap, so a midnight-crossing outage is counted in uptime but missing from the log; also open events appear in the log with no downtime contribution (non-blocking follow-up).
- F-76 [P3] open — `periodWindow()` is browser-local while `rangeBounds` is `+07:00`; WIB browsers agree exactly, others shift (and west-of-UTC expands a custom range one day early) (non-blocking follow-up).
- F-77 [P3] open — the new count-mode, cap, and period-window/overlap logic has no committed test (non-blocking follow-up).
- F-78 [P3] open — the `SAMPLE_LIMIT` warning fires at exactly 200,000 rows and claims truncation that may not have happened; fix by fetching `SAMPLE_LIMIT + 1` (non-blocking follow-up).
- F-79 [P3] open — the chart and export still use `setDefaultDateRange()` while the summary/log/probe use `periodWindow()`, so `bulanan`/`tahunan` cover different day sets (non-blocking follow-up).
- F-58 [P2] closed, F-59 [P2] closed, F-65 [P2] closed — repaired and re-reviewed in this pass against their changed files; the original defects are gone.
- F-61 [P3] re-examined: still open; `getRawSamples` and the new count path remain untested (now cross-referenced by F-77).
- No P0 or P1 finding is `open` or `fixed`; the receipt passes. No merge-blocking finding was identified.

### Remaining risk

- The live MongoDB device record for `AP-Akademik-Lt1` could not be inspected offline (the configured database is remote and no credentials/network access were used, per the review boundary), so the step 4 data move is unverified; `backend/data/devices.json` is stale local fallback state and still reads `Gizi`. The PUT itself was confirmed non-destructive by code and the installed Mongoose version.
- No browser harness exists, so F-65/F-75/F-76's rendered behavior was derived from code and arithmetic, not visually reproduced.
- No runtime measurement of the 200,000-sample cap, `countDocuments` latency, or memory use was possible without querying the database; the reachability estimate (~14 days/site at a 6 s cadence) is arithmetic from `INTERVAL_MS`.
- F-77/F-61: `npm run verify` would stay green if the count-mode guard, the cap/reversal, or the period-window arithmetic regressed.
- `SAMPLE_LIMIT` is a deliberate bound: once a site passes it, the oldest part of a long range is dropped (with a warning) rather than served; this is the spec's chosen trade-off, recorded here for awareness.
- No lint, typecheck, security, or performance command is declared beyond `npm run verify`; Check was not required and was not run.
- Pre-existing findings outside this delta keep their recorded status; only F-58, F-59, F-61, and F-65 were re-examined because the delta touches them.
