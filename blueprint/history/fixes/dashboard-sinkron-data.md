# Fix: Dashboard — sinkronkan data & rapikan tata letak

**Type:** Fix
**Status:** verified
**Branch:** fix/dashboard-sinkron-data

## Masalah

1. **Data tidak sinkron (semua nol).** `DashboardComponent.ngOnInit()` kosong — tidak ada pemanggilan API sama sekali, jadi KPI (`perangkatDown`, `siteAktif`, `networkAvailability`, `laporanBulanIni`) selalu 0, kartu "Kesehatan Jaringan per Site" kosong, dan 3 panel bawah hanya menampilkan link. Janji header "update tiap 2 menit" juga belum ada (tanpa interval/tombol refresh).
2. **Tata letak terasa kosong/rusak.** Panel tanpa empty state, badge "prioritas" laporan memakai field yang tidak ada di model Laporan (`priority`), dan panel "Aktivitas Sistem" tanpa sumber data.

## Perbaikan

- **Helper murni baru `shared/dashboard-data.ts`** (bisa dites tanpa DOM/HTTP):
  - `countDevicesByStatus(devices)` → `{ total, online, offline, notMonitored }`.
  - `deviceAvailabilityPct(devices)` → Online ÷ (Online+Offline) × 100; **`null`** bila tidak ada perangkat terklaim (`Tidak Terpantau` tidak dihitung).
  - `buildSiteHealth(siteNames, devices)` → per site: total/online/percentage + status warna (Sehat hijau / Perlu perhatian amber / Gangguan merah / Belum ada perangkat abu).
  - `buildProblemDevices(devices, 3)`, `buildRecentReports(laporans, tz, 3)`, `buildActivities(events, tz, 5)`.
  - `countReportsInMonth(laporans, tz, now)` → `date` berawalan `YYYY-MM` bulan berjalan **di zona pengguna** (`tzDateString`).
- **Komponen** (`dashboard.component.ts`): `loadDashboard()` menembak 4 endpoint paralel yang sudah ada — `/api/devices/status` (tanpa site = semua perangkat + status ping), `/api/projects`, `/api/laporan`, `/api/router/downtime-events` — lalu mengisi KPI/site/panel. Auto-refresh **2 menit** + tombol **Muat ulang** + stempel "Diperbarui HH:mm:ss" (zona browser) + loading state. `siteAktif` = jumlah site dengan ≥1 perangkat Online.
- **Template**: empty state tiap panel ("Semua perangkat sehat ✓", "Belum ada laporan", "Belum ada aktivitas", ajakan buat site), badge laporan memakai **`type`** dengan warna per jenis, waktu update + tombol refresh di header, `Network Availability` menampilkan `—` bila belum ada dasar.
- **CSS**: gaya `.empty-state` dan perapian kecil; tanpa redesign total (proporsi grid sudah baik).
- Tanpa perubahan backend/API/dependency; angka mengikuti zona waktu pengguna (fitur 13).

Yang tidak boleh rusak: navigasi cepat (KPI → Monitoring/`status=down`, link panel), endpoint yang ada, halaman lain.

## Build steps

- [x] **1. Helper murni + test** - `shared/dashboard-data.ts` + `dashboard-data.spec.ts` (hitungan status, availability null/normal, kesehatan site 4 kasus, problem list, filter bulan per zona, mapping laporan & aktivitas). *Done when:* test hijau.
- [x] **2. Komponen + template + test** - `loadDashboard()` 4 endpoint paralel, interval 2 menit, tombol refresh, stempel waktu, empty state, badge `type`. Test komponen: `loadDashboard` mengisi KPI/site/panel dari mock; `siteAktif` menghitung site ber-perangkat-online. *Done when:* test hijau.
- [x] **3. Verifikasi + mutasi** - `npm run verify`; mutasi: `deviceAvailabilityPct` ikut menghitung `Tidak Terpantau` → test gagal; pulihkan.

## Hasil verifikasi (implement)

- `npm run verify`: backend 240 lulus / 1 skip (parity Mongo, DNS lokal) / 0 gagal; frontend **199 lulus** (13 baru: 10 `dashboard-data` + 3 `dashboard.component`); build sukses tanpa warning budget.
- Mutasi `deviceAvailabilityPct` (menghitung semua perangkat, termasuk `Tidak Terpantau`) → **3 test gagal** (2 helper + 1 komponen); dipulihkan dan hijau lagi.
- Manual di browser belum dijalankan: sesi ini tidak punya browser desktop (tool melaporkan tidak terhubung). Menunggu pemilik.


## Verify

- `npm run verify` (backend + frontend test + build).
- Uji mutasi: `Tidak Terpantau` ikut dihitung di availability → test gagal. Dipulihkan.
- Manual (pemilik): buka `/dashboard` → KPI terisi (perangkat down, site aktif, availability, laporan bulan ini), kartu site berisi angka online/total, panel bawah berisi data; tombol Muat ulang bekerja; biarkan 2 menit → stempel waktu berubah.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser pengguna (manual di atas).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4262,"specSha256":"f4b7ce71c0ce0e9d48902b90f697aeaf9f5830eba5931988f6a604edee31b0d0","branch":"refs/heads/fix/dashboard-sinkron-data","head":"a739e440c68c053433ab923cf48ec8e321f816e0","baseRef":"refs/heads/main","baseCommit":"973a9d0db84279731972d644d64b3cae7aeb5ce1","sourceTree":"bda27185ee4a114689e3a5c0fcc407bf0ed8670e","absentOptional":[]} -->

## Independent review

**Status:** passed
**Target commit:** a739e440c68c053433ab923cf48ec8e321f816e0
**Base commit:** 973a9d0db84279731972d644d64b3cae7aeb5ce1
**Base ref:** main
**Spec hash:** f4b7ce71c0ce0e9d48902b90f697aeaf9f5830eba5931988f6a604edee31b0d0
**Prepared by:** opencode
**Builder model:** opencode-go/deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** opencode-go/kimi-k2.7-code
**Requested execution:** automatic
**Requested at:** 2026-09-29T10:23:51Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** opencode-go/kimi-k2.7-code
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-29T10:27:51Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `npm run verify`: pass

## Evidence

- Freshness checks passed: `HEAD` = `a739e440c68c053433ab923cf48ec8e321f816e0`; `git merge-base main HEAD` = `973a9d0db84279731972d644d64b3cae7aeb5ce1`; `blueprint/context/current-feature.md` SHA-256 = `f4b7ce71c0ce0e9d48902b90f697aeaf9f5830eba5931988f6a604edee31b0d0`; only `blueprint/context/review.md` and `blueprint/context/findings.md` differ from the target.
- `npm run verify`: backend 240 pass / 1 skip / 0 fail; frontend 199 pass; Angular build succeeded (with the pre-existing `sweetalert2` CommonJS warning).
- Reviewed the complete delta `973a9d0..a739e44` plus `blueprint/context/current-feature.md`; files reviewed include `frontend/src/app/shared/dashboard-data.ts`, `frontend/src/app/shared/dashboard-data.spec.ts`, `frontend/src/app/pages/dashboard/dashboard.component.{ts,html,css,spec.ts}`, and the active spec.

## Findings

- F-102 [P2] open — KPI "Laporan Bulan Ini" sends an ignored `period=currentMonth` query param.
- F-103 [P3] open — overlapping `loadDashboard` calls are not serialized.
- F-104 [P3] open — dead responsive CSS rule `.dashboard-grid-2`.

## Remaining risk

- Manual browser verification was not performed in this environment; the spec notes it is pending the owner.
- The backend MongoDB parity integration subtest skipped because the local DNS cannot resolve the Atlas SRV record; the skip is an environment limitation, not a product defect.
- No P0/P1 findings are open or fixed in the ledger; existing open P2/P3 findings outside this delta remain as context.
