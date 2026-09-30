# Fix: Aplikasi responsif di HP / tablet

**Type:** Fix
**Status:** verified
**Branch:** fix/responsif-semua-halaman

## Masalah

Di handphone, tata letak berantakan (laporan pemilik, 30 Sep). Temuan survei kode:

1. **Project & Site**: grid 3 kolom `1fr 1fr 1fr` dengan `height: calc(100vh - 120px)` — di HP tiga panel berdempetan dan tidak terbaca.
2. **Tabel** (Perangkat di Monitoring; Ringkasan uptime & Log downtime di Laporan Trafik; Daftar laporan) menyusut jadi kolom sempit dan teks terpotong/berdesakan; beberapa tidak punya pembungkus scroll (tabel uptime & log downtime), yang punya scroll pun tanpa lebar minimum sehingga tetap tergencet.
3. **Baris filter/aksi** (filter Laporan 220px+160px; bar periode + rentang manual di Laporan Trafik; header grafik) tidak `flex-wrap` → meluber keluar kartu.
4. **Modal**: overlay tanpa padding → modal menempel tepi layar; grid form 2 kolom (`.form-row`, `1fr 1fr` di modal perangkat) tidak turun jadi 1 kolom.
5. **Sidebar mobile**: strip horizontal `position: relative` (hilang saat scroll), item masih longgar.
6. **Toast** (monitoring & laporan) lebar minimum/nowrap bisa melebihi layar; panel `site-dropdown` `min-width: 260px` bisa meluber di layar 360px.

Perubahan hanya lapisan tampilan (CSS/template); tidak menyentuh logika, API, atau perilaku data. Grafik tetap bisa discroll horizontal (memang didesain begitu).

## Perbaikan

- **Global `styles.css`**:
  - `.main { min-width: 0; }` + padding lebih kecil di layar sempit (≤600px).
  - `.page-header { flex-wrap: wrap; gap: 10px; }` supaya judul & tombol menumpuk rapi.
  - Utility `.table-scroll` (`overflow-x: auto`) dengan `min-width` tabel 600px, varian `.table-scroll--wide` 780px, dan `th` tidak wrap.
  - Modal: overlay `padding: 16px`; `.modal-box` padding lebih kecil di HP.
  - `.form-row`/`.form-row-3` turun menjadi 1 kolom di ≤640px; `.form-actions` boleh wrap.
  - Sidebar mobile (≤720px): `position: sticky; top: 0`, item lebih ringkas, nav tidak wrap.
  - `#login-screen { padding: 16px; }`.
- **Per halaman** (kelas menggantikan inline style untuk layout kritis):
  - `project-site`: kelas `.ps-layout`; ≤980px 1 kolom dengan tinggi otomatis dan tiap panel `max-height` + scroll internal.
  - `laporan`: baris filter jadi kelas (`.report-filters`, `.report-search`, `.report-type`) dengan wrap + full-width di HP; tabel memakai `.table-scroll`; `.laporan-modal .form-row` 1 kolom di ≤560px; toast `max-width: calc(100vw - 32px)` + boleh wrap.
  - `laporan-trafik`: bar periode & rentang manual dapat wrap; tabel uptime dan log downtime dibungkus `.table-scroll` (varian wide); header grafik wrap; input tanggal `flex` di HP.
  - `monitoring`: tabel perangkat memakai `.table-scroll--wide`; pencarian perangkat full-width di HP; grid modal perangkat jadi kelas `.modal-grid-2` (1 kolom ≤560px); toast `max-width` layar; baris pagination boleh wrap.
  - `dashboard`: `.header-actions` boleh wrap.
  - `site-dropdown`: panel `max-width: calc(100vw - 32px)`.

Yang tidak boleh rusak: perilaku & logika semua halaman; tampilan cetak/PDF (aturan `@media print` tidak diubah); scroll horizontal grafik yang memang disengaja; test yang ada.

## Build steps

- [x] **1. Lapisan global `styles.css`** - `.table-scroll` (+ varian `--wide`), `.page-header` wrap, `.main min-width/padding`, modal overlay padding + modal HP, `.form-row`/`.form-row-3` 1 kolom ≤640px, `.form-actions` wrap, sidebar mobile sticky + ringkas, `#login-screen` padding, pengecualian print untuk `.table-scroll`. *Bukti: build hijau.*
- [x] **2. Project & Site + Dashboard** - `.ps-layout` (3 kolom → 1 kolom ≤980px, tinggi otomatis, panel `max-height: 340px`); `.header-actions` dashboard wrap. *Bukti: build hijau.*
- [x] **3. Laporan** - `.report-filters`/`.report-search`/`.report-type` (wrap; full-width ≤640px), tabel `table-scroll--wide`, `.form-row` modal 1 kolom, toast `max-width` layar. *Bukti: build hijau.*
- [x] **4. Laporan Trafik** - bar periode, rentang manual, header grafik, dan baris site dropdown dapat wrap; tabel uptime & log downtime dibungkus `table-scroll(--wide)`; `input.range-date` fleksibel ≤560px. *Bukti: build hijau.*
- [x] **5. Monitoring + site-dropdown** - tabel perangkat `table-scroll--wide`; `input.device-search` full-width ≤640px; `.modal-grid-2` (1 kolom ≤640px); toast full-width; pagination wrap; panel dropdown `max-width: min(340px, calc(100vw - 32px))`. *Bukti: build hijau.*

## Hasil verifikasi (implement)

- `npm run verify` (root, dua kali): backend 241 test — 240 lulus / 1 skip (parity Mongo, DNS lokal) / 0 gagal; frontend **201 lulus**; build sukses **tanpa warning budget** (sempat 15 byte lewat di CSS dashboard, dirapikan).
- Pemeriksaan aturan CSS: breakpoint 720px (sidebar), 640px (form/modal), 600px (padding), 560px (tanggal), 980px (Project & Site); semua kelas baru punya spesifisitas cukup untuk mengalahkan aturan global (`input.device-search`, `input.range-date`, `.report-filters .report-search`).
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser sungguhan — tidak ada browser desktop terhubung di sesi ini; verifikasi visual oleh pemilik di HP.
- Checklist manual pemilik: tiap halaman (Login, Dashboard, Monitoring, Project & Site, Laporan, Laporan Trafik) tidak ada yang meluber; tabel perangkat/laporan/uptime/log bisa digeser; modal terbaca penuh dengan padding; sidebar tetap tampak saat scroll; tombol tidak saling tumpuk; PDF laporan tetap utuh.


## Verify

- `npm run verify` (backend + frontend test + build frontend).
- Manual (pemilik, di HP): setiap halaman — Login, Dashboard, Monitoring, Project & Site, Laporan, Laporan Trafik — tidak ada yang meluber; tabel bisa digeser; modal terbaca; sidebar tetap terlihat saat scroll; tombol tidak saling tumpuk.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser sungguhan (tidak ada browser desktop terhubung) — bukti visual dari pemilik.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":5948,"specSha256":"53ec100bad3a8d60bc705579e9e2f8a3772187c7d40b24579f69543312a9cf40","branch":"refs/heads/fix/responsif-semua-halaman","head":"1ff07a1a80f9d9a1392b707aba7ddb1527ad1844","baseRef":"refs/heads/main","baseCommit":"39410505540506c706382adf803c484f5611d1a7","sourceTree":"792f3f1b1110cbe2226d3dd3cfba750b3e42aa0b","absentOptional":[]} -->

## Independent review

**Status:** passed
**Target commit:** 1ff07a1a80f9d9a1392b707aba7ddb1527ad1844
**Base commit:** 39410505540506c706382adf803c484f5611d1a7
**Base ref:** main
**Spec hash:** 53ec100bad3a8d60bc705579e9e2f8a3772187c7d40b24579f69543312a9cf40
**Prepared by:** opencode
**Builder model:** opencode-go/deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** opencode-go/kimi-k2.7-code
**Requested execution:** automatic
**Requested at:** 2026-09-30T05:57:44Z
**Workflow:** regular
**Check required:** no

**Reviewer adapter:** opencode
**Reviewer model:** opencode-go/kimi-k2.7-code
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-30T06:03:55.285Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `npm run verify` (project root): pass — backend 240 pass / 1 skip (Mongo parity, local DNS cannot resolve Atlas SRV) / 0 fail; frontend 201 pass; Angular build succeeded (1 pre-existing sweetalert2 CommonJS warning).

## Evidence

- Freshness checks passed: `HEAD` == target, `git merge-base main HEAD` == base, `blueprint/context/current-feature.md` SHA-256 == spec hash, and only `blueprint/context/review.md` differs from the target.
- Delta reviewed: `39410505540506c706382adf803c484f5611d1a7..1ff07a1a80f9d9a1392b707aba7ddb1527ad1844` — 12 files, 275 insertions, 29 deletions.
- Changed frontend files: `frontend/src/styles.css`, `site-dropdown.component.css`, `dashboard.component.css`, `laporan-trafik.component.css/.html`, `laporan.component.css/.html`, `monitoring.component.css/.html`, `project-site.component.css/.html`, plus `blueprint/context/current-feature.md`.
- No product logic, API, auth, or data-flow changes; CSS/template-only responsiveness refactor as declared by the spec.

## Findings

- F-104: re-examined, status stays `open` (P3).
- F-105: added `open` (P3) — `.table-scroll th` nowrap not reset in `@media print`.

## Remaining risk

- Browser/visual responsive verification: unavailable (no desktop browser connected in this environment; owner manual check on phone remains pending).
- Print output visual verification: unavailable (no browser to generate PDF/preview; the F-105 print nowrap risk is unconfirmed visually).
- No visual-regression test harness exists; responsive layout was verified by code review and the passing build/tests only.
