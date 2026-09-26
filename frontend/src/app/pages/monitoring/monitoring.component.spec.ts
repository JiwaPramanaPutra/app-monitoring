import { MonitoringComponent } from './monitoring.component';

/**
 * Komponen dibuat langsung tanpa TestBed: skenario yang diuji hanya menyentuh
 * `selectSite`, `prefillTrafficHistory`, `fetchRouterTraffic`, dan
 * `updateTrafficMetrics`, jadi keempat ketergantungannya bisa dipalsukan.
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

const PROJECTS = [
  {
    sites: [
      { name: 'Gizi', routerConfig: { host: '10.0.0.1' } },
      { name: 'Kebidanan', routerConfig: { host: '10.0.0.2' } }
    ]
  }
];

describe('MonitoringComponent — prefill riwayat vs polling live', () => {
  it('sample live yang tiba lebih dulu tidak digambar selama riwayat dimuat', async () => {
    const history = defer<any>();
    const live = defer<any>();
    const fetch = (url: string) => {
      if (url.includes('/api/router/history')) return history.promise;
      if (url.includes('/api/router/traffic')) return live.promise;
      return Promise.resolve(jsonRes({ devices: [] }));
    };

    const component = makeComponent(fetch);
    component.projects = PROJECTS;

    component.selectSite('Gizi');

    live.resolve(jsonRes({
      siteConfigured: true, connected: true, txMbps: 0.05, rxMbps: 0.09,
      txBps: 50000, rxBps: 90000, ip: '10.0.0.1', interface: 'ether1'
    }));
    await flush();

    // Kedipan yang dulu terjadi: satu batang live digambar di sini.
    expect(component.chartBars).toEqual([]);
    // Legenda tetap mengikuti angka live terbaru.
    expect(component.lastTx).toBe('50 Kbps');

    history.resolve(jsonRes({
      data: [
        { txBps: 1000, rxBps: 2000 },
        { txBps: 3000, rxBps: 4000 }
      ]
    }));
    await flush();

    // Riwayat 2 sample + 1 sample live tertahan digambar sekali.
    expect(component.chartBars.length).toBe(3);
    expect(component.peakRate).toBe('140 Kbps');
  });

  it('riwayat kosong: sample live yang tertahan tetap digambar', async () => {
    const history = defer<any>();
    const live = defer<any>();
    const fetch = (url: string) => {
      if (url.includes('/api/router/history')) return history.promise;
      if (url.includes('/api/router/traffic')) return live.promise;
      return Promise.resolve(jsonRes({ devices: [] }));
    };

    const component = makeComponent(fetch);
    component.projects = PROJECTS;

    component.selectSite('Gizi');

    live.resolve(jsonRes({
      siteConfigured: true, connected: true, txMbps: 0.05, rxMbps: 0.09,
      txBps: 50000, rxBps: 90000, ip: '10.0.0.1', interface: 'ether1'
    }));
    await flush();
    expect(component.chartBars).toEqual([]);

    history.resolve(jsonRes({ data: [] }));
    await flush();

    // Tidak ada riwayat -> sample tertahan tetap tampil, bukan grafik kosong.
    expect(component.chartBars.length).toBe(1);
    expect(component.lastTx).toBe('50 Kbps');
  });

  it('respons riwayat site lama tidak menimpa site baru yang sedang dimuat', async () => {
    const historyGizi = defer<any>();
    const historyKebidanan = defer<any>();
    const liveGizi = defer<any>();
    const liveKebidanan = defer<any>();
    const fetch = (url: string) => {
      const isGizi = url.includes('site=Gizi');
      if (url.includes('/api/router/history')) return isGizi ? historyGizi.promise : historyKebidanan.promise;
      if (url.includes('/api/router/traffic')) return isGizi ? liveGizi.promise : liveKebidanan.promise;
      return Promise.resolve(jsonRes({ devices: [] }));
    };

    const component = makeComponent(fetch);
    component.projects = PROJECTS;

    component.selectSite('Gizi');
    component.selectSite('Kebidanan');

    // Sisa respons site lama tiba terlambat — harus diabaikan total.
    historyGizi.resolve(jsonRes({ data: [{ txBps: 999999, rxBps: 999999 }] }));
    liveGizi.resolve(jsonRes({
      siteConfigured: true, connected: true, txMbps: 1, rxMbps: 1,
      txBps: 1000000, rxBps: 1000000, ip: '10.0.0.1', interface: 'ether1'
    }));
    await flush();

    expect(component.chartBars).toEqual([]);

    liveKebidanan.resolve(jsonRes({
      siteConfigured: true, connected: true, txMbps: 0.01, rxMbps: 0.02,
      txBps: 10000, rxBps: 20000, ip: '10.0.0.2', interface: 'ether1'
    }));
    historyKebidanan.resolve(jsonRes({ data: [{ txBps: 1000, rxBps: 1000 }] }));
    await flush();

    // Hanya data Kebidanan (riwayat + live) yang digambar.
    expect(component.chartBars.length).toBe(2);
    expect(component.peakRate).toBe('30 Kbps');
  });
});
