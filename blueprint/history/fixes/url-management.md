# Fix: "Buka Management" membuka console yang benar

**Type:** Fix
**Status:** verified
**Branch:** `fix/url-management`
**Fixes:** temuan baru dari pemakaian nyata (tanpa ID di ledger)

## Masalah

Tombol **Buka Management** (item ke-3 di menu baris perangkat) tidak membuka console perangkat, dan modalnya menampilkan tiga hal yang tidak benar:

| Yang ditampilkan | Kenyataannya |
|---|---|
| `Provider: Ruijie Cloud / Web GUI` | teks tetap di template, untuk **semua** perangkat — MikroTik pun ditulis Ruijie |
| `Web GUI URL: http://<ip>` | selalu port **80** |
| `● Online (Port 80/443 aktif)` | **tidak ada yang diukur** — hijau tanpa bukti |

Akibatnya router MikroTik **tidak pernah terbuka**: RouterOS WebFig (dan Winbox) ada di **8291**, jadi tombolnya membuka port yang kosong. Ini juga alasan pertanyaan pemilik aplikasi "untuk tipe Router mikrotik, console-nya ke mana?" tidak punya jawaban di UI.

Akar tambahannya: `managementUrl` dan `managementProvider` **ada di model `Device`** tapi **tidak direferensikan satu kali pun di seluruh `frontend/src`** — grep untuk `managementUrl`, `managementProvider`, dan `deviceForm` menghasilkan nol. Dua kolom mati.

Ini kelas yang sama dengan yang sudah diperbaiki berulang kali di sesi ini: aplikasi menampilkan klaim ("Online, port 80/443 aktif") dari nol pengukuran.

## Perbaikan

- **Helper murni** `frontend/src/app/shared/management-url.ts`:
  - `managementUrlFor(device)` → pakai `managementUrl` bila diisi; kalau tidak, turunkan dari merek: **MikroTik → `http://<ip>:8291`** (WebFig/Winbox), **Ruijie → `https://<ip>`**, sisanya `http://<ip>`.
  - `normalizeManagementUrl(raw)` → menambahkan `http://` bila pengguna mengetik tanpa skema. Sengaja **http**, bukan https: WebFig MikroTik di 8291 memakai http, dan https harus diketik eksplisit.
  - IP yang tidak terpakai (`—`, kosong, `n/a`) memakai `isUsableIp` yang sudah ada dan teruji, bukan daftar baru.
- **Kolom URL Management di form** (Tambah dan Edit), dengan placeholder yang mengajarkan nilainya per tipe.
- **`openExternalManagement()` memakai helper itu**, dan memberi tahu bila URL-nya tidak bisa ditentukan alih-alih membuka halaman kosong.
- **Modal Management jujur**: provider diganti merek+tipe perangkat yang sebenarnya, URL ditampilkan apa adanya dari helper, dan klaim `● Online (Port 80/443 aktif)` **dihapus** — tidak ada yang mengukurnya.

Yang tidak boleh berubah: tes ping ICMP di modal itu (nyata dan sudah ada), `routerBridge` (kaitan router trafik), dan payload simpan perangkat selain tambahan satu kolom.

## Build steps

- [x] **Step 1 - Helper + test** - `management-url.ts` berisi `normalizeManagementUrl` dan `managementUrlFor`, dengan test yang menutup URL eksplisit, tambahan skema, MikroTik 8291, Ruijie https, IP tidak terpakai, dan perangkat kosong. *Done when:* `npm run verify` lolos.
- [x] **Step 2 - Form + tombol + modal** - Kolom di kedua modal, payload simpan ikut, `openExternalManagement` memakai helper, dan modal berhenti mengarang provider/status. *Done when:* kolom tersimpan dan terbaca kembali; tombol membuka `:8291` untuk MikroTik; `npm run verify` lolos.

## Verify

- `npm run verify`.
- Bukti test menggigit: kembalikan `managementUrlFor` agar selalu `http://<ip>` dan pastikan test MikroTik gagal.
- Bukti nyata di aplikasi: isi URL Management sebuah router MikroTik (mis. `172.16.1.1:8291`) → Buka Management harus membuka `http://172.16.1.1:8291`, bukan port 80.
- Bukti tidak ada regresi: perangkat tanpa URL Management tetap membuka `http://<ip>` seperti sebelumnya, dan tes ping di modal tetap bekerja.

## Bukti saat implementasi

- `management-url.ts` + 12 test. Bukti menggigit: mematikan pemetaan MikroTik ke 8291 menggagalkan **2 test**, termasuk yang bernama persis kasus itu.
- `npm run verify`: backend 168/168, frontend 128/128 (dari 116), Angular build OK — build-nya penting karena binding template baru ikut dikompilasi.
- Sekalian: perangkat baru tidak lagi di-set `status: 'Online'` sebelum diukur apa pun; sekarang `Tidak Terpantau` sampai `/api/devices/status` benar-benar menjawab.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4106,"specSha256":"675c6759af5adb7a2547a6d9d77339d9a8123ccb0453d9bccbd9473d0674c78d","branch":"refs/heads/main","head":"772912d7760dff0999af65f7ada9ce186ca0911c","baseRef":"refs/heads/main","baseCommit":"772912d7760dff0999af65f7ada9ce186ca0911c","sourceTree":"d170dee9b2a528a7f8504080b49c762cffa33dd5","absentOptional":[]} -->
