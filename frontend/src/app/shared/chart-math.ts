/**
 * Aritmetika grafik trend Laporan Trafik, dipisah sebagai fungsi murni supaya
 * bisa diuji tanpa DOM.
 *
 * Grafiknya SVG dengan `preserveAspectRatio="none"` dan semua titik berjarak
 * sama (`stepX = lebar/(n-1)`), jadi pemetaan kursor cukup satu pembagian.
 */

export interface ChartPointLike {
  samples?: number;
}

/** Perataan kotak tooltip terhadap titiknya. */
export type TooltipAlign = 'left' | 'center' | 'right';

/** Indeks titik terdekat dari posisi kursor (`ratio` = 0..1 terhadap lebar grafik). */
export function indexFromRatio(ratio: number, pointCount: number): number {
  if (pointCount <= 1) return 0;
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  return Math.round(clamped * (pointCount - 1));
}

/** Posisi titik pada viewBox 0..100. */
export function leftPercent(index: number, pointCount: number): number {
  if (pointCount <= 1) return 0;
  return (index / (pointCount - 1)) * 100;
}

/**
 * Perataan tooltip: menempel kiri di dekat tepi kiri, membalik ke kiri di dekat
 * tepi kanan, sisanya di tengah.
 *
 * Tanpa mode kiri, tooltip untuk titik-titik awal terpotong oleh pembungkus yang
 * memakai `overflow-x: auto` — tepi kanan sudah aman, tepi kiri belum.
 */
export function alignFor(left: number): TooltipAlign {
  if (left < 12) return 'left';
  if (left > 75) return 'right';
  return 'center';
}

/** Indeks titik terakhir yang punya sample, atau -1 bila tidak ada. */
export function lastIndexWithData(points: ChartPointLike[] | null | undefined): number {
  const list = Array.isArray(points) ? points : [];
  let last = -1;
  list.forEach((p, i) => {
    if (((p && p.samples) || 0) > 0) last = i;
  });
  return last;
}

/**
 * Berapa titik yang tidak punya sample, dihitung sampai `limitIndex` (inklusif).
 * `limitIndex` adalah indeks terakhir yang dianggap sudah terjadi; nilai negatif
 * berarti tidak ada yang bisa dihitung.
 */
export function countMissing(points: ChartPointLike[] | null | undefined, limitIndex: number): number {
  const list = Array.isArray(points) ? points : [];
  if (limitIndex < 0 || list.length === 0) return 0;

  const end = Math.min(limitIndex, list.length - 1);
  let missing = 0;
  for (let i = 0; i <= end; i++) {
    if (((list[i] && list[i].samples) || 0) === 0) missing++;
  }
  return missing;
}

/**
 * Batas indeks yang dianggap "sudah terjadi".
 *
 * Nilainya yang LEBIH JAUH antara titik terakhir yang berisi data dan slot waktu
 * "sekarang":
 * - berhenti di titik terakhir saja -> celah setelahnya (mis. gangguan siang ini
 *   yang menghentikan sample) hilang dari hitungan;
 * - berhenti di slot terakhir saja -> jam/bulan yang belum lewat dihitung sebagai
 *   data hilang.
 */
export function missingLimit(lastWithData: number, currentSlot: number): number {
  return Math.max(lastWithData, currentSlot);
}
