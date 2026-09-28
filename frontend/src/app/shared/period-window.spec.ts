import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  DEFAULT_TIME_ZONE,
  MONTH_LABELS,
  WIB_OFFSET_MS,
  browserTimeZone,
  clipSeconds,
  currentSlot,
  formatTzDateTime,
  formatTzTime,
  formatWibDay,
  isValidTimeZone,
  overlapsWindow,
  periodWindow,
  tzDateString,
  tzEndOfDay
} from './period-window';

/** Instan awal hari WIB lewat parsing eksplisit — sumber kebenaran test ini. */
const wibInstant = (iso: string) => new Date(iso + '+07:00');

/** Zona default yang perilakunya dikunci test lama. */
const TZ = 'Asia/Jakarta';

describe('WIB_OFFSET_MS', () => {
  // WIB itu UTC+7. UTC+8 adalah WITA/Makassar, dan memakainya membuat seluruh
  // jendela halaman meleset satu jam dari rentang backend yang memakai +07:00.
  it('memakai UTC+7, bukan UTC+8', () => {
    expect(WIB_OFFSET_MS).toBe(7 * 60 * 60 * 1000);
    expect(WIB_OFFSET_MS).not.toBe(8 * 60 * 60 * 1000);
  });

  it('menjaga zona default tetap Asia/Jakarta', () => {
    expect(DEFAULT_TIME_ZONE).toBe('Asia/Jakarta');
  });
});

describe('browserTimeZone', () => {
  it('selalu menghasilkan zona IANA yang dikenal Intl', () => {
   expect(isValidTimeZone(browserTimeZone())).toBe(true);
  });
});

describe('periodWindow - batasnya harus sama persis dengan +07:00', () => {
  it('custom 1-10 September mencakup tepat hari WIB-nya', () => {
    const win = periodWindow('custom', new Date('2026-09-25T04:00:00Z'), '2026-09-01', '2026-09-10', TZ);

    expect(win.start.toISOString()).toBe(wibInstant('2026-09-01T00:00:00').toISOString());
    expect(win.end.toISOString()).toBe('2026-09-10T16:59:59.999Z');
    expect(win.startDate).toBe('2026-09-01');
    expect(win.endDate).toBe('2026-09-10');
  });

  it('harian mulai 00:00 WIB hari ini, bukan 23:00 WIB kemarin', () => {
    const now = new Date('2026-09-25T04:00:00Z'); // 11:00 WIB
    const win = periodWindow('harian', now, null, null, TZ);

    expect(win.start.toISOString()).toBe(wibInstant('2026-09-25T00:00:00').toISOString());
    expect(win.end).toEqual(now);
    expect(win.startDate).toBe('2026-09-25');
    expect(win.endDate).toBe('2026-09-25');
    // Jendela harian tidak boleh lebih panjang dari sejak tengah malam WIB.
    expect((win.end.getTime() - win.start.getTime()) / 3600000).toBeCloseTo(11, 6);
  });

  it('mingguan mencakup 7 hari termasuk hari ini', () => {
    const win = periodWindow('mingguan', new Date('2026-09-25T04:00:00Z'), null, null, TZ);

    expect(win.startDate).toBe('2026-09-19');
    expect(win.endDate).toBe('2026-09-25');
    expect(new Date(win.start.getTime() + 6 * DAY_MS).toISOString()).toBe(wibInstant('2026-09-25T00:00:00').toISOString());
  });

  it('bulanan mencakup 30 hari termasuk hari ini', () => {
    const win = periodWindow('bulanan', new Date('2026-09-25T04:00:00Z'), null, null, TZ);

    expect(win.startDate).toBe('2026-08-27');
    expect(win.endDate).toBe('2026-09-25');
  });

  it('tahunan mulai 1 Januari tahun berjalan', () => {
    const win = periodWindow('tahunan', new Date('2026-09-25T04:00:00Z'), null, null, TZ);

    expect(win.startDate).toBe('2026-01-01');
    expect(win.endDate).toBe('2026-09-25');
  });

  // Inilah sub-cacat F-80 yang paling sulit terlihat: kalender ber-offset 8 jam
  // sudah mengganti tanggal saat WIB masih hari yang sama.
  it('pukul 23:30 WIB masih menamai hari WIB yang sama', () => {
    const malam = new Date('2026-09-25T16:30:00Z'); // 23:30 WIB

    expect(tzDateString(malam, TZ)).toBe('2026-09-25');

    const win = periodWindow('harian', malam, null, null, TZ);
    expect(win.startDate).toBe('2026-09-25');
    expect(win.endDate).toBe('2026-09-25');
  });

  it('pukul 00:30 WIB sudah memakai tanggal WIB yang baru', () => {
    const subuh = new Date('2026-09-25T17:30:00Z'); // 26 Sep 00:30 WIB

    expect(tzDateString(subuh, TZ)).toBe('2026-09-26');
  });

  it('custom tanpa tanggal jatuh ke jendela satu hari', () => {
    const win = periodWindow('custom', new Date('2026-09-25T04:00:00Z'), null, null, TZ);

    expect(win.startDate).toBe('2026-09-24');
    expect(win.endDate).toBe('2026-09-25');
  });
});

describe('periodWindow - zona pengguna selain WIB', () => {
  it('instan 16:30Z adalah hari yang berbeda di WIB dan WITA', () => {
    const malam = new Date('2026-09-25T16:30:00Z'); // 23:30 WIB, sudah 26 Sep 00:30 WITA

    const wib = periodWindow('harian', malam, null, null, 'Asia/Jakarta');
    expect(wib.startDate).toBe('2026-09-25');
    expect(wib.start.toISOString()).toBe('2026-09-24T17:00:00.000Z');

    const wita = periodWindow('harian', malam, null, null, 'Asia/Makassar');
    expect(wita.startDate).toBe('2026-09-26');
    expect(wita.start.toISOString()).toBe('2026-09-25T16:00:00.000Z');
  });

  it('Jayapura mulai dua jam lebih awal daripada WIB', () => {
    const win = periodWindow('harian', new Date('2026-09-25T04:00:00Z'), null, null, 'Asia/Jayapura');

    expect(win.startDate).toBe('2026-09-25');
    expect(win.start.toISOString()).toBe('2026-09-24T15:00:00.000Z');
  });

  it('UTC memakai tengah malam UTC', () => {
    const win = periodWindow('harian', new Date('2026-09-25T04:00:00Z'), null, null, 'UTC');

    expect(win.startDate).toBe('2026-09-25');
    expect(win.start.toISOString()).toBe('2026-09-25T00:00:00.000Z');
  });

  it('custom per zona memakai batas hari zona itu', () => {
    const wita = periodWindow('custom', new Date('2026-09-25T04:00:00Z'), '2026-09-01', '2026-09-01', 'Asia/Makassar');

    expect(wita.start.toISOString()).toBe('2026-08-31T16:00:00.000Z');
    expect(wita.end.toISOString()).toBe('2026-09-01T15:59:59.999Z');
  });

  it('tanpa tz memakai zona browser', () => {
    const now = new Date('2026-09-25T16:30:00Z');
    const win = periodWindow('harian', now);

    expect(win.startDate).toBe(tzDateString(now, browserTimeZone()));
    expect(win.endDate).toBe(tzDateString(now, browserTimeZone()));
  });

  it('zona tak dikenal jatuh ke WIB, bukan melempar', () => {
    const win = periodWindow('harian', new Date('2026-09-25T04:00:00Z'), null, null, 'Bukan/Zona');

    expect(win.start.toISOString()).toBe('2026-09-24T17:00:00.000Z');
  });
});

describe('tzDateString - kalender zona, bukan kalender mesin', () => {
  it('menamai tanggal berbeda untuk instan yang sama', () => {
    const malam = new Date('2026-09-25T16:30:00Z');

    expect(tzDateString(malam, 'Asia/Jakarta')).toBe('2026-09-25');
    expect(tzDateString(malam, 'Asia/Makassar')).toBe('2026-09-26');
    expect(tzDateString(malam, 'UTC')).toBe('2026-09-25');
  });

  it('pukul 23:30 WITA sudah tanggal berikutnya', () => {
    const malam = new Date('2026-09-25T15:30:00Z'); // 23:30 WITA

    expect(tzDateString(malam, 'Asia/Makassar')).toBe('2026-09-25');

    const tengahMalam = new Date('2026-09-25T16:00:00Z'); // 00:00 WITA
    expect(tzDateString(tengahMalam, 'Asia/Makassar')).toBe('2026-09-26');
  });
});

describe('tzEndOfDay', () => {
  it('menutup hari tepat di 23:59:59.999 zona itu', () => {
    expect(tzEndOfDay('2026-09-10', 'Asia/Jakarta').toISOString()).toBe('2026-09-10T16:59:59.999Z');
    expect(tzEndOfDay('2026-09-10', 'Asia/Makassar').toISOString()).toBe('2026-09-10T15:59:59.999Z');
  });

  it('hari ber-DST 23 jam tetap ditutup pada tengah malam setempat', () => {
    // New York 8 Mar 2026 kehilangan satu jam (02:00 -> 03:00).
    const end = tzEndOfDay('2026-03-08', 'America/New_York');

    expect(end.toISOString()).toBe('2026-03-09T03:59:59.999Z');
  });
});

describe('formatTzDateTime / formatTzTime', () => {
  const stamp = '2026-09-25T21:00:00.000Z'; // 26 Sep 04:00 WIB, 05:00 WITA

  it('memformat tanggal dan jam menurut tz', () => {
    expect(formatTzDateTime(stamp, 'Asia/Jakarta')).toBe('2026-09-26 04:00');
    expect(formatTzDateTime(stamp, 'Asia/Makassar')).toBe('2026-09-26 05:00');
    expect(formatTzDateTime(stamp, 'UTC')).toBe('2026-09-25 21:00');
  });

  it('memformat jam saja menurut tz', () => {
    expect(formatTzTime(stamp, 'Asia/Jakarta')).toBe('04:00:00');
    expect(formatTzTime(stamp, 'Asia/Makassar')).toBe('05:00:00');
  });

  it('masukan kosong atau tidak sah menghasilkan string kosong', () => {
    expect(formatTzDateTime(null, TZ)).toBe('');
    expect(formatTzDateTime('bukan-tanggal', TZ)).toBe('');
    expect(formatTzTime(undefined, TZ)).toBe('');
  });
});

describe('overlapsWindow - satu predikat untuk ringkasan dan log', () => {
  const win = periodWindow('custom', new Date('2026-09-25T04:00:00Z'), '2026-09-02', '2026-09-02', TZ);

  it('gangguan yang melewati tengah malam beririsan dengan kedua harinya', () => {
    const mulai = wibInstant('2026-09-01T23:00:00').getTime();
    const selesai = wibInstant('2026-09-02T01:00:00').getTime();

    expect(overlapsWindow(mulai, selesai, win)).toBe(true);
    // Dan ia menyumbang tepat satu jam ke uptime tanggal 2.
    expect(clipSeconds(mulai, selesai, win)).toBe(3600);
  });

  it('event di luar jendela tidak beririsan', () => {
    expect(overlapsWindow(
      wibInstant('2026-09-01T23:00:00').getTime(),
      wibInstant('2026-09-01T23:59:00').getTime(),
      win
    )).toBe(false);
    expect(overlapsWindow(
      wibInstant('2026-09-03T00:01:00').getTime(),
      wibInstant('2026-09-03T02:00:00').getTime(),
      win
    )).toBe(false);
  });

  it('event yang belum pulih beririsan bila mulainya sudah di dalam jendela', () => {
    const mulai = wibInstant('2026-09-02T10:00:00').getTime();
    const sekarang = win.end.getTime();

    expect(overlapsWindow(mulai, sekarang, win)).toBe(true);
    expect(clipSeconds(mulai, sekarang, win)).toBeGreaterThan(0);
  });

  it('event berdurasi nol tidak menyumbang downtime', () => {
    const titik = wibInstant('2026-09-02T10:00:00').getTime();

    expect(overlapsWindow(titik, titik, win)).toBe(true);
    expect(clipSeconds(titik, titik, win)).toBe(0);
  });

  it('durasi dipotong ke batas jendela, bukan dihitung penuh', () => {
    const mulai = wibInstant('2026-09-01T22:00:00').getTime();
    const selesai = wibInstant('2026-09-02T03:00:00').getTime();

    // Lima jam total, tapi hanya 00:00-03:00 tanggal 2 yang ada di jendela.
    expect((selesai - mulai) / 3600000).toBe(5);
    expect(clipSeconds(mulai, selesai, win)).toBe(3 * 3600);
  });
});

describe('formatWibDay - label tanggal tanpa menyentuh zona waktu', () => {
  // `new Date('2026-09-01')` adalah tengah malam UTC; memformatnya dengan getter
  // lokal membuat labelnya terbaca "31 Agu" di browser barat UTC. Fungsi ini
  // membaca bagian stringnya langsung, jadi hasilnya sama di mana pun.
  it('memformat tanggal apa adanya', () => {
    expect(formatWibDay('2026-09-01')).toBe('1 Sep 2026');
    expect(formatWibDay('2026-09-10')).toBe('10 Sep 2026');
    expect(formatWibDay('2026-01-31')).toBe('31 Jan 2026');
    expect(formatWibDay('2026-08-31')).toBe('31 Agu 2026');
    expect(formatWibDay('2026-12-31')).toBe('31 Des 2026');
  });

  it('tanggal 1 tidak pernah jatuh ke bulan sebelumnya', () => {
    // Inilah bentuk cacatnya: tanggal 1 di setiap bulan harus tetap tanggal 1.
    for (let m = 1; m <= 12; m++) {
      const bulan = String(m).padStart(2, '0');
      expect(formatWibDay(`2026-${bulan}-01`)).toBe(`1 ${MONTH_LABELS[m - 1]} 2026`);
    }
  });

  it('masukan kosong atau tidak lengkap dikembalikan apa adanya', () => {
    expect(formatWibDay('')).toBe('');
    expect(formatWibDay(null)).toBe('');
    expect(formatWibDay(undefined)).toBe('');
    expect(formatWibDay('bukan-tanggal')).toBe('bukan-tanggal');
    expect(formatWibDay('2026-09')).toBe('2026-09');
  });
});

describe('currentSlot - zona label harus sama dengan zona bucket backend', () => {
  const harian = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  it('menemukan jam WIB yang benar, bukan jam WITA', () => {
    // 10:30 WIB (03:30Z). Di WITA jamnya 11:30, jadi offset yang salah memilih 11:00.
    const now = new Date('2026-09-25T03:30:00Z');

    expect(harian[currentSlot('harian', harian, now, TZ)]).toBe('10:00');
  });

  it('mengikuti tz pengguna saat diberikan', () => {
    const now = new Date('2026-09-25T03:30:00Z');

    expect(harian[currentSlot('harian', harian, now, 'Asia/Makassar')]).toBe('11:00');
    expect(harian[currentSlot('harian', harian, now, 'UTC')]).toBe('03:00');
  });

  it('tengah malam WIB terbaca 00, bukan 24', () => {
    const now = new Date('2026-09-25T17:30:00Z'); // 26 Sep 00:30 WIB

    expect(harian[currentSlot('harian', harian, now, TZ)]).toBe('00:00');
  });

  it('tahunan mencocokkan nama bulan backend per tz', () => {
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const now = new Date('2026-09-30T17:30:00Z'); // 1 Okt 00:30 WIB

    // Label backend untuk September adalah "Sep" (lihat `aggregateSamples`).
    expect(MONTH_LABELS[8]).toBe('Sep');
    expect(currentSlot('tahunan', bulan, now, TZ)).toBe(9);
    expect(currentSlot('tahunan', bulan, now, 'Asia/Makassar')).toBe(9);
    expect(currentSlot('tahunan', bulan, new Date('2026-09-25T03:30:00Z'), TZ)).toBe(8);
    // `Intl` dengan locale en-GB menghasilkan "Sept"; label itu tidak boleh cocok.
    expect(currentSlot('tahunan', ['Jan', 'Sept'], new Date('2026-09-25T03:30:00Z'), TZ)).toBe(-1);
  });

  it('periode tanpa slot waktu mengembalikan -1', () => {
    const now = new Date('2026-09-25T03:30:00Z');

    expect(currentSlot('bulanan', ['mg1'], now, TZ)).toBe(-1);
    expect(currentSlot('custom', ['2026-09-25'], now, TZ)).toBe(-1);
    expect(currentSlot('harian', null, now, TZ)).toBe(-1);
  });
});
