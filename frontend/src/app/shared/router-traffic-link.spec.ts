import { bridgeDraftError, hasRouterDeviceFor, hasTrafficRouterConfig, isTrafficRouter, leavesSiteWithoutRouter, trafficRouterNoteFor } from './router-traffic-link';

describe('router-traffic-link', () => {
  describe('bridgeDraftError', () => {
    const ready = {
      enabled: true, host: '223.27.155.58', interface: 'ether1-WAN',
      user: 'app-monitoring', password: 'rahasia'
    };

    it('is null when the bridge is off, whatever the fields say', () => {
      expect(bridgeDraftError({ enabled: false, host: '', interface: '', user: '', password: '' }, null)).toBeNull();
      expect(bridgeDraftError(null, null)).toBeNull();
      expect(bridgeDraftError(undefined, { user: 'x' })).toBeNull();
    });

    it('is null when the draft is complete', () => {
      expect(bridgeDraftError(ready, null)).toBeNull();
    });

    it('demands an IP address to point at', () => {
      expect(bridgeDraftError({ ...ready, host: '   ' }, null)).toMatch(/IP Address/);
    });

    it('demands an interface instead of silently falling back to ether1', () => {
      const message = bridgeDraftError({ ...ready, interface: '  ' }, null);
      expect(message).toMatch(/interface/i);
      expect(message).not.toMatch(/ether1/);
    });

    it('accepts empty credentials when the site stores a password (the real API shape)', () => {
      // `GET /api/projects` meredaksi password dan hanya menyisakan `hasPassword`,
      // jadi inilah bentuk yang benar-benar diterima komponen.
      expect(bridgeDraftError(
        { ...ready, user: '', password: '' },
        { user: 'app-monitoring', hasPassword: true }
      )).toBeNull();
      expect(bridgeDraftError(
        { ...ready, password: '' },
        { user: 'app-monitoring', hasPassword: true }
      )).toBeNull();
    });

    it('accepts a stored username combined with a freshly typed password', () => {
      expect(bridgeDraftError({ ...ready, user: '' }, { user: 'app-monitoring' })).toBeNull();
    });

    it('demands credentials when nothing is stored for the site', () => {
      expect(bridgeDraftError({ ...ready, user: '' }, null)).toMatch(/username/i);
      expect(bridgeDraftError({ ...ready, password: '' }, { user: 'app-monitoring' })).toMatch(/password/i);
      expect(bridgeDraftError({ ...ready, password: '' }, { user: 'app-monitoring', hasPassword: false }))
        .toMatch(/password/i);
    });

    it('ignores an empty routerConfig from the API instead of trusting it', () => {
      expect(bridgeDraftError({ ...ready, password: '' }, {})).toMatch(/password/i);
      expect(bridgeDraftError({ ...ready, user: '' }, {})).toMatch(/username/i);
    });
  });

  describe('leavesSiteWithoutRouter', () => {
    const otherRouter = { id: 'd2', type: 'Router', ip: '10.0.0.2', siteLocation: 'Poltekkes Gizi' };

    it('is false when the device was never a Router', () => {
      expect(leavesSiteWithoutRouter(
        { id: 'd1', type: 'Access Point', siteLocation: 'Poltekkes Gizi' },
        { type: 'Access Point', siteLocation: 'Poltekkes Gizi' }, [otherRouter]
      )).toBe(false);
    });

    it('is false while it stays a Router in the same site', () => {
      expect(leavesSiteWithoutRouter(
        { id: 'd1', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Router', siteLocation: 'Poltekkes Gizi' }, [otherRouter]
      )).toBe(false);
    });

    it('is true when the last Router becomes an Access Point', () => {
      expect(leavesSiteWithoutRouter(
        { id: 'd1', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Access Point', siteLocation: 'Poltekkes Gizi' }, []
      )).toBe(true);
    });

    it('is false when another Router of the same site remains', () => {
      expect(leavesSiteWithoutRouter(
        { id: 'd1', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Access Point', siteLocation: 'Poltekkes Gizi' }, [otherRouter]
      )).toBe(false);
    });

    it('is true when the only Router moves to another site', () => {
      // Router lain ada, tapi di site berbeda — tidak menyelamatkan site lama.
      const elsewhere = { id: 'd9', type: 'Router', ip: '10.0.0.9', siteLocation: 'Kebidanan' };
      expect(leavesSiteWithoutRouter(
        { id: 'd1', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Router', siteLocation: 'Kebidanan' }, [elsewhere]
      )).toBe(true);
    });

    it('is false when a Router of the original site remains after the move', () => {
      expect(leavesSiteWithoutRouter(
        { id: 'd1', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Router', siteLocation: 'Kebidanan' }, [otherRouter]
      )).toBe(false);
    });

    it('ignores Router devices belonging to a different site', () => {
      const elsewhere = { id: 'd9', type: 'Router', ip: '10.0.0.9', siteLocation: 'Kebidanan' };
      expect(leavesSiteWithoutRouter(
        { id: 'd1', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Access Point', siteLocation: 'Poltekkes Gizi' }, [elsewhere]
      )).toBe(true);
    });

    it('never counts the edited device itself, matched by id', () => {
      const self = { id: 'd1', type: 'Router', ip: '10.0.0.1', siteLocation: 'Poltekkes Gizi' };
      expect(leavesSiteWithoutRouter(
        { id: 'd1', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Access Point', siteLocation: 'Poltekkes Gizi' }, [self]
      )).toBe(true);
    });

    it('never counts the edited device itself when the record is Mongo-backed (_id only)', () => {
      // Dokumen Mongo hanya punya `_id`. Memeriksa `id` saja meninggalkan record
      // basi perangkat itu sendiri, sehingga peringatan "monitoring trafik akan
      // berhenti" tidak pernah muncul dan routerConfig site tidak pernah dibersihkan.
      const mongoDevices = [
        { _id: '6ab49dbf3232eb2c6fc7b657', type: 'Router', ip: '223.27.147.18', siteLocation: 'Poltekkes Gizi' },
        { _id: '6ab4cccc62800075e1d87925', type: 'Access Point', ip: '10.0.0.9', siteLocation: 'Poltekkes Gizi' }
      ];
      expect(leavesSiteWithoutRouter(
        { _id: '6ab49dbf3232eb2c6fc7b657', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Access Point', siteLocation: 'Poltekkes Gizi' }, mongoDevices
      )).toBe(true);
    });

    it('still reports false when another Mongo Router of the same site remains', () => {
      const mongoDevices = [
        { _id: 'aaa', type: 'Router', ip: '10.0.0.1', siteLocation: 'Poltekkes Gizi' },
        { _id: 'bbb', type: 'Router', ip: '10.0.0.2', siteLocation: 'Poltekkes Gizi' }
      ];
      expect(leavesSiteWithoutRouter(
        { _id: 'aaa', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Access Point', siteLocation: 'Poltekkes Gizi' }, mongoDevices
      )).toBe(false);
    });

    it('excludes a local-mode record matched through either id or _id', () => {
      const local = [{ _id: 'd1', id: 'd1', type: 'Router', ip: '10.0.0.1', siteLocation: 'Poltekkes Gizi' }];
      expect(leavesSiteWithoutRouter(
        { id: 'd1', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Access Point', siteLocation: 'Poltekkes Gizi' }, local
      )).toBe(true);
      expect(leavesSiteWithoutRouter(
        { _id: 'd1', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Access Point', siteLocation: 'Poltekkes Gizi' }, local
      )).toBe(true);
    });

    it('tolerates missing input and a missing device list', () => {
      expect(leavesSiteWithoutRouter(null, null, null)).toBe(false);
      expect(leavesSiteWithoutRouter(undefined, undefined, undefined)).toBe(false);
      expect(leavesSiteWithoutRouter(
        { id: 'd1', type: 'Router', siteLocation: 'Poltekkes Gizi' },
        { type: 'Access Point', siteLocation: 'Poltekkes Gizi' }, null
      )).toBe(true);
    });
  });

  describe('hasRouterDeviceFor', () => {
    const devices = [
      { type: 'Router', ip: '223.27.155.162', siteLocation: 'Kebidanan' },
      { type: 'Router', ip: '223.27.147.18', siteLocation: 'Poltekkes Gizi' },
      { type: 'Access Point', ip: '223.27.155.58', siteLocation: 'Poltekkes Gizi' }
    ];

    it('finds a Router registered for the site, whatever its IP', () => {
      expect(hasRouterDeviceFor('Poltekkes Gizi', devices)).toBe(true);
      expect(hasRouterDeviceFor('Kebidanan', devices)).toBe(true);
    });

    it('is false for a site without a Router device', () => {
      expect(hasRouterDeviceFor('Poltekkes Gigi', devices)).toBe(false);
    });

    it('never counts a non-Router device', () => {
      expect(hasRouterDeviceFor('Poltekkes Gizi', [
        { type: 'Access Point', ip: '223.27.155.58', siteLocation: 'Poltekkes Gizi' }
      ])).toBe(false);
    });

    it('is false once the last Router of the site has been removed', () => {
      const remaining = devices.filter(d => d.siteLocation !== 'Poltekkes Gizi');
      expect(hasRouterDeviceFor('Poltekkes Gizi', remaining)).toBe(false);
    });

    it('stays true while another Router of the same site remains', () => {
      const two = [
        { type: 'Router', ip: '10.0.0.1', siteLocation: 'Poltekkes Gizi' },
        { type: 'Router', ip: '10.0.0.2', siteLocation: 'Poltekkes Gizi' }
      ];
      expect(hasRouterDeviceFor('Poltekkes Gizi', two.slice(1))).toBe(true);
    });

    it('tolerates a missing device list', () => {
      expect(hasRouterDeviceFor('Poltekkes Gizi', null)).toBe(false);
      expect(hasRouterDeviceFor('Poltekkes Gizi', undefined)).toBe(false);
    });
  });

  describe('hasTrafficRouterConfig', () => {
    it('is true only when the site router host is filled in', () => {
      expect(hasTrafficRouterConfig({ routerConfig: { host: '223.27.155.58' } })).toBe(true);
      expect(hasTrafficRouterConfig({ routerConfig: { host: ' ro-cni.poltekkes-gigi ' } })).toBe(true);
    });

    it('is false after the host is cleared (router device deleted)', () => {
      expect(hasTrafficRouterConfig({ routerConfig: { host: '' } })).toBe(false);
      expect(hasTrafficRouterConfig({ routerConfig: { host: '   ' } })).toBe(false);
    });

    it('is false when the site has no routerConfig at all', () => {
      expect(hasTrafficRouterConfig({})).toBe(false);
      expect(hasTrafficRouterConfig({ routerConfig: null })).toBe(false);
      expect(hasTrafficRouterConfig(null)).toBe(false);
      expect(hasTrafficRouterConfig(undefined)).toBe(false);
    });
  });

  describe('isTrafficRouter', () => {
  const routerDevice = { type: 'Router', ip: '223.27.155.58' };

  it('matches a Router device whose IP is the site traffic host', () => {
    expect(isTrafficRouter(routerDevice, { host: '223.27.155.58' })).toBe(true);
  });

  it('tolerates whitespace and hostname case differences', () => {
    expect(isTrafficRouter({ type: 'Router', ip: ' 223.27.155.58 ' }, { host: '223.27.155.58' })).toBe(true);
    expect(isTrafficRouter({ type: 'Router', ip: 'RO-CNI.POLTEKKES-GIGI' }, { host: 'ro-cni.poltekkes-gigi' })).toBe(true);
  });

  it('does not match a different host — this is how a widget pointed at another router', () => {
    expect(isTrafficRouter(routerDevice, { host: '223.27.147.18' })).toBe(false);
  });

  it('never matches a non-Router device, even with a matching IP', () => {
    expect(isTrafficRouter({ type: 'Access Point', ip: '223.27.155.58' }, { host: '223.27.155.58' })).toBe(false);
    expect(isTrafficRouter({ type: 'Switch', ip: '223.27.155.58' }, { host: '223.27.155.58' })).toBe(false);
    expect(isTrafficRouter({ type: 'Server', ip: '223.27.155.58' }, { host: '223.27.155.58' })).toBe(false);
  });

  it('never matches when the site has no routerConfig at all', () => {
    expect(isTrafficRouter(routerDevice, null)).toBe(false);
    expect(isTrafficRouter(routerDevice, undefined)).toBe(false);
    expect(isTrafficRouter(routerDevice, {})).toBe(false);
  });

  it('never matches after the site host has been cleared (device deleted)', () => {
    expect(isTrafficRouter(routerDevice, { host: '' })).toBe(false);
    expect(isTrafficRouter(routerDevice, { host: '   ' })).toBe(false);
  });

  it('never matches a device without a usable IP', () => {
    expect(isTrafficRouter({ type: 'Router', ip: '' }, { host: '223.27.155.58' })).toBe(false);
    expect(isTrafficRouter({ type: 'Router' }, { host: '223.27.155.58' })).toBe(false);
    expect(isTrafficRouter({ type: 'Router', ip: '   ' }, { host: '223.27.155.58' })).toBe(false);
  });

  it('tolerates missing device or missing type', () => {
    expect(isTrafficRouter(null, { host: '223.27.155.58' })).toBe(false);
    expect(isTrafficRouter(undefined, undefined)).toBe(false);
    expect(isTrafficRouter({ ip: '223.27.155.58' }, { host: '223.27.155.58' })).toBe(false);
  });
  });

  describe('trafficRouterNoteFor', () => {
    const devices = [
      { type: 'Router', ip: '223.27.147.18', siteLocation: 'Poltekkes Gizi' },
      { type: 'Access Point', ip: '223.27.155.58', siteLocation: 'Poltekkes Gizi' },
      { type: 'Router', ip: '223.27.155.162', siteLocation: 'Kebidanan' }
    ];

    it('returns null when the site is not monitored at all', () => {
      expect(trafficRouterNoteFor('Poltekkes Gizi', { host: '' }, devices)).toBeNull();
      expect(trafficRouterNoteFor('Poltekkes Gizi', null, devices)).toBeNull();
    });

    it('returns null when a Router device matches the traffic host', () => {
      const ok = [{ type: 'Router', ip: '223.27.155.58', siteLocation: 'Poltekkes Gizi' }];
      expect(trafficRouterNoteFor('Poltekkes Gizi', { host: '223.27.155.58' }, ok)).toBeNull();
    });

    it('reports a missing inventory device only when the site has no Router at all', () => {
      expect(trafficRouterNoteFor('Poltekkes Gigi', { host: '223.27.155.58' }, devices))
        .toBe('belum punya perangkat Router terdaftar');
    });

    it('reports an IP mismatch and names the stale IP instead of claiming no device', () => {
      const note = trafficRouterNoteFor('Poltekkes Gizi', { host: '223.27.155.58' }, devices);
      expect(note).toContain('223.27.147.18');
      expect(note).toContain('223.27.155.58');
      expect(note).not.toContain('belum punya perangkat');
    });

    it('ignores Router devices belonging to another site', () => {
      expect(trafficRouterNoteFor('Kebidanan', { host: '223.27.155.58' }, devices))
        .toBe('IP perangkat Router (223.27.155.162) tidak cocok dengan host router trafik 223.27.155.58');
    });

    it('never counts a non-Router device as the traffic router', () => {
      const apOnly = [{ type: 'Access Point', ip: '223.27.155.58', siteLocation: 'Poltekkes Gizi' }];
      expect(trafficRouterNoteFor('Poltekkes Gizi', { host: '223.27.155.58' }, apOnly))
        .toBe('belum punya perangkat Router terdaftar');
    });

    it('tolerates a missing device list', () => {
      expect(trafficRouterNoteFor('Poltekkes Gizi', { host: '223.27.155.58' }, null))
        .toBe('belum punya perangkat Router terdaftar');
      expect(trafficRouterNoteFor('Poltekkes Gizi', { host: '223.27.155.58' }, undefined))
        .toBe('belum punya perangkat Router terdaftar');
    });
  });
});
