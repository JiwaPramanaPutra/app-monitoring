# Build Plan

## Your features

- [x] 1. **Autentikasi & RBAC** - Login JWT dan pemisahan akses EOS (Admin) & Client (Viewer)
- [x] 2. **Monitoring Trafik Real-time** - Integrasi RouterOS API untuk grafik TX/RX per site
- [x] 3. **Monitoring Status & Ping** - Polling otomatis ping untuk deteksi perangkat offline dan latensi
- [x] 4. **Device Management** - CRUD perangkat jaringan dan fungsi remote reboot (SSH/HTTP)
- [x] 5. **Histori Trafik** - Penyimpanan sampel trafik dan grafik laporan historis
- [x] 6. **Laporan Gangguan** - Pencatatan tiket/laporan maintenance oleh teknisi
- [ ] 7. **Audit Log & User Management** - Pencatatan log aktivitas dan CRUD pengguna (post-v1)
- [ ] 8. **Notifikasi Telegram/WhatsApp** - Alert otomatis saat perangkat terdeteksi offline
- [x] 9. **Sanitasi Data & Site Dinamis** - Hapus kredensial/IP/MAC/nama institusi dari kode dan seed; daftar site jadi data dari koleksi Project; API base URL configurable
- [ ] 10. **Rampungkan Fitur Setengah Jadi** - Export CSV laporan, keputusan reboot & notifikasi Telegram (#8), perilaku saat database offline
- [ ] 12. **Packaging Self-Host** - README setup, .env.example, LICENSE, Docker Compose, dan demo seed
