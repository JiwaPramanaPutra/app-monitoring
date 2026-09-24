# Nadi — Monitoring Jaringan & Infrastruktur

Sistem monitoring jaringan dan infrastruktur terpusat multi-site: trafik router
real-time, status perangkat, dan laporan pemeliharaan. Open source dan
self-hosted — tiap organisasi menjalankan instance-nya sendiri.

## Fitur

- **Monitoring trafik real-time** per site lewat MikroTik RouterOS API (TX/RX, peak, average)
- **Status perangkat** online/offline + latensi ICMP ping (polling otomatis)
- **Manajemen perangkat** (CRUD) dengan hierarki Project → Site → Gedung → Lantai → Ruangan
- **Histori trafik** (harian/mingguan/bulanan/tahunan/custom) + export CSV/JSON
- **Laporan gangguan & maintenance** + filter + export CSV
- **Notifikasi Telegram** saat perangkat terdeteksi offline (dan kembali online)
- **Autentikasi JWT** dengan peran **EOS** (akses penuh) dan **Client** (hanya-baca)
- **Penyimpanan ganda**: MongoDB, atau JSON lokal di `backend/data/` bila MongoDB tidak diset

## Prasyarat

- Node.js 24+ dan npm
- (Opsional) MongoDB — tanpa itu aplikasi berjalan dengan penyimpanan JSON lokal
- (Opsional) Docker + Docker Compose untuk self-host
- Koneksi jaringan/VPN ke router MikroTik dan perangkat yang dipantau,
  karena ping dan RouterOS API dijalankan dari server backend

## Mulai cepat (development)

```bash
# 1. Siapkan konfigurasi backend
cp backend/.env.example backend/.env
#    Wajib diisi: JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
#    Generate secret: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Backend (terminal 1)
cd backend
npm install
npm run dev            # http://localhost:3000

# 3. Frontend (terminal 2)
cd frontend
npm install
npm start              # http://localhost:4200
```

Login memakai `ADMIN_USERNAME` / `ADMIN_PASSWORD` yang Anda isi di `.env`.
Tambahkan `VIEWER_USERNAME` / `VIEWER_PASSWORD` (opsional) untuk akun Client
hanya-baca.

Data contoh (opsional):

```bash
cd backend && npm run seed:demo
```

## Docker Compose (self-host)

```bash
cp backend/.env.example backend/.env
#    Isi JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
docker compose up --build
```

Buka `http://localhost`.

- Compose menjalankan backend, frontend (nginx), dan MongoDB sekaligus.
- Secara default backend diarahkan ke MongoDB bawaan (`mongodb://mongo:27017/nadi`).
  Untuk memakai MongoDB eksternal, set `MONGO_URI` di environment shell atau file
  `.env` di root project sebelum `docker compose up`.
- Data JSON lokal backend tersimpan di `backend/data/` (volume), data MongoDB di
  volume `mongo-data`.

## Konfigurasi

Semua konfigurasi backend lewat environment (`backend/.env`). Ringkasnya:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `PORT` | tidak | Port backend (default `3000`) |
| `MONGO_URI` | tidak | Kosong = mode penyimpanan JSON lokal |
| `JWT_SECRET` | **ya** | Kunci penandatangan JWT — backend menolak start tanpanya |
| `JWT_EXPIRES_IN` | tidak | Masa berlaku token (default `12h`) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | **ya** | Akun role EOS (akses penuh) |
| `VIEWER_USERNAME`, `VIEWER_PASSWORD` | tidak | Akun role Client (hanya-baca) |
| `MIKROTIK_*` | tidak | Fallback global router; disarankan isi per-site lewat UI |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | tidak | Notifikasi Telegram |

Lihat `backend/.env.example` untuk daftar lengkap beserta komentarnya.

## Perintah

Backend (di `backend/`):

- `npm run dev` — dev server (nodemon)
- `npm run start` — server produksi
- `npm test` — unit test (Node built-in test runner)
- `npm run seed:demo` — isi data demo (project/site/perangkat fiktif)
- `npm run telegram:test` — kirim satu pesan uji Telegram

Frontend (di `frontend/`):

- `npm start` — dev server (proxy `/api` ke backend `:3000`)
- `npm run build` — build produksi ke `dist/frontend`
- `npm test` — unit test (Vitest)

Project-wide (root):

- `npm run verify` — backend + frontend tests, lalu build frontend

## Cara kerja singkat

- Frontend memanggil API lewat jalur relatif `/api/*`; saat development
  `frontend/proxy.conf.json` meneruskannya ke backend `:3000`, dan di Docker
  nginx yang mem-proxy. Tidak ada URL backend yang di-hardcode.
- Konfigurasi router disimpan per site (halaman **Project & Site**) atau lewat
  environment; backend tidak pernah mengirim kredensial router/perangkat ke frontend.
- Semua endpoint `/api/*` butuh JWT kecuali `/api/health` dan `/api/auth/login`.
  Operasi non-GET (tambah/ubah/hapus, termasuk ping manual) hanya untuk role EOS.

## Roadmap (backlog post-v1)

- Remote reboot perangkat (SSH/HTTP)
- Audit log aktivitas & manajemen pengguna tersimpan
- AI troubleshooting — membaca struktur dan konfigurasi jaringan untuk membantu
  diagnosis network engineer

## Lisensi

MIT — lihat [LICENSE](LICENSE).
