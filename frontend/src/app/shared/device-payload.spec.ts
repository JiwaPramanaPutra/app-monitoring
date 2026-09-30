import { deviceWritePayload } from './device-payload';

describe('deviceWritePayload', () => {
  it('membuang status, mempertahankan field lain', () => {
    const payload = {
      status: 'Tidak Terpantau',
      name: 'Router Gigi',
      ip: '223.27.147.18',
      type: 'Router',
      siteLocation: 'Poltekkes Gizi'
    };

    expect(deviceWritePayload(payload)).toEqual({
      name: 'Router Gigi',
      ip: '223.27.147.18',
      type: 'Router',
      siteLocation: 'Poltekkes Gizi'
    });
  });

  it('tidak mengubah objek sumber', () => {
    const payload = { status: 'Online', name: 'AP' };

    deviceWritePayload(payload);

    expect(payload.status).toBe('Online');
  });
});
