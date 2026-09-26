/**
 * Warna status perangkat.
 *
 * Ada **tiga** keadaan, bukan dua. `Tidak Terpantau` berarti server tidak bisa
 * menjangkau perangkat — itu bukan bukti perangkatnya mati (bisa jadi memang
 * tidak ada jalur ke sub-jaringannya, seperti AP di jaringan lain), jadi tidak
 * boleh diwarnai merah seperti `Offline`.
 */

export type DeviceStatus = 'Online' | 'Offline' | 'Tidak Terpantau';

const HIJAU = '#5B7A52';
const MERAH = '#C4442E';
const ABU = '#9AA0A6';

/** Warna titik dan teks status. */
export function deviceStatusColor(status: string | null | undefined): string {
  if (status === 'Online') return HIJAU;
  if (status === 'Offline') return MERAH;
  // Termasuk status yang belum dikenal: jangan mengklaim merah.
  return ABU;
}

/** Hanya `Offline` yang layak diberi latar peringatan di tabel. */
export function deviceStatusIsDown(status: string | null | undefined): boolean {
  return status === 'Offline';
}
