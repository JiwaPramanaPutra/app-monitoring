# NEXUS (Nadi) - Project Overview

<!-- blueprint:source-hash 99c73b7d98637217cf89ce840ac237677a87e89e2cfcbe429408629b21433fb1 -->

> Sistem monitoring jaringan & infrastruktur terpusat multi-site, open source & self-hosted: trafik router real-time, status perangkat, dan laporan pemeliharaan.

## Problem

Kondisi perangkat jaringan dan infrastruktur di beberapa site belum terpantau terpusat, sehingga anomali trafik, perangkat offline, dan riwayat pemeliharaan sulit dideteksi dan ditelusuri. Sistem ini menyatukan monitoring trafik, status perangkat, dan pencatatan laporan gangguan dalam satu dashboard.

## Users

Sasaran publik: open source & self-hosted - organisasi mana pun yang mengelola jaringan multi-site dapat deploy instance sendiri.

- **EOS (Engineer On Site)** - teknisi lapangan; akses penuh: monitoring, manajemen perangkat, laporan, konfigurasi, dan manajemen pengguna.
- **Client** - pimpinan/tamu; akses hanya-baca ke dashboard, status jaringan, dan laporan.

Akses dibatasi per role (EOS vs Client) dan dapat dibatasi per site.

## Usage model

- Proyek open source; tidak untuk dimonetisasi secara langsung.
- Setiap organisasi men-deploy instance sendiri (self-hosted); data dan kredensial tetap di infrastruktur masing-masing.
- Sistem memerlukan koneksi jaringan lokal/VPN ke router MikroTik dan perangkat lain agar fungsi RouterOS API dan ICMP ping dapat berjalan.

## Features

1. **Autentikasi & RBAC** - Login JWT dan pemisahan akses EOS (Admin) & Client (Viewer).
2. **Monitoring Trafik Real-time** (headline) - Integrasi RouterOS API untuk grafik TX/RX per site.
3. **Monitoring Status & Ping** - Polling otomatis ping untuk deteksi perangkat offline dan latensi.
4. **Device Management** - CRUD perangkat jaringan dan fungsi remote reboot (SSH/HTTP).
5. **Histori Trafik** - Penyimpanan sampel trafik dan grafik laporan historis.
6. **Laporan Gangguan** - Pencatatan tiket/laporan maintenance oleh teknisi.
7. **Audit Log & User Management** (post-v1) - Pencatatan log aktivitas dan CRUD pengguna.
8. **Notifikasi Telegram/WhatsApp** - Alert otomatis saat perangkat terdeteksi offline.
9. **Sanitasi Data & Site Dinamis** - Hapus data institusi dari kode dan seed; daftar site jadi data dari koleksi Project; API base URL configurable.
10. **Rampungkan Fitur Setengah Jadi** - Export CSV laporan, keputusan reboot & Telegram, perilaku saat database offline.
12. **Packaging Self-Host** - README, `.env.example`, LICENSE, Docker Compose, dan demo seed.

Backlog (bukan MVP): AI troubleshooting - AI membaca struktur dan konfigurasi jaringan untuk membantu network engineer mendiagnosis masalah.

## Data model

### Device

- `name`, `type` (Access Point / Switch / Router / Server), `brand`, `model`, `mac`, `ip`
- `status` (Online / Offline / Degraded), `client`, `signal`, `lastChecked`
- Lokasi: `siteLocation`, `gedung`, `lantai`, `ruangan`
- Manajemen: `managementProvider`, `managementUrl`
- Kredensial SSH: `sshPort`, `sshUsername`, `sshPassword`

### Laporan

- `date`, `type` (Jaringan / Printer-komputer / Monitoring kegiatan khusus)
- `masalah`, `tindakan`, `technician`
- Lokasi: `site`, `gedung`, `lantai`, `ruangan`, `perangkatTerkait`

### TrafficSample

- `site`, `timestamp`, `txMbps`, `rxMbps` - satu sampel per polling per site

### Site (hierarki lokasi)

- `name` site: Direktorat, Gigi, Keperawatan, Gizi, Kebidanan
- Tiap site punya gedung -> lantai -> ruangan; dipakai Device, Laporan, dan akses User
- Konfigurasi router per site (host, port, interface) untuk fitur 2

### User

- `name`, `role` (EOS / Client), `siteAccess` (site tertentu atau semua site), `lastLogin`

### AuditLog

- `timestamp`, `actor` (user/role/system), `action`, `status`

> Shape Device, Laporan, TrafficSample, dan Site dipakai fitur 2-6. User & AuditLog dipakai fitur 1 dan 7.

## Tech stack

- **Frontend:** Angular v22 (standalone components) - dashboard dan halaman monitoring
- **Backend:** Node.js + Express.js - REST API, polling, integrasi perangkat
- **Database:** MongoDB (via Mongoose) - device, laporan, sampel trafik
- **API:** REST API
- **Network integration:** MikroTik RouterOS API (port 8728), ssh2 (reboot), ICMP ping
- **Auth:** JWT

## Monetization

Proyek open source; tidak untuk dimonetisasi secara langsung.

## UI/UX

Dashboard terpusat: widget trafik real-time, tabel perangkat dengan status warna (Hijau = Online, Merah = Offline), dan grafik historis yang responsif.

- `/login` - autentikasi
- `/dashboard` - KPI ringkasan, grafik trafik, status kesehatan per site
- `/monitoring` - trafik router + tabel perangkat per site, aksi khusus EOS
- `/laporan-trafik` - grafik historis TX/RX dan export
- `/laporan` - tabel dan input laporan gangguan
- `/project-site` - pengelolaan project dan hierarki site
- `/pengguna` - manajemen pengguna dan log aktivitas (EOS)

## Deployment

Model open source & self-hosted: tiap organisasi deploy instance sendiri.

- **Backend:** Node.js server
- **Frontend:** Angular build server (folder `dist`)
- **Paket:** Docker Compose (backend + frontend + MongoDB) - direncanakan
- **Konektivitas:** jaringan lokal/VPN ke router dan perangkat (lihat Usage model)

## Open questions

> - Fitur build-plan #8 (Notifikasi Telegram/WhatsApp) belum ada padanannya di project-plan §3.
