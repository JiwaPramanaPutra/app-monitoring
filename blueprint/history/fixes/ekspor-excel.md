# Fix: Ekspor laporan — Excel rapi, CSV dihapus, laporan trafik bisa diunduh PDF

**Type:** Fix
**Status:** verified
**Branch:** `fix/ekspor-excel`
**Fixes:** temuan baru dari pemakaian nyata (tanpa ID di ledger; belum pernah diaudit)

## Masalah

### A. Ekspor CSV lama berantakan di Excel

Pengguna mengekspor laporan lalu membukanya di Excel; hasilnya berantakan. Bukti dari tangkapan layar:

- Sel **A1** berisi seluruh header dalam satu sel: `Tanggal,Jenis,Site,Gedung,Lantai,Ruangan,Perangkat,Masalah,Tindakan,Teknisi`.
- Setiap nilai tampil dengan tanda kutip (`"Jaringan"`, `"Fakultas Teknik"`).
- Excel menampilkan peringatan *"POSSIBLE DATA LOSS — Some features might be lost if you save this workbook in the comma-delimited (.csv) format"*.

**Akar masalah (dari kode, bukan dugaan):** `buildLaporanCsv` menggabungkan kolom dengan `','` tanpa baris `sep=`, sedangkan Excel **tidak** memakai karakter di dalam berkas untuk memutuskan pemisah `.csv` — ia memakai *list separator* regional Windows (Microsoft: "the default list separator (delimiter) is a comma... change this to another separator character using Windows Region settings"). Di locale Indonesia list separator-nya `;`, jadi Excel membaca seluruh baris sebagai satu sel.

Peringatan *possible data loss* bukan bug aplikasi: CSV memang tidak bisa menyimpan bold, lebar kolom, warna, dan format tanggal.

### B. Keputusan pemilik setelah melihat hasil di dev server (26 Sep 2026, sesi ini)

- Menu **Laporan**: jalur CSV **dihapus** (tombol + endpoint). Excel adalah jalur utama; dua tombol ekspor membingungkan dan CSV tidak bisa memenuhi tampilan rapi.
- Menu **Laporan Trafik**: ekspor **JSON dan CSV dihapus** — keduanya bukan laporan, hanya membuang deret grafik (label/tx/rx/samples). Penggantinya satu tombol **Unduh Laporan (PDF)** yang membuka dialog cetak browser (opsi "Simpan sebagai PDF"). Dipilih pemilik karena laporan harus siap-baca/arsip, grafik ikut tercetak, dan tidak perlu dependensi baru.

## Perbaikan

### 1. Ekspor `.xlsx` berformat (sudah dibangun; tetap)

Dependensi `exceljs` hanya di `backend/` (lockfile ikut). Modul murni `backend/services/laporan-xlsx.js` dipakai endpoint `GET /api/laporan/export/xlsx`; filter `search`/`type` sama dengan `GET /api/laporan`.

**Template lembar 1 (`Laporan`):** judul `Laporan Gangguan — <site>` + periode digabung A1:J1 (tebal, 16); stempel `Diekspor:` di baris 2; header 10 kolom di baris 3 (teks terang, latar gelap, tinggi 20); freeze `ySplit: 3`; lebar kolom Tanggal 13, Jenis 24, Site 18, Gedung 14, Lantai 8, Ruangan 18, Perangkat 22, Masalah 42, Tindakan 42, Teknisi 18; tanggal sebagai Date + `numFmt DD-MMM-YYYY` rata tengah; warna latar per jenis; AutoFilter `A3:J<n>`; border tipis; zebra; Masalah/Tindakan wrap text; tanpa tanda kutip pembungkus dan tanpa baris kosong di ujung.

**Lembar 2 (`Ringkasan`):** jumlah per jenis, per site, per teknisi sebagai **angka**, urut deterministik (jumlah menurun, lalu A–Z), plus baris Total.

**Keamanan jalur `.xlsx` (diverifikasi test):** ExcelJS menulis string sebagai teks, bukan formula, kecuali nilai diberikan sebagai objek `{ formula }`; tidak ada nilai data yang melewati bentuk itu. Nilai seperti `=SUM(A1:A2)` kembali sebagai teks apa adanya (tanpa prefix `'` — prefix itu khusus CSV dan kini tidak dipakai lagi).

Label `<site>` diturunkan dari data: satu site → namanya; nol/lebih dari satu → `Semua Site`. Periode diturunkan dari tanggal minimum–maksimum data.

### 2. CSV laporan dihapus (Step 5)

- Tombol `CSV` dan `exportCSV()` hilang dari halaman Laporan.
- `GET /api/laporan/export/csv` dihapus dari `backend/server.js`.
- `csvCell`, `buildLaporanCsv`, dan `CSV_SEPARATOR` dihapus dari `backend/services/laporan-utils.js` (tidak ada pemakai lagi); `filterLaporan` dan `LAPORAN_HEADERS` tetap karena dipakai `.xlsx`.
- Test khusus CSV dihapus bersama jalurnya. Netralisasi formula injection tidak lagi relevan: tidak ada jalur CSV, dan jalur `.xlsx` menulis nilai sebagai teks (sudah diverifikasi test baca-ulang).

### 3. Ekspor JSON/CSV Laporan Trafik diganti laporan PDF dialog cetak (Step 6)

- Tombol `Ekspor JSON` dan `Ekspor CSV` dihapus; `exportData()` dihapus.
- Endpoint `GET /api/router/history/export` dihapus (tidak ada pemakai lain; `GET /api/router/history` untuk grafik tetap).
- Tombol baru `Unduh Laporan (PDF)` → `printReport()`: menyetel `document.title` (nama berkas saran saat "Simpan sebagai PDF"), mengisi stempel waktu cetak, memanggil `window.print()`, lalu memulihkan judul.
- Print stylesheet global (`frontend/src/styles.css`): `app-sidebar` dan `.no-print` disembunyikan; header cetak (judul, site, periode, stempel waktu) hanya muncul saat cetak; kartu tidak terpotong halaman (`break-inside: avoid`); warna tabel/status dipertahankan (`print-color-adjust: exact`); area grafik tidak ter-clip (`overflow: visible`) dan grafik SVG ikut tercetak tajam.
- **Lingkup laporan (revisi pemilik, 26 Sep): per site aktif.** Isinya hanya (1) pemakaian bandwidth — grafik trend + statistik Tx/Rx — dan (2) downtime — log riwayat downtime & keterlihatan. Ringkasan uptime semua site tetap di layar tetapi **tidak ikut tercetak**. Header cetak menyebut site dan periode terpilih (Harian/Mingguan/Bulanan/Tahunan/Custom).

## Build steps

- [x] **Step 1 - CSV benar (pemisah + `sep=`)** - `buildLaporanCsv` memakai `;` dan menulis `sep=;` di baris pertama; `csvCell` tidak berubah. Test diperbarui dan uji mutasi membuktikan test bisa gagal. **Dibatalkan oleh Step 5**: pemilik memutuskan jalur CSV dihapus setelah melihat hasilnya, sehingga kode dan test CSV ikut dihapus di revisi ini.
- [x] **Step 2 - Modul `.xlsx` + test struktural** - `exceljs` terpasang di `backend/package.json` + lockfile; `backend/services/laporan-xlsx.js` membangun dua lembar sesuai template. Test baca-ulang (`writeBuffer()` → `xlsx.load()`), termasuk freeze/header/lebar/format tanggal/warna/zebra/autofilter/ringkasan dan nilai `=SUM(...)` tetap teks. *Done when:* test lulus; mutasi freeze pane membuat test gagal. — Terpenuhi (mutasi `ySplit: 0` → 2 test gagal).
- [x] **Step 3 - Endpoint + frontend** - `GET /api/laporan/export/xlsx` (auth sama, `Content-Type` OOXML, nama `laporan_<tanggal>.xlsx`); tombol `Ekspor Excel` di halaman Laporan; test frontend `exportExcel()` menembak endpoint dengan filter aktif. *Bagian `exportCSV` yang semula masuk step ini dibatalkan oleh Step 5.*
- [x] **Step 4 - Verifikasi penuh (sebelum revisi pemilik)** - `npm run verify` hijau: backend 200/200, frontend 139/139, Angular build OK.
- [x] **Step 5 - Hapus CSV laporan (tombol + endpoint + helper + test)** - Selesai. Tombol/`exportCSV()` hilang; endpoint, helper, dan 5 test CSV dihapus; skrip smoke manual `backend/test-laporan.js` diarahkan ke `/export/xlsx`. Grep penutup bersih.
- [x] **Step 6 - Trafik: hapus JSON/CSV + tombol PDF + print CSS + test** - Selesai. Dua tombol lama dan `exportData()` hilang; endpoint `history/export` dihapus; `printReport()` + header cetak + print CSS global ditambah; 2 test `printReport` baru membuktikan nama berkas sementara, pemanggilan `window.print`, pemulihan judul, dan fallback `site`. Revisi pemilik (26 Sep): lingkup PDF dibatasi per site aktif — hanya bandwidth + downtime; ringkasan uptime semua site ditandai `no-print`; header cetak menyebut periode terpilih.
- [x] **Step 7 - Verifikasi penuh + bukti** - Selesai. `npm run verify` hijau (rincian di Bukti). Manual try path PDF tersedia untuk pemilik (dev server 4200 sudah memuat perubahan).

## Bukti implementasi

**Sebelum revisi pemilik (26 Sep 2026):**

- `npm run verify`: backend **200/200** (185 + 15 baru), frontend **139/139** (137 + 2 baru), Angular build OK (peringatan `sweetalert2` CommonJS sudah ada sebelumnya).
- Uji mutasi CSV lama: `CSV_SEPARATOR = ','` → 3 test gagal. Uji mutasi xlsx: `ySplit: 3` → `ySplit: 0` → 2 test gagal. Semua dipulihkan.
- Berkas `.xlsx` nyata dibaca ulang dengan ExcelJS: 8.858 byte, `A1` = `Laporan Gangguan — Semua Site · Periode: 21-Sep-2026 s.d. 24-Sep-2026`, freeze `ySplit 3`, `autoFilter A3:J7`, tanggal `2026-09-24T00:00:00.000Z` + numFmt `DD-MMM-YYYY` + center, tiga warna jenis, zebra `FFF8FAFC`, `=SUM(A1:A2)` tetap string, ringkasan `2/1/1` jenis, `2/2` site, `2/1/1` teknisi, total `4`.

**Setelah revisi pemilik (26 Sep 2026):**

- `npm run verify` hijau: backend **195/195** (200 − 5 test CSV yang dihapus bersama jalurnya), frontend **140/140** (139 − 1 test CSV + 2 test print baru), Angular build OK (warning `sweetalert2` CommonJS sudah ada sebelumnya). Test integrasi MongoDB ikut jalan (0 skipped).
- Uji mutasi `printReport`: mematikan panggilan `window.print()` membuat tepat 2 test gagal (spy 0 kali; judul sementara kosong); dipulihkan → hijau lagi.
- Grep penutup: `export/csv`, `history/export`, `exportCSV`, `exportData`, `buildLaporanCsv`, `csvCell` tidak ditemukan lagi di `backend/` maupun `frontend/src/`.
- `backend/test-laporan.js` (skrip smoke manual di luar `npm test`) diarahkan dari `/export/csv` ke `/export/xlsx` dengan cek magic `PK` + panjang buffer, supaya tidak menunjuk endpoint mati.
- Revisi lingkup laporan (26 Sep): ringkasan uptime semua site ditandai `no-print` (tetap tampil di layar); header cetak menampilkan `Periode: <Harian/Mingguan/Bulanan/Tahunan/Custom> · <label>`. `npm run verify` ulang setelahnya: backend **195/195**, frontend **140/140**, build OK.

## Verify

- `npm run verify` (backend + frontend test + build).
- Uji mutasi: hapus panggilan `window.print()` di `printReport()` → test `printReport` gagal; pulihkan → hijau.
- Grep penutup: `export/csv`, `history/export`, `exportCSV`, `exportData`, `buildLaporanCsv`, `csvCell` tidak ditemukan lagi di kode aktif (berkas `blueprint/history/` dikecualikan).
- Baca ulang `.xlsx` hasil `writeBuffer()` dengan ExcelJS dan periksa sel kunci (sudah terbukti di Step 2; tetap berlaku).
- Manual try path (pemilik): buka `/laporan-trafik`, pilih site + periode, klik **Unduh Laporan (PDF)**, pilih "Simpan sebagai PDF", periksa ringkasan + grafik + log.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: rendering PDF di mesin pengguna (font, margin, pagination ditentukan dialog cetak browser) dan tampilan `.xlsx` di Excel pengguna.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":10257,"specSha256":"fa5cd40226a670aeb2ef8edd25609fb2a1c0cb634b98003afe394a27e317ee6d","branch":"refs/heads/fix/ekspor-excel","head":"16943c85bd4cced1b10d97bf52f4c7602356513e","baseRef":"refs/heads/main","baseCommit":"7f0b43aad2d85fd2f4a2fb9fb7a81ce7289be41d","sourceTree":"9042f94e130640b446dabf104279c3bb92e67a63","absentOptional":[]} -->

## Independent review

**Status:** passed
**Target commit:** 16943c85bd4cced1b10d97bf52f4c7602356513e
**Base commit:** 7f0b43aad2d85fd2f4a2fb9fb7a81ce7289be41d
**Base ref:** main
**Spec hash:** fa5cd40226a670aeb2ef8edd25609fb2a1c0cb634b98003afe394a27e317ee6d
**Prepared by:** opencode
**Builder model:** deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-26T12:09:10.874Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** opencode-go/deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-26T12:42:20.513Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `7f0b43aad2d85fd2f4a2fb9fb7a81ce7289be41d..16943c85bd4cced1b10d97bf52f4c7602356513e` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD`: pass (16943c85bd4cced1b10d97bf52f4c7602356513e)
- `git merge-base main HEAD`: pass (7f0b43aad2d85fd2f4a2fb9fb7a81ce7289be41d)
- `git status --porcelain=v1 -uall`: pass (only `blueprint/context/review.md` modified; no untracked paths)
- Spec raw-byte SHA-256, disk vs `git show HEAD:`: pass (both `fa5cd402...`; bytes identical; `git diff HEAD` empty)
- `npm run verify`: pass (backend 195/195, 0 skipped, including the MongoDB integration suite; frontend 140/140 in 13 files; Angular build OK)
- Removed-symbol grep (`export/csv`, `exportCSV`, `exportData`, `buildLaporanCsv`, `csvCell`, `history/export`, `CSV_SEPARATOR`) in active code: pass (no matches)
- `GET http://localhost:3000/api/laporan` without a token: 401 (evidence for F-98)
- Browser print verification: unavailable (no desktop browser connected to this session)

### Evidence

- Reviewed the full `7f0b43a..16943c8` delta from scratch (16 files): spec revision, backend endpoint/service/tests, frontend components/styles/tests, backend-only `exceljs` dependency (`^4.4.0`, lockfile root entry 4.4.0; frontend has none).
- XLSX read-back tests genuinely pin structure: title/merge, header row 3, freeze `ySplit: 3`, column widths, date `numFmt DD-MMM-YYYY` + centered, per-category fills, zebra, thin borders, `AutoFilter A3:J7`, `rowCount` without trailing empty rows, summary counts as numbers, and `=SUM(A1:A2)` staying a string with `formula` undefined both pre-serialization and after reload.
- CSV removal is complete: no active references remain; `filterLaporan` and `LAPORAN_HEADERS` are still used by `GET /api/laporan` and `laporan-xlsx.js`; the removed CSV tests left no orphaned imports.
- Print scope: `no-print` covers the page header, site dropdown, period filter, and the all-sites uptime card; what remains is the print header, the bandwidth card (chart + Tx/Rx statistics), and the downtime log. `.main [style*='overflow-x']` matches the chart wrapper's inline style (`laporan-trafik.component.html:137`); `print-color-adjust: exact` and `break-inside: avoid` are present in `styles.css`. The only hover-dependent element (chart tooltip) is cleared by `onChartLeave()` before the print button can be clicked.
- Security: the new endpoint is a GET behind the unchanged global `app.use('/api', auth.requireAuth)` (`backend/server.js:50`); removed routes leave no reachable handler; no secrets or credential values in the new code.
- Performance: the export builds one in-memory workbook proportional to the filtered rows; no new unbounded loop, repeated query, or hot-path work; the removed CSV path had the same data shape.
- Tests: 12 new xlsx tests, 2 new `printReport` tests, 1 new `exportExcel` test; no `.only`/focused/placeholder tests; the only `.skip(` is the deliberate offline-Mongo guard in `traffic-aggregate.mongo.test.js`. Coverage gaps: the endpoint wiring (auth, headers, filename) and the print CSS/DOM timing are reading-only.
- The running dev server on :3000 was reachable; no browser was connected, so print rendering was not exercised.

### Findings

- F-96 [P2] unverified - printed "Dicetak" timestamp can be empty/one print stale (print snapshot timing).
- F-97 [P3] open - README still advertises removed CSV/JSON exports and omits Excel/PDF.
- F-98 [P3] open - manual smoke script cannot authenticate, so its new xlsx check is unreachable.
- Ledger update: F-86 re-examined - its export call site was removed by this delta; the chart-vs-summary window half is unchanged and stays `open` (P3).
- No P0/P1 findings.

### Remaining risk

- Print/PDF rendering (pagination, fonts, colors) and the F-96 timestamp behavior were not verified in a real browser; no desktop browser was connected to this session.
- The `.xlsx` file was not opened in real Excel; correctness rests on ExcelJS read-back tests (the spec records the same limitation).
- The MongoDB integration suite ran against the local MongoDB (22,806 real samples, 0 skipped); on a machine without a reachable MongoDB it self-skips by design (F-94).
- `GET /api/laporan/export/xlsx` wiring (auth, headers, filename) has no automated HTTP-level test; covered by reading only (same class as F-49/F-61).
- `backend/test-laporan.js` is a manual script and was not executed end to end (it currently cannot authenticate; F-98).
