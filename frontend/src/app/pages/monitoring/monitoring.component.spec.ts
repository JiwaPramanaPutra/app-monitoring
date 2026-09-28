import { MonitoringComponent } from './monitoring.component';

/**
 * Komponen dibuat langsung tanpa TestBed: skenario yang diuji hanya menyentuh
 * `selectSite`, `fetchRouterTraffic`, `calculateScale`, `axisTickLabel`, dan
 * `generateChartBars`.
 */

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: any) => void;
};

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function jsonRes(body: any) {
  return { ok: true, json: async () => body } as any;
}

function makeComponent(fetch: (url: string) => Promise<any>): MonitoringComponent {
  return new MonitoringComponent(
    {} as any, // router
    {} as any, // route
    { markForCheck: () => undefined } as any, // cdr
    {} as any, // projectService
    { fetch } as any, // api
    {} as any // auth
  );
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const LIVE_BODY = {
  siteConfigured: true, connected: true, txMbps: 0.01, rxMbps: 0.02,
  txBps: 10000, rxBps: 20000, ip: '10.0.0.1', interface: 'ether1'
};

describe('MonitoringComponent — grafik live dari kanan', () => {
  it('selectSite membersihkan grafik dan tidak menarik riwayat lama', () => {
    const calls: string[] = [];
    const fetch = (url: string) => {
      calls.push(url);
      return Promise.resolve(jsonRes({ devices: [] }));
    };
    const component = makeComponent(fetch);

    component.selectSite('Gizi');

    expect(component.chartBars).toEqual([]);
    expect(calls.some(url => url.includes('/api/router/history'))).toBe(false);
  });

  it('sample live menempel di kanan dan yang lama bergeser ke kiri', async () => {
    const liveQueue: Array<Deferred<any>> = [];
    const fetch = (url: string) => {
      if (url.includes('/api/router/traffic')) {
        const pending = defer<any>();
        liveQueue.push(pending);
        return pending.promise;
      }
      return Promise.resolve(jsonRes({ devices: [] }));
    };
    const component = makeComponent(fetch);

    component.selectSite('Gizi');

    liveQueue[0].resolve(jsonRes(LIVE_BODY));
    await flush();

    expect(component.chartBars.length).toBe(1);
    expect(component.chartBars[0].x).toBeCloseTo(990, 5);

    // Polling berikutnya (manual, seperti interval 2 dtk).
    component.fetchRouterTraffic();
    liveQueue[1].resolve(jsonRes(LIVE_BODY));
    await flush();

    expect(component.chartBars.length).toBe(2);
    // Bar terbaru tetap di kanan; yang lama bergeser 11 unit ke kiri.
    expect(component.chartBars[1].x).toBeCloseTo(990, 5);
    expect(component.chartBars[0].x).toBeCloseTo(979, 5);
  });

  it('respons site lama tidak mengisi grafik site baru', async () => {
    const liveGizi = defer<any>();
    const liveKebidanan = defer<any>();
    const fetch = (url: string) => {
      const isGizi = url.includes('site=Gizi');
      if (url.includes('/api/router/traffic')) return isGizi ? liveGizi.promise : liveKebidanan.promise;
      return Promise.resolve(jsonRes({ devices: [] }));
    };
    const component = makeComponent(fetch);

    component.selectSite('Gizi');
    component.selectSite('Kebidanan');

    // Sisa respons site lama tiba terlambat — harus diabaikan total.
    liveGizi.resolve(jsonRes({ ...LIVE_BODY, txBps: 1_000_000, rxBps: 1_000_000 }));
    await flush();
    expect(component.chartBars).toEqual([]);

    liveKebidanan.resolve(jsonRes(LIVE_BODY));
    await flush();
    expect(component.chartBars.length).toBe(1);
  });
});

describe('MonitoringComponent.calculateScale (skala akar)', () => {
  it('lonjakan tinggi tidak menenggelamkan trafik kecil', () => {
    const component = makeComponent(() => Promise.resolve({ ok: false } as any));

    (component as any).calculateScale(17500); // 17,5 Mbps → batas 20 (label tengah 5)
    expect(component.chartYUnit).toBe('Mbps');
    expect(component.scaleCeil).toBe(20);

    (component as any).calculateScale(392); // 392 Kbps → batas 600 (label tengah 150)
    expect(component.chartYUnit).toBe('Kbps');
    expect(component.scaleCeil).toBe(600);

    // Label sumbu mengikuti posisi kuadrat, bukan linear.
    component.chartYUnit = 'Mbps';
    component.scaleCeil = 20;
    expect(component.axisTickLabel(1)).toBe('20 Mbps');
    expect(component.axisTickLabel(0.5)).toBe('5');
  });
});

describe('MonitoringComponent.chartTimeRange — label per zona', () => {
  it('memakai zona pengguna, bukan getter lokal mesin', () => {
    const component = makeComponent(() => Promise.resolve({ ok: false } as any));
    (component as any).trafficHistory = [
      { txBps: 0, rxBps: 0, timestamp: '2026-09-25T03:30:00.000Z' },
      { txBps: 0, rxBps: 0, timestamp: '2026-09-25T03:31:00.000Z' }
    ];

    component.timeZone = 'Asia/Jakarta';
    expect(component.chartTimeRange).toBe('10:30:00 – 10:31:00');

    component.timeZone = 'Asia/Makassar';
    expect(component.chartTimeRange).toBe('11:30:00 – 11:31:00');
  });
});

describe('MonitoringComponent.generateChartBars', () => {  it('menaruh bar di dasar plot 200 dengan jarak 11 dan tinggi akar', () => {
    const component = makeComponent(() => Promise.resolve({ ok: false } as any));
    component.chartYUnit = 'Mbps';
    component.scaleCeil = 20; // plafon 20.000 Kbps
    (component as any).trafficHistory = [
      { txBps: 1_000_000, rxBps: 2_000_000 },
      { txBps: 1_000_000, rxBps: 2_000_000 }
    ];

    (component as any).generateChartBars();

    expect(component.chartBars.length).toBe(2);
    const newest = component.chartBars[1];
    // 1 Mbps / 20 Mbps -> √0,05 ≈ 0,2236 -> round(0,2236 × 172) = 38; dasar 200.
    expect(newest.txHeight).toBe(38);
    expect(newest.txY).toBe(162);
    // 2 Mbps / 20 Mbps -> √0,1 ≈ 0,3162 -> round(0,3162 × 172) = 54.
    expect(newest.rxHeight).toBe(54);
    expect(newest.rxY).toBe(146);
    // Bar terbaru di kanan; tetangganya 11 unit di kiri.
    expect(newest.x).toBe(990);
    expect(component.chartBars[0].x).toBeCloseTo(979, 5);
  });
});
