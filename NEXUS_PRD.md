# NEXUS — Network & Infrastructure Monitoring System
### Product Requirements Document (PRD)

**Versi:** 1.0  
**Tanggal:** September 2026  
**Status:** Draft

---

## Daftar Isi

1. [Gambaran Umum](#1-gambaran-umum)
2. [User Flow](#2-user-flow)
3. [Nama & Tech Stack](#3-nama--tech-stack)
4. [Core Functions](#4-core-functions)
5. [Model Data](#5-model-data)
6. [Keamanan & Akses](#6-keamanan--akses)

---

## 1. Gambaran Umum

**NEXUS** (Network & Infrastructure Monitoring System) adalah sistem pemantauan jaringan dan infrastruktur berbasis web yang dirancang untuk memantau kondisi perangkat jaringan secara terpusat. Sistem ini memungkinkan tim teknis (EOS) maupun pimpinan (Client) untuk memantau status perangkat, trafik jaringan, latensi, serta mengelola laporan gangguan dan aktivitas pemeliharaan di seluruh lokasi/site secara real-time.

**Target Pengguna:**
- **EOS (Engineer On Site):** Teknisi lapangan yang memiliki akses penuh — pemantauan, manajemen perangkat, laporan, dan konfigurasi.
- **Client:** Pengguna dengan akses terbatas — hanya dapat melihat dashboard dan informasi status jaringan.

**Cakupan Site:**
Direktorat · Gigi · Keperawatan · Gizi · Kebidanan

---

## 2. User Flow

> User flow yang digunakan adalah user flow yang telah dibuat sebelumnya. Bagian ini merujuk dan memetakan flow tersebut terhadap fitur-fitur sistem NEXUS.

### 2.1 Alur Login

```
Pengguna membuka aplikasi
    │
    ▼
Halaman Login
    │── Input username & password
    │── Sistem memvalidasi kredensial via JWT
    │
    ├── [Gagal] → Tampilkan pesan error, stay di halaman login
    │
    └── [Berhasil] → Sistem membaca role pengguna
                        │
                        ├── [Role: EOS] → Redirect ke Dashboard (akses penuh)
                        └── [Role: Client] → Redirect ke Dashboard (akses terbatas)
```

### 2.2 Alur Dashboard

```
Dashboard
    │── Melihat KPI ringkasan (total perangkat, site aktif, availability)
    │── Melihat grafik trafik real-time per site (TX/RX)
    │── Melihat status kesehatan per site
    │── Melihat daftar perangkat bermasalah
    │── Melihat laporan & aktivitas terbaru
    │
    ├── Klik site pada tabel kesehatan → Halaman Monitoring (filter by site)
    ├── Klik perangkat down → Halaman Monitoring (filter: status offline)
    └── Klik laporan bulan ini → Halaman Laporan
```

### 2.3 Alur Monitoring Perangkat

```
Halaman Monitoring
    │── Pilih site (tab: Direktorat / Gigi / Keperawatan / Gizi / Kebidanan)
    │── Widget trafik router TX/RX real-time (jika site terkonfigurasi)
    │── Tabel perangkat (AP / Switch / Router / Server) dengan status Online/Offline
    │── Kolom: Nama, IP, Status, Tipe, Gedung, Lantai, Ruangan, Client, Ping Time
    │
    ├── [EOS] Tombol "+ Tambah Perangkat" → Modal tambah perangkat
    │
    ├── Dropdown aksi per perangkat:
    │       ├── Detail Perangkat → Modal informasi lengkap
    │       ├── Edit Perangkat → Modal edit (EOS only)
    │       ├── Management → Modal ping & web console
    │       ├── Reboot → Modal konfirmasi reboot via SSH/Web API (EOS only)
    │       └── Hapus → Modal konfirmasi hapus (EOS only)
    │
    └── Filter: Pencarian teks, filter status offline
```

### 2.4 Alur Laporan Gangguan & Maintenance

```
Halaman Laporan
    │── Tabel laporan (Jaringan / Printer-Komputer / Monitoring Kegiatan Khusus)
    │── Filter: periode, site, tipe laporan
    │
    ├── [EOS] Tombol "+ Buat Laporan" → Modal input laporan
    │       │── Pilih tipe, site, tanggal, gedung, lantai, ruangan
    │       │── Input masalah, tindakan, teknisi, perangkat terkait
    │       └── Simpan → Laporan tersimpan ke database
    │
    └── Lihat detail laporan / Export
```

### 2.5 Alur Halaman Laporan Trafik

```
Halaman Laporan Trafik
    │── Pilih site & rentang waktu
    │── Tampilkan grafik trafik historis TX/RX
    │── Ringkasan: peak, average, total data
    └── Export data trafik (opsional)
```

### 2.6 Alur Manajemen Pengguna

```
Halaman Pengguna (EOS only)
    │── Tabel daftar pengguna (nama, role, site akses, last login)
    │── Log aktivitas pengguna terbaru
    │
    └── [EOS] Tombol "+ Tambah Pengguna" → Modal input
            │── Input nama, pilih role (EOS/Client), pilih site akses
            └── Simpan → Pengguna baru ditambahkan
```

---

## 3. Nama & Tech Stack

| Komponen | Teknologi |
|---|---|
| **Nama Sistem** | NEXUS — Network & Infrastructure Monitoring System |
| **Frontend** | Angular (Standalone Components) |
| **Backend** | Node.js + Express.js |
| **Database** | MongoDB (via Mongoose ODM) |
| **API** | REST API |
| **Real-time** | WebSocket |
| **Network Integration** | MikroTik RouterOS API (port 8728) / RouterOS REST API |
| **Authentication** | JWT (JSON Web Token) + Role Based Access Control (RBAC) |
| **Deployment** | Backend: Node.js server · Frontend: Angular dev/build server |

---

## 4. Core Functions

Bagian ini menjabarkan delapan fungsi utama sistem NEXUS. Setiap fungsi dijelaskan dari sisi tujuan, cara kerja, dan teknologi yang digunakan.

---

### 4.1 Real-Time Monitoring Trafik Router TX/RX

**Fungsi:**
Menampilkan data trafik jaringan (upload/TX dan download/RX) dari router MikroTik di setiap site secara langsung dan terus-menerus diperbarui.

**Tujuan:**
Memberikan visibilitas kepada tim teknis mengenai beban trafik jaringan saat ini di setiap lokasi, sehingga anomali seperti lonjakan trafik atau putusnya koneksi dapat dideteksi secara cepat.

**Cara Kerja & Teknologi:**

Data trafik **diambil langsung dari router MikroTik fisik** melalui **RouterOS API (port 8728)** pada sisi backend Node.js. Backend menggunakan library `node-routeros` untuk terhubung ke router dan mengirimkan perintah `/interface/monitor-traffic` dengan parameter `=once=` untuk mendapatkan data trafik instan pada interface WAN yang ditentukan (misalnya `ether5`).

Alur pengambilan data:

```
Frontend Angular
    │
    │  HTTP GET /api/router/traffic?site=Gizi (polling setiap 2 detik)
    ▼
Backend Node.js + Express
    │
    │  RouterOS API (TCP port 8728)
    ▼
Router MikroTik (RB450Gx4)
    │  /interface/monitor-traffic =interface=ether5 =once=
    ▼
Backend memproses rx-bits-per-second & tx-bits-per-second
    │
    └── Response JSON → { txMbps, rxMbps, txBps, rxBps, connected, ... }
```

- Setiap site dapat memiliki konfigurasi router yang berbeda (host, port, user, password, interface) yang didefinisikan dalam `SITE_ROUTER_MAP` di backend.
- Backend menyimpan cache data trafik terakhir (`cachedTraffic`) sebagai fallback apabila koneksi ke router terputus sementara.
- Sistem mencatat jumlah kegagalan berturut-turut; jika melebihi ambang batas (`FAILURE_THRESHOLD = 5`), maka downtime dicatat ke storage.
- Setiap sampel trafik yang berhasil diambil disimpan ke database MongoDB melalui `storage.recordTrafficSample()` untuk keperluan historis.
- Di sisi frontend (Angular), polling dilakukan setiap 2 detik menggunakan `setInterval`. Data TX/RX ditampilkan dalam format sparkline bar chart dengan skala dinamis (Kbps / Mbps) serta metrik peak rate dan average rate dari 45 titik data terakhir.

**Catatan Khusus:**
Site yang belum memiliki konfigurasi router akan menampilkan status "Site belum terkonfigurasi" tanpa menampilkan data trafik palsu. Sistem hanya menampilkan data trafik nyata dari router yang terhubung.

---

### 4.2 Monitoring Status Online/Offline Perangkat (AP, Switch, Router)

**Fungsi:**
Memantau kondisi konektivitas setiap perangkat jaringan — Access Point, Switch, Router, dan Server — yang terdaftar di setiap site.

**Tujuan:**
Mendeteksi perangkat yang mengalami gangguan (offline atau degraded) secara otomatis dan menampilkannya kepada pengguna tanpa perlu pengecekan manual.

**Cara Kerja & Teknologi:**

- Status setiap perangkat ditentukan berdasarkan hasil **ping ICMP** ke alamat IP perangkat yang dilakukan oleh backend Node.js menggunakan library `ping`.
- Backend menyediakan endpoint `GET /api/devices/status?site=<nama_site>` yang mengembalikan daftar perangkat beserta status terkini (`Online` / `Offline`), ping time (RTT), dan jumlah client (untuk AP).
- Frontend Angular memanggil endpoint ini saat halaman dimuat (`initDevices`) dan kemudian melakukan refresh otomatis setiap **30 detik** (`setInterval`) tanpa memuat ulang halaman.
- Status perangkat disimpan dalam model `Device` di MongoDB dengan field `status` bertipe enum: `Online`, `Offline`, `Degraded`.
- Setelah operasi reboot berhasil, sistem secara otomatis melakukan polling status setiap 5 detik (maksimal 3 menit) hingga perangkat kembali Online.

**Tampilan:**
- Tabel perangkat menampilkan badge status berwarna (hijau = Online, merah = Offline).
- Dashboard menampilkan ringkasan per site: jumlah perangkat online vs. total, persentase ketersediaan, dan daftar perangkat bermasalah.

---

### 4.3 Monitoring Latensi (Ping)

**Fungsi:**
Mengukur waktu respons (Round-Trip Time / RTT) dari setiap perangkat jaringan menggunakan protokol ICMP Ping.

**Tujuan:**
Mendeteksi degradasi koneksi sebelum perangkat benar-benar offline, serta memberikan informasi kualitatif mengenai kualitas jaringan di setiap lokasi.

**Cara Kerja & Teknologi:**

- Backend Node.js menyediakan endpoint `POST /api/ping` yang menerima parameter `host` (IP perangkat) dan mengirimkan paket ICMP menggunakan library `ping`.
- Endpoint `POST /api/ping-all` memungkinkan pengecekan massal terhadap beberapa perangkat sekaligus (digunakan saat polling pasca-reboot).
- Hasil ping berupa:
  - `alive: true/false` — apakah perangkat dapat dijangkau.
  - `time` — nilai RTT dalam milidetik.
- Data ping time ditampilkan pada kolom "Ping Time" di tabel perangkat pada halaman Monitoring.
- Pengguna EOS juga dapat melakukan ping manual terhadap perangkat tertentu melalui **modal Management**, yang hasilnya ditampilkan secara langsung di UI.
- Nilai ping time yang tinggi atau timeout (RTO) dapat menjadi indikator awal degradasi jaringan.

---

### 4.4 Device Management

**Fungsi:**
Mengelola inventaris perangkat jaringan yang terdaftar dalam sistem, mencakup penambahan, pengeditan, penghapusan, dan reboot perangkat.

**Tujuan:**
Menjaga data inventaris perangkat tetap akurat dan terkini, serta memungkinkan tim teknis melakukan tindakan operasional dasar langsung dari dashboard.

**Cara Kerja & Teknologi:**

Data perangkat disimpan di koleksi `devices` MongoDB dengan model yang mencakup: nama, tipe, merek, model, MAC address, IP address, lokasi (site, gedung, lantai, ruangan), jumlah client, signal, SSH credentials, dan status.

Operasi yang tersedia (khusus role EOS):

| Operasi | Endpoint | Metode |
|---|---|---|
| Lihat semua perangkat | `GET /api/devices` | REST |
| Lihat perangkat + status | `GET /api/devices/status?site=` | REST |
| Tambah perangkat | `POST /api/devices` | REST |
| Edit perangkat | `PUT /api/devices/:id` | REST |
| Hapus perangkat | `DELETE /api/devices/:id` | REST |
| Reboot perangkat | `POST /api/device/reboot` | REST |
| Ping perangkat | `POST /api/ping` | REST |

**Reboot Perangkat:**
Backend mendukung dua metode reboot:
- **SSH**: Menggunakan library `ssh2` untuk terhubung ke perangkat via SSH dan mengirimkan perintah reboot.
- **Web API (HTTP)**: Untuk perangkat yang mendukung reboot via antarmuka web (misalnya perangkat TP-Link tertentu).
Backend akan mencoba metode yang sesuai berdasarkan merek perangkat (`brand`).

**Modal Management:**
Pengguna dapat membuka Web Console perangkat di tab baru melalui URL `http://<ip_perangkat>`, serta menjalankan ping manual untuk verifikasi konektivitas.

---

### 4.5 Histori & Laporan Trafik

**Fungsi:**
Menyimpan dan menampilkan rekam jejak data trafik jaringan (TX/RX) dari waktu ke waktu per site.

**Tujuan:**
Memberikan gambaran tren penggunaan bandwidth jangka panjang, membantu analisis kapasitas jaringan, dan mendukung perencanaan infrastruktur ke depan.

**Cara Kerja & Teknologi:**

- Setiap kali backend berhasil mengambil data trafik dari router MikroTik, sampel tersebut langsung disimpan ke storage melalui fungsi `storage.recordTrafficSample()`.
- Data sampel trafik menggunakan model `TrafficSample` di MongoDB, yang menyimpan: `site`, `timestamp`, `txMbps`, `rxMbps`.
- Halaman **Laporan Trafik** di frontend mengambil data historis melalui REST API dan menampilkannya dalam bentuk grafik area (SVG) dengan sumbu waktu dan sumbu nilai trafik (Mbps).
- Pengguna dapat memilih site dan rentang waktu untuk melihat rekam jejak trafik pada periode tertentu.
- Metrik yang ditampilkan meliputi: nilai saat ini, rata-rata, dan puncak trafik pada rentang waktu yang dipilih.

**Penyimpanan:**
Data trafik historis disimpan di MongoDB Atlas sehingga tetap tersedia meskipun backend di-restart.

---

### 4.6 Laporan Gangguan & Maintenance

**Fungsi:**
Memungkinkan tim teknis untuk mencatat, mengelola, dan menelusuri setiap kejadian gangguan jaringan maupun kegiatan pemeliharaan yang telah dilakukan.

**Tujuan:**
Membangun dokumentasi operasional yang terstruktur sehingga setiap insiden dan tindakan dapat ditelusuri, dianalisis, dan dijadikan referensi di masa mendatang.

**Cara Kerja & Teknologi:**

- Laporan disimpan di koleksi `laporans` MongoDB menggunakan model `Laporan`.
- Setiap laporan mencakup field berikut:

| Field | Keterangan |
|---|---|
| `date` | Tanggal kejadian |
| `type` | Tipe: Jaringan / Printer-Komputer / Monitoring Kegiatan Khusus |
| `masalah` | Deskripsi masalah yang terjadi |
| `tindakan` | Tindakan penanganan yang dilakukan |
| `site` | Lokasi/site terkait |
| `technician` | Nama teknisi yang menangani |
| `gedung` | Gedung lokasi kejadian |
| `lantai` | Lantai lokasi kejadian |
| `ruangan` | Ruangan lokasi kejadian |
| `perangkatTerkait` | Perangkat yang terlibat |

- Backend menyediakan endpoint REST API untuk operasi CRUD laporan:
  - `GET /api/laporan` — mengambil semua laporan (dengan filter opsional).
  - `POST /api/laporan` — membuat laporan baru (EOS only).
  - `PUT /api/laporan/:id` — memperbarui laporan (EOS only).
  - `DELETE /api/laporan/:id` — menghapus laporan (EOS only).
- Frontend menampilkan laporan dalam tabel yang dapat difilter berdasarkan periode, site, dan tipe laporan.

---

### 4.7 Audit Log Aktivitas

**Fungsi:**
Mencatat setiap aktivitas penting yang dilakukan oleh pengguna maupun sistem secara otomatis, seperti login, reboot perangkat, penambahan/penghapusan perangkat, dan perubahan konfigurasi.

**Tujuan:**
Menjaga akuntabilitas dan keterlacakan setiap tindakan di dalam sistem, sehingga apabila terjadi kesalahan atau insiden, tim dapat menelusuri siapa yang melakukan apa dan kapan.

**Cara Kerja & Teknologi:**

- **Log sisi frontend (sesi aktif):** Setiap aksi yang dilakukan pengguna di halaman Monitoring — seperti reboot, tambah perangkat, edit, hapus — dicatat ke dalam `activityLogs` pada sesi Angular yang sedang berjalan. Log ini ditampilkan langsung di antarmuka dengan format: `[waktu] [user/role] [deskripsi aksi] [status: Success/Alert]`.

- **Log sisi sistem:** Sistem secara otomatis mencatat kejadian seperti:
  - Perangkat kembali Online setelah reboot.
  - Deteksi perangkat yang offline.
  - Kegagalan koneksi ke router MikroTik.

- **Persistensi (diperlukan untuk audit jangka panjang):** Log aktivitas yang bersifat permanen disimpan di MongoDB agar dapat diakses kembali setelah sesi berakhir.

- **Tampilan:** Log aktivitas ditampilkan di Dashboard (aktivitas sistem terkini) dan di halaman Pengguna (aktivitas per pengguna).

- **Format entri log:**
  ```
  Waktu | Aktor (user/role/system) | Deskripsi aksi | Status
  ```

---

### 4.8 User & Role Management

**Fungsi:**
Mengelola akun pengguna yang memiliki akses ke sistem NEXUS, termasuk pengaturan hak akses berdasarkan peran (role).

**Tujuan:**
Memastikan bahwa setiap pengguna hanya dapat mengakses fitur yang sesuai dengan tanggung jawabnya, sehingga keamanan dan integritas data sistem terjaga.

**Cara Kerja & Teknologi:**

**Autentikasi:**
- Pengguna login menggunakan username dan password.
- Backend memvalidasi kredensial dan menghasilkan **JWT (JSON Web Token)** yang dikirimkan ke frontend.
- Token JWT disimpan di `localStorage` browser dan disertakan pada setiap permintaan API yang memerlukan autentikasi.
- Token memiliki masa berlaku tertentu; setelah kedaluwarsa, pengguna diwajibkan login kembali.

**Otorisasi (RBAC — Role Based Access Control):**

Sistem memiliki dua role utama:

| Role | Deskripsi | Akses |
|---|---|---|
| **EOS** | Engineer On Site / Administrator | Akses penuh: monitoring, manajemen perangkat, laporan (buat/edit/hapus), manajemen pengguna, reboot perangkat |
| **Client** | Pengguna tamu / Pimpinan | Akses hanya-baca: melihat dashboard, status perangkat, dan laporan |

- Kontrol akses diterapkan di dua lapisan:
  1. **Backend:** Setiap endpoint yang bersifat memodifikasi data dilindungi oleh middleware autentikasi JWT dan pemeriksaan role.
  2. **Frontend:** Tombol dan menu aksi seperti "Tambah Perangkat", "Edit", "Hapus", "Reboot", dan "Tambah Laporan" hanya ditampilkan apabila role pengguna adalah EOS (`isClient === false`).

- Setiap pengguna dapat dikaitkan dengan akses site tertentu (misalnya hanya melihat data site Keperawatan) atau seluruh site (Semua site).

**Manajemen Pengguna (EOS only):**
- Menambah pengguna baru dengan menentukan nama, role, dan cakupan site.
- Melihat daftar semua pengguna beserta role dan waktu login terakhir.
- Melihat log aktivitas per pengguna.

---

## 5. Model Data

### 5.1 Device (Perangkat)

```
{
  status: 'Online' | 'Offline' | 'Degraded',
  type: 'Access Point' | 'Switch' | 'Router' | 'Server',
  name: String (required),
  brand: String,
  model: String,
  mac: String,
  ip: String (required),
  client: String,
  signal: String,
  siteLocation: String (required),
  gedung: String,
  lantai: String,
  ruangan: String,
  managementProvider: String,
  managementUrl: String,
  sshPort: Number,
  sshUsername: String,
  sshPassword: String,
  lastChecked: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### 5.2 Laporan

```
{
  date: String (required),
  type: 'Jaringan' | 'Printer / komputer' | 'Monitoring kegiatan khusus',
  masalah: String (required),
  tindakan: String (required),
  site: String (required),
  technician: String (required),
  gedung: String,
  lantai: String,
  ruangan: String,
  perangkatTerkait: String,
  createdAt: Date,
  updatedAt: Date
}
```

### 5.3 TrafficSample (Sampel Trafik Historis)

```
{
  site: String,
  timestamp: Date,
  txMbps: Number,
  rxMbps: Number
}
```

---

## 6. Keamanan & Akses

| Aspek | Implementasi |
|---|---|
| Autentikasi | JWT dengan masa berlaku token |
| Otorisasi | RBAC: EOS (penuh) / Client (hanya baca) |
| Akses API | Endpoint modifikasi data dilindungi middleware JWT |
| Kredensial Router | Disimpan di server-side (environment variable / `.env`), tidak pernah dikirim ke frontend |
| Kredensial SSH Perangkat | Disimpan terenkripsi di database, hanya digunakan oleh backend saat operasi reboot |
| Akses per Site | Pengguna dapat dibatasi hanya pada site tertentu |

---

*Dokumen ini disusun berdasarkan implementasi aktual sistem NEXUS yang sedang dikembangkan. Perubahan pada implementasi harus direfleksikan pada dokumen ini.*
