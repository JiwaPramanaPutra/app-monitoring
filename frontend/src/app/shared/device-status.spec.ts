import { describe, expect, it } from 'vitest';
import { deviceStatusColor, deviceStatusIsDown } from './device-status';

describe('deviceStatusColor', () => {
  it('Online hijau, Offline merah', () => {
    expect(deviceStatusColor('Online')).toBe('#5B7A52');
    expect(deviceStatusColor('Offline')).toBe('#C4442E');
  });

  it('Tidak Terpantau abu-abu, BUKAN merah', () => {
    // Merah berarti "perangkat mati". Server yang tidak bisa menjangkau tidak
    // membuktikan itu.
    expect(deviceStatusColor('Tidak Terpantau')).toBe('#9AA0A6');
    expect(deviceStatusColor('Tidak Terpantau')).not.toBe('#C4442E');
  });

  it('status kosong atau tak dikenal tidak mengklaim merah', () => {
    expect(deviceStatusColor(null)).toBe('#9AA0A6');
    expect(deviceStatusColor(undefined)).toBe('#9AA0A6');
    expect(deviceStatusColor('')).toBe('#9AA0A6');
    expect(deviceStatusColor('Entah')).toBe('#9AA0A6');
  });
});

describe('deviceStatusIsDown', () => {
  it('hanya Offline yang dianggap down', () => {
    expect(deviceStatusIsDown('Offline')).toBe(true);
    expect(deviceStatusIsDown('Online')).toBe(false);
    expect(deviceStatusIsDown('Tidak Terpantau')).toBe(false);
    expect(deviceStatusIsDown(null)).toBe(false);
  });
});
