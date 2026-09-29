import {
  buildActivities,
  buildProblemDevices,
  buildRecentReports,
  buildSiteHealth,
  countDevicesByStatus,
  countReportsInMonth,
  deviceAvailabilityPct
} from './dashboard-data';

const DEVICES = [
  { name: 'AP-1', type: 'Access Point', siteLocation: 'A', status: 'Online', ip: '10.0.0.1' },
  { name: 'AP-2', type: 'Access Point', siteLocation: 'A', status: 'Offline', ip: '10.0.0.2' },
  { name: 'AP-3', type: 'Access Point', siteLocation: 'B', status: 'Tidak Terpantau', ip: '10.0.0.3' },
  { name: 'R-1', type: 'Router', siteLocation: 'B', status: 'Online', ip: '10.0.0.4' }
];

describe('dashboard-data', () => {
  describe('countDevicesByStatus', () => {
    it('menghitung total, online, offline, dan tidak terpantau', () => {
      expect(countDevicesByStatus(DEVICES)).toEqual({ total: 4, online: 2, offline: 1, notMonitored: 1 });
    });

    it('masukan kosong/aneh aman', () => {
      expect(countDevicesByStatus(null)).toEqual({ total: 0, online: 0, offline: 0, notMonitored: 0 });
      expect(countDevicesByStatus('bukan-array' as any).total).toBe(0);
    });
  });

  describe('deviceAvailabilityPct', () => {
    it('hanya menghitung perangkat yang terklaim (Online+Offline)', () => {
      expect(deviceAvailabilityPct(DEVICES)).toBe(67); // 2 dari 3
    });

    it('null bila belum ada perangkat terklaim', () => {
      expect(deviceAvailabilityPct([{ status: 'Tidak Terpantau' }])).toBeNull();
      expect(deviceAvailabilityPct([])).toBeNull();
    });
  });

  describe('buildSiteHealth', () => {
    it('menghitung online/total per site dan status warna', () => {
      const health = buildSiteHealth(['A', 'B', 'C'], DEVICES);

      expect(health[0]).toMatchObject({ name: 'A', total: 2, online: 1, percentage: 50, status: 'Perlu perhatian' });
      expect(health[1]).toMatchObject({ name: 'B', total: 2, online: 1, percentage: 50, status: 'Perlu perhatian' });
      expect(health[2]).toMatchObject({ name: 'C', total: 0, online: 0, percentage: 0, status: 'Belum ada perangkat' });
    });

    it('semua online = Sehat; tidak ada online = Gangguan', () => {
      expect(buildSiteHealth(['A'], [{ siteLocation: 'A', status: 'Online' }])[0].status).toBe('Sehat');
      expect(buildSiteHealth(['A'], [{ siteLocation: 'A', status: 'Offline' }])[0].status).toBe('Gangguan');
    });
  });

  describe('buildProblemDevices', () => {
    it('hanya bukan Online, maksimal 3, dengan teks masalah', () => {
      const problems = buildProblemDevices(DEVICES);

      expect(problems.map(p => p.name)).toEqual(['AP-2', 'AP-3']);
      expect(problems[0].problem).toBe('Tidak dapat dijangkau');
      expect(problems[1].problem).toBe('Belum pernah terpantau');
    });
  });

  describe('countReportsInMonth', () => {
    it('mengikuti bulan kalender zona pengguna', () => {
      const reports = [{ date: '2026-09-01' }, { date: '2026-09-30' }, { date: '2026-08-31' }, { date: '' }];
      const now = new Date('2026-09-15T04:00:00Z');

      expect(countReportsInMonth(reports, 'Asia/Jakarta', now)).toBe(2);
      expect(countReportsInMonth(reports, 'UTC', now)).toBe(2);

      // 1 Okt 00:30 WITA sudah bulan baru, walau UTC masih 30 Sep.
      const nowWita = new Date('2026-09-30T16:30:00Z');
      expect(countReportsInMonth(reports, 'Asia/Makassar', nowWita)).toBe(0);
    });
  });

  describe('buildRecentReports', () => {
    it('urut terbaru dan memetakan badge jenis + warna + jam zona', () => {
      const reports = [
        { date: '2026-09-20', createdAt: '2026-09-20T02:00:00Z', masalah: 'lama', site: 'A', technician: 'T', type: 'Jaringan' },
        { date: '2026-09-25', createdAt: '2026-09-25T03:30:00Z', masalah: 'baru', site: 'B', technician: 'U', type: 'Printer / komputer' }
      ];

      const mapped = buildRecentReports(reports, 'Asia/Jakarta');

      expect(mapped.map(r => r.content)).toEqual(['baru', 'lama']);
      expect(mapped[0]).toMatchObject({ site: 'B', technician: 'U', type: 'Printer / komputer', color: '#D9A441', time: '10:30' });
    });
  });

  describe('buildActivities', () => {
    it('urut terbaru; event terbuka = belum pulih, tertutup = pulih', () => {
      const events = [
        { site: 'A', kind: 'unreachable', startTimeIso: '2026-09-26T00:10:00Z', endTimeIso: '2026-09-26T00:20:00Z' },
        { site: 'B', kind: 'interface-down', startTimeIso: '2026-09-26T01:00:00Z', endTimeIso: null }
      ];

      const items = buildActivities(events, 'Asia/Jakarta');

      expect(items[0]).toEqual({ time: '08:00', content: 'B downtime (link putus)' });
      expect(items[1]).toEqual({ time: '07:20', content: 'A pulih dari tidak terpantau' });
    });
  });
});
