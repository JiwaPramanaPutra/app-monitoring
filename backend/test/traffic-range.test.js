const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SAMPLE_LIMIT,
    WIB_OFFSET_MS,
    capSamples,
    isFlagOn,
    mergeSamples,
    rangeBounds
} = require('../services/traffic-range');

test('WIB_OFFSET_MS adalah UTC+7, bukan UTC+8', () => {
    assert.equal(WIB_OFFSET_MS, 7 * 60 * 60 * 1000);
    assert.notEqual(WIB_OFFSET_MS, 8 * 60 * 60 * 1000);
});

test('rangeBounds menafsirkan tanggal sebagai hari WIB', () => {
    const { startMs, endMs } = rangeBounds('2026-09-01', '2026-09-10');

    assert.equal(startMs.toISOString(), '2026-08-31T17:00:00.000Z');
    assert.equal(endMs.toISOString(), '2026-09-10T16:59:59.000Z');
});

test('rangeBounds: hari terakhir mencakup sampai 23:59:59 WIB', () => {
    const { startMs, endMs } = rangeBounds('2026-09-10', '2026-09-10');

    assert.equal(startMs.toISOString(), '2026-09-09T17:00:00.000Z');
    assert.equal(endMs.toISOString(), '2026-09-10T16:59:59.000Z');
    assert.equal(endMs.getTime() - startMs.getTime(), 24 * 60 * 60 * 1000 - 1000);
});

test('rangeBounds tanpa tanggal berarti tanpa batas', () => {
    assert.deepEqual(rangeBounds(null, null), { startMs: null, endMs: null });

    const partial = rangeBounds('2026-09-01', null);
    assert.equal(partial.startMs.toISOString(), '2026-08-31T17:00:00.000Z');
    assert.equal(partial.endMs, null);
});

test('capSamples: riwayat yang persis SAMPLE_LIMIT bukan pemotongan', () => {
    const docs = Array.from({ length: SAMPLE_LIMIT }, (_, i) => ({ i }));

    const { docs: kept, truncated } = capSamples(docs);

    assert.equal(truncated, false);
    assert.equal(kept.length, SAMPLE_LIMIT);
});

test('capSamples: baris ekstra menandai pemotongan dan dibuang', () => {
    const limit = 3;
    // Query memakai urutan menurun, jadi tiga baris pertama adalah yang terbaru.
    const docs = [{ i: 'baru' }, { i: 'tengah' }, { i: 'lama' }, { i: 'terbuang' }];

    const { docs: kept, truncated } = capSamples(docs, limit);

    assert.equal(truncated, true);
    assert.deepEqual(kept.map(d => d.i), ['baru', 'tengah', 'lama']);
});

test('capSamples: input bukan array diperlakukan sebagai kosong', () => {
    assert.deepEqual(capSamples(null), { docs: [], truncated: false });
    assert.deepEqual(capSamples(undefined, 5), { docs: [], truncated: false });
});

test('capSamples: tepat di bawah batas tidak dipotong', () => {
    const { docs, truncated } = capSamples([{ a: 1 }, { a: 2 }], 3);

    assert.equal(truncated, false);
    assert.equal(docs.length, 2);
});

test('isFlagOn: hanya "0" dan "false" yang mematikan', () => {
    assert.equal(isFlagOn(undefined), false);
    assert.equal(isFlagOn('0'), false);
    assert.equal(isFlagOn('false'), false);

    assert.equal(isFlagOn('1'), true);
    assert.equal(isFlagOn('true'), true);
    assert.equal(isFlagOn(''), true);
});

test('mergeSamples membuang duplikat site+timestamp dari dua sumber', () => {
    const stamp = '2026-09-01T03:00:00.000Z';
    const merged = mergeSamples([
        { site: 'Gizi', timestamp: stamp, txMbps: 1 },
        { site: 'Gizi', timestamp: stamp, txMbps: 1 },
        { site: 'Gizi', timestamp: stamp, txMbps: 1 }
    ], 'Gizi');

    assert.equal(merged.length, 1);
});

test('mergeSamples mengurutkan menaik walau sumbernya bercampur', () => {
    const merged = mergeSamples([
        { site: 'Gizi', timestamp: '2026-09-01T05:00:00.000Z' },
        { site: 'Gizi', timestamp: '2026-09-01T01:00:00.000Z' },
        { site: 'Gizi', timestamp: '2026-09-01T03:00:00.000Z' }
    ], 'Gizi');

    assert.deepEqual(merged.map(s => s.timestamp), [
        '2026-09-01T01:00:00.000Z',
        '2026-09-01T03:00:00.000Z',
        '2026-09-01T05:00:00.000Z'
    ]);
});

test('mergeSamples membuang baris tanpa timestamp yang bisa dibaca', () => {
    const merged = mergeSamples([
        { site: 'Gizi', timestamp: '2026-09-01T01:00:00.000Z' },
        { site: 'Gizi' },
        { site: 'Gizi', timestamp: null },
        { site: 'Gizi', timestamp: 'bukan-tanggal' },
        null
    ], 'Gizi');

    assert.equal(merged.length, 1);
});

test('mergeSamples tidak mencampur site lain dan memakai site pemanggil sebagai cadangan', () => {
    const merged = mergeSamples([
        { site: 'Kebidanan', timestamp: '2026-09-01T01:00:00.000Z' },
        { timestamp: '2026-09-01T02:00:00.000Z' }
    ], 'Gizi');

    assert.equal(merged.length, 2);
    assert.equal(merged[0].site, 'Kebidanan');
    assert.equal(merged[1].site, undefined);
});

test('mergeSamples pada input kosong mengembalikan array kosong', () => {
    assert.deepEqual(mergeSamples(null, 'Gizi'), []);
    assert.deepEqual(mergeSamples([], 'Gizi'), []);
});
