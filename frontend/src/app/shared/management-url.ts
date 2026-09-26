import { isUsableIp } from './device-identity';

/**
 * URL console manajemen sebuah perangkat.
 *
 * Sebelumnya modal "Buka Management" selalu membuka `http://<ip>` (port 80) dan
 * menulis "Provider: Ruijie Cloud" untuk semua perangkat, sehingga router
 * MikroTik — WebFig dan Winbox-nya di 8291 — tidak pernah terbuka. Dua kolom
 * `managementUrl`/`managementProvider` ada di model tapi tidak dipakai sama
 * sekali.
 */

export interface ManagementTarget {
  ip?: string;
  type?: string;
  brand?: string;
  /** Diisi pengguna di form perangkat. */
  managementUrl?: string;
}

/**
 * Tambahkan skema bila pengguna mengetik tanpa itu.
 *
 * Defaultnya **http**, bukan https: WebFig MikroTik di 8291 memakai http, dan
 * `https://` harus diketik eksplisit bila memang itu yang dipakai.
 */
export function normalizeManagementUrl(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  return `http://${value}`;
}

/**
 * URL yang harus dibuka untuk perangkat ini.
 *
 * Urutan: `managementUrl` yang diisi pengguna, lalu turunan dari merek, lalu
 * `http://<ip>` biasa. Mengembalikan string kosong bila tidak ada yang bisa
 * dibuka — pemanggil wajib menanganinya, bukan membuka halaman kosong.
 */
export function managementUrlFor(device: ManagementTarget | null | undefined): string {
  if (!device) return '';

  const explicit = normalizeManagementUrl(device.managementUrl);
  if (explicit) return explicit;

  const ip = String(device.ip ?? '').trim();
  if (!isUsableIp(ip)) return '';

  const brand = String(device.brand ?? '').trim().toLowerCase();

  // RouterOS: WebFig dan Winbox sama-sama di 8291; port 80 kosong di sana.
  if (brand.includes('mikrotik')) return `http://${ip}:8291`;
  // eweb Ruijie memakai TLS.
  if (brand.includes('ruijie')) return `https://${ip}`;

  return `http://${ip}`;
}

/** Label provider yang ditampilkan di modal: merek dan tipe yang sebenarnya. */
export function managementLabel(device: ManagementTarget | null | undefined): string {
  if (!device) return '';
  const brand = String(device.brand ?? '').trim();
  const type = String(device.type ?? '').trim();
  return [brand, type].filter(Boolean).join(' ') || 'Perangkat';
}

export type ManagementActionKind = 'web' | 'cloud' | 'winbox';

export interface ManagementAction {
  kind: ManagementActionKind;
  label: string;
  url: string;
  /** Batasan yang harus diketahui pengguna sebelum menekan tombolnya. */
  note?: string;
}

/** Apakah URL ini menunjuk ke alamat IP, bukan nama domain? */
function isIpHost(url: string): boolean {
  return /^https?:\/\/\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/i.test(url);
}

/**
 * Aksi management yang benar-benar tersedia untuk sebuah perangkat.
 *
 * Sengaja berupa daftar, bukan satu URL: jalur yang bisa diandalkan berbeda per
 * merek, dan tidak semuanya bisa dijalankan browser.
 *
 * - **Web/Portal selalu aksi utama.** Kalau URL yang diisi pengguna menunjuk
 *   domain (mis. portal Ruijie Cloud), labelnya "Buka Portal Cloud" — aplikasi
 *   tidak bisa menebak tautan perangkat di cloud, hanya pengguna yang tahu.
 * - **Winbox hanya untuk MikroTik, dan hanya sebagai aksi kedua.** Skema
 *   `winbox://` tidak dikenali browser kecuali Windows sudah punya handler-nya;
 *   di komputer pengembangan aplikasi ini handler itu TIDAK ada meski Winbox
 *   terpasang (diverifikasi dari registri Windows). Menjadikannya satu-satunya
 *   jalan berarti tombol yang tidak melakukan apa-apa.
 */
export function managementActions(device: ManagementTarget | null | undefined): ManagementAction[] {
  const actions: ManagementAction[] = [];
  if (!device) return actions;

  const web = managementUrlFor(device);
  if (web) {
    actions.push({
      kind: isIpHost(web) ? 'web' : 'cloud',
      label: isIpHost(web) ? 'Buka Web Console' : 'Buka Portal Cloud',
      url: web
    });
  }

  const ip = String(device.ip ?? '').trim();
  const brand = String(device.brand ?? '').trim().toLowerCase();
  if (brand.includes('mikrotik') && isUsableIp(ip)) {
    actions.push({
      kind: 'winbox',
      label: 'Buka di Winbox',
      url: `winbox://${ip}`,
      note: 'Berfungsi hanya bila Windows sudah punya handler winbox:// terpasang. Kalau belum, tombol ini tidak membuka apa pun — pakai Web Console (port 8291).'
    });
  }

  return actions;
}
