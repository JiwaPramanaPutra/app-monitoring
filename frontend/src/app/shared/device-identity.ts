/**
 * Aturan identitas perangkat.
 *
 * Dua hal yang mudah salah dan sudah terbukti memakan korban:
 * - **Kunci record**: dokumen Mongo hanya punya `_id`. Memakai `id` saja membuat
 *   kuncinya `undefined` untuk semua baris, dan `undefined === undefined` bernilai
 *   benar — satu klik membuka menu aksi seluruh baris.
 * - **Alamat**: satu IP hanya untuk satu perangkat per site. Dibatasi per site
 *   karena gedung berbeda umumnya memakai rentang privat yang sama.
 */

export interface DeviceIpCandidate {
  ip?: string;
  siteLocation?: string;
  id?: string | number;
  /** Dokumen Mongo hanya punya `_id`; mode JSON lokal menyimpan keduanya. */
  _id?: string | number;
  name?: string;
}

/**
 * Kunci identitas sebuah perangkat: `_id` lebih dulu, lalu `id`.
 *
 * Mengembalikan string kosong bila record tidak punya kunci sama sekali.
 * Pemanggil **wajib** memperlakukan kunci kosong sebagai "tidak ada baris yang
 * cocok", bukan sebagai nilai yang boleh dibandingkan — kalau tidak, seluruh
 * baris tanpa kunci akan cocok satu sama lain.
 */
export function deviceKey(
  device: { _id?: string | number | null; id?: string | number | null } | null | undefined
): string {
  if (!device) return '';
  const raw = device._id !== undefined && device._id !== null ? device._id : device.id;
  return raw === undefined || raw === null ? '' : String(raw);
}

// Nilai yang dipakai UI untuk "tidak ada IP", bukan alamat sungguhan.
const NO_IP = new Set(['', '—', '-', 'n/a', 'na', 'tidak ada']);

/** IP yang benar-benar terisi, bukan placeholder tabel. */
export function isUsableIp(ip: string | null | undefined): boolean {
  return !NO_IP.has(String(ip ?? '').trim().toLowerCase());
}

/**
 * Perangkat lain di **site yang sama** yang sudah memakai `ip`, atau `null`.
 * `excludeId` dipakai saat mengedit supaya perangkat itu tidak dianggap bentrok
 * dengan dirinya sendiri.
 */
export function findDuplicateIp(
  devices: DeviceIpCandidate[] | null | undefined,
  ip: string | null | undefined,
  siteName: string,
  excludeId?: string | number
): DeviceIpCandidate | null {
  if (!isUsableIp(ip)) return null;

  const target = String(ip ?? '').trim().toLowerCase();
  const site = String(siteName ?? '').trim();
  const excluded = excludeId === undefined ? null : String(excludeId);

  const match = (Array.isArray(devices) ? devices : []).find(d => {
    if (!d || String(d.siteLocation ?? '').trim() !== site) return false;
    // Bandingkan ke `id` MAUPUN `_id`: dokumen Mongo tidak punya `id`, sehingga
    // memeriksa `id` saja membuat perangkat dianggap bentrok dengan dirinya
    // sendiri dan setiap edit yang mempertahankan IP ditolak.
    if (excluded !== null && (String(d.id ?? '') === excluded || String(d._id ?? '') === excluded)) {
      return false;
    }
    return isUsableIp(d.ip) && String(d.ip ?? '').trim().toLowerCase() === target;
  });

  return match || null;
}
