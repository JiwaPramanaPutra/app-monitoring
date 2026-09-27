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

/**
 * Tangga langkah grid sumbu Y (Mbps). Batas atas sumbu selalu `langkah × 4`
 * supaya lima label grid (0, ¼, ½, ¾, 1) tetap angka yang bulat.
 */
export const CHART_STEP_LADDER = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000];

/**
 * Batas atas sumbu Y yang mengikuti data, bukan lantai keras.
 *
 * Data kecil (mis. 0–2 Mbps) dulu menempel di dasar grafik karena skala selalu
 * minimal 300 Mbps. Sekarang: langkah grid terkecil yang menutup `data + 10%`
 * ruang kepala. Nilai kosong/tidak masuk akal -> 10 Mbps; nilai di atas tangga
 * dibulatkan ke ribuan berikutnya. Hasilnya SELALU >= data (tidak memotong).
 */
export function niceChartCeiling(maxValue: number): number {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 10;
  const target = maxValue * 1.1;
  for (const step of CHART_STEP_LADDER) {
    const ceiling = step * 4;
    if (ceiling >= target) return ceiling;
  }
  return Math.ceil(target / 1000) * 1000;
}
