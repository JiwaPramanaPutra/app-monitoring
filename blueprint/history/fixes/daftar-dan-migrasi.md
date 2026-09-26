# Fix: Dua temuan audit — penyegaran daftar yang hilang + migrasi yang tidak idempoten

**Type:** Fix
**Status:** verified
**Branch:** `fix/daftar-dan-migrasi`
**Fixes:** F-88, F-87

## Masalah

**1. F-88 [P3] — form Project & Site menutup modal setelah 2 detik dan melewati penyegaran daftar.**
Ketujuh operasi simpan/hapus (project, site, gedung, lantai) memakai bentuk yang sama: `finish()` yang menjalankan `refreshProjects()`, menutup modal, dan menandai `done = true`, dipanggil dari callback `subscribe` **dan** dari `setTimeout(() => this.ngZone.run(() => finish()), 2000)`.

Penjaga `done` membuat timeout berkuasa, bukan cadangan. Kalau simpan memakan lebih dari dua detik, timeout menang: `refreshProjects()` berjalan **sebelum** responsnya tiba dan modal tertutup. Saat responsnya akhirnya datang, `finish()` langsung `return` karena `done` sudah `true` — jadi `refreshProjects()` **tidak pernah dipanggil lagi**, dan daftar tetap menampilkan keadaan sebelum simpan padahal simpan berhasil. Karena modalnya sudah hilang, tidak ada tanda apa pun bahwa daftarnya basi.

**2. F-87 [P3] — `migrate_traffic.js` tidak benar-benar mencegah duplikat.**
Skripnya menghitung `existingCount = await TrafficSample.countDocuments()` lalu **hanya mencetaknya**; tidak ada satu pun cabang yang memakainya untuk melewati data yang sudah ada. Komentarnya berbunyi *"hindari duplikat"*, dan `catch`-nya ditulis seolah `{ ordered: false }` memunculkan duplicate-key — padahal tidak bisa: `trafficSampleSchema.index({ site: 1, timestamp: 1 })` bukan unique, dan satu-satunya indeks unik di proyek ini adalah `Project.name`. Menjalankan ulang skripnya menyisipkan seluruh `traffic_history.json` sekali lagi. Kerusakannya terbatas karena `mergeSamples` membuang duplikat `site`+`timestamp` — grafik dan uptime tidak berlipat — tapi storage membengkak dan `totalSamples` yang dilaporkan ikut dua kali.

## Perbaikan

- **F-88: hapus ketujuh `setTimeout`.** Penyelesaian hanya milik observable: `finish()` tetap dipanggil dari `next` dan `error`, dan penjaganya tidak lagi bisa dimenangkan oleh timer. `NgZone` hanya dipakai oleh baris-baris itu, jadi impor dan injeksinya ikut hilang.
- **F-87: jadikan migrasi idempoten, tanpa indeks unik dan tanpa memuat kunci lama ke memori.** Setiap sample menjadi `updateOne` dengan filter `site`+`timestamp` dan `upsert: true` di dalam `bulkWrite`, jadi baris yang sudah ada tidak disisipkan lagi dan menjalankan ulang skripnya menjadi tidak mengubah apa pun. Penyusunan operasinya diekstrak ke `backend/services/traffic-migrate.js` supaya bisa diuji tanpa MongoDB.
- Indeks unik **tidak** ditambahkan: itu mengubah koleksi hidup dan gagal kalau sudah ada duplikat, jadi keputusan itu diserahkan ke pemilik data lewat ledger, bukan diambil sepihak di sini.

Yang tidak boleh berubah: perilaku UI form Project & Site (modal tetap tertutup dan daftar tetap tersegarkan pada simpan normal), isi `traffic_history.json`, dan data yang sudah ada di MongoDB — `$setOnInsert` tidak boleh menimpa dokumen yang sudah ada.

## Build steps

- [x] **Step 1 - Penyelesaian milik observable (F-88)** - Hapus tujuh `setTimeout`, lalu hapus `NgZone` dari impor dan konstruktor. *Done when:* tidak ada `setTimeout` tersisa di `project-site.component.ts`, `refreshProjects()` hanya dipanggil dari callback respons, dan `npm run verify` lolos.
- [x] **Step 2 - Migrasi idempoten + unit teruji (F-87)** - Tambahkan `backend/services/traffic-migrate.js` berisi `buildUpsertOps(samples)`, pakai di `migrate_traffic.js` dengan `bulkWrite(..., { ordered: false })`, dan uji penyusunan operasinya. *Done when:* satu sample menghasilkan satu operasi `updateOne` ber-`upsert` yang filternya `site`+`timestamp`; baris tanpa timestamp sah dibuang; `npm run verify` lolos.

## Verify

- `npm run verify`.
- **F-88:** bukti utamanya pembacaan + build, karena proyek ini belum punya harness komponen (F-30). Periksa bahwa `refreshProjects()` muncul tepat sekali per operasi dan hanya di jalur respons, dan bahwa `grep setTimeout` pada berkas itu kosong. Catat keterbatasan ini di laporan.
- **F-87:** unit test `buildUpsertOps` menutup bentuk operasinya — itulah yang membuat migrasi idempoten. Uji ulang terhadap MongoDB hidup **tidak** dilakukan di sini karena koneksi mongoose dari skrip lepas tidak andal di mesin ini; dicatat sebagai risiko yang tersisa, bukan diklaim lolos.
- Bukti tidak ada regresi: simpan project/site/gedung/lantai lewat UI tetap menutup modal dan menyegarkan daftar; perangkat di `Monitoring` tidak terpengaruh.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4554,"specSha256":"641fe67b57fcfdf464246c68232805904fed015a2ce319924f23939f55228d19","branch":"refs/heads/fix/daftar-dan-migrasi","head":"0604fea266707859ad903a7a6e6048068527c1d5","baseRef":"refs/heads/main","baseCommit":"0604fea266707859ad903a7a6e6048068527c1d5","sourceTree":"c615f438f10b958bd2ac9dfb33b07c50dd3da9c6","absentOptional":[]} -->

## Findings

### daftar-dan-migrasi/F-84 [P3] closed - Backend keeps a second WIB offset constant beside the one the new module exports

**File:** backend/server.js:26,437-441; backend/services/traffic-range.js:16,96-103
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `traffic-range.js` defines `WIB_OFFSET_MS` and derives its `+07:00` suffix from it so that no second copy can drift (the module comment says two places claiming WIB is exactly how an hour disappears), and it exports the constant at `:98` - but `server.js` still declares its own `const WIB_OFFSET_MS = 7 * 60 * 60 * 1000` (`:437`) for `toWIB` (`:439-441`) and destructures only `SAMPLE_LIMIT, rangeBounds, capSamples, isFlagOn, mergeSamples` from the module (`:26`). Both copies are UTC+7 today, so there is no live defect; the drift risk is concrete because `toWIB`/`aggregateSamples` live in `server.js`, which no test imports, so changing only `server.js:437` back to 8 h would still pass `npm run verify` while shifting every `harian`/`tahunan` bucket label - the same class of bug as F-80.
**Suggested fix:** Add `WIB_OFFSET_MS` to the destructure at `backend/server.js:26` and delete the literal at `:437`, so `toWIB` uses the single definition the backend tests already pin. No current requirement is lost.
**Resolution:** Repaired 2026-09-25 on `fix/satu-konstanta-wib`. `toWIB` moved into `backend/services/traffic-range.js` and uses that module's `WIB_OFFSET_MS`; `server.js` imports it and its own `const WIB_OFFSET_MS` literal is gone. Grep evidence: no `60 * 60 * 1000` remains anywhere in `backend/server.js`, and `const WIB_OFFSET_MS` now appears exactly once in the whole backend, at `backend/services/traffic-range.js:16`. Four new tests in `backend/test/traffic-range.test.js` pin the conversion - `toWIB`'s UTC fields equal WIB for a daytime instant, the day rolls exactly at 00:00 WIB, `toWIB` agrees with the `rangeBounds` day boundary, and `toWIB(stamp) - stamp === WIB_OFFSET_MS` so a reintroduced second offset fails even when both copies hold the same value. Evidence that the tests bite: mutating the constant to 8 hours fails three of them (`WIB_OFFSET_MS adalah UTC+7, bukan UTC+8`, `toWIB menghasilkan kalender WIB`, `toWIB memindahkan hari tepat di tengah malam WIB`), while the duplication guard correctly still passes because both copies moved together. `npm run verify` green: 134/134 backend (from 130), 109/109 frontend, Angular build OK. Awaiting re-review.
Closed 2026-09-26 by /audit (scope: full; lens: quality). Re-read the repaired files against the current code. `backend/services/traffic-range.js:16` holds the only `WIB_OFFSET_MS` in the backend and `toWIB` (`:53-55`) uses it; `backend/server.js` has no hour-offset literal left and imports both from the service. The behavior is unchanged - `toWIB` is the same expression, and `downtime-classify`/`traffic-range` suites plus the frontend suite ran green in this pass (`npm run verify`: 138/138 backend, 112/112 frontend, Angular build OK). The original defect - a second, untested WIB definition that could drift back to UTC+8 without failing any test - is gone, and the repair introduced no new defect. Closed.

### daftar-dan-migrasi/F-85 [P3] closed - Displayed custom-range dates and the input cap still follow the browser calendar, and `applyQuickPreset` has no caller

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:143-149,391-400,415-420,758-776; frontend/src/app/pages/laporan-trafik/laporan-trafik.component.html:53,59
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The fix moved the window arithmetic to WIB, but the display path still formats with local getters: `getPeriodLabel()` parses the stored `YYYY-MM-DD` with `new Date(this.startDate)` (UTC midnight, `:759-761`) and `formatDate()` reads `getDate()/getMonth()/getFullYear()` (`:774-776`), so on a browser west of UTC the custom-range label shown in both page headers renders one day early - measured with `TZ=America/New_York`, `new Date('2026-09-01').getDate()` is 31 (Aug) while WIB gives 1 Sep. The `[max]="today"` inputs (`:145`; `html:53,59`) are seeded by `formatDateForInput` (`:415-420`) from the browser calendar, so a WIB `endDate` of the current day can exceed the max there. `applyQuickPreset` (`:391-400`) builds the same browser-local dates and has no caller anywhere under `frontend/src` (dead code). F-76/F-80 removed browser-calendar dependence from the window itself; these label/preset paths are the remainder, and F-81 records the same class for displayed downtime times.
**Suggested fix:** Format the label from the stored dates with the WIB calendar (`wibDateString`/`parseWibDay` or an explicit `+07:00`), derive `today` from WIB as well, and delete the unreferenced `applyQuickPreset`; no current requirement is lost. Display-only change, no data decision needed.
**Resolution:** Repaired 2026-09-26 on `fix/label-wib-dan-log-collector`. `getPeriodLabel` no longer builds a `Date` at all: it formats the stored `YYYY-MM-DD` WIB strings through the new `formatWibDay` in `shared/period-window.ts`, which reads the string parts and the shared `MONTH_LABELS` list, so no timezone can shift it. `today`, which bounds both date inputs through `[max]`, now comes from `wibDateString(new Date())` instead of the browser calendar. `applyQuickPreset` (verified to have no callers under `frontend/src`) and the then-dead `formatDateForInput` and `formatDate` were deleted. Measured evidence: with `TZ=America/New_York` the old expression renders `2026-09-01` as `31 Agu 2026`, `2026-09-10` as `9 Sep 2026`, and `2026-01-01` as `31 Des 2025`; the new one renders all three correctly and produces identical output under `America/New_York` and `Asia/Jakarta`, and the frontend suite passes 112/112 under both zones. A committed test walks all twelve months to pin that a `-01` day never lands in the previous month. Awaiting re-review.
Closed 2026-09-26 by /audit (scope: full; lens: quality). Re-read `frontend/src/app/shared/period-window.ts:142-159` and the component's `getPeriodLabel`/`ngOnInit`. `formatWibDay` splits the stored `YYYY-MM-DD` string and formats it through the shared `MONTH_LABELS` list without constructing a `Date`, so no timezone can move it; `today`, which bounds both date inputs, comes from `wibDateString(new Date())`; and the unreferenced `applyQuickPreset` plus the then-dead `formatDateForInput` and `formatDate` are gone (grep over `frontend/src` finds no remaining caller). This pass's `npm run verify` ran 112/112 frontend tests green, including the twelve-month `formatWibDay` guard. The original defect is gone and the repair introduced no new defect. Closed.
