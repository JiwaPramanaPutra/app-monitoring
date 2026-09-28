/**
 * Aritmetika jendela periode Laporan Trafik.
 *
 * Seluruh halaman — ringkasan uptime, log downtime, probe sample, input tanggal,
 * grafik, dan ekspor — wajib memakai SATU jendela. Fungsi-fungsi ini sengaja
 * diekstrak supaya "satu jendela" bisa diuji, bukan sekadar disepakati lewat
 * komentar: dua salinan yang mirip adalah persis cara jendela berbeda muncul.
 *
 * Zona waktunya milik PENGGUNA: fungsi menerima `tz` IANA dan menghitung offset
 * PER TANGGAL lewat `Intl` (bukan offset tetap), sehingga `Asia/Makassar` dan
 * zona ber-DST tetap benar. Default-nya zona browser; `Asia/Jakarta` (WIB) tetap
 * fallback backend dan dipakai `toWIB`-style helper lama. Backend menafsirkan
 * `startDate`/`endDate` sebagai hari di tz yang sama dan menerbitkan label
 * bucket dengan offset yang sama, jadi selisih satu jam membuat ringkasan, log,
 * dan grafik memilih serta memotong hari yang berbeda.
 */

/** Zona default dan fallback bila browser tidak memberi IANA yang dikenal. */
export const DEFAULT_TIME_ZONE = 'Asia/Jakarta';

/** WIB = UTC+7. Dipertahankan sebagai konstanta fallback yang diuji. */
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface PeriodWindow {
  /** Instan batas jendela, dipakai memilih dan memotong event. */
  start: Date;
  end: Date;
  /** Tanggal `YYYY-MM-DD` menurut kalender `tz`, siap dikirim ke endpoint riwayat. */
  startDate: string;
  endDate: string;
}

const WALL_CLOCK_PARTS: Intl.DateTimeFormatOptions = {
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
};

// Satu formatter per zona: `Intl.DateTimeFormat` mahal dibuat ulang, dan
// fungsi-fungsi ini dipanggil berkali-kali per render.
const formatterByZone = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let formatter = formatterByZone.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...WALL_CLOCK_PARTS });
    formatterByZone.set(tz, formatter);
  }
  return formatter;
}

function wallClockParts(date: Date, tz: string): Record<string, number> {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(tz).formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts;
}

/** Apakah `tz` nama zona IANA yang dikenal `Intl`? */
export function isValidTimeZone(tz: string | null | undefined): boolean {
  if (typeof tz !== 'string' || tz.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Zona browser bila tersedia; selain itu WIB. */
export function browserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Zona untuk perhitungan: input valid, selain itu WIB — bukan zona browser. */
function safeZone(tz: string | null | undefined): string {
  return isValidTimeZone(tz) ? (tz as string) : DEFAULT_TIME_ZONE;
}

/**
 * Offset (ms) zona `tz` PADA INSTAN `date` — bukan offset tetap.
 *
 * Dihitung dari dinding jam `Intl` untuk tanggal itu supaya zona ber-DST benar,
 * dan supaya Jakarta selalu sama dengan `WIB_OFFSET_MS`.
 */
export function tzOffsetMs(date: Date, tz: string): number {
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return 0;

  const parts = wallClockParts(date, safeZone(tz));
  const wallMs = Date.UTC(parts['year'], parts['month'] - 1, parts['day'], parts['hour'], parts['minute'], parts['second']);
  // Buang milidetik: `formatToParts` tidak mengembalikannya, dan sisanya akan
  // tampak sebagai offset yang bukan kelipatan detik.
  const wholeMs = ms - ((ms % 1000) + 1000) % 1000;
  return wallMs - wholeMs;
}

/** Bagian kalender zona `tz` dari sebuah instan. */
export function tzParts(date: Date, tz: string): { y: number; m: number; d: number; h: number } {
  const parts = wallClockParts(date, safeZone(tz));
  return {
    y: parts['year'],
    m: parts['month'] - 1,
    d: parts['day'],
    h: parts['hour']
  };
}

/** Awal hari kalender `tz` untuk tanggal itu. */
export function tzDayStart(year: number, month: number, day: number, tz: string): Date {
  const zone = safeZone(tz);
  const utcDay = Date.UTC(year, month, day);
  // Dua langkah: tebakan pertama memakai offset di UTC, tebakan kedua memakai
  // offset di instan hasil — cukup untuk batas DST tanpa iterasi tak berujung.
  const firstGuess = utcDay - tzOffsetMs(new Date(utcDay), zone);
  return new Date(utcDay - tzOffsetMs(new Date(firstGuess), zone));
}

/** `YYYY-MM-DD` menurut kalender `tz` — bukan kalender browser. */
export function tzDateString(date: Date, tz: string): string {
  const { y, m, d } = tzParts(date, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Ubah `YYYY-MM-DD` (hari `tz`) menjadi instan awal hari itu. */
export function parseTzDay(value: string, tz: string): Date {
  const [y, m, d] = String(value).split('-').map(Number);
  return tzDayStart(
    Number.isFinite(y) ? y : 1970,
    (Number.isFinite(m) ? m : 1) - 1,
    Number.isFinite(d) ? d : 1,
    tz
  );
}

/**
 * Akhir hari `YYYY-MM-DD` di zona `tz` (`23:59:59.999`), dihitung dari awal hari
 * BERIKUTNYA supaya hari ber-DST yang panjangnya 23/25 jam tetap benar.
 */
export function tzEndOfDay(value: string, tz: string): Date {
  const [y, m, d] = String(value).split('-').map(Number);
  const nextUtc = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStart = tzDayStart(nextUtc.getUTCFullYear(), nextUtc.getUTCMonth(), nextUtc.getUTCDate(), tz);
  return new Date(nextStart.getTime() - 1);
}

/**
 * Jendela periode aktif.
 *
 * `custom` memakai tanggal yang dipilih pengguna — keduanya sudah hari `tz`, dan
 * hari terakhirnya inklusif sampai `23:59:59.999` zona itu. Periode lain
 * dihitung dari kalender `tz` "sekarang" dan berakhir tepat di `now`.
 * `tz` default-nya zona browser; nilai tak dikenal jatuh ke WIB.
 */
export function periodWindow(
  period: string,
  now: Date,
  customStart?: string | null,
  customEnd?: string | null,
  tz: string = browserTimeZone()
): PeriodWindow {
  const zone = safeZone(tz);
  const today = tzParts(now, zone);
  let startDay = tzDayStart(today.y, today.m, today.d, zone);

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
      startDay = tzDayStart(today.y, 0, 1, zone);
      break;
    case 'custom':
      if (customStart && customEnd) {
        return {
          start: parseTzDay(customStart, zone),
          end: tzEndOfDay(customEnd, zone),
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
    startDate: tzDateString(startDay, zone),
    endDate: tzDateString(now, zone)
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
 * Format tanggal `YYYY-MM-DD` menjadi `1 Sep 2026`.
 *
 * Sengaja **tidak** membentuk objek `Date` sama sekali. `new Date('2026-09-01')`
 * ditafsirkan sebagai tengah malam UTC, dan memformatnya dengan getter lokal
 * membuat labelnya terbaca 31 Agustus di browser barat UTC. Karena masukannya
 * sudah berupa tanggal kalender satu zona, bagian stringnya langsung dipakai —
 * tidak ada zona waktu yang bisa menggesernya.
 */
export function formatWibDay(value: string | null | undefined): string {
  const parts = String(value || '').split('-').map(Number);
  const [y, m, d] = parts;
  if (parts.length !== 3 || !Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return String(value || '');
  }
  const bulan = MONTH_LABELS[m - 1] || '';
  return `${d} ${bulan} ${y}`;
}

/**
 * `YYYY-MM-DD HH:mm` di zona `tz`, dari instan ISO/Date. `''` bila tak terbaca.
 *
 * Dipakai log downtime dan "terakhir down/pulih": string tanggal lama backend
 * tidak dipakai untuk tampilan baru — field ISO yang tersimpan yang menjadi
 * sumbernya, diformat ke zona pengguna.
 */
export function formatTzDateTime(value: string | Date | null | undefined, tz: string): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  if (isNaN(date.getTime())) return '';

  const parts = wallClockParts(date, safeZone(tz));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parts['year']}-${pad(parts['month'])}-${pad(parts['day'])} ${pad(parts['hour'] % 24)}:${pad(parts['minute'])}`;
}

/** `HH:mm:ss` di zona `tz`, dari instan ISO/Date. `''` bila tak terbaca. */
export function formatTzTime(value: string | Date | null | undefined, tz: string): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  if (isNaN(date.getTime())) return '';

  const parts = wallClockParts(date, safeZone(tz));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(parts['hour'] % 24)}:${pad(parts['minute'])}:${pad(parts['second'])}`;
}

/**
 * Indeks titik grafik yang mewakili "sekarang", atau -1 bila periode ini tidak
 * punya slot waktu (mis. `bulanan`/`custom`).
 *
 * Label datang dari backend yang mengelompokkan per `tz`, jadi zona di sini juga
 * harus sama — memakai zona lain membuat batas hitung celah meleset satu slot.
 */
export function currentSlot(period: string, labels: string[] | null | undefined, now: Date, tz: string = browserTimeZone()): number {
  const list = Array.isArray(labels) ? labels : [];

  if (period === 'harian') {
    const hour = String(tzParts(now, tz).h).padStart(2, '0');
    return list.findIndex(l => String(l).trim().startsWith(`${hour}:`));
  }

  if (period === 'tahunan') {
    const name = MONTH_LABELS[tzParts(now, tz).m];
    return list.findIndex(l => String(l).trim().toLowerCase() === name.toLowerCase());
  }

  return -1;
}
