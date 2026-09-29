# Fix: Sumbu mingguan/bulanan tanpa slot kosong (Rabu & Minggu 1 "hilang")

**Type:** Fix
**Status:** verified
**Branch:** fix/slot-kosong-mingguan-bulanan

## Masalah

Di Laporan Trafik, label sumbu X periode **mingguan** kehilangan "Rabu" dan periode **bulanan** kehilangan "Minggu 1" (laporan pemilik, 29 Sep). Keduanya **bukan** bug data yang bisa diisi: tidak ada sample untuk slot itu.

Bukti probe read-only ke Mongo produksi (29 Sep, lewat `getAggregatedHistory` — fungsi yang sama dengan endpoint):

- Sample per hari WITA site `Poltekkes Gizi`: 14, 15, 17, 18, 22 (3 sample), 24, 25, 26, 27, 28, 29 Sep. **23 Sep = 0 sample**; sample tertua seluruh koleksi = 14 Sep (`2026-09-14T05:39Z`). Tidak ada site name lama yang menyimpan data lebih tua (site lain mulai 24–25 Sep).
- Respons mingguan 23–29 Sep sekarang: `Senin, Selasa, Kamis, Jumat, Sabtu, Minggu` (Rabu absen).
- Respons bulanan 31 Agu–29 Sep: `Minggu 2, Minggu 3, Minggu 4` (Minggu 1 absen).

Penyebabnya di `backend/services/traffic-aggregate.js` `finalizeBuckets`: slot tanpa data dibuang untuk `mingguan`/`bulanan` (`harian`/`tahunan` justru diisi `{0, 0, samples: 0}`). Akibatnya sumbu bolong tanpa penjelasan — pengguna membacanya sebagai kehilangan hari/minggu.

## Perbaikan

- `finalizeBuckets`: **semua periode grid** (`harian`, `mingguan`, `bulanan`, `tahunan`) mengisi slot kosong dengan `{ label, tx: 0, rx: 0, samples: 0 }`. Untuk `custom`, `sortedKeys` hanya berisi key yang ada, jadi tidak berubah.
- Frontend **tidak diubah**: `generateChartPaths` sudah menggambar `samples: 0` sebagai **celah** (garis putus, bukan turun ke nol) dan tooltip sudah menampilkan "Tidak ada data" untuk slot itu. Inilah kenapa slot kosong aman ditampilkan.
- Test backend diperbarui + test baru yang mengunci perilaku slot kosong; satu test frontend baru mengunci kontrak "bucket tanpa sample = celah".

Yang tidak boleh rusak: zero-fill harian/tahunan; bucket `custom`; kesetaraan Node ↔ Mongo (keduanya lewat `finalizeBuckets` yang sama); `totalSamples` (hanya menjumlah group berisi sample); render celah + tooltip yang sudah ada.

Catatan (di luar fix ini): ada 1 sample tersimpan dengan nama site beda kapitalisasi (`Poltekkes gigi`, 24 Sep) — tidak mengubah diagnosis; tidak diutak-atik di sini.

## Build steps

- [x] **1. Zero-fill slot kosong** - Cabang `else if` di `finalizeBuckets` menjadi `else` untuk semua periode grid + komentar alasan. *Done when:* probe lokal menghasilkan slot kosong. **Bukti: probe endpoint (data nyata) → Rabu & Minggu 1 muncul `samples: 0`; totalSamples tidak terpengaruh.**
- [x] **2. Perbarui test backend** - `traffic-aggregate.test.js`: mingguan 7 label + Rabu kosong, bulanan 4 label + Minggu 3 kosong, baris pipeline `mongoRowsToGroups`, test pergeseran tz memakai filter `samples > 0`. *Done when:* backend hijau. **Bukti: 37/37 file itu; suite penuh 244/244 dengan preload DNS (0 skip).**
- [x] **3. Test frontend kontrak celah** - `laporan-trafik.component.spec.ts`: dua subpath saat slot kosong di tengah; tanpa titik palsu saat slot kosong di ujung. *Done when:* test hijau. **Bukti: 201/201 test frontend (2 baru).**
- [x] **4. Verifikasi + mutasi + parity** - `npm run verify` hijau; mutasi `else` → `else if (harian||tahunan)` membuat **3 test gagal**; dipulihkan. *Done when:* hijau. **Bukti: suite penuh 244/244 termasuk parity Node ↔ Mongo atas data nyata.**

## Hasil verifikasi (implement)

- `npm run verify` (root): backend 241 test — 240 lulus / 1 skip (parity Mongo, DNS lokal) / 0 gagal; frontend **201 lulus**; build sukses tanpa warning.
- `node --require <dns-patch> --test test/*.test.js` (backend): **244 lulus / 0 skip / 0 gagal**, ~91 dtk — parity Node ↔ Mongo lulus dengan slot kosong.
- Mutasi: `else` dikembalikan ke `else if (period === 'harian' || period === 'tahunan')` → **3 test gagal** (mingguan, bulanan, baris pipeline); dipulihkan → hijau.
- Probe endpoint atas data produksi (read-only): mingguan 23–29 Sep kini `Senin..Minggu` lengkap dengan `Rabu: samples=0`; bulanan `Minggu 1..4` dengan `Minggu 1: samples=0`; `totalSamples` tetap jumlah sample nyata (34.934 / 42.527).
- Manual di browser belum dijalankan: environment ini tidak punya browser desktop. Backend dev memakai nodemon, jadi perubahan seharusnya sudah ter-reload — menunggu pemilik.


## Verify

- `npm run verify` (backend + frontend + build).
- `node --require <dns-patch> --test test/*.test.js` dari `backend/` — membuktikan parity Node ↔ Mongo tetap identik dengan slot kosong.
- Manual (pemilik): buka Laporan Trafik mingguan → label **Rabu** muncul (celah, tanpa titik); bulanan → **Minggu 1** muncul (celah). Hover slot kosong → "Tidak ada data". Periode harian/tahunan tidak berubah perilakunya.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser pengguna (manual di atas).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4862,"specSha256":"57f438578f6637e7e0dd3c979153963989e0bc97c453da5a3e284f311f7f3f2c","branch":"refs/heads/fix/slot-kosong-mingguan-bulanan","head":"31cc9a0b9aa6d07f838d07bb9ae66acc81338d98","baseRef":"refs/heads/main","baseCommit":"1c94ce5c92554509b6c6d3ad0ee13ccc993e65b5","sourceTree":"1d30e95f122d447726aaf33f10bbc26c984ef0f1","absentOptional":[]} -->

## Findings

### slot-kosong-mingguan-bulanan/F-62 [P3] closed - `aggregateSamples` omits empty buckets for `mingguan`, `bulanan`, and `custom`, so the gap marker never engages there

**File:** backend/server.js:504-546; frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:629-632, 648-688
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** Zero-sample slots are emitted only for `harian` and `tahunan`; the other periods return only keys that had samples, so a fully missing day or week is not a gap - the chart interpolates straight through it and `chartMissingBuckets` reports 0. The spec's "Bucket kosong ditandai ... grafik menggambarnya sebagai celah, bukan 0" is fully met only for the hourly/monthly views, while the daily view used to see history since 14/9 is the `custom` path, where a missing day is invisible.
**Suggested fix:** Fill the requested day/week slots for the `custom` (and `mingguan`) keys with `samples: 0`, as the `harian`/`tahunan` branches already do.
**Resolution:** Re-confirmed at target 94bfb00 (2026-09-25, independent automatic review): `aggregateSamples` still emits zero-sample slots only for `harian`/`tahunan` (`backend/server.js:534-545`), so `mingguan`, `bulanan`, and `custom` return only keys that had samples and the gap marker stays inert there (`frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:639-641`). Status stays `open` (P3).
Re-confirmed at target dd43d25 (2026-09-25, independent automatic review): unchanged - the zero-slot branch is still gated on `['harian', 'tahunan'].includes(period)` (`backend/server.js:535-545`), and the frontend gap logic keys off the `samples` field that every emitted bucket carries (`:533`). Status stays `open` (P3).
Re-examined at 901504f (2026-09-25, /audit scope: full; lens: quality): the zero-sample branch is still gated on `['harian', 'tahunan'].includes(period)` (`backend/server.js:535`), so `mingguan`, `bulanan`, and `custom` return only days/weeks that had samples and the gap marker stays inert exactly where the daily history view is used. Status stays `open` (P3).
Re-examined at target ba634ef (2026-09-26, independent automatic review): the aggregation moved to `backend/services/traffic-aggregate.js`; the zero-slot branch is still gated on `harian`/`tahunan` in `finalizeBuckets` (`:136-139`), so `mingguan`, `bulanan`, and `custom` still emit only slots that had samples and the frontend gap marker stays inert there. Status stays `open` (P3).
Re-examined at target 31cc9a0 (2026-09-29, independent automatic review): the fix changes the zero-slot branch in `finalizeBuckets` from `else if (period === 'harian' || period === 'tahunan')` to `else`, so `mingguan` and `bulanan` now emit `{ label, tx: 0, rx: 0, samples: 0 }` slots; `custom` still skips empty slots because its `sortedKeys` only contains keys with data. The backend tests assert the full Senin–Minggu and Minggu 1–4 labels with zero slots, the frontend tests assert zero-slot buckets render as chart gaps, and the DNS-preload parity run (244 pass / 0 skip) compared real MongoDB output against the Node path for all five periods across four zones including the new zero slots. Status moved to `closed` (P3).

## Independent review

**Status:** passed
**Target commit:** 31cc9a0b9aa6d07f838d07bb9ae66acc81338d98
**Base commit:** 1c94ce5c92554509b6c6d3ad0ee13ccc993e65b5
**Base ref:** main
**Spec hash:** 57f438578f6637e7e0dd3c979153963989e0bc97c453da5a3e284f311f7f3f2c
**Prepared by:** opencode
**Builder model:** opencode-go/deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** opencode-go/kimi-k2.7-code
**Requested execution:** automatic
**Requested at:** 2026-09-29T10:54:21Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** opencode-go/kimi-k2.7-code
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-29T11:00:27Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `npm run verify` (project root): pass — backend 240 pass / 1 skip / 0 fail, frontend 201 pass, Angular build success (one pre-existing sweetalert2 CommonJS warning).
- `node --require "C:\Users\Jiwa Pramana\AppData\Local\Temp\opencode\dns-patch.cjs" --test test/*.test.js` (from `backend/`): pass — 244 pass / 0 skip / 0 fail; Mongo vs Node parity passed including real-data comparison.

## Evidence

- Freshness checks passed: `HEAD` equals target, `git merge-base main HEAD` equals base, raw-byte SHA-256 of `blueprint/context/current-feature.md` matches the spec hash, and only `blueprint/context/review.md` and `blueprint/context/findings.md` differ from the target.
- Delta reviewed: `backend/services/traffic-aggregate.js`, `backend/test/traffic-aggregate.test.js`, `frontend/src/app/pages/laporan-trafik/laporan-trafik.component.spec.ts`, plus the active spec.
- `finalizeBuckets` zero-fill branch changed from `else if (period === 'harian' || period === 'tahunan')` to `else`; backend tests now assert full Senin–Minggu and Minggu 1–4 labels with zero slots; frontend tests assert zero-slot buckets render as chart gaps.

## Findings

- `F-62` closed — the missing zero-slot issue for `mingguan`/`bulanan` is fixed.
- No new findings.
- Re-examined `F-90`, `F-91`, `F-94`, `F-95`, and `F-101`; all remain open/unverified and are unaffected by this fix.

## Remaining risk

- Manual browser verification of the "Tidak ada data" tooltip and gap rendering is unavailable in this environment (no desktop browser).
- Default `npm run verify` cannot pin the Mongo parity proof without the DNS preload patch; the preload run is not a committed project command, so a green default verify elsewhere still self-skips the integration suite.
