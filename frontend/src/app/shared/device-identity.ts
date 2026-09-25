/**
 * Aturan identitas perangkat: satu IP hanya boleh dipakai satu perangkat di
 * site yang sama.
 *
 * Sengaja dibatasi per site. Gedung/site berbeda umumnya memakai rentang privat
 * yang sama (192.168.x.x, 10.x.x.x), jadi membandingkan lintas site akan menolak
 * konfigurasi yang sah.
 */

export interface DeviceIpCandidate {
  ip?: string;
  siteLocation?: string;
  id?: string | number;
  /** Dokumen Mongo hanya punya `_id`; mode JSON lokal menyimpan keduanya. */
  _id?: string | number;
  name?: string;
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
