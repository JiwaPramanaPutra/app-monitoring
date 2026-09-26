import { vi } from 'vitest';
import { LaporanTrafikComponent } from './laporan-trafik.component';

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
