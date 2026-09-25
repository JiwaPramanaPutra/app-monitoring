# Fix: Jendela Laporan Trafik benar-benar WIB (dan terkunci test)

**Type:** Fix
**Status:** verified
**Branch:** `fix/jendela-wib-dan-test`
**Fixes:** F-80, F-77

## Masalah

**F-80 [P1] — jendela Laporan Trafik meleset satu jam.**
Perbaikan F-76 mengganti kalender browser dengan kalender ber-offset tetap, tapi offset yang dipilih salah: komponen memakai `8 * 60 * 60 * 1000` dan menyebutnya WIB, sementara WIB itu **UTC+7** (`backend/server.js:436`, dan `rangeBounds` menafsirkan tanggal sebagai `+07:00`). UTC+8 adalah WITA/Makassar.

Terukur untuk rentang kustom 1–10 September:

| | Mulai | Akhir |
|---|---|---|
| Jendela frontend | `2026-08-31T16:00:00Z` (31 Agu 23:00 WIB) | `2026-09-10T15:59:59.999Z` (10 Sep 22:59 WIB) |
| Rentang backend | `2026-08-31T17:00:00Z` | `2026-09-10T16:59:59Z` |
| | **−1 jam** | **−1 jam** |

Akibatnya: ringkasan uptime dan log memilih serta memotong event pada jam yang berbeda dari probe dan grafik — persis kelas "dua jendela" yang F-76/F-79 mau hilangkan. `totalPeriodSeconds` ikut salah (jendela `harian` terukur 18 jam alih-alih 17), sehingga penyebut uptime membengkak dan persentasenya terencerkan. `iso()` juga meleset sehari: pukul 23:00–24:00 WIB `endDate` menjadi tanggal besok. `currentSlotIndex()` memakai `Asia/Makassar` untuk mencari label jam/bulan yang backend-nya menerbitkan label UTC+7, jadi batas badge celah meleset satu slot.

**F-77 [P3] — aritmetika jendela tidak punya test sama sekali.**
Justru karena itulah F-80 bisa lolos: `periodWindow`, predikat tumpang tindih, dan pemotongan durasi semuanya privat di komponen dan tidak diimpor spec mana pun. Di backend, `backend/server.js` tidak diimpor satu pun dari 116 test, sehingga `rangeBounds`' batas WIB, batas `SAMPLE_LIMIT`, dan penjaga mode `count` juga tidak terkunci.

## Perbaikan

- **Satu definisi WIB untuk frontend.** Offset WIB (**UTC+7**) dan seluruh aritmetika jendela diekstrak ke `frontend/src/app/shared/period-window.ts`, dengan komentar yang menyebut WIB = Asia/Jakarta dan mencatat mengapa bukan Asia/Makassar.
- **Satu fungsi untuk kedua sisi.** Predikat tumpang tindih dan pemotongan durasi menjadi fungsi yang sama yang dipakai ringkasan **dan** log — bukan dua salinan yang kebetulan mirip. `currentSlotIndex` juga ikut diekstrak, memakai `Asia/Jakarta`.
- **Aritmetika jalur baca riwayat diekstrak di backend.** `rangeBounds` (batas WIB), `capSamples` (keputusan batas `SAMPLE_LIMIT`), `isCountMode` (penjaga mode `count`), dan `mergeSamples` (dedup + urut) pindah ke `backend/services/traffic-range.js`.
- **Test mengunci batasnya.** Test vitest memastikan batas jendela **sama persis** dengan `new Date('YYYY-MM-DDT00:00:00+07:00')` — bukan sekadar "sekitar". Test backend mengunci batas WIB, keputusan batas, dan dedup.

Yang tidak boleh berubah: perilaku grafik, celah, tooltip, ekspor CSV/JSON, aturan "uptime `—` bila tidak terukur", dan hasil `npm run verify` selain test yang bertambah.

## Build steps

- [x] **Step 1 - Offset WIB dibetulkan + aritmetika diekstrak (F-80, F-77)** - Buat `frontend/src/app/shared/period-window.ts` berisi `WIB_OFFSET_MS = 7 jam`, `wibDayStart`, `wibDateString`, `periodWindow`, `overlapsWindow`, `clipSeconds`, dan `currentSlot(period, labels, now)`; komponen memakainya dan tidak lagi menyimpan salinannya. *Done when:* batas jendela untuk rentang kustom 1–10 September sama dengan `2026-08-31T17:00:00.000Z`/`2026-09-10T16:59:59.999Z`; pukul 23:30 WIB `endDate` tetap `2026-09-25`; `npm run verify` lolos.
- [x] **Step 2 - Test frontend mengunci batas (F-77)** - `frontend/src/app/shared/period-window.spec.ts` menutup: batas WIB sama dengan `+07:00`, hari yang sama dengan `harian`, 7 hari dengan `mingguan`, 30 hari dengan `bulanan`, 1 Januari dengan `tahunan`, rentang kustom yang melintasi tengah malam, event yang belum pulih, durasi nol, dan indeks slot sekarang. *Done when:* test gagal bila offset dikembalikan ke 8 jam; `npm run verify` lolos.
- [x] **Step 3 - Aritmetika jalur baca backend diekstrak + diuji (F-77)** - `backend/services/traffic-range.js` berisi `rangeBounds`, `capSamples`, `isCountMode`, dan `mergeSamples`; `server.js` mengimpor keempatnya. Test baru menutup batas WIB, baris ekstra yang menentukan pemotongan, mode `count`, dan dedup `site`+`timestamp` dengan urutan campur. *Done when:* `npm run verify` lolos dan jumlah test backend bertambah tanpa mengubah test yang ada.

## Verify

- `npm run verify`.
- Smoke F-80: buka Laporan Trafik, pilih rentang kustom 1–10 September -> periksa Network tab, `startDate=2026-09-01` dan `endDate=2026-09-10` (bukan bergeser), dan permintaan `count=1` memakai tanggal yang sama.
- Smoke F-80: pilih periode `harian` -> jendela yang dipakai ringkasan mencakup jam 00:00 WIB hari ini sampai sekarang, bukan sejak 23:00 WIB kemarin.
- Bukti tidak ada regresi: grafik dan celahnya, tooltip, ekspor CSV/JSON, serta baris "Tidak Terpantau" pada ringkasan uptime tetap seperti sebelumnya.
- Test baru harus benar-benar menggigit: kembalikan sementara offset ke 8 jam dan pastikan test frontend gagal.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":5076,"specSha256":"e9ab24aab2d4ca0507ca50b9aa0871b4ed478bd85ca25ae40ed67959f8cae3c8","branch":"refs/heads/fix/jendela-wib-dan-test","head":"82d96236c94e79b8314b578ca81da52fcb539b50","baseRef":"refs/heads/main","baseCommit":"901504f82764a85cc8d1eda00373a999224f9042","sourceTree":"b19ea3c99afa46db2ea1f606f7d2e0e78cc75834","absentOptional":[]} -->

## Findings

### jendela-wib-dan-test/F-16 [P3] closed - Security-critical backend helpers have no durable regression tests

**File:** backend/package.json:6-10; backend/services/redact.js; backend/services/project-utils.js; backend/services/auth.js
**Found:** 2026-09-23 by /audit independent current (scope: current; lens: tests)
**Why it matters:** The feature's security core - router-password preservation, nested-id normalization, the login throttle, and the auth/role middleware - is verified only by ad-hoc reviewer scripts. `backend/package.json` declares no test script, no `*.test.js`/`*.spec.js` exists under `backend/`, and the project Verify command (`package.json:3` -> `frontend/package.json:10`) runs only the frontend vitest suite plus the Angular build. The ledger shows the cost: the F-10 repair regressed a stored temp-id password (F-14) and the next review pass caught it, not a test. A committed test for `preserveRouterPasswords`/`normalizeNestedIds`/`checkLoginThrottle` would lock the repaired behavior and the F-10/F-14/F-15 edge cases.
**Suggested fix:** When backend test tooling is next touched (or via `/tests`), add focused tests for the pure helpers with Node's built-in `node:test` runner - no new dependency - covering rename, missing `routerConfig`, persisted temp id, unknown temp id, both normalization modes, and the 11th-attempt throttle block. The frontend specs already cover `AuthService`/`ApiService`.
**Resolution:** Re-examined at checkpoint 809ce428 (2026-09-23): `backend/package.json` still declares no test script, no `*.test.js`/`*.spec.js` file exists under `backend/`, and this delta only added the `jsonwebtoken` dependency. The backend security helpers are still covered only by reviewer scripts, not committed tests. Status stays open (P3).
Re-examined at checkpoint 3615c4c (2026-09-23): `backend/package.json:6-11` still declares no `test` script and no backend test file exists. This delta added new pure logic with no committed coverage - `filterLaporan` and `csvCell` (`backend/server.js:1080-1096`) and the local laporan CRUD (`backend/storage.js:325-354`) - which a `node:test` suite could cover alongside the existing helpers. Status stays open (P3). Re-confirmed at checkpoint 7581c0e (2026-09-23): still no backend test script or test files. Status stays open (P3).
**Fixed in the `/tests` setup (2026-09-23):** backend now has `npm test` (`node --test test/*.test.js`, no new dependency) with 25 focused tests covering `redact.js` (password preservation cases), `project-utils.js` (both normalization modes), `auth.js` (authenticate roles, JWT middleware, EOS-for-mutations, login throttle), and the extracted `backend/services/laporan-utils.js` (filter, csvCell formula neutralization, CSV builder). The project `verify` command now runs backend tests before the frontend gate, and the CI workflow installs backend dependencies. Awaiting re-review.
Re-examined at checkpoint cd9c095 (2026-09-24) by the independent review of the current delta: `backend/test/{auth,redact,project-utils,laporan-utils}.test.js` exist at the target and this pass's `npm run verify` ran them green (25/25 backend, 11/11 frontend, Angular build OK); the suite covers every case listed above. The repair's files are outside this delta (committed at base `f0c3161`), so this pass records the confirmation but leaves the status `fixed`; closure belongs to a review pass that covers that checkpoint.
Re-confirmed at target 6cf1407 (2026-09-24, independent automatic review): `npm run verify` ran the four backend suites green (25/25). The repair files are still outside the reviewed delta (`f0c3161..6cf1407`), so the status stays `fixed`; since the fix landed directly on `main`, closure needs a full-project or `backend/`-scoped audit pass.
Re-confirmed at target b5f2ca2 (2026-09-25, independent automatic review): `npm run verify` ran all seven backend suites green (66/66) plus the frontend suite (52/52) and the Angular build. The repair files are still outside this delta (`eb70dd3..b5f2ca2`), so the status stays `fixed`.
Re-confirmed at target 6e9eaca (2026-09-25, independent automatic review): this delta now includes `backend/services/redact.js` and `backend/test/redact.test.js`, and `npm run verify` ran all 66 backend tests green, including the new `router-errors`, `router-interfaces`, and `traffic-response` suites. The `auth.js`/`project-utils.js` repair files are still outside this delta, so closure still belongs to a full-project or `backend/`-scoped pass. Status stays `fixed` (P3).
Re-confirmed at target 3db1301 (2026-09-25, independent automatic review): this delta now includes `backend/services/redact.js` and `backend/test/redact.test.js`, and `npm run verify` ran all 66 backend tests green including the new marker tests. The `auth.js`/`project-utils.js` repair files are still outside this delta, so closure still belongs to a full-project or `backend/`-scoped pass. Status stays `fixed` (P3).
Re-examined at target 48202b5 (2026-09-25, independent automatic review): `npm run verify` ran 79/79 backend tests green, including `redact.test.js`. `auth.js`/`project-utils.js` and their suites remain outside the reviewed delta, so the status stays `fixed` (P3).
Re-confirmed at target fbc777d (2026-09-25, independent automatic review): this pass's `npm run verify` ran all 79 backend tests green (`auth`, `redact`, `project-utils`, `laporan-utils`, `device-identity`, `router-errors`, `router-interfaces`, `traffic-response`). `backend/services/redact.js` and `backend/test/redact.test.js` are inside this delta; `backend/services/auth.js` and `project-utils.js` and their suites remain outside it, so closure still belongs to a full-project or `backend/`-scoped pass. Status stays `fixed` (P3).
Closed 2026-09-25 by /audit (scope: full; lens: tests). This pass covers the whole project, so the repair files are inside the reviewed set. `backend/package.json` declares `"test": "node --test test/*.test.js"`, and `backend/test/{auth,redact,project-utils,laporan-utils}.test.js` exist; this pass's `npm run verify` ran 116/116 backend tests green, including those four suites and the three cases the finding named (rename, missing `routerConfig`, persisted temp id, unknown temp id, both normalization modes, the 11th-attempt throttle block). The original defect - security-critical helpers covered only by ad-hoc reviewer scripts - is gone, and the repair introduced no new defect. Closed.

### jendela-wib-dan-test/F-69 [P2] closed - The hover tooltip is clipped at the left edge by the chart's `overflow-x:auto` wrapper

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.html:132-134,176-202; frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:751,761
**Found:** 2026-09-25 by /audit (scope: current; lens: quality)
**Why it matters:** The tooltip's containing block is the `position:relative` div (`html:134`) inside the `overflow-x:auto` wrapper (`html:132`). It is placed with `[style.left.%]="hoveredPoint.left"` plus `translateX(-50%)` (`html:183-184`), so half its width sits left of the point. The widest content, "Tidak ada data pada jam ini" (~28 chars at 10.5px, roughly 170px including padding), puts about 85px outside the chart at `left = 0`. The wrapper is a scroll container, and CSS clips overflow at its padding box; content in the inline-start direction is not reachable by scrolling, so that half is cut off. With equally spaced points, the first buckets are always inside that clipped strip: at the current desktop layout (roughly 1,100px of chart) the first two hourly buckets are affected and more on narrower screens; a single-bucket `custom` range (`chartData.length === 1` -> `left = 0`, `ts:737-751`) is always affected. `flip: left > 75` (`ts:761`) guards only the right edge, so there is no left equivalent. Confirmed by reading the CSS/DOM and SVG geometry; no browser harness exists, so it was not visually reproduced.
**Suggested fix:** Mirror the existing right-edge `flip` with a left guard: when the point is close enough to 0 that `left% * chartWidth < tooltipWidth / 2`, place the box with `translateX(0)` (or clamp its left offset) instead of `translateX(-50%)`; place the single-bucket case inside the chart. Keep the same positioning context so the box still follows the cursor.
**Resolution:** Repaired 2026-09-25. Posisi tooltip memakai tiga mode perataan (`alignFor`): menempel kiri pada `left < 12`, membalik ke kiri pada `left > 75`, sisanya di tengah. Titik-titik awal tidak lagi terpotong pembungkus yang `overflow-x: auto`. Aritmetikanya murni dan teruji di `shared/chart-math.ts`.
Closed 2026-09-25 by /audit (scope: full; lens: quality). Re-read the repair against `laporan-trafik.component.html:181-204` and `shared/chart-math.ts:36-40`: the tooltip now takes three alignments and renders `translateX(0)` when `alignFor(left)` returns `left` (`left < 12`), so the box starts at the point instead of centering on it and the `overflow-x: auto` wrapper no longer clips the leading buckets. The arithmetic is pure and covered by `chart-math.spec.ts` in this pass's green vitest run (91/91). The original defect is gone; no new defect introduced. Closed.

### jendela-wib-dan-test/F-70 [P3] closed - The hover marker dots render as wide flat ellipses because `preserveAspectRatio="none"` scales the circle radius with the chart width

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.html:135,167-172
**Found:** 2026-09-25 by /audit (scope: current; lens: quality)
**Why it matters:** The SVG uses `viewBox="0 0 100 150"` with `preserveAspectRatio="none"`, so x scales by `width/100` and y by `150/150 = 1`. The marker circles use `r="2.5"` in user units, which renders as `rx = 2.5 * width/100` (roughly 25-28px at the current ~1,000-1,100px chart) and `ry = 2.5px` - a ~50x5px ellipse, not the "titik di posisi Tx/Rx" the spec promises. `vector-effect="non-scaling-stroke"` protects only the stroke, not the radius. The dot centers (x and y) are correct and match the paths, so this is a visual-shape defect, not a data-position one. At `left = 0`/`100` the ellipse also paints half outside the SVG box, clipped by the scroll container on the left.
**Suggested fix:** Draw the marker at a fixed screen size - for example two small absolutely positioned dots in the existing overlay using the same `left` percentage and a pixel `top` derived from `txY`/`rxY`, or bind `rx`/`ry` so the on-screen shape is round (`ry` fixed, `rx = ry * 150 / chartWidthPx`). Visual-only change.
**Resolution:** Repaired 2026-09-25. Penanda dipindah dari SVG ke overlay HTML dengan ukuran tetap (7px, `border-radius: 50%`), jadi titiknya bulat di layar berapa pun lebarnya — `preserveAspectRatio="none"` tidak lagi memipihkannya. Garis penanda tetap putus-putus.
Closed 2026-09-25 by /audit (scope: full; lens: quality). Re-read `laporan-trafik.component.html:164-175`: the hover markers are now HTML divs in the absolute overlay (`width/height: 7px`, `border-radius: 50%`), so the `preserveAspectRatio="none"` scaling of the parent SVG no longer flattens them into ellipses. The dashed axis line is kept. Pure visual change, correct at any chart width. Closed.

### jendela-wib-dan-test/F-71 [P2] closed - Stopping the "titik tanpa data" count at the last sample also hides real gaps after it and makes a fully empty day report 0

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:657-670; backend/server.js:526-547
**Found:** 2026-09-25 by /audit (scope: current; lens: quality)
**Why it matters:** `aggregateSamples` still emits every `harian` hourly slot (and every `tahunan` month) with `samples: 0` when there is no data (`backend/server.js:535-545`), including past ones. The new counter stops at the last bucket with `samples > 0` and returns 0 when no bucket has data, so three reachable states are now under-reported: (a) a current day whose collector or router stopped at 14:00 counts nothing for 15:00-23:00 even though those buckets are in the past - the chart simply ends early and the badge disappears, which is the opposite of the signal this badge exists to give; (b) a day with no samples at all (backend down, restored backup, a site whose collector never ran) shows no badge instead of the previous "24 titik tanpa data" (the API returns the 24 empty slots, so the empty-state branch is not taken); (c) for `tahunan`, every month between the last sample and the current month is ignored. The frontend knows the current time, so "not yet happened" and "data lost" can be told apart; the F-68 ledger entry itself named the alternative ("cap the daily view at the current hour"). Confirmed by reading the code paths.
**Suggested fix:** Count `samples === 0` buckets up to the bucket that contains the current time instead of up to the last sample - for `harian` the current hour and for `tahunan` the current month, compared against the same WIB labels the backend emits. That keeps F-68's no-future-false-positives goal and restores the outage/empty-day signal; alternatively stop emitting future slots in `aggregateSamples`. This refines the shipped badge behavior, so the user may also choose to accept the current trade-off.
**Resolution:** Repaired 2026-09-25. Batas hitung celah kini `missingLimit(lastIndexWithData, currentSlotIndex)` — yang LEBIH JAUH antara sample terakhir dan slot waktu "sekarang". Jam/bulan yang belum lewat tetap dikecualikan, tapi celah setelah sample terakhir (gangguan siang ini) dan hari yang bolong total kembali terhitung. `currentSlotIndex()` mengenali label jam untuk `harian` dan label bulan untuk `tahunan`; periode lain jatuh ke perilaku lama karena tidak punya slot kosong.
Closed 2026-09-25 by /audit (scope: full; lens: quality). Re-read `laporan-trafik.component.ts:677-708` and `shared/chart-math.ts:57-81`: `chartMissingBuckets` now counts up to `missingLimit(lastIndexWithData(chartData), currentSlotIndex())`, i.e. the FARTHER of the last sample and the current slot, so a gap after the last sample (this afternoon's outage) and a fully empty day are both counted again while slots that have not happened yet stay excluded. The logic itself is correct and tested; the zone used by `currentSlotIndex()` is a separate defect, recorded as F-80. Closed.

### jendela-wib-dan-test/F-75 [P2] closed - The downtime log still selects by event start, so an outage crossing the window start is counted in uptime but missing from the log

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:555-568, 649-657
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The F-65 repair made the summary select events by interval overlap (`eventEnd >= window.start && eventStart <= window.end`, `:555-568`) and clip each duration to the window, but `filterDowntimeLog` (`:654-657`) still keeps only events whose `timestamp` — the event start (`:226`) — lies inside the window. An outage that begins before the window and ends inside it is therefore counted by `downtimeTotal` and lowers the uptime percentage while the log below the table shows nothing. Verified predicate arithmetic for window 2 Sept 00:00–23:59:59 and event 1 Sept 23:00 → 2 Sept 01:00: the summary overlaps and counts 3600 clipped seconds (`summary overlap: true clippedSec: 3600`), the log predicate is false (`log start-in-window: false`). The inverse exists too: an open event that starts inside the window appears in the log but contributes zero downtime because `if (!ev.end) continue` (`:562`) skips it. The spec's Step 3 done-when is "angkanya konsisten dengan log"; with calendar-day windows, a midnight-crossing outage is the common boundary case. The table still shows the downtime total, so the impact is a page that contradicts itself, not lost data. Confirmed by reading and predicate arithmetic; no browser repro.
**Suggested fix:** Carry `startTimeIso`/`endTimeIso` into `DowntimeEvent` (the backend response already has both) and filter the log by the same overlap predicate the summary uses (`(endIso ?? window.end) >= window.start && startIso <= window.end`) instead of start-only. The log shows the full event duration while the summary shows the clipped part; note the clipping in the row tooltip or leave the full duration, no data decision needed.
**Resolution:** Repaired 2026-09-25. `DowntimeEvent` membawa `endTime` dari `endTimeIso`, dan `filterDowntimeLog` memakai predikat TUMPANG TINDIH yang sama dengan ringkasan — bukan lagi menyaring berdasarkan waktu mulai. Gangguan yang melewati tengah malam kini muncul di log kedua hari yang bersinggungan, dan event yang belum pulih menampilkan durasi berjalan sampai ujung jendela, bukan `0s`.
Closed 2026-09-25 by /audit (scope: full; lens: quality). Re-read `laporan-trafik.component.ts:653-675`: `DowntimeEvent` carries `endTime` from the backend's `endTimeIso`, and `filterDowntimeLog` uses the same interval-overlap predicate as the summary (`end >= window.start && start <= window.end`) instead of the event start alone. An outage crossing midnight now appears on both days it touches and its contribution to uptime is consistent with the row; an event that has not recovered shows running elapsed time instead of `0s`. The predicate is right - the window it is handed is the subject of F-80. Closed.

### jendela-wib-dan-test/F-76 [P3] closed - The period window is built from the browser-local calendar while the API interprets the same dates as +07:00

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:487-531; backend/server.js:561-566
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `periodWindow()` builds its bounds with `setHours(0,0,0,0)` / `setHours(23,59,59,999)` in the browser's timezone and `isoDate()` (`:528-531`) formats them back to `YYYY-MM-DD`, while `rangeBounds` re-parses those strings as `+07:00`. For a WIB browser the two agree exactly. For any other zone they diverge: with `TZ=America/New_York`, `new Date('2026-09-01')` + `setHours(0,0,0,0)` is 31 Aug local and `isoDate` sends `2026-08-31`, expanding the custom range by one day (measured: `TZ=New York custom window start: Mon Aug 31 2026 … -> isoDate 2026-08-31`); east of WIB (for example UTC+9) the date is preserved but the event/log window starts 2 h before the backend probe range. Preset windows have the same divergence. The backend is deliberately WIB everywhere (`aggregateSamples` uses `toWIB`), so this is only reachable for a browser whose clock is not WIB, but then the summary/log and the probe/chart can cover shifted periods.
**Suggested fix:** Make the WIB calendar the single source: build the window from WIB-offset instants (or send ISO instants and accept them in `rangeBounds`). At minimum, parse the date-input parts as a local calendar date (`new Date(y, m-1, d, 0, 0, 0, 0)`) instead of `new Date('YYYY-MM-DD')` so the west-of-UTC off-by-one day cannot happen, and document the WIB assumption. The parse fix needs no behavior decision; supporting non-WIB browsers changes contract and needs the user's call.
**Resolution:** Repaired 2026-09-25. `periodWindow()` membentuk batas dari kalender WIB (Asia/Makassar, UTC+8) dan mengembalikan tanggal `YYYY-MM-DD` WIB untuk dikirim ke endpoint riwayat, sehingga rentang kustom tidak lagi bergeser sehari di mesin non-WIB. `isoDate()` yang berbasis kalender browser dihapus karena tidak dipakai lagi.
Re-examined at 901504f (2026-09-25, /audit scope: full; lens: quality). Half repaired: the window dates are now derived from a fixed-offset calendar rather than the browser calendar, so the west-of-UTC off-by-one day measured in the original finding can no longer happen. But the chosen offset is `8 * 60 * 60 * 1000` (`laporan-trafik.component.ts:482`) while the backend's WIB is `7 * 60 * 60 * 1000` (`backend/server.js:436`) and `rangeBounds` parses `+07:00` (`:561-566`), so the window still disagrees with the very API the finding named - by one hour, and by one day in the 23:00-24:00 WIB hour. The measured evidence and the fix are recorded as F-80. Status stays `fixed` (P3); closure waits on F-80.
Closed 2026-09-25 by /audit independent current (scope: current; lens: all four) at target 55fe88f. Re-read `frontend/src/app/shared/period-window.ts:32-58,67-112` and `laporan-trafik.component.ts:480-482`: the window is now built from `wibParts`/`wibDayStart`/`wibDateString` with a fixed WIB offset, so the browser calendar can no longer shift the custom range, and `isoDate()` is gone. This pass's vitest run (109/109, including the 18 new `period-window.spec.ts` cases) pins the custom 1-10 September bounds to `+07:00` and the 23:30 WIB date to the same WIB day. The original defect is gone and the repair introduced no new behavioral defect; the display paths that still use the browser calendar are recorded separately as F-85. Closed.

### jendela-wib-dan-test/F-78 [P3] closed - The cap warning fires at exactly SAMPLE_LIMIT and claims truncation that may not have happened

**File:** backend/server.js:615-622
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `find(…).limit(SAMPLE_LIMIT)` returns at most 200,000 documents and the warning condition is `docs.length >= SAMPLE_LIMIT`, so a site whose in-range history is exactly 200,000 documents logs "batas 200000 sample tercapai, sisanya tidak dimuat" even though nothing was dropped. The warning is the only signal that history was truncated, so a false positive erodes the signal the F-58 repair added. The cap is reachable in normal operation: at the collector's 6-second cadence that is about 14 days of continuous history for one site.
**Suggested fix:** Fetch `SAMPLE_LIMIT + 1` rows, serve the first `SAMPLE_LIMIT`, and warn only when the extra row is present (or confirm with the existing `countDocuments`). No behavior decision needed.
**Resolution:** Repaired 2026-09-25. `getRawSamples` mengambil `SAMPLE_LIMIT + 1` baris dan memperingatkan hanya bila baris ekstra itu benar-benar ada, sehingga riwayat yang pas 200.000 tidak lagi memunculkan klaim pemotongan yang tidak terjadi.
Closed 2026-09-25 by /audit (scope: full; lens: quality). Re-read `backend/server.js:611-631`: the query fetches `SAMPLE_LIMIT + 1`, the warning and the `docs.length = SAMPLE_LIMIT` truncation run only when `docs.length > SAMPLE_LIMIT`, and the reverse copy loop starts from the truncated length so the retained rows are still the newest 200,000. A history of exactly 200,000 rows no longer claims truncation. Closed.

### jendela-wib-dan-test/F-79 [P3] closed - The chart and export still use a different period window than the summary and log

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:239-246, 396-422, 487-525
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The F-65 repair gave the summary, probe, denominator, and log one window (`periodWindow`), but the history request and export still send `this.startDate`/`this.endDate` set by `setDefaultDateRange()`. For `bulanan` that is `now - 29 days` while `periodWindow` goes one calendar month back (on 25 Sept: 27 Aug vs 25 Aug); for `tahunan` it is 1 January of the current year while the summary uses a rolling year. The page can therefore claim uptime (and evidence) for days the chart and export do not cover - the same "two windows" class the repair removed elsewhere. It is a residual inconsistency, not a regression of the repaired paths, and no runtime data was needed to confirm the code paths.
**Suggested fix:** Derive the chart/export dates from `periodWindow()` as well, or state in the component why the chart intentionally keeps its own preset range. Changing the shipped `tahunan` chart range (1 Jan to date → rolling year) removes current behavior and needs the user's decision.
**Resolution:** Repaired 2026-09-25. `setDefaultDateRange()` kini diturunkan dari `periodWindow()` yang sama dengan ringkasan, log, probe, dan grafik, sehingga input tanggal, grafik, dan tabel menampilkan himpunan hari yang identik untuk setiap periode. Sekaligus `bulanan` disamakan menjadi 30 hari terakhir dan `tahunan` menjadi 1 Januari tahun berjalan, sesuai labelnya di `getPeriodLabel()`.
Closed 2026-09-25 by /audit (scope: full; lens: quality). Re-read `laporan-trafik.component.ts:406-412, 361-371, 211-249, 290-298`: `setDefaultDateRange()` now derives both input values from `periodWindow()`, and the chart and export requests send those same `startDate`/`endDate`, so the chart, export, date inputs, summary, and log cover one identical day set for every period instead of the chart keeping its own preset range. `bulanan` and `tahunan` were brought in line with their labels at the same time. The repair introduced no new defect - the one-hour offset they all now share is F-80. Closed.

### jendela-wib-dan-test/F-80 [P1] closed - `periodWindow()` uses a UTC+8 offset while the backend's WIB is UTC+7, so every window it feeds is an hour early and the date rolls over an hour early at night

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:482,486-494,523,534,695,703; backend/server.js:436,561-566
**Found:** 2026-09-25 by /audit (scope: full; lens: quality)
**Why it matters:** The F-76 repair replaced the browser calendar with a fixed-offset one but picked the wrong offset: the component uses `const WIB_OFFSET_MS = 8 * 60 * 60 * 1000` (`:482`) and calls it WIB, while the backend's WIB is `7 * 60 * 60 * 1000` (`backend/server.js:436`) and `rangeBounds` re-parses the same dates as `+07:00` (`:561-566`). Asia/Makassar is WITA (UTC+8), not WIB (UTC+7). Measured for the custom range 1-10 September: the component's window is `2026-08-31T16:00:00Z`..`2026-09-10T15:59:59.999Z` (= 31 Aug 23:00 WIB to 10 Sep 22:59 WIB) while the backend range is `2026-08-31T17:00:00Z`..`2026-09-10T16:59:59Z` - both boundaries exactly one hour early, so the summary and log select and clip events over a different hour than the probe and chart measure. `totalPeriodSeconds` (`:607`) inherits it: the `harian` window measured 18 h at 17:00 WIB instead of 17 h, inflating the denominator by an hour and diluting the reported uptime. The `iso()` helper (`:490-494`) also rolls over early: at 23:30 WIB it returns `2026-09-26` while the WIB calendar day is `2026-09-25`, so `endDate` and the visible date inputs point at tomorrow's day for the last hour of every WIB day. `currentSlotIndex()` (`:693-708`) uses `Asia/Makassar` for its hour and month lookup against labels the backend emitted in UTC+7, so the gap-badge boundary is off by one slot at the edge. The consequence is the exact class F-76 and F-79 set out to remove - two windows that disagree - and a monitoring report whose uptime percentage is computed over a window an hour too long.
**Suggested fix:** Change the constant to `7 * 60 * 60 * 1000` so it matches `server.js:436` and `rangeBounds`' `+07:00`, and define it in one named place with a comment naming WIB (Asia/Jakarta, UTC+7) - not Asia/Makassar. Switch `currentSlotIndex()` to `timeZone: 'Asia/Jakarta'` for the same reason. Then add the vitest coverage F-77 asks for, asserting the boundary instants equal `new Date('YYYY-MM-DDT00:00:00+07:00')` and that a custom range's `endDate` still names the real WIB day at 23:30 WIB.
**Resolution:**
Repaired 2026-09-25 on `fix/jendela-wib-dan-test`. `WIB_OFFSET_MS` is now `7 * 60 * 60 * 1000` and lives in one place, `frontend/src/app/shared/period-window.ts`, together with `wibDayStart`, `wibParts`, `wibDateString`, `periodWindow`, `overlapsWindow`, `clipSeconds`, and `currentSlot`; the component keeps only a thin wrapper and no longer holds a second copy of any of it. `currentSlot` also stopped depending on `Intl`: with locale `en-GB`, `Intl` returns `"Sept"` for September, which never matched the backend's `"Sep"` label, so the annual gap count silently fell back to the last sample. It now indexes a fixed `MONTH_LABELS` list identical to the backend's, and derives the hour from the WIB calendar instead of a timezone name. Evidence that the repair bites: `frontend/src/app/shared/period-window.spec.ts` (18 tests) fails on 10 cases when the constant is mutated back to 8 hours, including `expected '2026-09-26' to be '2026-09-25'` for the 23:30 WIB case and `expected 7200 to be 3600` for the midnight-crossing clip. The frontend spec and the new backend `rangeBounds` test assert the same instants for 1-10 September (`2026-08-31T17:00:00.000Z`..`2026-09-10T16:59:59.000Z`), so the two sides are now pinned to one agreement. `npm run verify` green: 130/130 backend, 109/109 frontend, Angular build OK. Awaiting re-review.
Closed 2026-09-25 by /audit independent current (scope: current; lens: all four) at target 55fe88f. Re-read `frontend/src/app/shared/period-window.ts:17-20,67-112,149-163` and `laporan-trafik.component.ts:480-482,642-644`: the single frontend offset is `7 * 60 * 60 * 1000`, `periodWindow` returns the WIB boundaries, `wibDateString` keeps the WIB day at 23:30, and `currentSlot` derives the hour and month from WIB with a fixed `MONTH_LABELS` list matching the backend's (`backend/server.js:479-483`). The new tests assert the exact instants on both sides (frontend `period-window.spec.ts:26-33,71-79`; backend `traffic-range.test.js:18-31`) and this pass's `npm run verify` ran them green (130/130 backend, 109/109 frontend, Angular build OK). The one-hour window error and the early date rollover are gone; the residual backend constant duplication and display-path issues found alongside are recorded separately as F-84 and F-85. Closed.

## Independent review

**Status:** passed
**Target commit:** 55fe88fe1913528c296557a995f3c4364ee4db17
**Base commit:** 901504f82764a85cc8d1eda00373a999224f9042
**Base ref:** main
**Spec hash:** e9ab24aab2d4ca0507ca50b9aa0871b4ed478bd85ca25ae40ed67959f8cae3c8
**Prepared by:** opencode
**Builder model:** deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-25T12:51:52.232Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-25T12:59:40.371Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `git rev-parse HEAD` / `git merge-base main 55fe88f`: pass - HEAD equals `Target commit` and the recorded base ref `main` still resolves to `Base commit`.
- `Get-FileHash -Algorithm SHA256 blueprint/context/current-feature.md`: pass - equals `Spec hash`.
- `git status --porcelain --untracked-files=all`: pass - before this receipt, only `blueprint/context/review.md` differed from the target; `blueprint/context/findings.md` is the second permitted evidence path.
- `npm run verify`: pass - backend `node --test` 130/130, frontend vitest 109/109 (9 files), Angular build complete.

## Evidence

- Reviewed the complete `901504f..55fe88f` delta from scratch: `backend/server.js`, `backend/services/traffic-range.js`, `backend/test/traffic-range.test.js`, `frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts`, `frontend/src/app/shared/period-window.ts`, `frontend/src/app/shared/period-window.spec.ts`; the spec and findings files were excluded from the code scope.
- F-80 repair: `period-window.ts:18` is UTC+7; the custom 1-10 September window resolves to `2026-08-31T17:00:00.000Z`..`2026-09-10T16:59:59.999Z`; `wibDateString` keeps `2026-09-25` at 23:30 WIB; `currentSlot` derives the hour and month from WIB and matches the backend's fixed month list.
- Backend: `traffic-range.js:38-43` derives `+07:00` from its own UTC+7 constant; `capSamples`, `isFlagOn`, and `mergeSamples` preserve the previous behavior and are wired at `server.js:616,642,666,681`.
- `npm run verify` green with the new suites (`period-window.spec.ts` 18 tests, `traffic-range.test.js` 14 tests); the only build warning is the pre-existing sweetalert2 CommonJS notice.
- No focused, skipped, or placeholder tests; the new tests use fixed instants and no mocks or timers.

## Findings

- Closed: F-76, F-80.
- Stays `fixed`: F-77 (the count/cap/window logic it named is now covered; `hasSamplesInRange`'s either-source rule remains only indirect and is tracked with F-61), F-30, F-72.
- Stays `open`: F-61 (its merge half is now tested by `traffic-range.test.js`).
- New open P3: F-84, F-85, F-86.
- No P0 or P1 finding is `open` or `fixed`.

## Remaining risk

- No lint, typecheck, or security-scanner command is declared, so none was run.
- No browser or end-to-end harness exists, so F-80's smoke steps (Network-tab dates, daily window, chart/tooltip/export regression) and the F-73/F-74/F-85/F-86 behaviors were verified by reading, not in a running UI.
- No Docker (F-25), no router hardware (F-31), and no runtime profiling were available.
- F-84, F-85, and F-86 are open P3 findings; F-61 keeps the `getRawSamples` source wiring and the collector gate untested.
