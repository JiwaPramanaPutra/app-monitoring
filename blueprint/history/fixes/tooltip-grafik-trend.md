# Fix: Tooltip grafik trend dan sisa temuan grafik

**Type:** Fix
**Status:** verified
**Branch:** `fix/tooltip-grafik-trend`
**Fixes:** F-66, F-67, F-68

## Masalah

**1. Grafik trend tidak punya keterangan saat kursor diarahkan** (permintaan langsung). Nilai Tx/Rx hanya terbaca dari ringkasan di bawah grafik ("Current / Average / Maximum"); titik mana pun di grafik tidak bisa ditanyai. Untuk grafik 24 jam, itu membuat lonjakan tertentu tidak bisa dipastikan jam berapa dan seberapa besar.

**2. F-68 [P3] — badge "N titik tanpa data" menghitung jam yang belum terjadi.** `chartMissingBuckets` (`laporan-trafik.component.ts`) menghitung setiap bucket dengan `samples === 0`, sedangkan `aggregateSamples` **selalu** mengisi 24 slot untuk `harian`. Untuk hari yang sedang berjalan, jam 19:00-23:00 yang belum terjadi ikut terhitung — screenshot terbaru menampilkan **"14 titik tanpa data"** padahal sebagian besar hanya jam yang belum lewat. Ini menyesatkan ke arah sebaliknya dari tujuan badge itu.

**3. F-66 [P2] — kejadian lama tanpa `kind` menyerap link-down (regresi halus dari F-55).** `decideDowntimeAction` menyamakan "tidak ada kejadian terbuka" dengan "kejadian terbuka tanpa `kind`". Padahal kejadian tanpa `kind` adalah data lama (isi kegagalan koneksi) yang seharusnya diperlakukan sebagai `unreachable` — sehingga `closeOpen` seharusnya `true`. Akibatnya, pada upgrade/restore yang dimulai dengan satu event lama masih terbuka, link-down yang terverifikasi tenggelam di dalamnya dan tidak pernah menurunkan uptime. **Laten sekarang** (ledger berisi 0 event dan semua event baru punya `kind`), tapi test-nya justru mengunci perilaku yang salah.

**4. F-67 [P3] — rate `NaN` dibaca berbeda oleh dua tempat.** Collector memakai `txBps === 0 && rxBps === 0` (untuk `NaN` hasilnya `false` → dianggap "mengalir" dan memaksa `running: true`), sedangkan `decideDowntimeAction` memakai `Number(x) || 0` (untuk `NaN` hasilnya "idle"). Perbedaan itu membuat satu event bisa ditutup tanpa bukti saat balasan router cacat.

## Perbaikan

- **Tooltip interaktif pada grafik trend.** Overlay transparan di atas SVG memetakan posisi kursor ke titik terdekat (`stepX = lebar/(n-1)`, semua titik berjarak sama). Saat kursor diarahkan muncul: **label waktu** (mis. `08:00`), **Tx** dan **Rx** dalam Mbps (atau Kbps bila di bawah 1 Mbps), dan jumlah sample. Bucket tanpa sample menampilkan **"Tidak ada data pada jam ini"**, bukan `0 Mbps`. Ditambah **garis penanda vertikal** dan **titik** di posisi Tx/Rx, supaya jelas titik mana yang sedang dibaca. Skala grafik disimpan sebagai properti (`chartMaxValue`) supaya penanda dan path memakai sumber yang sama.
- **F-68:** `chartMissingBuckets` hanya menghitung sampai bucket terakhir yang **punya data**; jam yang belum terjadi tidak dihitung.
- **F-66:** `decideDowntimeAction` memperlakukan kejadian terbuka tanpa `kind` sebagai `unreachable` (bukan sebagai "tidak ada kejadian"), sehingga `closeOpen` benar. Testnya diperbaiki agar mengunci perilaku yang benar.
- **F-67:** satu predikat idle dipakai bersama; collector memakai `Number(x) || 0` seperti fungsi klasifikasi, sehingga `NaN` diperlakukan sama di kedua tempat.

Yang tidak boleh rusak: tampilan grafik untuk `harian`/`mingguan`/`bulanan`/`tahunan`/`custom`, celah untuk bucket kosong, ekspor CSV/JSON, dan perhitungan uptime.

## Build steps

- [x] **Step 1 - Tooltip dan penanda titik pada grafik trend** - Tambah overlay kursor, `hoveredPoint`, garis penanda + titik di SVG, dan kotak keterangan (waktu, Tx, Rx, jumlah sample; "tidak ada data" untuk bucket kosong). Simpan skala sebagai `chartMaxValue` agar dipakai bersama `generateChartPaths`. *Done when:* arahkan kursor ke titik mana pun -> muncul jam, Tx, dan Rx dalam Mbps; bucket kosong menyebut tidak ada data; penanda ikut bergerak; `npm run verify` lolos.
- [x] **Step 2 - Badge "titik tanpa data" tidak menghitung jam yang belum terjadi (F-68)** - `chartMissingBuckets` berhenti di bucket terakhir yang punya data. *Done when:* hari yang sedang berjalan dan terukur penuh menampilkan **0** titik tanpa data, sedangkan celah sungguhan (mis. 15:00 kosong) tetap terhitung.
- [x] **Step 3 - Rapikan klasifikasi downtime (F-66, F-67)** - Kejadian terbuka tanpa `kind` diperlakukan `unreachable`; predikat idle disatukan sehingga `NaN` dibaca sama oleh collector dan `decideDowntimeAction`. *Done when:* test "link-down saat event lama tanpa kind terbuka" mengharapkan `closeOpen: true` dan lolos; `npm run verify` lolos.

## Verify

- `npm run verify`.
- Smoke tooltip: buka Laporan Trafik -> arahkan kursor ke beberapa titik -> keterangan mengikuti kursor dan angkanya cocok dengan ringkasan di bawah grafik; arahkan ke celah (mis. 15:00) -> muncul "Tidak ada data pada jam ini"; geser kursor dari kiri ke kanan -> penanda bergerak mulus tanpa lompatan.
- Smoke F-68: pada hari yang sedang berjalan, badge "titik tanpa data" tidak lagi menghitung jam setelah data terakhir.
- Bukti tidak ada regresi: ekspor CSV/JSON tetap terunduh; filter periode tetap bekerja; celah pada grafik tetap tampak.

## Findings

### tooltip-grafik-trend/F-66 [P2] closed - A kind-less (pre-classification) ongoing event is never closed before an `interface-down` start, so a verified link-down is still absorbed and never reduces uptime

**File:** backend/server.js:833-840; backend/services/downtime-classify.js:15-32; backend/test/downtime-classify.test.js:33-42
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality, tests)
**Why it matters:** The F-64 repair replaced the unconditional close with `decideDowntimeAction`, whose own contract says a legacy event without `kind` must be normalized to `unreachable` (`downtime-classify.js:18-22`). The caller passes the raw kind (`ongoingKind: ongoing ? ongoing.kind : null`, `server.js:839`), and the function treats `null`/`undefined` as "no ongoing event", so "no event" and "legacy event" are conflated. When a pre-classification event is open and a successful poll verifies the link is down, the function returns `{ closeOpen: false, open: 'interface-down' }` (`:32`) and `recordDowntimeStart` returns the existing kind-less event unchanged (`storage.js:211-212`) - exactly F-55's absorption bug for old data. At 94bfb00 the unconditional close covered this case, so dd43d25 regressed it. Reproduced mechanically with a temp `DATA_DIR`: one legacy event plus one idle link-down poll produced one event with `kind` undefined, same id, still open. Reachability is latent in this checkout - `backend/data/downtime_events.json` holds zero events and every event created by the target code carries a `kind` - but any deployment or restored backup that begins with an open pre-classification event would hit it immediately (P1-class there). The commit message and the test titled "a legacy event without a kind is treated as unreachable (fix F-55 for old data)" both claim the normalization works, while the assertions (`:35-41`) lock `closeOpen: false`; the test therefore grants false confidence.
**Suggested fix:** Normalize at the call site: `ongoingKind: ongoing ? (ongoing.kind || 'unreachable') : null` in `backend/server.js:839`, and change the legacy test to cover an actually-open kind-less event (close-then-reopen) instead of the no-event case.
**Resolution:** Re-examined at target 352df5b (2026-09-25, independent automatic review): repaired. The collector now passes `ongoingKind: ongoing ? (ongoing.kind || 'unreachable') : null` (`backend/server.js:844`), so an open pre-classification event is no longer conflated with "no ongoing event"; with a verified link-down the function returns `{ closeOpen: true, open: 'interface-down' }` and `recordDowntimeEnd` closes the legacy event before `recordDowntimeStart` opens the link-down event. This is the only production call site (`backend/server.js:835`); `decideDowntimeAction` itself still treats `null`/`undefined` as "nothing open", which matches its documented contract. The caller expression remains without automated coverage (the rewritten test feeds an already-normalised `'unreachable'`), recorded under F-72/F-61. Status closed.

### tooltip-grafik-trend/F-67 [P3] closed - The collector's idle gate and `decideDowntimeAction`'s idle test disagree for malformed rates, so a bad reply can close an open event and skip the link probe

**File:** backend/server.js:831-832, 170-171; backend/services/downtime-classify.js:16; backend/test/downtime-classify.test.js:80-86
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality, tests)
**Why it matters:** The collector computes `idle = sample.txBps === 0 && sample.rxBps === 0` (`server.js:831`) and then passes the raw numbers plus `running: true` for the non-idle case into `decideDowntimeAction`, which recomputes idle as `(Number(txBps) || 0) === 0 && (Number(rxBps) || 0) === 0` (`downtime-classify.js:16`). For every numeric value the two predicates agree, but for `NaN` (which `fetchMikrotikTraffic`'s inline `parseInt` can produce at `server.js:170-171`, F-38) the collector reads "traffic flowing" while the function reads idle; because the collector forced `running: true`, the function's `running === true` branch wins and returns `closeOpen: true`. A malformed rate therefore closes any open event with no traffic and no link evidence and skips `isInterfaceRunning`. The new test "missing or malformed numbers count as idle, not as traffic" (`downtime-classify.test.js:80-86`) asserts a semantic the production caller contradicts end-to-end. Mechanically confirmed: `decideDowntimeAction({ txBps: NaN, rxBps: NaN, running: true, ongoingKind: 'interface-down' })` returns `{ closeOpen: true, open: null }`, which is what the collector executes for an `NaN` sample. Reachability depends on a non-numeric RouterOS rate field, so this is a low-likelihood guard gap rather than a live defect.
**Suggested fix:** Use one predicate in both places - either derive `running` from the same idle helper the decision function uses, or (better, per F-38) parse the rates through the tested `parseMonitorRates` so `NaN` cannot reach the collector.
**Resolution:** Re-examined at target 352df5b (2026-09-25, independent automatic review): repaired via the first option. `isIdleSample` (`backend/services/downtime-classify.js:13-15`) is now the single predicate: the collector uses it (`backend/server.js:831`) and `decideDowntimeAction` uses it (`:28`), so `NaN`/`null`/`undefined` rates read as idle in both places. The collector's forced `running: true` for malformed rates is gone - a `NaN` sample now probes the link (`:832`) and the function branches on the probe result instead of closing on no evidence. The new tests cover the predicate and the agreement (`backend/test/downtime-classify.test.js:5-23`); no new defect was found in the new path. The `NaN` source is untouched: `fetchMikrotikTraffic` still parses inline with `parseInt` (`backend/server.js:170-171`, F-38 open), so a malformed reply still records a `NaN` sample, now classified as idle. Status closed.

### tooltip-grafik-trend/F-68 [P3] closed - The "titik tanpa data" badge counts hours that have not happened yet, so a fully measured day always shows missing points

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:639-641; frontend/src/app/pages/laporan-trafik/laporan-trafik.component.html:113-116; backend/server.js:526-547
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** For `harian`, `aggregateSamples` emits all 24 hourly slots and marks every slot without samples as `samples: 0` (`backend/server.js:535-545`), including hours after the current time; `chartMissingBuckets` counts them all (`laporan-trafik.component.ts:639-641`) and the trend header renders the badge whenever the count is above zero (`laporan-trafik.component.html:113-116`). At 18:xx a fully measured site therefore shows about five "titik tanpa data" that are simply the future, which reads as lost history. The gap rendering itself is correct; only the count conflates "not measured yet" with "data lost".
**Suggested fix:** Count gaps only up to the last bucket that carries samples (or cap the daily view at the current hour) before displaying the badge. Cosmetic, no behavior decision needed.
**Resolution:** Re-examined at target 352df5b (2026-09-25, independent automatic review): the false positive is repaired. `chartMissingBuckets` (`frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:657-670`) now finds the last bucket with `(samples || 0) > 0` and counts empty buckets only up to it, so a fully measured current day reports 0 and a genuine gap before the last data bucket is still counted; the all-empty case returns 0. The same stop-at-last-data heuristic drops empty buckets that are in the past but come after the last sample (mid-day collector/router outage, fully empty day, `tahunan` months after the last data); that inverse defect is recorded as F-71 so it is not lost. Status closed for the original future-hours defect.

## Independent review

# Independent Review

**Status:** passed
**Target commit:** 352df5b8f5f83d536adf58c8bc05dc63c67bcbe8
**Base commit:** a55b2b2610d9280944d8dc7662e55a7294e65840
**Base ref:** main
**Spec hash:** f4c18b48fa75f1e3e4c7df39cc58d558ece1baad6d4537764c20fa266a72fdc8
**Prepared by:** opencode
**Builder model:** deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-25T11:18:24Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-25T11:27:31Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `a55b2b2610d9280944d8dc7662e55a7294e65840..352df5b8f5f83d536adf58c8bc05dc63c67bcbe8` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD` / `git rev-parse main` / `git merge-base HEAD main`: pass (HEAD = target; merge base = base `a55b2b2`)
- `git status --porcelain=v1 -uall`: pass (only `blueprint/context/review.md` differed from the target before this review's own writes; no staged, unstaged, or untracked path changes elsewhere; `blueprint/context/findings.md` is written later by this review, which the contract permits)
- SHA-256 of the raw `blueprint/context/current-feature.md` bytes: pass (`f4c18b4…fdc8`, matches the request; 5,079 bytes)
- `npm run verify`: pass (backend 116/116 tests, frontend 71/71 tests, Angular build OK; one pre-existing `sweetalert2` CommonJS warning)
- `git diff a55b2b2..352df5b` plus targeted reads of the six changed files, their callers, and the storage/test contracts: pass (review evidence, not a check)

### Evidence

- Reviewed the complete delta `a55b2b2610…e65840..352df5b8f5…7bcbe8` (6 files, +212/−19): `backend/server.js`, `backend/services/downtime-classify.js`, `backend/test/downtime-classify.test.js`, `frontend/src/app/pages/laporan-trafik/laporan-trafik.component.{ts,html}`, and the tracked spec `blueprint/context/current-feature.md`.
- Tooltip geometry: the cursor-to-index mapping (`ratio * (n - 1)` rounded, `left = i/(n-1)*100`) agrees with how the paths are drawn (`stepX = 100/(n-1)`, `xAt(i) = i*stepX`); the y mapping `130 - min(130, value/max*130)` matches the paths' `130 - value/max*130` and shares `chartMaxValue` (`laporan-trafik.component.ts:677-681,684,696-703,724,750-751`). `preserveAspectRatio="none"` scales x linearly, so the fraction is preserved even when the wrapper is scrolled; the overlay covers exactly the SVG box (`inset:0` in the same `position:relative` container), including a chart wider than the scrollport. A single-bucket chart maps every hover to index 0, consistent with the paths' `stepX = 0`.
- Tooltip content: empty buckets (`samples === 0`) show "Tidak ada data pada jam ini" with no marker dots; the marker line is drawn, the dots are suppressed for zero values. `formatChartValue` is consistent with the summary: bucket values arrive as 2-decimal Mbps averages, so `≥1 Mbps` prints identically to the summary's `x.xx Mbps`, and `<1 Mbps` switches to whole Kbps as the spec asks (numerically equal; no rounding mismatch for ≥1).
- Tooltip placement: the box is inside the `overflow-x:auto` wrapper; the right edge is protected by `flip` at `left > 75`; the live badge is in the header above the tooltip's positioning context, so no overlap is possible; the left edge has no equivalent guard (F-69). Marker dots stay inside the 130-of-150 plot vertically; at `left=0`/`100` the ellipse paints half outside the SVG box and is clipped by the scroll container, not over the axis-label column.
- F-68: the counter now counts only buckets up to the last one with `samples > 0`, so a fully measured current day reports 0 and a gap before the last data bucket is still counted; a fully empty window and gaps after the last sample now report 0 (F-71).
- F-66: the collector passes `ongoing ? (ongoing.kind || 'unreachable') : null` (`backend/server.js:844`) at the only production call site; a legacy open event is closed before the link-down event opens, matching the function contract.
- F-67: `isIdleSample` is the single predicate used by the collector (`backend/server.js:831`) and `decideDowntimeAction` (`downtime-classify.js:28`); the collector no longer forces `running: true` for malformed rates, and the new tests cover the predicate and the agreement for `NaN`/`null`/`undefined`.
- Security lens: no new trust boundary, input surface, injection, secret, or authorization path in the delta (Angular interpolation escapes the tooltip text; the backend change only normalizes a stored field). Performance lens: no new unbounded work; the hover handler and the badge getter are bounded by the chart's ≤31 buckets, and no measurement was taken.
- No browser harness exists, so no rendered or visual verification was performed; the placement and marker-shape findings are derived from reading the DOM, CSS, and SVG scaling rules.

### Findings

- F-69 [P2] open - hover tooltip is clipped at the left edge by the chart's `overflow-x:auto` wrapper (non-blocking)
- F-70 [P3] open - hover marker dots render as wide flat ellipses under `preserveAspectRatio="none"` (non-blocking)
- F-71 [P2] open - the "titik tanpa data" count now hides real gaps after the last sample and reports 0 for a fully empty day (non-blocking)
- F-72 [P3] open - no test for the F-66 caller normalization (the new legacy test duplicates the F-55 case) or for the new chart hover/gap arithmetic (non-blocking)
- F-66 [P2] closed, F-67 [P3] closed, F-68 [P3] closed - repaired and re-reviewed in this pass
- No P0 or P1 finding is `open` or `fixed`, so the receipt passes.

### Remaining risk

- No browser harness and no rendered check: F-69 and F-70's exact pixel impact is read-derived, not visually confirmed.
- F-71 can leave a mid-day collector/router outage behind a 0 badge until it is fixed (non-blocking).
- F-67's root cause remains: `fetchMikrotikTraffic` still parses RouterOS rates inline with `parseInt` (`backend/server.js:170-171`, F-38 open P3), so a malformed reply still records a `NaN` sample; no live router was available to exercise the new idle → link-probe path end to end.
- The F-66 caller normalization is verified only by reading (F-72): `npm run verify` would stay green if it regressed.
- No separate lint, typecheck, security, or performance command is declared; `npm run verify` (tests + build) is the only automated signal available locally.
- Pre-existing findings outside this delta keep their recorded status (F-16, F-25, F-26, F-30, F-31, F-33, F-34, F-36, F-37, F-38, F-45, F-46, F-48-F-52, F-54, F-58, F-59, F-61-F-63, F-65); only F-66, F-67, and F-68 were re-examined because the delta touches them.
- Pre-existing and unchanged: the y-axis labels are a fixed 300/225/150/75/0 scale while the plot uses `chartMaxValue`; above 300 Mbps the axis understates the peak, and the new tooltip makes that mismatch visible.
