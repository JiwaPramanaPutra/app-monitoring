import { deviceKey, findDuplicateIp, isUsableIp } from './device-identity';

describe('device-identity', () => {
  describe('deviceKey', () => {
    it('prefers _id, which is all a Mongo-backed device has', () => {
      expect(deviceKey({ _id: '6ab49dbf3232eb2c6fc7b657' })).toBe('6ab49dbf3232eb2c6fc7b657');
      expect(deviceKey({ _id: '6ab49dbf3232eb2c6fc7b657', id: 7 })).toBe('6ab49dbf3232eb2c6fc7b657');
    });

    it('falls back to id for a local-mode record', () => {
      expect(deviceKey({ id: 7 })).toBe('7');
      expect(deviceKey({ id: 'dev_1' })).toBe('dev_1');
    });

    it('normalizes numbers to strings so === comparisons cannot drift', () => {
      expect(deviceKey({ id: 7 })).toBe(deviceKey({ _id: '7' }));
    });

    it('returns an empty key only when there is no key at all', () => {
      expect(deviceKey({})).toBe('');
      expect(deviceKey({ _id: null, id: undefined })).toBe('');
      expect(deviceKey(null)).toBe('');
      expect(deviceKey(undefined)).toBe('');
    });

    it('gives different devices different keys — the bug was every row matching', () => {
      const a = deviceKey({ _id: 'aaa' });
      const b = deviceKey({ _id: 'bbb' });
      expect(a).not.toBe(b);
      expect(a === b).toBe(false);
    });
  });

  const devices = [
    { id: 'd1', name: 'Router Srikandi', ip: '223.27.147.18', siteLocation: 'Poltekkes Gizi' },
    { id: 'd2', name: 'AP-Akademik-Lt1', ip: '192.168.104.5', siteLocation: 'Poltekkes Gizi' },
    { id: 'd3', name: 'AP-Gedung Belakang', ip: '192.168.104.5', siteLocation: 'Poltekkes Gigi' },
    { id: 'd4', name: 'Tanpa IP', ip: '—', siteLocation: 'Poltekkes Gizi' }
  ];

  describe('isUsableIp', () => {
    it('accepts a real address', () => {
      expect(isUsableIp('223.27.147.18')).toBe(true);
      expect(isUsableIp('router.local')).toBe(true);
    });

    it('rejects the placeholder values the table uses for "no IP"', () => {
      for (const value of ['', '   ', '—', '-', 'N/A', 'n/a', 'NA', null, undefined]) {
        expect(isUsableIp(value as any)).toBe(false);
      }
    });
  });

  describe('findDuplicateIp', () => {
    it('finds another device on the same site with the same IP', () => {
      const clash = findDuplicateIp(devices, '223.27.147.18', 'Poltekkes Gizi');
      expect(clash?.name).toBe('Router Srikandi');
    });

    it('never reports the edited device as its own duplicate', () => {
      expect(findDuplicateIp(devices, '223.27.147.18', 'Poltekkes Gizi', 'd1')).toBeNull();
    });

    it('excludes the edited device when the record is Mongo-backed (has _id, no id)', () => {
      // Dokumen Mongo hanya punya `_id`. Memeriksa `id` saja membuat perangkat
      // dianggap bentrok dengan dirinya sendiri, sehingga setiap edit yang
      // mempertahankan IP ditolak di deployment utama.
      const mongo = [
        { _id: '6ab49dbf3232eb2c6fc7b657', name: 'Router', ip: '223.27.147.18', siteLocation: 'Poltekkes Gizi' },
        { _id: '6ab4cccc62800075e1d87925', name: 'AP Lama', ip: '10.0.0.9', siteLocation: 'Poltekkes Gizi' }
      ];
      expect(findDuplicateIp(mongo, '223.27.147.18', 'Poltekkes Gizi', '6ab49dbf3232eb2c6fc7b657')).toBeNull();
      expect(findDuplicateIp(mongo, '223.27.147.18', 'Poltekkes Gizi', '6ab4cccc62800075e1d87925')?.name).toBe('Router');
      expect(findDuplicateIp(mongo, '10.0.0.9', 'Poltekkes Gizi', '6ab4cccc62800075e1d87925')).toBeNull();
    });

    it('also excludes a local-mode record that carries both id and _id', () => {
      const local = [
        { _id: 'd1', id: 'd1', name: 'Lokal', ip: '10.0.0.1', siteLocation: 'Poltekkes Gizi' }
      ];
      expect(findDuplicateIp(local, '10.0.0.1', 'Poltekkes Gizi', 'd1')).toBeNull();
    });

    it('allows the same private address on a different site', () => {
      // d2 dan d3 sama-sama 192.168.104.5, tapi beda site -> sah.
      expect(findDuplicateIp(devices, '192.168.104.5', 'Poltekkes Gizi', 'd2')).toBeNull();
      expect(findDuplicateIp(devices, '192.168.104.5', 'Poltekkes Gigi', 'd3')).toBeNull();
      expect(findDuplicateIp(devices, '192.168.104.5', 'Kebidanan')).toBeNull();
    });

    it('ignores placeholder IPs so devices without an address never collide', () => {
      expect(findDuplicateIp(devices, '—', 'Poltekkes Gizi')).toBeNull();
      expect(findDuplicateIp(devices, '', 'Poltekkes Gizi')).toBeNull();
      expect(findDuplicateIp(devices, null, 'Poltekkes Gizi')).toBeNull();
      expect(findDuplicateIp(devices, undefined, 'Poltekkes Gizi')).toBeNull();
    });

    it('treats whitespace and letter case as equal', () => {
      expect(findDuplicateIp(devices, ' 223.27.147.18 ', 'Poltekkes Gizi')?.id).toBe('d1');
      const hosts = [{ id: 'h1', ip: 'RO-CNI.Poltekkes-Gigi', siteLocation: 'Poltekkes Gigi' }];
      expect(findDuplicateIp(hosts, 'ro-cni.poltekkes-gigi', 'Poltekkes Gigi')?.id).toBe('h1');
    });

    it('requires the site to match exactly', () => {
      expect(findDuplicateIp(devices, '223.27.147.18', 'Poltekkes')).toBeNull();
      expect(findDuplicateIp(devices, '223.27.147.18', '')).toBeNull();
    });

    it('tolerates a missing device list', () => {
      expect(findDuplicateIp(null, '223.27.147.18', 'Poltekkes Gizi')).toBeNull();
      expect(findDuplicateIp(undefined, '223.27.147.18', 'Poltekkes Gizi')).toBeNull();
    });
  });
});
