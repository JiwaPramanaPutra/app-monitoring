# Fix: Simpan perangkat gagal di mode MongoDB ("status" tampilan ikut terkirim)

**Type:** Fix
**Status:** verified
**Branch:** fix/simpan-perangkat-gagal-mongo

## Masalah

Menambah perangkat (contoh pemilik: Router MikroTik di site Poltekkes Gizi) **gagal di hosting** dengan pesan:

> Gagal menyimpan ke server: Device validation failed: `status`: `Tidak Terpantau` is not a valid enum value for path `status`.

Bukan masalah hosting — ini bug kode yang hanya muncul di mode MongoDB:

- `frontend/src/app/pages/monitoring/monitoring.component.ts:1249` membangun payload perangkat baru dengan `status: 'Tidak Terpantau'`, dan `saveEditedDevice` (`:753`) mengirim `this.editingDevice` apa adanya (ikut `status`).
- `backend/models/Device.js:6` hanya menerima enum `['Online','Offline','Degraded']`. `Tidak Terpantau` adalah **status komputasi** (`backend/services/device-status.js`, keputusan pemilik di fix `status-perangkat-jujur`: "menyimpannya ke dokumen perangkat berarti memakai field `status` yang default-nya `'Online'`, dan default itulah sumber kebohongan").
- Mode JSON lokal (`storage.saveLocalDevice`) tidak memvalidasi apa pun, jadi bug tersembunyi sampai aplikasi dipakai dengan MongoDB (hosting).

Kelas bug yang sama menyerang **edit perangkat**: perangkat yang tampil `Tidak Terpantau` di tabel akan mengirim status itu saat disimpan → 500.

## Perbaikan

Dua lapis, supaya client lama/ter-cache juga tidak jebol:

- **Backend** — helper murni baru `backend/services/device-payload.js`: `withoutMeasuredStatus(body)` membuang `status` dari body (tanpa mengubah objek asal). Dipakai `POST /api/devices` dan `PUT /api/devices/:id` untuk jalur Mongo **dan** JSON, sehingga kontraknya sama: status perangkat adalah hasil pengukuran, bukan input pengguna.
- **Frontend** — helper murni baru `frontend/src/app/shared/device-payload.ts`: `deviceWritePayload(device)` mengembalikan salinan tanpa `status`. Dipakai `saveDevice` dan `saveEditedDevice`; tampilan lokal tetap memakai status komputasi seperti sekarang.

Yang tidak boleh rusak: pembuatan/edit perangkat di mode JSON; tampilan status (`Online`/`Offline`/`Tidak Terpantau`) di tabel & filter down; alur "Jadikan router trafik site" setelah simpan; endpoint lain yang memakai `Device`.

## Build steps

- [x] **1. Helper backend + test** - `device-payload.js` + `test/device-payload.test.js` (4 test): membuang `status`, mempertahankan field lain, tidak memutasi sumber, aman `null`/non-objek, dan **reproduksi bug nyata**: `new Device(payload)` (cara lama) gagal validasi, `new Device(withoutMeasuredStatus(payload))` lolos. *Bukti: 4/4 hijau.*
- [x] **2. Wiring backend** - POST & PUT `/api/devices` memakai helper (jalur Mongo + JSON). *Bukti: `node --check` lulus; test hijau.*
- [x] **3. Helper frontend + test** - `shared/device-payload.ts` + spec (2 test). *Bukti: hijau.*
- [x] **4. Wiring frontend** - `saveDevice` & `saveEditedDevice` memakai `deviceWritePayload`. *Bukti: hijau.*
- [x] **5. Verifikasi + mutasi** - `npm run verify` hijau; mutasi frontend (`return { ...device }`) → 1 test gagal; mutasi backend (`delete clean.status` dikomentari) → test backend gagal; keduanya dipulihkan. *Bukti: hijau.*

## Hasil verifikasi (implement)

- `npm run verify`: backend 245 test — 244 lulus / 1 skip (parity Mongo, DNS lokal) / 0 gagal; frontend **203 lulus** (2 baru); build sukses tanpa warning.
- Reproduksi terarah (di dalam test): payload cara lama `{ status: 'Tidak Terpantau', name, ip, siteLocation }` **gagal** `validateSync()` persis seperti error hosting; setelah helper **lolos** dan memakai default model.
- Mutasi: frontend → 1 test gagal; backend → test gagal; dipulihkan → hijau.
- Manual (pemilik, setelah deploy): tambah Router MikroTik di hosting → tersimpan; edit perangkat yang tampil `Tidak Terpantau` → tersimpan.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: POST/PUT sungguhan ke MongoDB hosting (perlu sesi login pemilik).


## Verify

- `npm run verify`.
- Reproduksi terarah (read-only, skrip): `new Device(payload)` (cara lama) gagal validasi, `new Device(withoutMeasuredStatus(payload))` lolos — memakai model asli.
- Manual (pemilik, setelah deploy): tambah Router MikroTik di hosting → tersimpan; edit perangkat yang tampil `Tidak Terpantau` → tersimpan.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: simpan sungguhan ke MongoDB hosting (perlu login pemilik); bukti deploy dicatat terpisah.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4448,"specSha256":"0c04584c0cd6699fc847dfa14c981f4bacef62fd4ed1809230e3e86760ae5ec6","branch":"refs/heads/fix/simpan-perangkat-gagal-mongo","head":"1f1eeedefbe57783bb468538e0c29413ab9a2dcd","baseRef":"refs/heads/main","baseCommit":"cfbc36223faa10e56571dbe2c37ce9834efbafd9","sourceTree":"d9d1484852ada8212054158cd76237a8099d8676","absentOptional":[]} -->

## Independent review

**Status:** passed
**Target commit:** 1f1eeedefbe57783bb468538e0c29413ab9a2dcd
**Base commit:** cfbc36223faa10e56571dbe2c37ce9834efbafd9
**Base ref:** main
**Spec hash:** 0c04584c0cd6699fc847dfa14c981f4bacef62fd4ed1809230e3e86760ae5ec6
**Prepared by:** opencode
**Builder model:** opencode-go/deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** opencode-go/kimi-k2.7-code
**Requested execution:** automatic
**Requested at:** 2026-09-30T10:57:14Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** opencode-go/kimi-k2.7-code
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-30T10:59:51Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `npm run verify` (project root): pass
- `node --test test/device-payload.test.js` (from `backend/`): pass

## Evidence

- `git rev-parse HEAD` equals target commit `1f1eeedefbe57783bb468538e0c29413ab9a2dcd`
- `git merge-base main HEAD` equals base commit `cfbc36223faa10e56571dbe2c37ce9834efbafd9`
- SHA-256 of `blueprint/context/current-feature.md` equals `0c04584c0cd6699fc847dfa14c981f4bacef62fd4ed1809230e3e86760ae5ec6`
- Only dirty path vs. target: `blueprint/context/review.md`
- Backend test result: 244 pass / 1 skip / 0 fail (1 skip is the known Mongo parity suite that self-skips when local DNS cannot resolve the Atlas SRV record)
- Frontend test result: 203 pass / 0 fail
- Frontend build: success
- Reviewed delta `cfbc362..1f1eee` plus active spec in `blueprint/context/current-feature.md`
- Backend helper `withoutMeasuredStatus` strips `status` from POST/PUT `/api/devices` for both Mongo and JSON paths
- Frontend helper `deviceWritePayload` strips `status` from `saveDevice`/`saveEditedDevice` payloads
- No other client payloads send computed `status` to device write endpoints
- New tests reproduce the actual Mongo enum validation failure and guard against regression

## Findings

- Re-examined F-49: remains `open` (P3); endpoint wiring still untested.
- Re-examined F-54: remains `open` (P3); `toObject` truthiness guards unchanged.
- No new findings added this pass.

## Remaining risk

- Browser visual verification unavailable (no desktop browser)
- Real POST/PUT against the live MongoDB hosting deployment not exercised locally
- `backend/data/*.json` may be clobbered by a running backend process (F-63, unrelated)
