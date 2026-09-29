import { vi } from 'vitest';
import { LaporanTrafikComponent } from './laporan-trafik.component';
import { periodWindow } from '../../shared/period-window';

/**
 * Komponen dibuat langsung tanpa TestBed: `generateUptimeData` hanya memakai
 * `sites`, `selectedPeriod`, tanggal, dan `ApiService.fetch`, jadi ketiga
 * ketergantungan itu bisa dipalsukan seperlunya. `printReport` hanya memakai
 * `selectedSite`, `selectedPeriod`, `document`, dan `window.print`.
 */
function makeComponent(fetch: (url: string) => Promise<any>): LaporanTrafikComponent {
  return new LaporanTrafikComponent(
    {} as any,
    {} as any,
    { markForCheck: () => undefined } as any,
    {} as any,
    { fetch } as any
  );
}

describe('LaporanTrafikComponent.generateUptimeData', () => {
  it('menembak semua site bersamaan dan menjaga urutan hasil', async () => {
    const calls: string[] = [];
    const resolvers: Array<() => void> = [];
    let inFlight = 0;
    let maxInFlight = 0;

    const fetch = (url: string): Promise<any> => {
      calls.push(url);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise(resolve => {
        resolvers.push(() => {
          inFlight--;
          resolve({ ok: false } as any);
        });
      });
    };

    const component = makeComponent(fetch);
    component.sites = ['Gizi', 'Gigi', 'Kebidanan'];
    component.selectedPeriod = 'harian';
    component.startDate = '2026-09-01';
    component.endDate = '2026-09-01';
    component.timeZone = 'Asia/Jakarta';

    const pending = component.generateUptimeData();

    // Cara lama berbaris satu site demi satu site: puncaknya 1 permintaan.
    expect(maxInFlight).toBe(3);

    while (resolvers.length > 0) {
      const batch = resolvers.splice(0);
      batch.forEach(resolve => resolve());
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await pending;

    expect(component.uptimeData.map(entry => entry.site)).toEqual(['Gizi', 'Gigi', 'Kebidanan']);
    expect(calls.length).toBe(6);
    expect(calls.filter(url => url.includes('/api/router/downtime-events'))).toHaveLength(3);
    expect(calls.filter(url => url.includes('/api/router/history') && url.includes('count=1'))).toHaveLength(3);
    // Hitung "ada sample" juga di zona pengguna: hari yang diperiksa harus sama
    // dengan hari jendela yang dikirim.
    expect(calls.filter(url => url.includes('count=1') && url.includes('tz=Asia%2FJakarta'))).toHaveLength(3);
  });

  it('tidak menembak apa pun saat daftar site kosong', async () => {
    const calls: string[] = [];
    const component = makeComponent(url => {
      calls.push(url);
      return Promise.resolve({ ok: false } as any);
    });
    component.sites = [];

    await component.generateUptimeData();

    expect(calls).toHaveLength(0);
    expect(component.uptimeData).toEqual([]);
  });
});

describe('LaporanTrafikComponent — zona waktu laporan', () => {
  it('mengirim tz pengguna pada request riwayat', () => {
    const calls: string[] = [];
    const component = makeComponent(url => {
      calls.push(url);
      return Promise.resolve({ ok: false } as any);
    });
    component.selectedSite = 'Gizi';
    component.selectedPeriod = 'harian';
    component.timeZone = 'Asia/Makassar';

    component.fetchRealHistoryAndEvents();

    const historyCall = calls.find(url => url.includes('/api/router/history?'));
    expect(historyCall).toBeDefined();
    expect(historyCall).toContain('tz=Asia%2FMakassar');
  });

  it('memformat waktu log downtime dari ISO menurut tz, bukan string lama', async () => {
    const event = {
      site: 'Gizi',
      kind: 'interface-down',
      reason: '',
      start: '2026-09-26 04:00:00',
      startTimeIso: '2026-09-25T21:00:00.000Z',
      end: '2026-09-26 04:30:00',
      endTimeIso: '2026-09-25T21:30:00.000Z',
      duration: '30m',
      color: '#C4442E',
      reported: false
    };
    const fetch = (url: string) => Promise.resolve({
      ok: true,
      json: async () => url.includes('downtime-events')
        ? { success: true, events: [event] }
        : { success: true, data: [] }
    } as any);

    const component = makeComponent(fetch);
    component.selectedSite = 'Gizi';
    component.selectedPeriod = 'harian';
    component.timeZone = 'Asia/Makassar';

    component.fetchRealHistoryAndEvents();
    await new Promise(resolve => setTimeout(resolve, 0));

    // 21:00Z = 05:00 WITA keesokan harinya; string lama (04:00) tidak dipakai.
    expect(component.allDowntimeEvents[0].start).toBe('2026-09-26 05:00');
    expect(component.allDowntimeEvents[0].end).toBe('2026-09-26 05:30');
  });

  it('memakai string lama sebagai cadangan bila ISO tidak ada', async () => {
    const fetch = (url: string) => Promise.resolve({
      ok: true,
      json: async () => url.includes('downtime-events')
        ? { success: true, events: [{ site: 'Gizi', kind: 'interface-down', start: '2026-09-26 04:00:00', duration: '1m' }] }
        : { success: true, data: [] }
    } as any);

    const component = makeComponent(fetch);
    component.selectedSite = 'Gizi';
    component.timeZone = 'Asia/Makassar';

    component.fetchRealHistoryAndEvents();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(component.allDowntimeEvents[0].start).toBe('2026-09-26 04:00:00');
    expect(component.allDowntimeEvents[0].end).toBe('—');
  });
});

describe('LaporanTrafikComponent.printReport', () => {
  it('menyetel nama berkas sementara, membuka dialog cetak, lalu memulihkan judul', () => {
    const component = makeComponent(() => Promise.resolve({ ok: false } as any));
    component.selectedSite = 'Gizi';
    component.selectedPeriod = 'harian';

    const originalTitle = document.title;
    let titleDuringPrint = '';
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {
      titleDuringPrint = document.title;
    });

    component.printReport();

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(titleDuringPrint).toMatch(/^Laporan-Trafik_Gizi_harian_\d{4}-\d{2}-\d{2}$/);
    expect(document.title).toBe(originalTitle);
    expect(component.printTimestamp).not.toBe('');

    printSpy.mockRestore();
  });

  it('memakai "site" sebagai nama berkas bila site belum dipilih', () => {
    const component = makeComponent(() => Promise.resolve({ ok: false } as any));
    component.selectedSite = '';

    let titleDuringPrint = '';
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {
      titleDuringPrint = document.title;
    });

    component.printReport();

    expect(titleDuringPrint).toMatch(/^Laporan-Trafik_site_harian_\d{4}-\d{2}-\d{2}$/);

    printSpy.mockRestore();
  });
});

describe('LaporanTrafikComponent.filterDowntimeLog', () => {
  function event(kind: string, when: Date) {
    return {
      site: 'Gizi',
      kind,
      reason: '',
      start: '2026-09-26 21:00:00',
      endTime: undefined,
      duration: '46s',
      color: '#B45309',
      end: '—',
      reported: false,
      timestamp: when
    } as any;
  }

  it('hanya menampilkan downtime asli, bukan kejadian "Tidak terpantau"', () => {
    const component = makeComponent(() => Promise.resolve({ ok: false } as any));
    component.selectedSite = 'Gizi';
    component.selectedPeriod = 'harian';
    const now = new Date();
    component.allDowntimeEvents = [event('unreachable', now), event('interface-down', now)];

    component.filterDowntimeLog();

    expect(component.downtimeLog.map(e => e.kind)).toEqual(['interface-down']);
  });
});

describe('LaporanTrafikComponent — skala stabil', () => {
  it('skala awal dihitung dari data', () => {
    const component = makeComponent(() => Promise.resolve({ ok: false } as any));
    component.chartData = [
      { label: 'a', tx: 1, rx: 2, samples: 1 },
      { label: 'b', tx: 25, rx: 3, samples: 1 }
    ];

    (component as any).updateChartScale(false);

    expect(component.chartMaxValue).toBe(40); // 25 × 1,1 → langkah 10 → 40
  });

  it('poll live tidak menurunkan skala; puncak baru menaikkannya', () => {
    const component = makeComponent(() => Promise.resolve({ ok: false } as any));
    component.chartData = [
      { label: 'a', tx: 1, rx: 2, samples: 1 }
    ];

    (component as any).updateChartScale(false);
    expect(component.chartMaxValue).toBe(4);

    // Skala sudah naik karena puncak sebelumnya — titik live kecil tidak menurunkannya.
    component.chartMaxValue = 20;
    (component as any).updateChartScale(true);
    expect(component.chartMaxValue).toBe(20);

    // Puncak baru yang lebih tinggi tetap menaikkan.
    component.chartData = [
      { label: 'a', tx: 50, rx: 2, samples: 1 }
    ];
    (component as any).updateChartScale(true);
    expect(component.chartMaxValue).toBe(100);
  });
});

describe('LaporanTrafikComponent — bucket tanpa sample jadi celah', () => {
  it('slot kosong di tengah memutus garis menjadi dua subpath', () => {
    const component = makeComponent(() => Promise.resolve({ ok: false } as any));
    component.chartData = [
      { label: 'Senin', tx: 5, rx: 5, samples: 3 },
      { label: 'Selasa', tx: 5, rx: 5, samples: 3 },
      { label: 'Rabu', tx: 0, rx: 0, samples: 0 },   // tidak ada data
      { label: 'Kamis', tx: 5, rx: 5, samples: 3 },
      { label: 'Jumat', tx: 5, rx: 5, samples: 3 }
    ];
    component.chartMaxValue = 10;

    (component as any).generateChartPaths();

    // Dua `M` = dua subpath; titik Rabu (x=50) tidak digambar sama sekali.
    expect(component.txPath).toBe('M 0.00 65.00 L 25.00 65.00 M 75.00 65.00 L 100.00 65.00');
    expect(component.rxPath).toBe(component.txPath);
  });

  it('slot kosong di ujung tidak menarik garis ke titik palsu', () => {
    const component = makeComponent(() => Promise.resolve({ ok: false } as any));
    component.chartData = [
      { label: 'Rabu', tx: 0, rx: 0, samples: 0 },   // tidak ada data, di ujung kiri
      { label: 'Kamis', tx: 5, rx: 5, samples: 2 }
    ];
    component.chartMaxValue = 10;

    (component as any).generateChartPaths();

    expect(component.txPath).toBe('M 100.00 65.00');
    expect(component.rxPath).toBe('M 100.00 65.00');
  });
});

describe('LaporanTrafikComponent.generateUptimeData — waktu event (F-99)', () => {
  it('memakai instan ISO, bukan string waktu-dinding server', async () => {
    // Event di awal hari zona terpilih supaya tidak bergantung jam berapa tes
    // dijalankan; jendela `harian` berakhir tepat di "sekarang".
    const win = periodWindow('harian', new Date(), '', '', 'Asia/Makassar');
    const startMs = win.start.getTime() + 60 * 1000; // 00:01 lokal
    const endMs = startMs + 5 * 60 * 1000;           // 00:06 lokal
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(endMs).toISOString();

    const fetch = (url: string): Promise<any> => {
      if (url.includes('/api/router/downtime-events')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            events: [{
              site: 'Gizi',
              kind: 'interface-down',
              // String lama (waktu dinding server) sengaja berbeda jauh: bila
              // dipakai, event ini tidak akan tumpang tindih dengan jendela.
              start: '2001-01-01 00:00:00',
              end: '2001-01-01 00:05:00',
              startTimeIso: startIso,
              endTimeIso: endIso,
              reported: false
            }]
          })
        } as any);
      }
      if (url.includes('/api/router/history')) {
        return Promise.resolve({ ok: true, json: async () => ({ hasSamples: true }) } as any);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as any);
    };

    const component = makeComponent(fetch);
    component.sites = ['Gizi'];
    component.selectedPeriod = 'harian';
    component.timeZone = 'Asia/Makassar';

    await component.generateUptimeData();

    const expectedSeconds = Math.max(0, (Math.min(endMs, win.end.getTime()) - startMs) / 1000);
    expect(component.uptimeData.length).toBe(1);
    // Durasi dihitung dari instan ISO; string lama (2001) akan menghasilkan '0s'.
    expect(component.uptimeData[0].downtimeTotal).toBe((component as any).formatDurationText(expectedSeconds));
  });
});
