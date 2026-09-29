import { DashboardComponent } from './dashboard.component';

/**
 * Komponen dibuat langsung tanpa TestBed: yang diuji hanya `loadDashboard`
 * (pengambilan 4 sumber data + pemetaan ke KPI/site/panel), bukan render DOM.
 */

function jsonRes(body: any) {
  return { ok: true, json: async () => body } as any;
}

function makeComponent(fetch: (url: string) => Promise<any>): DashboardComponent {
  return new DashboardComponent(
    {} as any, // router
    { fetch } as any, // api
    { markForCheck: () => undefined } as any // cdr
  );
}

const PAYLOADS: { [url: string]: any } = {
  '/api/devices/status': {
    devices: [
      { name: 'AP-1', type: 'Access Point', siteLocation: 'A', status: 'Online', ip: '10.0.0.1' },
      { name: 'AP-2', type: 'Access Point', siteLocation: 'A', status: 'Offline', ip: '10.0.0.2' },
      { name: 'AP-3', type: 'Access Point', siteLocation: 'B', status: 'Tidak Terpantau', ip: '10.0.0.3' }
    ]
  },
  '/api/projects': {
    projects: [{ name: 'P1', sites: [{ name: 'A' }, { name: 'B' }] }]
  },
  '/api/laporan': {
    data: [{ date: '2026-09-10', createdAt: '2026-09-10T02:00:00Z', masalah: 'Kabel lepas', site: 'A', technician: 'Budi', type: 'Jaringan' }]
  },
  '/api/router/downtime-events': {
    events: [{ site: 'A', kind: 'unreachable', startTimeIso: '2026-09-11T01:00:00Z', endTimeIso: null }]
  }
};

describe('DashboardComponent — sinkronisasi data', () => {
  it('memuat 4 sumber data dan mengisi KPI, site, dan panel', async () => {
    const calls: string[] = [];
    const fetch = (url: string) => {
      calls.push(url);
      return Promise.resolve(jsonRes(PAYLOADS[url]));
    };
    const component = makeComponent(fetch);

    await component.loadDashboard();

    expect(calls).toEqual([
      '/api/devices/status',
      '/api/projects',
      '/api/laporan',
      '/api/router/downtime-events'
    ]);
    expect(calls.length).toBe(4);

    // KPI
    expect(component.kpi.perangkatDown).toBe(1);
    expect(component.kpi.perangkatTotal).toBe(3);
    expect(component.kpi.siteAktif).toBe(1); // hanya A punya perangkat Online
    expect(component.kpi.siteTotal).toBe(2);
    expect(component.kpi.networkAvailability).toBe(50); // 1 online dari 2 terklaim
    expect(component.kpi.laporanBulanIni).toBeGreaterThanOrEqual(0);

    // Kesehatan site
    expect(component.sites.map(s => s.name)).toEqual(['A', 'B']);
    expect(component.sites[0]).toMatchObject({ total: 2, online: 1, status: 'Perlu perhatian' });
    expect(component.sites[1]).toMatchObject({ total: 1, online: 0, status: 'Gangguan' });

    // Panel
    expect(component.perangkatBermasalah.map(d => d.name)).toEqual(['AP-2', 'AP-3']);
    expect(component.recentReports.length).toBe(1);
    expect(component.recentReports[0].content).toBe('Kabel lepas');
    expect(component.systemActivities.length).toBe(1);

    // Status
    expect(component.loading).toBe(false);
    expect(component.lastUpdated).not.toBeNull();
    expect(component.updatedLabel).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('payload kosong tidak membuat komponen rusak', async () => {
    const fetch = (url: string) => Promise.resolve(jsonRes({}));
    const component = makeComponent(fetch);

    await component.loadDashboard();

    expect(component.kpi).toEqual({
      perangkatDown: 0,
      perangkatTotal: 0,
      siteAktif: 0,
      siteTotal: 0,
      networkAvailability: null,
      laporanBulanIni: 0
    });
    expect(component.sites).toEqual([]);
    expect(component.perangkatBermasalah).toEqual([]);
    expect(component.recentReports).toEqual([]);
    expect(component.systemActivities).toEqual([]);
    expect(component.loading).toBe(false);
  });

  it('kegagalan fetch tidak melempar dan loading kembali normal', async () => {
    const fetch = () => Promise.reject(new Error('offline'));
    const component = makeComponent(fetch);

    await component.loadDashboard();
    expect(component.loading).toBe(false);
    expect(component.lastUpdated).toBeNull();
  });
});
