# Fix: State site dan kunci perangkat

**Type:** Fix
**Status:** verified
**Branch:** `fix/state-site-dan-kunci-perangkat`
**Fixes:** F-36, F-37, F-48

## Masalah

Tiga sisa temuan di sekitar **Monitoring Jaringan**, dua di kode dan satu di data. Ketiganya berakar pada hal yang sama: identitas yang tidak diikat ke site-nya.

**1. F-36 [P2] — draft bridge di modal Edit tidak terikat ke site-nya.**
`initRouterBridgeForEdit` otomatis **mencentang** "Jadikan router trafik site ini" untuk setiap perangkat Router yang site-nya belum punya `routerConfig.host`. Tapi `<select>` Site Location di modal Edit **tidak punya handler perubahan**, jadi draft-nya tidak pernah di-bind ulang saat site diganti. Akibatnya: mengganti site di modal Edit lalu menyimpan dapat menulis `routerConfig` ke site yang **salah**, atau menolak penyimpanan dengan pesan tentang field milik site lain.

**2. F-37 [P2] — respons site lama bisa tertulis setelah pindah site.**
`fetchRouterTraffic` mengirim request untuk `selectedSite` saat dipanggil, tapi **tidak memeriksa lagi** saat responsnya tiba — berbeda dengan `prefillTrafficHistory` yang sudah menjaga ini. Karena koneksi ke router bisa memakan waktu detik-an, respons site A yang lambat bisa mendarat setelah pengguna pindah ke site B, lalu **menulis ip/interface/angka milik A ke widget B dan mendorong sample A ke grafik B**. `initDevices` punya celah yang sama untuk daftar perangkatnya.

**3. F-48 [P2] — kunci perangkat lama masih bentrok di mode JSON.**
Perbaikan F-44 mencegah kunci baru yang bentrok, tapi **tidak memperbaiki record lama**. `backend/data/devices.json` di mesin ini berisi **8 perangkat yang semuanya ber-`_id=1, id=1`** (keluaran bug lama). Di mode JSON, `deviceKey()` mengembalikan `'1'` untuk semuanya — gejala F-43 kembali (satu klik membuka semua menu) dan hapus/ubah menjadi undian "record pertama yang cocok".

## Perbaikan

- **F-36: ikat draft bridge ke site modal.** Reset `routerBridge`, `bridgeInterfaces`, `bridgeIfaceError`, dan `bridgeIfaceLoading` saat Site Location di modal Edit berubah (seperti `onNewSiteLocationChange` di modal Tambah), lalu siapkan ulang draft untuk site yang baru. Sekaligus **perketat syarat centang otomatis**: hanya dicentang bila site itu memang sudah menunjuk perangkat ini (`routerConfig.host` == IP perangkat). Sebelumnya site yang **belum** punya router pun ikut dicentang, sehingga edit biasa (alias/ruangan) diam-diam menyalakan monitoring.
- **F-37: kunci respons ke site-nya.** Setiap request menangkap `const site = this.selectedSite` lebih dulu dan **membatalkan penerapan** hasilnya bila `site !== this.selectedSite` saat respons tiba — pola yang sudah dipakai `prefillTrafficHistory`. Berlaku untuk `fetchRouterTraffic` dan `initDevices`.
- **F-48: re-key data lama sekali jalan.** Perangkat yang `_id`-nya duplikat (selain yang pertama) diberi kunci baru `dev_<ts>_<rand>`; `id` numeriknya tetap. **Backup diambil lebih dulu**, dan hanya record ber-`_id` duplikat yang disentuh. Ini mengubah data tersimpan, jadi langkahnya dijalankan sekali dan dilaporkan apa adanya.

Yang tidak boleh rusak: tambah/edit/hapus perangkat di mode Mongo **dan** JSON, simpan/bridge router trafik, widget trafik saat pindah site, paginasi tabel, dan penyembunyian kredensial SSH.

## Build steps

- [x] **Step 1 - Draft bridge terikat ke site modal (F-36)** - Ganti site di modal Edit mereset draft lalu menyiapkannya untuk site baru; centang otomatis hanya bila site sudah menunjuk perangkat ini. *Done when:* buka Edit perangkat Router milik site A, ganti Site Location ke site B -> draft bridge direset dan mencerminkan site B (bukan A); mengedit alias tanpa menyentuh bridge tidak menyalakan monitoring site yang belum punya router; `npm run verify` lolos.
- [x] **Step 2 - Respons yang telat tidak lagi mendarat di site lain (F-37)** - `fetchRouterTraffic` dan `initDevices` menangkap site saat request dikirim dan tidak menerapkan hasilnya bila site sudah berubah. *Done when:* pindah site saat respons masih dalam perjalanan -> widget dan daftar perangkat tetap milik site yang sedang dipilih; `npm run verify` lolos.
- [x] **Step 3 - Re-key perangkat lama yang kuncinya duplikat (F-48, data)** - Backup `backend/data/devices.json`, lalu beri `_id` baru pada setiap record yang `_id`-nya sudah dipakai record sebelumnya. *Done when:* tidak ada lagi `_id` duplikat di file itu, jumlah record tidak berubah, dan setelah backend dimuat ulang tabel perangkat kembali normal (satu klik = satu menu).

## Verify

- `npm run verify`.
- Smoke F-36: Edit perangkat Router -> ganti Site Location -> draft bridge menyesuaikan site baru, tidak ada sisa interface/user site lama.
- Smoke F-37: pindah site cepat berkali-kali saat router lambat -> widget tidak pernah menampilkan ip/interface site lain, dan grafik tidak menerima sample site lain.
- Smoke F-48: `backend/data/devices.json` tidak lagi punya `_id` duplikat; klik tombol **⋮** membuka satu menu saja.
- Bukti tidak ada regresi: tambah, edit, hapus perangkat tetap berjalan; bridge router trafik tetap tersimpan benar; paginasi utuh.

## Findings

### state-site-dan-kunci-perangkat/F-33 [P2] closed - Bridge draft survives a device-type or site change and can block saves on hidden fields or bridge a non-Router device

**File:** frontend/src/app/pages/monitoring/monitoring.component.ts:703-710,720-726,1175-1182,1251; frontend/src/app/pages/monitoring/monitoring.component.html:535,782,849
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `routerBridge.enabled` does not depend on the device type or on the modal's selected site. The bridge block only renders for `type === 'Router'` (`monitoring.component.html:535,849`) and the Add modal's type select has no change handler (`:782`), so toggling "Jadikan router trafik site ini" while the type is Router and then switching to Access Point/Switch/Server hides the block but leaves `routerBridge.enabled === true`. `saveDevice` still validates that stale draft (`monitoring.component.ts:1175-1182`), so the save is rejected by a message telling the user to click "Muat interface dari router" or fill fields that are no longer on screen; recovery means switching the type back or reopening the modal. If the draft was complete, `bridged` is computed with no type check (`:1251`) and `bridgeRouterToSite` silently rewrites the site's `routerConfig.host` to a non-Router device, repointing traffic monitoring. The Edit modal guards the write with `type === 'Router'` (`:720`) but still runs the ungated validation (`:703-710`), and changing Site Location keeps the draft from the old site, so the overwrite can land on the newly selected site's `routerConfig`.
**Suggested fix:** Gate the draft once per save — compute `const bridge = this.routerBridge.enabled && device.type === 'Router' ? ... : null`, pass `bridge` instead of the raw draft to `bridgeDraftError`, and use the same value for the write — or reset `routerBridge`/`bridgeInterfaces`/`bridgeIfaceError` in `(ngModelChange)` handlers when the type changes away from Router or the site changes. A component test only makes sense after the project adopts a component-test harness (F-30).
**Resolution:** Repaired 2026-09-25. Tambah `activeBridgeDraft(deviceType, host)` yang mengembalikan `{ enabled: false }` kecuali blok dicentang DAN perangkatnya bertipe Router. Dipakai untuk validasi maupun penulisan di `saveDevice` dan `saveEditedDevice`, sehingga blok yang tersembunyi karena tipe diganti tidak lagi menolak penyimpanan maupun menulis `routerConfig` site dari perangkat non-Router. Kebersihan state setelah pindah tipe belum diuji di browser; keamanan tulisnya sudah tertutup. Awaiting re-review.
Re-examined at target 6e9eaca (2026-09-25, independent automatic review): the type-change half is genuinely repaired — `activeBridgeDraft` (`monitoring.component.ts:1109-1112`) is used for validation and write in both modals (`saveEditedDevice` 704-712, `saveDevice` 1193-1201), and `saveDevice`'s `bridged` flag also reads it, so a draft hidden by a type change no longer blocks saves and a non-Router device can no longer write `routerConfig`. The site-change half of this finding remains: the Edit modal's Site Location select (`monitoring.component.html:465`) has no handler and the auto-enabled draft keeps the old site's interface/user, which can still block a save or write the new site's config (the auto-enable effect is also reachable without a site change). Because part of the original defect is still present, the status stays `fixed`, not closed; the remaining defect is recorded as F-36.
Re-examined at target 3db1301 (2026-09-25): `activeBridgeDraft` (`monitoring.component.ts:1126-1129`) is still the single gate used for validation and write in both save paths (`:721`, `:1221`), and the site-change half remains open as F-36. Status stays `fixed` (P2).
Re-examined at target 48202b5 (2026-09-25): the type gate is unchanged (`activeBridgeDraft` `monitoring.component.ts:1126-1129`, validation/write `:721`, `:1221`; `bridged` `:1298`), so a hidden non-Router draft still cannot block a save or write `routerConfig`. The site-change half remains open as F-36. Status stays `fixed` (P2).
Re-examined at target fbc777d (2026-09-25): `activeBridgeDraft` (`monitoring.component.ts:1126-1129`) is still the single gate used for validation and write in both save paths (`:721`, `:1230`) and `bridged` still reads it (`:1307`), so the type-change half stays repaired. The site-change half remains open as F-36. Status stays `fixed` (P2).
Closed at target fba8f1c (2026-09-25, independent automatic review): the type-change half is still gated by `activeBridgeDraft` (`monitoring.component.ts:1164-1167`, used at `:759`, `:1268`, `:1345`) and the site-change half is repaired by F-36's handler (`monitoring.component.html:465`, `monitoring.component.ts:724-727`), so neither a hidden non-Router draft nor a stale draft from the previous site can block a save or write `routerConfig`. No new defect found in the repaired paths. Closing.

### state-site-dan-kunci-perangkat/F-36 [P2] closed - Auto-enabled Edit-modal bridge draft is not bound to the site, blocking unrelated saves and silently re-enabling monitoring

**File:** frontend/src/app/pages/monitoring/monitoring.component.ts:669-688, 704-712, 1193-1201, 1109-1112, 1302-1327; frontend/src/app/pages/monitoring/monitoring.component.html:465-467, 535-588
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `initRouterBridgeForEdit` auto-checks "Jadikan router trafik site ini" for every Router device whose site has no `routerConfig.host` (`:686-687`), and the Edit modal's Site Location select has no change handler (`monitoring.component.html:465`), so the draft is never re-bound to the modal's site. Three reachable effects: (1) on a site whose host was cleared but whose interface/user/password were preserved (the state `clearRouterConfigHost` leaves; reachable by re-adding a Router device and then editing it), `bridgeDraftError` passes on the prefilled schema defaults and `bridgeRouterToSite` silently writes `host = device.ip`, restarting monitoring the user had stopped; (2) on a site whose `routerConfig` is empty, the auto-checked draft rejects an unrelated alias/IP edit with "Isi username RouterOS." / "Pilih interface..." even though the user never touched the bridge — the spec's "simpan/edit perangkat tidak boleh rusak"; (3) after moving the device to another site, the stale draft (old site's interface/user) either blocks the save or overwrites the new site's `routerConfig`. No component test covers these paths (F-30).
**Suggested fix:** Bind the draft to the modal's site: reset `routerBridge`/`bridgeInterfaces`/`bridgeIfaceError` in the Site Location select's `(ngModelChange)` (like `onNewSiteLocationChange`), and only auto-check the bridge when the site already points at this exact device (`String(cfg.host).trim() === device.ip.trim()`); leave it unchecked when the site has no host so the user opts in. Changing the auto-check behavior alters shipped validation behavior, so it needs the user's explicit decision.
**Resolution:** Repaired 2026-09-25. `<select>` Site Location di modal Edit kini punya `(ngModelChange)="onEditSiteLocationChange()"` yang mereset dan menyiapkan ulang draft bridge untuk site baru. Syarat centang otomatis juga diperketat: hanya bila site itu memang sudah menunjuk perangkat ini (`routerConfig.host` == IP perangkat), sehingga mengedit alias tidak lagi menyalakan monitoring dan site tanpa router tidak lagi menolak penyimpanan dengan pesan milik site lain.
Re-examined at target 3db1301 (2026-09-25): `initRouterBridgeForEdit` still auto-enables the bridge for a Router device whose site has no `routerConfig.host` or whose host equals the device IP (`monitoring.component.ts:670-689`), and the Edit modal's Site Location select (`monitoring.component.html:465`) still has no change handler, so the draft (old site's interface/user) is not re-bound to the modal's site. Status stays `open` (P2).
Re-examined at target 48202b5 (2026-09-25): unchanged (`initRouterBridgeForEdit` `monitoring.component.ts:670-689`; Edit Site Location select `monitoring.component.html:465`; auto-enable `:687-688`). The same unbound-draft class also exists in the Add modal: `onNewSiteLocationChange` (`monitoring.component.ts:593-596`) resets only gedung/lantai, so a checked bridge draft (user/password/interface) survives a Site Location change and `bridgeRouterToSite` writes it into the newly selected site (`:1330-1355`), overwriting that site's `routerConfig` without confirmation. Status stays `open` (P2).
Re-examined at target fbc777d (2026-09-25): unchanged — `initRouterBridgeForEdit` still auto-enables the bridge for a Router device whose site has no `routerConfig.host` or whose host equals the device IP (`monitoring.component.ts:670-689`), the Edit modal's Site Location select (`monitoring.component.html:465`) still has no change handler, and `onNewSiteLocationChange` (`monitoring.component.ts:593-596`) still resets only gedung/lantai. Status stays `open` (P2).
Re-examined at target 1c472eb (2026-09-25, independent automatic review): unchanged — `initRouterBridgeForEdit` (`monitoring.component.ts:680-698`) still auto-enables the bridge when the site has no `routerConfig.host` or its host equals the device IP, the Edit Site Location select (`monitoring.component.html:465-467`) still has no change handler, and `onNewSiteLocationChange` (`monitoring.component.ts:596-599`) still resets only gedung/lantai. Status stays `open` (P2).
Closed at target fba8f1c (2026-09-25, independent automatic review): the Edit Site Location select now carries `(ngModelChange)="onEditSiteLocationChange()"` (`monitoring.component.html:465`) and re-runs `initRouterBridgeForEdit` (`monitoring.component.ts:724-727`); the compiled template registers the ngModel assignment listener before this handler (checked in the built `chunk-B57HmVCh.js` bundle), so the handler reads the newly selected site. The auto-check now requires `cfg.host === device.ip` (`:715-716`), so a plain alias/IP save on a hostless site leaves `routerConfig` untouched and a cleared-host site cannot silently re-enable monitoring (the old `!cfg?.host` branch is gone); `bridgeDraftError` still blocks on the new site's stored credentials and passes when it has them, and changing the device type still disables the draft via `activeBridgeDraft`. The three effects in the finding are gone. The reset deliberately discards a half-typed credential when the user moves the device to another site, which is the behavior the repair chose. Closing; the same-site Add-modal draft that survives a site change is user-controlled and visible (its host and interface list belong to the device being added), so no silent wrong-site write remains there.

### state-site-dan-kunci-perangkat/F-37 [P2] closed - Stale in-flight site responses are applied after a site switch

**File:** frontend/src/app/pages/monitoring/monitoring.component.ts:259-313, 206-229
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `fetchRouterTraffic` sends the request for the `selectedSite` at call time but never checks it when the response resolves (`:262-300`), unlike `prefillTrafficHistory` which bails when the site changed (`:561`). A slow response for site A (a router connect can block for `routerConfig.timeout`, 3-4 s) that lands after the user switched to site B writes A's `ip`/`interface`/error into the widget and pushes A's sample into B's chart through `updateTrafficMetrics` — exactly the cross-site exposure Step 8 set out to remove. `initDevices` has the same missing guard (`:206-213`): a late response for A can replace `this.devices` with A's list, which `filteredDevices` then hides for B and `refreshDeviceStatus` cannot repair (it only merges keys already present), leaving the table empty until another site switch. Confirmed by reading; not reproduced in a browser.
**Suggested fix:** Capture `const site = this.selectedSite` before each request and `if (site !== this.selectedSite) return;` before applying the data, as `prefillTrafficHistory` already does.
**Resolution:** Repaired 2026-09-25. `fetchRouterTraffic` dan `initDevices` menangkap `const site = this.selectedSite` sebelum request dikirim dan keluar lebih awal bila `site !== this.selectedSite` saat responsnya tiba — pola yang sudah dipakai `prefillTrafficHistory`. Respons yang telat tidak lagi menulis ip/interface/angka site lain ke widget, tidak mendorong sample site lain ke grafik, dan tidak mengisi daftar perangkat site lain.
Re-examined at target 3db1301 (2026-09-25): `fetchRouterTraffic` (`monitoring.component.ts:260-313`) and `initDevices` (`:207-230`) still apply responses without comparing `selectedSite`; only `prefillTrafficHistory` has the guard (`:562`). Status stays `open` (P2).
Re-examined at target 48202b5 (2026-09-25): unchanged — `fetchRouterTraffic` (`monitoring.component.ts:260-313`) and `initDevices` (`:207-230`) still apply responses with no `selectedSite` comparison; only `prefillTrafficHistory` guards (`:562`). Status stays `open` (P2).
Re-examined at target fbc777d (2026-09-25): unchanged — `fetchRouterTraffic` (`monitoring.component.ts:260-314`) and `initDevices` (`:207-230`) still apply responses with no `selectedSite` comparison; only `prefillTrafficHistory` guards (`:562`). Status stays `open` (P2).
Re-examined at target 1c472eb (2026-09-25, independent automatic review): unchanged — `fetchRouterTraffic` (`monitoring.component.ts:263-317`) and `initDevices` (`:210-233`) still apply responses with no `selectedSite` comparison; only `prefillTrafficHistory` guards (`:565`). Status stays `open` (P2).
Closed at target fba8f1c (2026-09-25, independent automatic review): `initDevices` captures the site before the request (`monitoring.component.ts:213`) and bails at `:220` and `:232`; `fetchRouterTraffic` does the same at `:275`, `:280`, and `:323`. A late cross-site response can no longer write the widget's ip/interface/numbers, push a chart sample, or replace the device list. No new defect found in the repaired paths. Closing; the remaining same-site ordering hazard and the unguarded 30-second status refresh are recorded separately as F-74 and F-73.

### state-site-dan-kunci-perangkat/F-48 [P2] closed - Existing duplicate device keys in local JSON mode still break row identity and make delete/update a first-match lottery

**File:** backend/storage.js:288-296; frontend/src/app/shared/device-identity.ts:29-35; frontend/src/app/pages/monitoring/monitoring.component.html:202,213; backend/data/devices.json (local data, untracked/ignored)
**Found:** 2026-09-25 by /audit independent current (scope: current; lens: quality)
**Why it matters:** The F-44 repair prevents new duplicate keys but does not re-key existing records. The working copy's `backend/data/devices.json` already holds 8 devices that all have `_id=1,id=1` (the old bug's output). In local mode `deviceKey()` returns `'1'` for every row, so the F-43 symptom returns (`activeDropdown === deviceKey(device)` matches all rows and every action menu opens together), and `deleteLocalDevice`/`updateLocalDevice` always act on the first `_id=1` record regardless of which row the user picked; `findDuplicateIp`'s exclusion also skips all of them, so a real duplicate IP among those rows is not reported. The spec's "Aman untuk data lama" claim holds only when keys are unique, which is false for this deployment's local data.
**Suggested fix:** Repair the stored data - a one-time load/import migration that re-keys every record after the first with a duplicate `_id` (`dev_<ts>_<rand>`), or a documented manual cleanup of `backend/data/devices.json`. This changes stored data, so it needs the user's explicit decision and is not an automatic repair.
**Resolution:** Repaired 2026-09-25 (data, dengan izin). `backend/data/devices.json` berisi 8 perangkat dengan 7 kunci duplikat (`_id=1`): 6 "Router Bima" dan 1 "AP-Akademik-Lt1". Semua yang duplikat diberi kunci baru `dev_<ts>_<rand>` lewat skrip sekali jalan; jumlah record tetap 8 dan tidak ada duplikat tersisa. Backup di `%TEMP%/opencode/backup-devices-2026-09-25T11-43-32-583Z.json`. mtime file diperiksa 12 detik setelah penulisan: backend (mode Mongo) tidak menimpanya.
Re-examined at target 5c94633 (2026-09-25, independent automatic review): still true. The ignored local `backend/data/devices.json` holds 8 records forming a single duplicate-`_id` group (all 8 share one key), so in JSON fallback mode `deviceKey()` returns the same key for every row (F-43's all-menus-open symptom) and a delete by that key removes the first matching record, not necessarily the clicked one. The delta prevents new duplicates but does not repair stored data; status stays `open` (P2).
Re-examined at target 37c6f44 (2026-09-25, independent automatic review): unchanged. The ignored `backend/data/devices.json` still holds 8 records whose `_id` is all `1` (read after this pass's `npm run verify`; the suite's `DATA_DIR` isolation left the real file untouched - no test records present). `deviceKey()` therefore still returns one key for every row in JSON mode, and delete/update still act on the first `_id=1` record. The delta prevents new duplicates but does not repair stored data. Status stays `open` (P2).
Closed at target fba8f1c (2026-09-25, independent automatic review): independently compared the ignored `backend/data/devices.json` against the recorded backup (`%TEMP%/opencode/backup-devices-2026-09-25T11-43-32-583Z.json`): 8 records on both sides, 0 duplicate `_id` values, the first record keeps `_id=1`, the other 7 now carry `dev_1790336612587_<rand>`, and a field-by-field comparison shows `_id` as the only changed field on exactly those 7 records. A read-only scan of the other local stores found no duplicate identity keys (projects.json: 2 unique keys; no laporan.json exists; traffic_history.json: 25,000 samples over 4 distinct non-empty site names with no case/whitespace variants). The stored-data defect is repaired; the code-level gaps for project storage and `updateLocalDevice` remain tracked as F-50/F-51. Closing.

## Independent review

# Independent Review

**Status:** passed
**Target commit:** fba8f1c186f66865f22dae9d2d6abc14e004c263
**Base commit:** d17b219ed297b0c5d385a3008e41418d13d901d1
**Base ref:** main
**Spec hash:** 4a75a9f3a394b779e0b51222584912750cf1017c7dc49b3777e6838e5c50e955
**Prepared by:** opencode
**Builder model:** deepseek-v4.1-flash
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-25T11:45:04Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** deepseek-v4.1-flash
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-25T11:52:54Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `d17b219ed297b0c5d385a3008e41418d13d901d1..fba8f1c186f66865f22dae9d2d6abc14e004c263` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD`: pass (`fba8f1c186f66865f22dae9d2d6abc14e004c263`).
- `git merge-base main fba8f1c...`: pass (`d17b219ed297b0c5d385a3008e41418d13d901d1`).
- `git status --porcelain=v1 --untracked-files=all`: pass (only `blueprint/context/review.md` differs from the target; `backend/data/` ignored).
- SHA-256 via `Get-FileHash` of `blueprint/context/current-feature.md`: pass (`4a75a9f3a394b779e0b51222584912750cf1017c7dc49b3777e6838e5c50e955`).
- `npm run verify`: pass (backend `node --test`: 116/116; frontend vitest: 91/91; Angular build OK; pre-existing `sweetalert2` CommonJS warning only).
- Read-only Node comparison of `backend/data/devices.json` against `%TEMP%/opencode/backup-devices-2026-09-25T11-43-32-583Z.json`: pass (8/8 records, 0 duplicate `_id`, `_id` the only changed field on 7 records).
- Read-only Node scan of `backend/data/*.json` for duplicate identity keys: pass (devices and projects have none; traffic history has 4 distinct non-empty site keys; `test.json` is a binary fixture unrelated to the delta).
- Compiled-template listener check in `frontend/dist/frontend/browser/chunk-B57HmVCh.js`: pass (the desugared ngModel assignment listener is registered before the explicit `onEditSiteLocationChange` handler).

### Evidence

- Delta `d17b219..fba8f1c`: `frontend/src/app/pages/monitoring/monitoring.component.ts` (+33/-11), `frontend/src/app/pages/monitoring/monitoring.component.html` (1 line), plus the spec and the findings ledger; no other product code or test changed.
- F-36: `monitoring.component.html:465` carries the change handler; `monitoring.component.ts:715-716` gates auto-check on `cfg.host === device.ip` (the old `!cfg?.host` branch is gone); `:724-727` rebinds the draft. A plain alias/IP save on a hostless site leaves `routerConfig` untouched, so the old silent re-enable and the old hidden-field validation block are gone; `bridgeDraftError` still blocks on the new site's stored credentials and passes when it has them.
- F-37: site guards at `monitoring.component.ts:220`/`:232` (`initDevices`) and `:280`/`:323` (`fetchRouterTraffic`), using the `prefillTrafficHistory` pattern; late cross-site responses can no longer touch the widget, the chart, or the device list.
- F-48: backup retained; only the 7 duplicate-`_id` records were re-keyed to `dev_1790336612587_<rand>`; the first record keeps `_id=1`; `id` and every other field are value-identical to the backup. No other local store currently holds a duplicate identity key.
- Tests: no `monitoring.component.spec.ts` or component harness exists, so the repaired component logic is verified by reading plus the green Verify run, not by a component test.
- No browser harness exists and no visual check was performed. No secrets or sensitive values were reproduced.

### Findings

- F-36, F-37, F-48: `fixed` → `closed` (verified at this target; the repairs are correct and introduce no new defect).
- F-33: `fixed` → `closed` (both the type-change half and the site-change half are now repaired by `activeBridgeDraft` plus the new site handler).
- F-30: stays `fixed` (P3) with a re-examination note; the delta's new component logic is still without committed coverage.
- New leads (non-blocking): F-73 [P3] `unverified` (unguarded 30 s status refresh), F-74 [P3] `unverified` (same-site response ordering).
- Merge-blocking (P0/P1) findings: **None**.

### Remaining risk

- No browser harness is configured, so F-36/F-37 and the Add-modal bridge flow were not exercised visually; the verdict rests on code reading, the compiled-template ordering check, the data comparison, and the green `npm run verify`.
- F-73 and F-74 are unverified leads, not confirmed defects; they do not block merge.
- The one-time migration has no committed script, so reproducibility depends on the retained backup; the data was verified read-only against that backup.
- No router or network target is available, so live bridge/traffic behavior remains unexercised (same as prior passes).
- Check was not required and was not run.
