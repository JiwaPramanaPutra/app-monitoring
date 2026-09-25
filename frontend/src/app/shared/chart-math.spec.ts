import {
  alignFor,
  countMissing,
  indexFromRatio,
  lastIndexWithData,
  leftPercent,
  missingLimit
} from './chart-math';

describe('chart-math', () => {
  describe('indexFromRatio', () => {
    it('maps the two edges to the first and last point', () => {
      expect(indexFromRatio(0, 24)).toBe(0);
      expect(indexFromRatio(1, 24)).toBe(23);
    });

    it('rounds to the nearest point', () => {
      // 24 titik -> 23 langkah; 1/23 ≈ 0.0435
      expect(indexFromRatio(0.043, 24)).toBe(1);
      expect(indexFromRatio(0.9, 24)).toBe(21);
    });

    it('clamps a cursor outside the box', () => {
      expect(indexFromRatio(-0.5, 24)).toBe(0);
      expect(indexFromRatio(1.7, 24)).toBe(23);
    });

    it('handles a single-point chart without dividing by zero', () => {
      expect(indexFromRatio(0, 1)).toBe(0);
      expect(indexFromRatio(0.5, 1)).toBe(0);
      expect(indexFromRatio(1, 1)).toBe(0);
    });

    it('tolerates malformed input', () => {
      expect(indexFromRatio(NaN, 24)).toBe(0);
      expect(indexFromRatio(undefined as any, 24)).toBe(0);
      expect(indexFromRatio(0.5, 0)).toBe(0);
    });
  });

  describe('leftPercent', () => {
    it('spreads points evenly across the viewBox', () => {
      expect(leftPercent(0, 24)).toBe(0);
      expect(leftPercent(11.5, 24)).toBe(50);
      expect(leftPercent(23, 24)).toBe(100);
    });

    it('puts a single point at the left edge instead of dividing by zero', () => {
      expect(leftPercent(0, 1)).toBe(0);
    });
  });

  describe('alignFor', () => {
    it('sticks to the left edge near the start', () => {
      // Inilah perbaikan F-69: tanpa mode ini tooltip jam 00:00 terpotong
      // pembungkus yang `overflow-x: auto`.
      expect(alignFor(0)).toBe('left');
      expect(alignFor(11.9)).toBe('left');
    });

    it('flips to the right edge near the end', () => {
      expect(alignFor(75.1)).toBe('right');
      expect(alignFor(100)).toBe('right');
    });

    it('centers everywhere else', () => {
      expect(alignFor(12)).toBe('center');
      expect(alignFor(50)).toBe('center');
      expect(alignFor(75)).toBe('center');
    });
  });

  describe('lastIndexWithData', () => {
    it('finds the last point that has samples', () => {
      expect(lastIndexWithData([{ samples: 3 }, { samples: 0 }, { samples: 1 }])).toBe(2);
    });

    it('is -1 when nothing has data', () => {
      expect(lastIndexWithData([{ samples: 0 }, {}])).toBe(-1);
      expect(lastIndexWithData([])).toBe(-1);
      expect(lastIndexWithData(null)).toBe(-1);
    });
  });

  describe('countMissing', () => {
    const day = [
      { samples: 5 }, { samples: 0 }, { samples: 0 }, { samples: 7 }, { samples: 0 }
    ];

    it('counts empty points up to the limit', () => {
      expect(countMissing(day, 4)).toBe(3);
      expect(countMissing(day, 3)).toBe(2);
    });

    it('never counts past the end of the list', () => {
      expect(countMissing(day, 99)).toBe(3);
    });

    it('returns 0 when there is nothing to count up to', () => {
      expect(countMissing(day, -1)).toBe(0);
      expect(countMissing([], 5)).toBe(0);
      expect(countMissing(null, 5)).toBe(0);
    });
  });

  describe('missingLimit (fix F-71)', () => {
    it('uses the current slot when no data arrived at all', () => {
      // Hari bolong total: tanpa ini badge-nya menampilkan 0.
      expect(missingLimit(-1, 8)).toBe(8);
    });

    it('uses the current slot when the outage came AFTER the last sample', () => {
      // Sample berhenti jam 10, sekarang jam 15 -> celah 11..15 harus terhitung.
      expect(missingLimit(10, 15)).toBe(15);
    });

    it('falls back to the last sample when the current slot is unknown', () => {
      // Periode yang tidak punya slot waktu (mis. bulanan) -> perilaku lama.
      expect(missingLimit(10, -1)).toBe(10);
    });

    it('never limits past the current slot, so future hours stay excluded', () => {
      // Sekarang jam 08 -> jam 09..23 tidak dihitung walau daftarnya 24 slot.
      expect(missingLimit(8, 8)).toBe(8);
    });
  });

  describe('a full current day reports no missing points (F-68 kept)', () => {
    it('counts only up to the current hour', () => {
      const full = Array.from({ length: 24 }, () => ({ samples: 4 }));
      const lastWithData = lastIndexWithData(full);
      expect(countMissing(full, missingLimit(lastWithData, 8))).toBe(0);
    });
  });
});
