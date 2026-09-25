/**
 * Aritmetika jendela periode Laporan Trafik.
 *
 * Seluruh halaman — ringkasan uptime, log downtime, probe sample, input tanggal,
 * grafik, dan ekspor — wajib memakai SATU jendela. Fungsi-fungsi ini sengaja
 * diekstrak supaya "satu jendela" bisa diuji, bukan sekadar disepakati lewat
 * komentar: dua salinan yang mirip adalah persis cara jendela berbeda muncul.
 *
 * **WIB = Asia/Jakarta = UTC+7.** Bukan Asia/Makassar (WITA, UTC+8). Backend
 * menafsirkan `startDate`/`endDate` sebagai hari WIB (`rangeBounds` memakai
 * `+07:00`) dan menerbitkan label bucket dengan offset yang sama (`toWIB`), jadi
 * offset di sini harus sama persis. Selisih satu jam membuat ringkasan dan log
 * memilih serta memotong event pada jam yang berbeda dari grafik dan probe, dan
 * membuat penyebut uptime satu jam terlalu panjang.
 */

/** WIB = UTC+7. Satu-satunya definisi offset di frontend. */
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface PeriodWindow {
  /** Instan batas jendela, dipakai memilih dan memotong event. */
  start: Date;
  end: Date;
  /** Tanggal `YYYY-MM-DD` menurut kalender WIB, siap dikirim ke endpoint riwayat. */
  startDate: string;
  endDate: string;
}

/** Awal hari WIB untuk tanggal kalender WIB. */
export function wibDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - WIB_OFFSET_MS);
}

/** Bagian kalender WIB dari sebuah instan. */
export function wibParts(date: Date): { y: number; m: number; d: number; h: number } {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours()
  };
}

/** `YYYY-MM-DD` menurut kalender WIB — bukan kalender browser. */
export function wibDateString(date: Date): string {
  const { y, m, d } = wibParts(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Ubah `YYYY-MM-DD` (hari WIB) menjadi instan awal hari itu. */
export function parseWibDay(value: string): Date {
  const [y, m, d] = String(value).split('-').map(Number);
  return wibDayStart(Number.isFinite(y) ? y : 1970, (Number.isFinite(m) ? m : 1) - 1, Number.isFinite(d) ? d : 1);
}

/**
 * Jendela periode aktif.
 *
 * `custom` memakai tanggal yang dipilih pengguna — keduanya sudah hari WIB, dan
 * hari terakhirnya inklusif sampai `23:59:59.999` WIB. Periode lain dihitung
 * dari kalender WIB "sekarang" dan berakhir tepat di `now`.
 */
export function periodWindow(
  period: string,
  now: Date,
  customStart?: string | null,
  customEnd?: string | null
): PeriodWindow {
  const today = wibParts(now);
  let startDay = wibDayStart(today.y, today.m, today.d);

  switch (period) {
    case 'harian':
      break;
    case 'mingguan':
      // "7 hari terakhir" termasuk hari ini.
      startDay = new Date(startDay.getTime() - 6 * DAY_MS);
      break;
    case 'bulanan':
      // "30 hari terakhir" termasuk hari ini.
      startDay = new Date(startDay.getTime() - 29 * DAY_MS);
      break;
    case 'tahunan':
      // Labelnya "Tahun ini", jadi mulai 1 Januari tahun berjalan.
      startDay = wibDayStart(today.y, 0, 1);
      break;
    case 'custom':
      if (customStart && customEnd) {
        return {
          start: parseWibDay(customStart),
          end: new Date(parseWibDay(customEnd).getTime() + DAY_MS - 1),
          startDate: customStart,
          endDate: customEnd
        };
      }
      startDay = new Date(startDay.getTime() - DAY_MS);
      break;
    default:
      startDay = new Date(startDay.getTime() - DAY_MS);
  }

  return {
    start: startDay,
    end: now,
    startDate: wibDateString(startDay),
    endDate: wibDateString(now)
  };
}

/**
 * Event beririsan dengan jendela?
 *
 * Dipakai ringkasan uptime DAN log downtime. Dua predikat terpisah — satu
 * menyaring berdasarkan waktu mulai, satu berdasarkan tumpang tindih — adalah
 * cara gangguan yang melewati tengah malam menurunkan uptime tanpa muncul di log.
 */
export function overlapsWindow(startMs: number, endMs: number, window: PeriodWindow): boolean {
  return endMs >= window.start.getTime() && startMs <= window.end.getTime();
}

/** Detik sebuah event yang jatuh DI DALAM jendela, dipotong ke batasnya. */
export function clipSeconds(startMs: number, endMs: number, window: PeriodWindow): number {
  const from = Math.max(startMs, window.start.getTime());
  const to = Math.min(endMs, window.end.getTime());
  return (to - from) / 1000;
}

/**
 * Nama bulan singkat yang dipakai backend sebagai label bucket `tahunan`
 * (`aggregateSamples`). Sengaja daftar tetap, bukan `Intl`: dengan locale
 * `en-GB`, `Intl` mengembalikan `"Sept"` untuk September sehingga pencocokan
 * label `"Sep"` milik backend selalu gagal dan batas hitung celah mundur ke
 * sample terakhir.
 */
export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Indeks titik grafik yang mewakili "sekarang", atau -1 bila periode ini tidak
 * punya slot waktu (mis. `bulanan`/`custom`).
 *
 * Label datang dari backend yang mengelompokkan per WIB, jadi zona di sini juga
 * harus WIB — memakai WITA membuat batas hitung celah meleset satu slot.
 */
export function currentSlot(period: string, labels: string[] | null | undefined, now: Date): number {
  const list = Array.isArray(labels) ? labels : [];

  if (period === 'harian') {
    const hour = String(wibParts(now).h).padStart(2, '0');
    return list.findIndex(l => String(l).trim().startsWith(`${hour}:`));
  }

  if (period === 'tahunan') {
    const name = MONTH_LABELS[wibParts(now).m];
    return list.findIndex(l => String(l).trim().toLowerCase() === name.toLowerCase());
  }

  return -1;
}
