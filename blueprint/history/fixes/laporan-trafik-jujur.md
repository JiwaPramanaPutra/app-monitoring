# Fix: Laporan Trafik yang jujur — downtime, riwayat, dan nama site

**Type:** Fix
**Status:** verified
**Branch:** `fix/laporan-trafik-jujur`

## Masalah

Empat hal di halaman **Laporan Trafik**, semuanya sudah dibuktikan dengan data nyata (bukan dugaan).

**1. Downtime palsu — yang tercatat adalah kegagalan aplikasi, bukan gangguan jaringan.**
Ringkasan menampilkan Poltekkes Gizi uptime **98.5%** dan Poltekkes Gigi **97.4%**, tapi keempat event di log alasannya sama:

```
Gagal terhubung ke RouterOS API 223.27.147.18:8729 - Timed out after 3 seconds
Gagal terhubung ke RouterOS API 223.27.147.18:8729 - errno -4078 (ECONNREFUSED)   (2 event)
Gagal terhubung ke RouterOS API 223.27.147.18:8729 - RosException
```

`223.27.147.18` bukan router yang benar (Gizi = `223.27.155.58`), dan pada 24/9 malam orang lain **mematikan api-ssl**-nya. Jadi yang dicatat sebagai "site down" adalah **aplikasi yang kehilangan visibilitas**.

Akarnya: `server.js:319` (endpoint traffic) dan `server.js:784` (collector) memanggil `storage.recordDowntimeStart()` untuk **setiap** kegagalan `fetchMikrotikTraffic` — termasuk host salah, kredensial salah, TLS gagal, port tertutup, dan timeout. Akibatnya `uptimePct` di `laporan-trafik.component.ts:473-546` dihitung dari durasi "tidak bisa memantau" dan melaporkan gangguan yang tidak pernah terjadi di lapangan.

**2. Riwayat terpecah dan tidak pernah digabung.** `getRawSamples` (`server.js:562-583`) memakai MongoDB **atau** `backend/data/traffic_history.json` — mana yang berisi, bukan keduanya:

| Site | MongoDB | JSON |
|---|---|---|
| Poltekkes Gizi | 8.769 | 6.670 |
| Kebidanan | 4.093 | 4.093 |

JSON menyimpan sejak **14/9** (25.000 sample, 2,7 MB). Trend harian karena itu hanya melihat salah satunya. Ini bentuk nyata dari **F-25** yang masih `unverified`.

**3. Nama site ganda.** Riwayat tersimpan untuk `Gizi` (**12.836** sample) **dan** `Poltekkes Gizi` (**6.670**) — site lama bernama `Gizi` menyimpan riwayat router yang sama, dan 12.836 sample itu tidak pernah tampil di grafik site yang sekarang.

**4. Jam tanpa sample tidak dibedakan dari trafik nol.** Bucket agregasi tanpa sample digambar sebagai `0`, sehingga jam yang datanya memang hilang (mis. 25/9 01:00-08:00 saat backend tidak berjalan) terlihat seperti "trafik nol". Aplikasi juga tidak punya cara mengejar riwayat yang terlewat.

## Perbaikan

### Keputusan produk yang perlu disetujui

**Apa yang boleh disebut "downtime"?** Usulannya: setiap kejadian punya `kind`.

| `kind` | Kapan | Ditampilkan sebagai | Masuk uptime? |
|---|---|---|---|
| `unreachable` | gagal menyambung ke RouterOS API (host/port/kredensial/TLS/jaringan) | **"Tidak terpantau"** | **Tidak** |
| `interface-down` | router terjangkau tapi interface yang dipantau link-down | **"Downtime"** | Ya |

Dan bila dalam satu periode **tidak ada bukti `interface-down` sama sekali**, uptime ditampilkan **"—"** dengan catatan *"tidak ada data downtime"* — bukan **100%** yang tidak punya dasar pengukuran. Angka uptime hanya muncul kalau memang ada yang mengukurnya.

Kalau kamu lebih suka lain (mis. `unreachable` tetap dihitung downtime tapi diberi label), bilang sebelum `/implement` — ini keputusanmu, bukan keputusan kode.

### Perubahan teknis

- **Klasifikasi kejadian.** `recordDowntimeStart(site, reason, kind)`; semua jalur kegagalan poll menulis `unreachable`. `interface-down` hanya dicatat kalau router **menjawab** dan interface-nya `running=false` — pengecekannya hanya dijalankan saat tx dan rx sama-sama `0` (mencurigakan) supaya tidak menambah satu panggilan jaringan di setiap polling.
- **Uptime dan log jujur.** `laporan-trafik.component.ts` menghitung uptime hanya dari `interface-down`, menampilkan `unreachable` di kolom terpisah, dan menulis label + sebab di log.
- **Gabungkan sumber riwayat.** `getRawSamples` menggabungkan sample MongoDB dan JSON (buang duplikat berdasarkan `site` + `timestamp`), bukan memilih salah satu.
- **Bucket kosong ditandai.** Agregasi mengembalikan penanda "tidak ada data" untuk bucket tanpa sample, dan grafik menggambarnya sebagai celah, bukan `0`.
- **Rapikan nama site ganda** (data, sekali jalan): pindahkan riwayat `Gizi` → `Poltekkes Gizi` di `traffic_history.json` **dan** koleksi `TrafficSample`, setelah memastikan `Gizi` bukan site yang masih dipakai.
- **Bersihkan record downtime lama** (data): pakai endpoint `DELETE /api/router/downtime-events` yang sudah ada.

Yang tidak boleh rusak: halaman Laporan Trafik, Laporan, Monitoring Jaringan, ekspor CSV/JSON, dan filter periode (`harian`/`mingguan`/`bulanan`/`tahunan`/`custom`).

## Build steps

- [x] **Step 1 - Klasifikasi kejadian: `unreachable` vs `interface-down` (A)** - `storage.recordDowntimeStart()` menerima `kind` (default `unreachable`); `server.js` endpoint dan collector mengirim `unreachable` untuk kegagalan koneksi; collector menandai `interface-down` hanya saat router menjawab tapi interface yang dipantau link-down (dicek lewat satu panggilan ringan hanya ketika tx dan rx sama-sama 0). *Done when:* kegagalan koneksi tercatat `unreachable`, dan site yang link-nya benar-benar putus tercatat `interface-down`; `npm run verify` lolos.
- [x] **Step 2 - Uptime dan log yang jujur (A lanjutan)** - `laporan-trafik.component.ts` menghitung uptime hanya dari `interface-down`; `unreachable` tampil di kolom terpisah "Tidak terpantau" beserta sebabnya; uptime menampilkan `—` bila tidak ada bukti sama sekali, bukan 100%. *Done when:* site yang hanya punya kejadian `unreachable` tidak lagi menurunkan uptime dan tidak lagi membuat situsnya terlihat pernah down.
- [x] **Step 3 - Gabungkan sumber riwayat (B)** - `getRawSamples` menggabungkan MongoDB dan JSON, buang duplikat `site`+`timestamp`, lalu urutkan kronologis; bucket tanpa sample ditandai sehingga grafik menggambarnya sebagai celah. *Done when:* trend harian Poltekkes Gizi menampilkan riwayat sejak 14/9, bukan hanya sebagian; jam yang datanya hilang terlihat sebagai celah, bukan trafik nol.
- [x] **Step 4 - Rapikan nama site ganda (C, data)** - Pindahkan riwayat `Gizi` ke `Poltekkes Gizi` di `backend/data/traffic_history.json` dan di koleksi `TrafficSample`, **hanya setelah** memastikan tidak ada site aktif bernama `Gizi`. Backup dulu. *Done when:* tidak ada lagi sample bersite `Gizi`, dan total sample Poltekkes Gizi bertambah sesuai, tanpa duplikat `site`+`timestamp`.
- [x] **Step 5 - Bersihkan record downtime lama yang palsu (D, data)** - Hapus event yang `kind`-nya `unreachable` dari sebelum perbaikan (atau seluruh riwayat lewat `DELETE /api/router/downtime-events`), setelah backup. *Done when:* Ringkasan uptime tidak lagi memuat downtime dari kegagalan koneksi lama.

## Verify

- `npm run verify`.
- Smoke A: dengan router yang sengaja salah host/port, buka Laporan Trafik -> event muncul sebagai **"Tidak terpantau"**, dan uptime site itu **tidak turun** (atau `—` bila belum ada data `interface-down`).
- Smoke B: bandingkan jumlah sample Poltekkes Gizi sebelum dan sesudah -> trend harian kini memuat riwayat sejak 14/9, dan jam tanpa data tampak sebagai celah.
- Smoke C: pilih site `Poltekkes Gizi` -> total sample bertambah; site `Gizi` tidak lagi muncul di mana pun.
- Smoke D: setelah pembersihan, Ringkasan uptime tidak lagi menampilkan Gizi 98.5% / Gigi 97.4% dari event lama.
- Bukti tidak ada regresi: ekspor CSV dan JSON tetap terunduh, filter periode (harian/mingguan/bulanan/tahunan/custom) tetap bekerja.

## Findings

### laporan-trafik-jujur/F-55 [P1] closed - A link-down that starts while the router is unreachable is never classified `interface-down` and never reduces uptime

**File:** backend/server.js:830-843; backend/storage.js:210-212
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** When an `unreachable` event is already open and a poll finally reaches the router but the monitored interface is link-down (`sample.txBps === 0 && sample.rxBps === 0`, `isInterfaceRunning` returns `false`), the collector calls `storage.recordDowntimeStart(siteName, ..., 'interface-down')`, but `recordDowntimeStart` returns the existing ongoing event unchanged (`storage.js:211-212`) and the following `continue` skips `recordDowntimeEnd`. The genuine link-down is absorbed into the still-open `unreachable` event: it never reduces `uptimePct` (only `interface-down` does), and the log shows "Tidak Terpantau"/"Belum pulih" while the router is answering. Spec Step 1's Done-when ("site yang link-nya benar-benar putus tercatat `interface-down`") fails for this sequence, which is plausible around a router reboot (API back before the monitored interface comes up). No router was available to reproduce it live.
**Suggested fix:** On a successful poll with `running === false`, close the ongoing event first (`storage.recordDowntimeEnd(siteName)`), then let the following `recordDowntimeStart` open a fresh `interface-down` event. That also restores the log's recovery semantics.
**Resolution:** Repaired 2026-09-25. Collector kini memanggil `recordDowntimeEnd(site)` SEBELUM `recordDowntimeStart(..., 'interface-down')`. Tanpa itu `recordDowntimeStart` hanya mengembalikan event yang sedang terbuka, sehingga link-down yang terjadi saat "tidak terpantau" tenggelam di dalamnya dan tidak pernah menurunkan `uptimePct`. Test baru di `backend/test/storage-downtime.test.js` mengunci mekanismenya: tutup-lalu-buka menghasilkan dua kejadian terpisah. Awaiting re-review.
**Closed 2026-09-25 at target 94bfb00 (independent automatic review).** The defect is gone: at `backend/server.js:833-844` the collector closes the ongoing event before opening the `interface-down` one, so a successful poll that finds the monitored interface link-down ends the unreachable event (the poll's answer is the recovery evidence) and opens a separate `interface-down` event that counts toward `uptimePct`. `backend/test/storage-downtime.test.js:72-84` locks the close-then-start mechanism (two distinct events, the new one open and `kind: interface-down`), and this pass's `npm run verify` ran all 104 backend tests green. All four poll outcomes at the call site were re-checked (`server.js:830-855`): `running === false` closes then reopens, `running === true` closes, flowing traffic closes, `running === null` leaves the ledger untouched. The repair calls close+start on **every** still-down poll, which introduces a separate, non-covered defect recorded as F-64 [P1]; it does not resurrect F-55's absorption bug, so this finding closes and F-64 carries the new risk. Closing.
Re-confirmed at target dd43d25 (2026-09-25, independent automatic review): the rewritten collector still closes a kind-bearing `unreachable` event before opening `interface-down` (`backend/server.js:833-856`; pure decision `backend/services/downtime-classify.js:27-32`), replayed mechanically as two events with the new one open and `kind: interface-down`. The pre-classification kind-less case is no longer closed by the rewrite and is recorded separately as F-66.

### laporan-trafik-jujur/F-56 [P2] closed - `isInterfaceRunning` returning `null` is treated as a verified recovery

**File:** backend/server.js:740-742 (contract), 830-843 (caller)
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The helper's own docstring says callers MUST treat `null` as "tidak tahu" and not accuse downtime; the collector instead falls through to `storage.recordDowntimeEnd(siteName)` for `null` just as for `true`. If the second connection fails or `/interface/print` returns no rows while an `interface-down` event is open, that event is closed with no verified recovery: the log shows a false "Pulih" timestamp, and the next `running === false` poll opens a new event, splitting one outage. The misclassification bounds a single poll interval and no live repro was possible; it is a missing guard against the helper's own contract.
**Suggested fix:** Only call `recordDowntimeEnd` when `running === true`; when `running === null`, leave the ledger untouched and retry on the next poll.
**Resolution:** Repaired 2026-09-25. `isInterfaceRunning()` yang mengembalikan `null` (status tidak bisa dipastikan) tidak lagi diperlakukan sebagai pulih — hanya `running === true` yang menutup kejadian. Kegagalan membaca status bukan bukti link kembali hidup. Awaiting re-review.
**Closed 2026-09-25 at target 94bfb00 (independent automatic review).** Verified: `backend/server.js:845-851` closes only on `running === true`; `running === null` falls through the `if/else if` without touching the ledger, and the trailing `continue` also skips the traffic-flow `recordDowntimeEnd` at `:855`. The only remaining writer of downtime events is this collector (the `/api/router/traffic` writer was removed in `12c994b`), so no other path can close an event on a `null` status. A `null` status therefore leaves an open event open until a later poll returns `true`, `false`, or flowing traffic, as the helper's contract requires. Closing.
Re-confirmed at target dd43d25 (2026-09-25, independent automatic review): in the rewritten collector a `null` status maps to `{ closeOpen: false, open: null }` (`backend/services/downtime-classify.js:37-39`) and `backend/server.js:849-856` performs no ledger write, so an open event stays open with no false recovery. The contract still holds.

### laporan-trafik-jujur/F-57 [P2] closed - The downtime log still presents `unreachable` events as downtime; the added `kind?` field is never populated

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:32-42, 194-202; frontend/src/app/pages/laporan-trafik/laporan-trafik.component.html:186-210
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The spec's technical change requires "menulis label + sebab di log", but `fetchRealHistoryAndEvents` maps only `site/start/duration/color/end/reported/timestamp` and drops `kind` and `reason`, and the log table has no kind or reason column. The `kind?` property added to `DowntimeEvent` is dead (never assigned, never read), so connection failures still appear under "Log riwayat downtime" in red, indistinguishable from a real link-down. The summary column separates the totals, but the log does not.
**Suggested fix:** Map `kind` and `reason` into `allDowntimeEvents` and render a distinguishing label (for example `interface-down` -> "Downtime", `unreachable` -> "Tidak terpantau") plus the short reason; otherwise delete the unused field.
**Resolution:** Repaired 2026-09-25. Log downtime ikut memetakan `kind` dan `reason`. Tabelnya kini punya kolom **Jenis** yang menampilkan "Downtime" (merah) atau "Tidak terpantau" (kuning) dengan sebabnya sebagai tooltip; judulnya menjadi "Log riwayat downtime & keterlihatan" dan keadaan kosongnya menyebut keduanya. Awaiting re-review.
**Closed 2026-09-25 at target 94bfb00 (independent automatic review).** Verified: `fetchRealHistoryAndEvents` maps `kind` (legacy or absent → `unreachable`) and `reason` into `allDowntimeEvents` (`frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:196-208`), and the log table renders `interface-down` as red "Downtime" and every other kind as amber "Tidak terpantau", with `reason` in the `title` tooltip (`laporan-trafik.component.html:200-216`); a missing reason renders an empty tooltip and the label still renders. The header and body both have six cells, so the added column lines up, and the Angular build (template type-check) passed in this pass's `npm run verify`. Closing.

### laporan-trafik-jujur/F-60 [P2] closed - A period with no traffic samples can still claim 100% uptime from an old `unreachable`/`interface-down` event

**File:** frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:500-504, 529-546
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `hasEvidence = measuredSamples > 0 || downtimeTotal > 0 || unreachableTotal > 0`. `measuredSamples` is bounded by `startDate..endDate`, but the event totals are bounded by the rolling `now - periodMs` window, so a site whose only in-window evidence is an event - for example an `unreachable` event that closed before today while no sample falls inside today's `startDate..endDate` - renders 100% in green. That contradicts the page's stated rule ("Angka uptime hanya muncul kalau memang ada yang mengukurnya") and the cell tooltip, which reserves `—` for exactly that case. Confirmed by reading; no runtime repro.
**Suggested fix:** Require `measuredSamples > 0` for a numeric uptime, and/or sum events inside the same `startDate..endDate` window as the samples. This changes displayed numbers, so it needs the user's explicit decision and is not an automatic repair.
**Resolution:** Repaired 2026-09-25. `hasEvidence` kini hanya `measuredSamples > 0`, sesuai kalimat spec sendiri: "Angka hanya ditampilkan kalau ada dasar pengukurannya". Sebelumnya adanya kejadian ikut dihitung sebagai bukti, sehingga periode tanpa satu pun sample bisa tampil 100% hijau. Awaiting re-review.
**Closed 2026-09-25 at target 94bfb00 (independent automatic review).** Verified: `hasEvidence = measuredSamples > 0` (`frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:552`) and `uptimePct` is `null` when there is no in-window sample, so a period with no samples renders `—` (grey, empty bar) instead of a numeric 100% (`:553-559`, template `[title]` explains "Belum ada sample trafik di periode ini"). The probe that sets `measuredSamples` sends `startDate`/`endDate` and reads `totalSamples`, which the backend computes from the full merged, window-filtered array before the `limit=1` slice (`backend/server.js:621-637`), so a site with samples but none inside the selected window yields 0 and shows `—`. One residual window mismatch remains and is recorded separately as F-65 [P2], so this finding's own defect is gone. Closing.

### laporan-trafik-jujur/F-64 [P1] closed - A sustained interface-down is fragmented into one event per 6 s poll, growing the ledger without bound and flooding the log

**File:** backend/server.js:830-851 (zero-traffic branch); backend/storage.js:210-232 (`recordDowntimeStart`), 124-130 (`saveDowntimeEvents`); frontend/src/app/pages/laporan-trafik/laporan-trafik.component.html:200-216 (log table)
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality, performance)
**Why it matters:** The F-55 repair closes the ongoing event before every `interface-down` start (`backend/server.js:839-844`). While the monitored interface stays link-down, every 6-second poll takes the same branch (`:830-833`), so a continuous outage is recorded as one closed event per poll instead of one open event: an hour of downtime is about 600 events, a day about 14,400. This regresses the previous behavior, where `recordDowntimeStart` returned the already-open event unchanged (`backend/storage.js:211-212`) and the outage stayed a single row. Concrete effects: (a) `downtime_events.json` grows without any cap (unlike `MAX_TRAFFIC_SAMPLES`) and `saveDowntimeEvents` synchronously rewrites the whole array twice per poll (`:124-130`); (b) `GET /api/router/downtime-events` returns every event and the log table renders all of them with no slice (`laporan-trafik.component.ts:633-635`, `laporan-trafik.component.html:200`), so a multi-hour outage floods the page; (c) the outage reads as hundreds of short rows, each with its own "Pulih" time, instead of one event carrying the outage's start and recovery. Reproduced at the storage layer with a temp `DATA_DIR`: five close-then-start cycles produced five separate events. `uptimePct` stays roughly right because the consecutive intervals tile the outage, which is why this is not P0. The new `backend/test/storage-downtime.test.js:72-84` asserts only the close-then-start mechanism, so it cannot catch the repetition (F-61).
**Suggested fix:** Close the ongoing event only when its kind differs from the one being opened, for example `const ongoing = storage.getOngoingDowntime(siteName); if (ongoing && ongoing.kind !== 'interface-down') storage.recordDowntimeEnd(siteName);` before `recordDowntimeStart(..., 'interface-down')`. That still closes an open `unreachable` event when the router answers (F-55) but leaves one `interface-down` event open for the whole outage. Extract the decision into a pure helper and cover "two consecutive false polls keep one open event" plus the kind-change case with `node:test`.
**Resolution:** Repaired 2026-09-25. Keputusan ledger diekstrak ke fungsi murni `decideDowntimeAction()` (`backend/services/downtime-classify.js`) yang mengembalikan `{ closeOpen, open }`. Aturannya kini: event yang sedang terbuka ditutup HANYA kalau `kind`-nya berbeda dari `interface-down`; kalau sama, gangguan itu tetap SATU kejadian — dan `recordDowntimeStart` memang idempoten. Jadi link yang putus terus tidak lagi dipecah menjadi satu baris per polling 6 detik. Kejadian lama tanpa `kind` dinormalkan sebagai `unreachable` sehingga urutan F-55 tetap benar untuk data lama. 9 test baru di `backend/test/downtime-classify.test.js`, termasuk kasus "dua polling berturut-turut link-down tetap satu kejadian". Awaiting re-review.
**Closed 2026-09-25 at target dd43d25 (independent automatic review).** The fragmentation is gone. `decideDowntimeAction` (`backend/services/downtime-classify.js:15-40`) closes the open event only when its normalized kind differs from `interface-down`, and the collector applies the result at `backend/server.js:833-856`. Replayed mechanically against the real modules with a temp `DATA_DIR`: three consecutive idle+link-down polls produced ONE open `interface-down` event, and flowing traffic closed it; because `recordDowntimeStart` early-returns the ongoing event (`backend/storage.js:211-212`), the repeated start does not rewrite `downtime_events.json` either. `backend/test/downtime-classify.test.js:44-60` and `backend/test/storage-downtime.test.js:32-40` lock the decision and the idempotence, and this pass's `npm run verify` ran all 113 backend tests green. Two separate defects found in the same repair - a kind-less ongoing event is no longer closed (F-66) and the caller's idle gate disagrees with the function for malformed rates (F-67) - do not resurrect the per-poll fragmentation, so this finding closes and those carry the new risk. Closing.
**Note (review provenance):** Header temuan ini sempat tertinggal `fixed` setelah review yang menutupnya. Reviewer menyatakan closure secara eksplisit di laporannya — "F-64 [P1] `fixed` → `closed`", dengan bukti 3 polling menghasilkan 1 kejadian dan `npm run verify` hijau — dan menulis receipt `passed`, yang menurut kontrak hanya sah bila tidak ada P0/P1 `open` atau `fixed`. Baris ini mentranskripsikan verdict tersebut ke record yang durable; bukan menutup temuan atas inisiatif builder.
## Independent review

# Independent Review

**Status:** passed
**Target commit:** dd43d25d73bfcf3ce0308d0a557012de5a9bbc43
**Base commit:** 075c22c62e94d949e065373eb999d436321d0d01
**Base ref:** main
**Spec hash:** 5d1015cca14bd2b5be6995af87c63731119e464aa4147c2a21981e44269e5edb
**Prepared by:** opencode
**Builder model:** deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-25T10:34:27Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-25T10:46:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `git rev-parse HEAD` / `git rev-parse main` / `git merge-base main HEAD`: pass - HEAD `dd43d25`, `main` `075c22c`, merge base `075c22c` (equals `Base commit`).
- `Get-FileHash -Algorithm SHA256 blueprint/context/current-feature.md`: pass - `5D1015CC...E5EDB`, matches `Spec hash`.
- `git status --porcelain=v1 --untracked-files=all`: pass - only `blueprint/context/review.md` and `blueprint/context/findings.md` differ.
- `git diff --name-status 075c22c..dd43d25`: pass - 8 changed paths, all reviewed (server.js, storage.js, downtime-classify.js, 2 test files, spec, 2 frontend files).
- `npm run verify`: pass - backend 113/113 (`node --test`, 11 files), frontend 71/71 (7 vitest files), Angular build OK (pre-existing sweetalert2 CommonJS warning only).
- Node poll-matrix replay against the real modules with a throwaway temp `DATA_DIR` (no repo data touched): pass - see Evidence.
- `Get-Content backend/data/downtime_events.json | ConvertFrom-Json`: pass - 0 events, 0 kind-less, 0 open.
- `/check`: not run - not required by the request.

### Evidence

- Freshness: full target SHA, merge base re-derived from local `main`, exact spec hash, and a clean tree apart from the two permitted evidence files. `downtime_events.json` is 2 bytes (`[]`).
- F-64 repair, replayed mechanically: three consecutive idle + link-down polls produced ONE open `interface-down` event; flowing traffic closed it. `recordDowntimeStart` early-returns the ongoing event (`backend/storage.js:211-212`), so no repeated `saveDowntimeEvents` rewrite. Tests `backend/test/downtime-classify.test.js:44-60` and `backend/test/storage-downtime.test.js:32-40` lock the decision and idempotence.
- Poll-outcome matrix (real modules, temp DATA_DIR): traffic flowing (no open event / any open event) -> closes, bounded; idle+down with no event -> one event opened; idle+down with open `unreachable` -> closed, then a separate open `interface-down` (F-55 order intact); idle+down with open `interface-down` -> one event stays open, no growth; idle+down with an open legacy kind-less event -> event NOT closed and not reclassified (F-66); idle+verified up -> closes; idle+unknown (`null`) -> ledger untouched (F-56 intact); poll-failure catch branch -> idempotent, leaves one open event and never closes.
- The only remaining ledger writers are the collector (`backend/server.js:849-856` and `:866`) plus the manual `DELETE /api/router/downtime-events` (`:730`); the traffic endpoint's writes were removed (`:302-320`).
- Frontend: every non-empty aggregated bucket carries `samples` (`backend/server.js:533`) and empty `harian`/`tahunan` slots carry `samples: 0` (`:545`), so gap rendering and `chartMissingBuckets` are consistent for those periods; `hasEvidence = measuredSamples > 0` (`laporan-trafik.component.ts:552`) and a null uptime renders `—` (template `:85-92`); the log maps and displays `kind`/`reason` (`laporan-trafik.component.ts:196-208`, template `:200-216`), and header/body cell counts line up in both tables.
- Security: no auth, ownership, secret, or injection surface changed by the delta; `reason` is rendered through Angular interpolation/attribute binding, and all RouterOS values still flow through existing stored config. No secrets reproduced anywhere.
- Performance: the F-64 defect's unbounded event growth and per-poll full-file rewrite are gone; the remaining cost signals are the pre-existing F-58 (spread) and F-59 (per-site uptime probe) plus the intended one extra link probe per idle poll.

### Findings

- F-64 [P1] `closed` - fragmentation repair verified; original defect gone, bounded at one event per outage.
- F-55 [P1] `closed` (re-confirmed) and F-56 [P2] `closed` (re-confirmed) - both contracts still hold under the rewritten collector.
- F-66 [P2] `open` (new) - a kind-less pre-classification ongoing event is no longer closed before an `interface-down` start, so a verified link-down is absorbed (regression from 94bfb00; latent here because the ledger holds zero events).
- F-67 [P3] `open` (new) - collector idle gate and `decideDowntimeAction` disagree for malformed rates (`NaN`), so a bad reply can close an open event and skip the link probe.
- F-68 [P3] `open` (new) - the "titik tanpa data" badge counts future hours of the current day as missing data.
- F-38, F-58, F-59, F-61, F-62, F-65 `open` (re-confirmed, unchanged).
- No P0 or P1 finding is `open` or `fixed` at this target.

### Remaining risk

- Spec Smoke A-D and a live router were unavailable, so the collector's real RouterOS behavior (including the `NaN` path behind F-67) is verified by code and module replay only, not end-to-end.
- `/check` was not required and not run; `Check result: not-required`.
- No browser or component harness exists (F-30), so the gap rendering, uptime math, and badge behavior were verified by reading and by the Angular build's template type-check, not by rendering.
- F-66 would be P1-class for a deployment or restored backup that starts with an open pre-classification event; it is latent in this checkout because `backend/data/downtime_events.json` is empty and every new event carries a `kind`.
- Minor unverified UX, not correctness: an isolated single-point run renders no visible line or area (`generateChartPaths` emits a bare `M x y`), and the 3 s live sync still writes onto the last `harian` bucket (23:00), which is now a gap and therefore not drawn.
- Pre-existing tracked risks remain in the ledger: F-25 (restart race, no Docker available), F-58 (131k-document spread limit), F-59 (per-site full-history uptime probe), F-63 (running backend clobbers hand-edited JSON).
