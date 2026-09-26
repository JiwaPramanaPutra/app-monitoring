import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  MONTH_LABELS,
  WIB_OFFSET_MS,
  clipSeconds,
  currentSlot,
  formatWibDay,
  overlapsWindow,
  periodWindow,
  wibDateString
} from './period-window';

/** Instan awal hari WIB lewat parsing eksplisit — sumber kebenaran test ini. */
const wibInstant = (iso: string) => new Date(iso + '+07:00');

describe('WIB_OFFSET_MS', () => {
  // WIB itu UTC+7. UTC+8 adalah WITA/Makassar, dan memakainya membuat seluruh
  // jendela halaman meleset satu jam dari rentang backend yang memakai +07:00.
  it('memakai UTC+7, bukan UTC+8', () => {
    expect(WIB_OFFSET_MS).toBe(7 * 60 * 60 * 1000);
    expect(WIB_OFFSET_MS).not.toBe(8 * 60 * 60 * 1000);
  });
});

describe('periodWindow - batasnya harus sama persis dengan +07:00', () => {
  it('custom 1-10 September mencakup tepat hari WIB-nya', () => {
    const win = periodWindow('custom', new Date('2026-09-25T04:00:00Z'), '2026-09-01', '2026-09-10');

    expect(win.start.toISOString()).toBe(wibInstant('2026-09-01T00:00:00').toISOString());
    expect(win.end.toISOString()).toBe('2026-09-10T16:59:59.999Z');
    expect(win.startDate).toBe('2026-09-01');
    expect(win.endDate).toBe('2026-09-10');
  });

  it('harian mulai 00:00 WIB hari ini, bukan 23:00 WIB kemarin', () => {
    const now = new Date('2026-09-25T04:00:00Z'); // 11:00 WIB
    const win = periodWindow('harian', now);

    expect(win.start.toISOString()).toBe(wibInstant('2026-09-25T00:00:00').toISOString());
    expect(win.end).toEqual(now);
    expect(win.startDate).toBe('2026-09-25');
    expect(win.endDate).toBe('2026-09-25');
    // Jendela harian tidak boleh lebih panjang dari sejak tengah malam WIB.
    expect((win.end.getTime() - win.start.getTime()) / 3600000).toBeCloseTo(11, 6);
  });

  it('mingguan mencakup 7 hari termasuk hari ini', () => {
    const win = periodWindow('mingguan', new Date('2026-09-25T04:00:00Z'));

    expect(win.startDate).toBe('2026-09-19');
    expect(win.endDate).toBe('2026-09-25');
    expect(new Date(win.start.getTime() + 6 * DAY_MS).toISOString()).toBe(wibInstant('2026-09-25T00:00:00').toISOString());
  });

  it('bulanan mencakup 30 hari termasuk hari ini', () => {
    const win = periodWindow('bulanan', new Date('2026-09-25T04:00:00Z'));

    expect(win.startDate).toBe('2026-08-27');
    expect(win.endDate).toBe('2026-09-25');
  });

  it('tahunan mulai 1 Januari tahun berjalan', () => {
    const win = periodWindow('tahunan', new Date('2026-09-25T04:00:00Z'));

    expect(win.startDate).toBe('2026-01-01');
    expect(win.endDate).toBe('2026-09-25');
  });

  // Inilah sub-cacat F-80 yang paling sulit terlihat: kalender ber-offset 8 jam
  // sudah mengganti tanggal saat WIB masih hari yang sama.
  it('pukul 23:30 WIB masih menamai hari WIB yang sama', () => {
    const malam = new Date('2026-09-25T16:30:00Z'); // 23:30 WIB

    expect(wibDateString(malam)).toBe('2026-09-25');

    const win = periodWindow('harian', malam);
    expect(win.startDate).toBe('2026-09-25');
    expect(win.endDate).toBe('2026-09-25');
  });

  it('pukul 00:30 WIB sudah memakai tanggal WIB yang baru', () => {
    const subuh = new Date('2026-09-25T17:30:00Z'); // 26 Sep 00:30 WIB

    expect(wibDateString(subuh)).toBe('2026-09-26');
  });

  it('custom tanpa tanggal jatuh ke jendela satu hari', () => {
    const win = periodWindow('custom', new Date('2026-09-25T04:00:00Z'));

    expect(win.startDate).toBe('2026-09-24');
    expect(win.endDate).toBe('2026-09-25');
  });
});

describe('overlapsWindow - satu predikat untuk ringkasan dan log', () => {
  const win = periodWindow('custom', new Date('2026-09-25T04:00:00Z'), '2026-09-02', '2026-09-02');

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
  it('memformat tanggal WIB apa adanya', () => {
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

describe('currentSlot - zona label harus WIB', () => {
  const harian = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  it('menemukan jam WIB yang benar, bukan jam WITA', () => {
    // 10:30 WIB (03:30Z). Di WITA jamnya 11:30, jadi offset yang salah memilih 11:00.
    const now = new Date('2026-09-25T03:30:00Z');

    expect(harian[currentSlot('harian', harian, now)]).toBe('10:00');
  });

  it('tengah malam WIB terbaca 00, bukan 24', () => {
    const now = new Date('2026-09-25T17:30:00Z'); // 26 Sep 00:30 WIB

    expect(harian[currentSlot('harian', harian, now)]).toBe('00:00');
  });

  it('tahunan mencocokkan nama bulan backend, bukan nama locale', () => {
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const now = new Date('2026-09-25T03:30:00Z');

    // Label backend untuk September adalah "Sep" (lihat `aggregateSamples`).
    expect(MONTH_LABELS[8]).toBe('Sep');
    expect(currentSlot('tahunan', bulan, now)).toBe(8);
    // `Intl` dengan locale en-GB menghasilkan "Sept"; label itu tidak boleh cocok.
    expect(currentSlot('tahunan', ['Jan', 'Sept'], now)).toBe(-1);
  });

  it('periode tanpa slot waktu mengembalikan -1', () => {
    const now = new Date('2026-09-25T03:30:00Z');

    expect(currentSlot('bulanan', ['mg1'], now)).toBe(-1);
    expect(currentSlot('custom', ['2026-09-25'], now)).toBe(-1);
    expect(currentSlot('harian', null, now)).toBe(-1);
  });
});
