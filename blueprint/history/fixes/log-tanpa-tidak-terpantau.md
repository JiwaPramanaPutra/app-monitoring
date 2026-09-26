# Fix: Log downtime tanpa baris "Tidak terpantau"

**Type:** Fix
**Status:** verified
**Branch:** fix/log-tanpa-tidak-terpantau

## Masalah

Di halaman Laporan Trafik, tabel **"Log riwayat downtime & keterlihatan"** menampilkan dua jenis kejadian:

- `interface-down` — downtime asli (router menjawab, link interface putus).
- `unreachable` — aplikasi kehilangan visibilitas ke router (kredensial/jaringan/TLS); **bukan** gangguan situs dan sengaja tidak menurunkan uptime.

Saat log ini dibawa ke laporan klien, baris "Tidak terpantau" banyak terbaca sebagai downtime ("kok banyak downnya ya?"). Keputusan pemilik (26 Sep 2026, sesi ini): log hanya menampilkan downtime asli; kehilangan visibilitas tetap terlihat sebagai kolom **"Tidak Terpantau"** di ringkasan uptime di layar (tidak ikut PDF karena laporan PDF memang per site).

Bukti: tangkapan layar pemilik — 12 baris "Tidak terpantau" beruntun pada periode Harian Poltekkes Gizi.

## Perbaikan

- `filterDowntimeLog()` (`frontend/src/app/pages/laporan-trafik/laporan-trafik.component.ts:571`) menyaring `kind === 'interface-down'` sebelum predikat jendela/urutan; event `unreachable` (termasuk data lama tanpa `kind`, yang dipetakan ke `unreachable` di `:224`) tidak masuk `downtimeLog`.
- Judul tabel menjadi **"Log riwayat downtime"**; teks kosong menjadi "Tidak ada downtime pada periode ini".
- PDF otomatis bersih (mencetak halaman yang sama); ringkasan uptime di layar tidak berubah (kolom "Tidak Terpantau" tetap).
- Predikat tumpang-tindih jendela, durasi event berjalan, dan urutan terbaru-ke-terlama tidak berubah — hanya populasi event-nya.
- Tanpa perubahan backend/API/dependency.

Yang tidak boleh rusak: downtime asli tetap tampil dengan durasi & status "Belum pulih"; ringkasan uptime (termasuk total "Tidak Terpantau" di layar) dan grafik trend tidak berubah; PDF per site tetap hanya bandwidth + downtime.

## Build steps

- [x] **Step 1 - Saring log ke downtime asli** - Filter `kind === 'interface-down'` ditambahkan dengan komentar alasan; judul + teks kosong diperbarui; test baru di `laporan-trafik.component.spec.ts` (event `unreachable` + `interface-down` dalam jendela → hanya `interface-down` di `downtimeLog`) lulus. Uji mutasi: filter dihapus sesaat → test baru **gagal** (1 failure); dipulihkan → hijau.
- [x] **Step 2 - Verifikasi** - `npm run verify`: backend **195/195** (0 skipped, integrasi Mongo jalan), frontend **144/144** (143 + 1 baru), Angular build OK.

## Verify

- `npm --prefix frontend run test` — 14 file, 144 test hijau (termasuk test filter log).
- `npm run verify` dari akar repo hijau.
- Manual (pemilik): `/laporan-trafik` → log tidak lagi memuat baris "Tidak terpantau"; klik **Unduh Laporan (PDF)** → laporan hanya memuat downtime asli + bandwidth.
- Yang **tidak** bisa dibuktikan dari lingkungan ini: tampilan browser/PDF pengguna (manual di atas).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2884,"specSha256":"04dac8dbfe143091c1ced5fa87087285e9518cdb837c47970374bfab02a4205b","branch":"refs/heads/fix/log-tanpa-tidak-terpantau","head":"c072c956f2d20b3e4f39d711e8f54b958f202c52","baseRef":"refs/heads/main","baseCommit":"c072c956f2d20b3e4f39d711e8f54b958f202c52","sourceTree":"1464240577faf162a8e2509ef9f56d5be623c79e","absentOptional":[]} -->
