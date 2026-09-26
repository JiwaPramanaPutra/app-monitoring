import { describe, expect, it } from 'vitest';
import { managementActions, managementLabel, managementUrlFor, normalizeManagementUrl } from './management-url';

describe('normalizeManagementUrl', () => {
  it('membiarkan URL yang sudah berskema', () => {
    expect(normalizeManagementUrl('http://172.16.1.1:8291')).toBe('http://172.16.1.1:8291');
    expect(normalizeManagementUrl('https://172.16.1.1')).toBe('https://172.16.1.1');
  });

  it('menambahkan http bila pengguna mengetik tanpa skema', () => {
    // Defaultnya http, bukan https: WebFig MikroTik di 8291 memakai http.
    expect(normalizeManagementUrl('172.16.1.1:8291')).toBe('http://172.16.1.1:8291');
    expect(normalizeManagementUrl('172.16.1.1')).toBe('http://172.16.1.1');
  });

  it('kosong tetap kosong', () => {
    expect(normalizeManagementUrl('')).toBe('');
    expect(normalizeManagementUrl('   ')).toBe('');
    expect(normalizeManagementUrl(null)).toBe('');
    expect(normalizeManagementUrl(undefined)).toBe('');
  });
});

describe('managementUrlFor', () => {
  it('mengutamakan URL yang diisi pengguna', () => {
    const out = managementUrlFor({ ip: '172.16.1.1', brand: 'MikroTik', managementUrl: 'https://router.local:8443' });
    expect(out).toBe('https://router.local:8443');
  });

  it('MikroTik tanpa URL eksplisit memakai 8291, bukan port 80', () => {
    // Inilah cacatnya: port 80 kosong di RouterOS, jadi tombolnya tidak pernah terbuka.
    const out = managementUrlFor({ ip: '172.16.1.1', brand: 'MikroTik', type: 'Router' });
    expect(out).toBe('http://172.16.1.1:8291');
    expect(out).not.toBe('http://172.16.1.1');
  });

  it('mereknya tidak peka huruf besar/kecil', () => {
    expect(managementUrlFor({ ip: '10.0.0.1', brand: 'mikrotik' })).toBe('http://10.0.0.1:8291');
    expect(managementUrlFor({ ip: '10.0.0.1', brand: 'MIKROTIK RouterOS' })).toBe('http://10.0.0.1:8291');
  });

  it('Ruijie memakai https', () => {
    expect(managementUrlFor({ ip: '172.16.2.25', brand: 'Ruijie', type: 'Access Point' })).toBe('https://172.16.2.25');
  });

  it('merek lain tetap http biasa', () => {
    expect(managementUrlFor({ ip: '172.16.3.5', brand: 'TP-Link' })).toBe('http://172.16.3.5');
    expect(managementUrlFor({ ip: '172.16.3.5', brand: '' })).toBe('http://172.16.3.5');
  });

  it('IP yang tidak terpakai tidak menghasilkan URL', () => {
    for (const ip of ['', '—', '-', 'n/a', 'N/A', 'tidak ada', null, undefined]) {
      expect(managementUrlFor({ ip: ip as any, brand: 'MikroTik' })).toBe('');
    }
  });

  it('perangkat kosong tidak menghasilkan URL', () => {
    expect(managementUrlFor(null)).toBe('');
    expect(managementUrlFor(undefined)).toBe('');
    expect(managementUrlFor({})).toBe('');
  });
});

describe('managementLabel', () => {
  it('menggabungkan merek dan tipe yang sebenarnya', () => {
    expect(managementLabel({ brand: 'MikroTik', type: 'Router' })).toBe('MikroTik Router');
    expect(managementLabel({ brand: 'TP-Link', type: 'Access Point' })).toBe('TP-Link Access Point');
  });

  it('tidak mengarang kalau datanya kosong', () => {
    expect(managementLabel({})).toBe('Perangkat');
    expect(managementLabel({ brand: 'MikroTik' })).toBe('MikroTik');
    expect(managementLabel(null)).toBe('');
  });
});

describe('managementActions', () => {
  it('selalu menawarkan web console sebagai aksi utama untuk perangkat ber-IP', () => {
    const acts = managementActions({ ip: '172.16.3.5', brand: 'TP-Link', type: 'Access Point' });

    expect(acts.length).toBe(1);
    expect(acts[0].kind).toBe('web');
    expect(acts[0].label).toBe('Buka Web Console');
    expect(acts[0].url).toBe('http://172.16.3.5');
  });

  it('menawarkan Winbox HANYA untuk MikroTik, sebagai aksi kedua', () => {
    const acts = managementActions({ ip: '223.27.147.18', brand: 'MikroTik', type: 'Router' });

    expect(acts.length).toBe(2);
    expect(acts[0].kind).toBe('web');
    expect(acts[1].kind).toBe('winbox');
    expect(acts[1].url).toBe('winbox://223.27.147.18');
  });

  it('catatan Winbox wajib ada dan menyebut syaratnya', () => {
    // Handler winbox:// TIDAK terdaftar di Windows ini meski Winbox terpasang;
    // tanpa catatan ini tombolnya jadi tombol yang tidak melakukan apa-apa.
    const [_, winbox] = managementActions({ ip: '223.27.147.18', brand: 'MikroTik' });

    expect(winbox.note).toBeTruthy();
    expect(String(winbox.note)).toContain('handler winbox://');
  });

  it('merek non-MikroTik tidak pernah mendapat aksi Winbox', () => {
    for (const brand of ['TP-Link', 'Ruijie', 'Cisco', '', 'Huawei']) {
      const acts = managementActions({ ip: '10.0.0.1', brand });
      expect(acts.some(a => a.kind === 'winbox')).toBe(false);
    }
  });

  it('URL berdomain dilabeli Portal Cloud, bukan Web Console', () => {
    // Ruijie Cloud tidak bisa ditebak aplikasi: tautannya milik pengguna.
    const acts = managementActions({
      ip: '172.16.2.25',
      brand: 'Ruijie',
      managementUrl: 'https://cloud.ruijienetworks.com/dashboard'
    });

    expect(acts[0].kind).toBe('cloud');
    expect(acts[0].label).toBe('Buka Portal Cloud');
    expect(acts[0].url).toBe('https://cloud.ruijienetworks.com/dashboard');
  });

  it('IP yang tidak terpakai tidak menghasilkan aksi apa pun', () => {
    expect(managementActions({ ip: '—', brand: 'MikroTik' })).toEqual([]);
    expect(managementActions({})).toEqual([]);
    expect(managementActions(null)).toEqual([]);
  });

  it('MikroTik tanpa IP tetap tidak dapat aksi Winbox', () => {
    const acts = managementActions({ ip: 'n/a', brand: 'MikroTik' });
    expect(acts).toEqual([]);
  });
});
