# Fix: Agregasi riwayat trafik di MongoDB & loop uptime paralel

**Type:** Fix
**Status:** verified
**Branch:** fix/agregasi-grafik

## Problem

Halaman Laporan Trafik menunggu ~11 detik sebelum kontennya muncul.

- `/api/router/history` mengukur (diukur dari server dev): harian ~0,7–1,5 s,
  mingguan ~1,9 s, bulanan ~2,0–2,2 s, tahunan ~2,3–3,2 s. Payload tetap 0–1 KB,
  jadi waktunya habis di server, bukan di jaringan.
- `getRawSamples` (`backend/server.js`) memuat SELURUH sample rentang dari
  MongoDB (27.964 dokumen untuk Poltekkes Gizi), menggabungkannya dengan riwayat
  JSON, membuang duplikat, mengurutkan — lalu `aggregateSamples` menjumlahkannya
  per bucket di Node.
- `generateUptimeData` (`frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts`)
  menembak 2 endpoint per site secara berurutan (5 site ≈ 254–481 ms).

## The fix

- **Agregasi pindah ke MongoDB** lewat pipeline `$match → $sort → $limit → $group`
  dengan kunci bucket WIB yang diturunkan dari `WIB_OFFSET_MS` di
  `backend/services/traffic-range.js` (satu definisi WIB, tidak menambah yang baru).
  Server tidak lagi memuat dokumen mentah untuk jalur agregat.
- **Kesetaraan hasil adalah syarat mutlak.** `tx`, `rx`, `samples`, `label`, dan
  urutan tiap bucket harus identik dengan cara lama, termasuk:
  - dedup `site|timestamp` antara MongoDB dan JSON (Mongo menang),
  - batas `SAMPLE_LIMIT` (hanya dokumen terbaru yang dihitung),
  - pengisian slot kosong `harian`/`tahunan`, urutan tetap `mingguan`/`bulanan`,
  - pembulatan `+(sum/count).toFixed(2)`,
  - `totalSamples` dan `source` yang sama.
- Bukti kesetaraan: test yang menjalankan **kedua cara atas data yang sama** lalu
  membandingkan hasilnya — bukan pembacaan kode.
  1. Uji murni: komposisi baru (bucket Mongo tiruan + baris JSON yang tersaring)
     dibandingkan `mergeSamples` + salinan verbatim algoritma lama.
  2. Uji integrasi MongoDB (read-only, lewat `$documents` untuk data sintetis dan
     `find` untuk data nyata): pipeline asli vs algoritma lama, semua periode.
  - Salinan algoritma lama diverifikasi setara dengan sumber aslinya di
    `git show main:backend/server.js` lewat uji fuzz sekali jalan.
- **Loop uptime di frontend paralel** dengan `Promise.all`, urutan hasil tetap
  sesuai urutan `sites`.
- Jalur `raw=1` dan `mergeSamples` tidak berubah perilakunya.

## Build steps

- [x] 1. Ekstrak algoritma lama ke `backend/services/traffic-aggregate.js` sebagai
      `aggregateSamplesInNode` (verbatim, plus pemecahan murni `groupSamplesInNode`
      + `finalizeBuckets`), dan pipeline Mongo `buildMongoBucketPipeline` dengan
      kunci bucket WIB. Buktikan salinan setara dengan `main` lewat fuzz
      sekali jalan.
      Done when: fuzz 10.000+ kombinasi input acak identik dengan fungsi dari
      `git show main:backend/server.js`; `npm --prefix backend test` hijau.
      Hasil: 30.000 kasus acak, 0 mismatch (setelah satu perbaikan label tanggal
      tidak sah ditemukan fuzz dan diperbaiki).
- [x] 2. Pindahkan jalur baca (`mongoSampleQuery`, `hasSamplesInRange`,
      `getRawSamples`) ke `backend/services/traffic-history.js` dan tambah
      `getAggregatedHistory` (agregasi Mongo + dedup JSON + `totalSamples` +
      `source`). `server.js` memakai jalur baru untuk `/history` non-raw dan
      `/history/export`; `raw=1` tetap lewat `getRawSamples`.
      Done when: endpoint mengembalikan `data`/`totalSamples`/`source` yang sama
      seperti sebelum perubahan untuk data nyata.
- [x] 3. Test kesetaraan murni dan integrasi di `backend/test/`:
      `traffic-aggregate.test.js` (selalu jalan) dan
      `traffic-aggregate.mongo.test.js` (jalan bila MongoDB terjangkau, skip
      dengan pesan jelas bila tidak).
      Done when: semua periode (`harian`, `mingguan`, `bulanan`, `tahunan`,
      `custom`) menghasilkan `deepStrictEqual` terhadap cara lama, pada data
      sintetis berbatas WIB dan data nyata.
      Hasil: 17 test baru hijau; data nyata Poltekkes Gizi 22.807 sample yang
      digabung, 5 periode `deepStrictEqual` termasuk `totalSamples` dan `source`.
- [x] 4. Frontend: `generateUptimeData` memakai `Promise.all` per site.
      Done when: spec membuktikan ketiga situs ditembak bersamaan (bukan
      berurutan) dan urutan hasil tetap.
      Hasil: `laporan-trafik.component.spec.ts` 2 test hijau (puncak 3
      permintaan bersamaan; urutan hasil tetap).
- [x] 5. `npm run verify` hijau; ukur sebelum/sesudah; rusak sengaja pipeline
      untuk membuktikan test menggigit, lalu pulihkan.
      Hasil: backend 185/185, frontend 137/137, build OK. Mutasi offset WITA
      membuat 3 test integrasi gagal; mutasi dedup Mongo membuat 6 test murni
      gagal; keduanya dipulihkan dan hijau lagi.

## Hasil pengukuran (HTTP, server dev, 5 kali per periode)

| Periode | Sebelum | Sesudah (min/median/max) |
|---|---|---|
| harian | 743–1523 ms | 114 / 218 / 414 ms |
| mingguan | 1891–2173 ms | 369 / 532 / 586 ms |
| bulanan | 1969–2226 ms | 415 / 438 / 559 ms |
| tahunan | 2259–3170 ms | 442 / 525 / 571 ms |

Loop uptime 5 site (mode `count`): berurutan 232 ms → bersamaan 57 ms.
Payload tetap sama (`raw=1` utuh: 45 titik, urutan naik, kunci `txBps`/`rxBps`/`timestamp`).

## Batas yang tidak dilanggar

- Tidak merge, tidak push, tidak `/complete`, tidak mengubah data MongoDB
  (semua query uji read-only).
- Pipeline uji memakai `$documents` (tidak menulis ke koleksi) dan `find`/`aggregate`
  read-only atas data nyata.
- WIB tetap satu definisi: `WIB_OFFSET_MS` di `services/traffic-range.js`,
  dipakai `toWIB`, `rangeBounds`, dan ekspresi `$dateAdd` pipeline Mongo.
- Jalur `raw=1` dan `mergeSamples` tidak berubah.
- Catatan yang tidak bisa dibuktikan: cabang pemotongan `SAMPLE_LIMIT` (rentang
  > 200.000 dokumen) tidak terpicu data saat ini, jadi hanya logikanya yang
  ditulis; cabang itu dipertahankan agar sama dan tidak diuji langsung.

## Verify

- `npm run verify` di root: backend `node --test`, frontend vitest + build.
- Ukur `/api/router/history` per periode (harian/mingguan/bulanan/tahunan)
  sebelum vs sesudah; target `tahunan` < 1 s.
- Bandingkan `data` (bucket per bucket) cara lama vs baru pada data Poltekkes
  Gizi; laporkan bila ada perbedaan.
- Tidak merge, tidak push, tidak `/complete`, tidak menulis data ke MongoDB.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":6421,"specSha256":"6026edd60f7831503e7d4779bf5522f2418f99c0eac84e850137a585d3a7b0ea","branch":"refs/heads/fix/agregasi-grafik","head":"ba634efaf70cea14c0fa33cdd18b472416885b32","baseRef":"refs/heads/main","baseCommit":"37da28044e2c87567bf284af33252d4927e45d6d","sourceTree":"8a780b215d608eb087b0caee6b6027520299b87a","absentOptional":[]} -->

## Independent review

**Status:** passed
**Target commit:** ba634efaf70cea14c0fa33cdd18b472416885b32
**Base commit:** 37da28044e2c87567bf284af33252d4927e45d6d
**Base ref:** main
**Spec hash:** 6026edd60f7831503e7d4779bf5522f2418f99c0eac84e850137a585d3a7b0ea
**Prepared by:** opencode
**Builder model:** deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-26T10:33:47.510Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-26T10:43:08.049Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `npm run verify` (repo root): pass - backend 185/185 with 0 skipped and 0 failed; frontend 137/137 in 12 files; Angular build completed.
- `git merge-base main ba634efaf70cea14c0fa33cdd18b472416885b32`, `git status --porcelain -uall`, raw SHA-256 of `blueprint/context/current-feature.md`: pass - all Phase B preconditions matched.
- Read-only verification probes (no writes, no files created): pass as commands and produced the evidence below - MongoDB `$documents` equality probe, 30,000-case fuzz against `git show main:backend/server.js`, in-memory Mongoose NaN validation, live collection scan.

## Evidence

- Freshness re-derived, not trusted: `HEAD` = `ba634ef...`; `git merge-base main` = `37da2804...`; raw spec bytes = 6,421 with 116 CRLF and 0 bare LF; raw-byte SHA-256 = `6026edd6...`. `git status --porcelain -uall` listed only `blueprint/context/findings.md` and `blueprint/context/review.md`.
- Required check's integration subtests ran against the live MongoDB (read-only): the `$documents` synthetic suite and the real-data suite passed for all five periods; real window 2026-09-14..2026-09-25 over Poltekkes Gizi reported 22,807 merged samples and `deepStrictEqual` equality including `source` and `totalSamples`.
- The equality assertion is falsifiable, not vacuous: a read-only `$documents` probe ran the real pipeline and the old algorithm over the same documents and produced divergent results that `assert.deepStrictEqual` would reject - old path 3 samples / tx 2.33 versus new path 2 samples / tx 0 when the input holds a NaN `txMbps` and a parseable string timestamp. This is the evidence behind F-90 and F-91.
- The "verbatim copy" claim was independently reproduced: 30,000 randomized inputs (including invalid timestamps, null/undefined/NaN/Infinity rates, empty arrays, all periods) compared `aggregateSamples` extracted from `git show main:backend/server.js` with `aggregateSamplesInNode`; 0 mismatches.
- Why F-90/F-91 stay latent: `mongoose` rejected a NaN `txMbps` in memory (Number cast error), and a live read-only scan found 0 NaN `txMbps`/`rxMbps` and 0 non-Date `timestamp` values among 54,003 documents.
- Frontend parallel loop is genuinely pinned: `laporan-trafik.component.spec.ts` passed with max in-flight 3 for 3 sites, 6 total calls (2 per site), and result order `['Gizi','Gigi','Kebidanan']`; the old sequential shape would report 1 in flight.
- Cap branch examined by reading only: `buildMongoBucketPipeline` `$limit` (`traffic-aggregate.js:248`) plus `dropTimestampsOutsideCap` (`traffic-history.js:136-153,188-191`) is coherent for ranges at or under the cap, but nothing in the suite reaches over-200,000-document windows; recorded as F-95 rather than claimed.
- Security lens found no new reachable boundary in the delta: `/api` still passes through `auth.requireAuth`/`requireEosForMutations` (`server.js:49-50`), Express 5.2.1 keeps the default simple query parser (string `site`, no operator injection), the pipeline expressions are constant per period, and no secret value or credential path is touched or logged by the new code.

## Findings

- F-90 [P2] open - The Mongo numeric coercion's NaN guard never fires; confirmed read-only, latent because no app writer can store NaN.
- F-91 [P3] open - Parseable non-Date Mongo timestamps are dropped by the pipeline but counted by the old path; confirmed read-only, latent.
- F-92 [P3] unverified - A concurrent write between the distinct and aggregate reads can double-count one sample; code order unchanged, not reproduced.
- F-93 [P3] open - The Mongo-failure fallback and JSON-only branches of `getAggregatedHistory` have no automated test.
- F-94 [P3] open (new) - The only test that compares the real Mongo pipeline with the old algorithm self-skips when MongoDB is absent, unreachable, older than 5.1, or the window is empty.
- F-95 [P3] open (new) - The SAMPLE_LIMIT truncation branch has no test; equality is unproven for windows over 200,000 documents.
- No P0 or P1 finding is `open` or `fixed`.

## Remaining risk

- No lint, no separate typecheck, no security scanner, no browser harness, and no GitHub Actions workflow exist in this project; `/check` was not required and was not run.
- The equality proof ran here but is skip-conditional elsewhere (F-94), and the over-200,000-document truncation branch remains unproven (F-95).
- F-92's double-count race remains `unverified`; no overlapping-write experiment was performed.
- The frontend now issues 2 requests per site concurrently (unbounded); only a 3-site unit test was run, so real multi-site latency and connection pressure were not measured in a browser.
- The HTTP-level before/after timings in the spec were not re-measured; the live dev server and its credentials were left untouched, and the review stayed at the function and test level.
