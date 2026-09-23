# Project Plan

## 1. Problem - What problem are we solving?
Memantau kondisi perangkat jaringan dan infrastruktur secara terpusat untuk mendeteksi anomali trafik, perangkat offline, dan mengelola laporan pemeliharaan di berbagai site (Direktorat, Gigi, Keperawatan, Gizi, Kebidanan).

## 2. Users - Who is this for?
Sasaran publik: open source & self-hosted - organisasi mana pun yang mengelola jaringan multi-site bisa deploy instance sendiri.

- **EOS (Engineer On Site):** Teknisi lapangan dengan akses penuh untuk monitoring, manajemen perangkat, laporan, dan konfigurasi.
- **Client:** Pengguna (Pimpinan/Tamu) dengan akses terbatas (hanya-baca) untuk melihat dashboard dan laporan.

## 3. Features - What does the MVP need?
- Autentikasi & Otorisasi RBAC (EOS vs Client)
- Real-Time Monitoring Trafik Router (TX/RX) via MikroTik API
- Monitoring Status Perangkat (Online/Offline) via Ping
- Monitoring Latensi (Ping Time)
- Device Management (CRUD & Reboot via SSH/Web)
- Histori & Laporan Trafik (Grafik Historis)
- Laporan Gangguan & Maintenance (CRUD)
- Audit Log Aktivitas Sistem & Pengguna
- User & Role Management

Backlog (bukan MVP): AI troubleshooting - AI membaca struktur dan konfigurasi jaringan untuk membantu network engineer mendiagnosis masalah.

## 4. Data - What are we storing?
- Data Perangkat (Device: nama, tipe, merek, model, mac, ip, lokasi, credentials ssh, dll)
- Data Laporan (Gangguan, tindakan, teknisi, lokasi)
- Data Sampel Trafik (TrafficSample: TX/RX per site per waktu)
- Data Pengguna: v1 memakai akun dari environment (admin + viewer opsional); penyimpanan user + akses per-site menyusul post-v1
- Audit Logs (Aktivitas user dan sistem)

## 5. Tech - What stack are we using?
- **Frontend:** Angular v22 (Standalone Components)
- **Backend:** Node.js + Express.js
- **Database:** MongoDB (via Mongoose)
- **API:** REST API
- **Network Integration:** MikroTik RouterOS API (port 8728) / ssh2 / ping
- **Auth:** JWT

## 6. Monetize - How will this make money?
Proyek internal/infrastruktur, tidak untuk dimonetisasi secara langsung.

## 7. UI/UX - How should this look and feel?
Dashboard terpusat dengan widget trafik real-time, tabel perangkat dengan status warna (Hijau=Online, Merah=Offline), dan grafik historis yang responsif.

## 8. Deployment - Where and how will this ship?
Model: open source, self-hosted - tiap organisasi deploy instance sendiri.

- **Backend:** Node.js server
- **Frontend:** Angular build server (dist folder)
- **Paket:** Docker Compose (backend + frontend + MongoDB) - direncanakan

## 9. Usage model and constraints (optional)
Diperlukan koneksi jaringan lokal/VPN ke router MikroTik dan perangkat lain agar fungsi ping dan RouterOS API dapat berjalan.
