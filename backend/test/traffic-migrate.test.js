const test = require('node:test');
const assert = require('node:assert/strict');

const { buildUpsertOps } = require('../services/traffic-migrate');

const sample = (over = {}) => ({
    site: 'Gizi',
    timestamp: '2026-09-01T03:00:00.000Z',
    txMbps: 1.5,
    rxMbps: 0.5,
    ...over
});

test('satu sample menjadi satu updateOne ber-upsert', () => {
    const ops = buildUpsertOps([sample()]);

    assert.equal(ops.length, 1);
    assert.ok(ops[0].updateOne, 'harus operasi updateOne, bukan insertOne');
    assert.equal(ops[0].updateOne.upsert, true);
    assert.equal(ops[0].updateOne.filter.site, 'Gizi');
    assert.equal(ops[0].updateOne.filter.timestamp.toISOString(), '2026-09-01T03:00:00.000Z');
});

test('filter memakai site+timestamp, dan nilainya masuk lewat $setOnInsert', () => {
    // Bentuk inilah yang membuat migrasi idempoten: baris yang sudah ada cocok
    // dengan filternya, sehingga tidak ada `insert`, dan `$setOnInsert` tidak
    // menimpa dokumen yang sudah ada.
    const [op] = buildUpsertOps([sample({ txMbps: 2, rxMbps: 3, interface: 'ether5' })]);

    assert.deepEqual(Object.keys(op.updateOne.update), ['$setOnInsert']);
    assert.equal(op.updateOne.update.$setOnInsert.site, 'Gizi');
    assert.equal(op.updateOne.update.$setOnInsert.txMbps, 2);
    assert.equal(op.updateOne.update.$setOnInsert.rxMbps, 3);
    assert.equal(op.updateOne.update.$setOnInsert.interface, 'ether5');
    assert.equal(op.updateOne.update.$setOnInsert.timestamp.toISOString(), '2026-09-01T03:00:00.000Z');
});

test('baris tanpa timestamp yang bisa dibaca dibuang', () => {
    const ops = buildUpsertOps([
        sample(),
        null,
        { site: 'Gizi' },
        sample({ timestamp: 'bukan-tanggal' }),
        sample({ timestamp: null })
    ]);

    assert.equal(ops.length, 1);
});

test('duplikat site+timestamp di dalam satu batch dibuang', () => {
    // Dua upsert berfilter identik dalam satu bulkWrite tidak berurutan bisa
    // sama-sama menyisipkan, jadi batchnya harus sudah bersih.
    const ops = buildUpsertOps([sample(), sample(), sample({ txMbps: 9 })]);

    assert.equal(ops.length, 1);
});

test('timestamp berbeda dengan site sama tetap menjadi dua operasi', () => {
    const ops = buildUpsertOps([
        sample(),
        sample({ timestamp: '2026-09-01T03:00:06.000Z' }),
        sample({ site: 'Kebidanan' })
    ]);

    assert.equal(ops.length, 3);
});

test('site kosong memakai Unknown agar filternya stabil', () => {
    const [op] = buildUpsertOps([sample({ site: '' })]);

    assert.equal(op.updateOne.filter.site, 'Unknown');
    assert.equal(op.updateOne.update.$setOnInsert.site, 'Unknown');
});

test('angka yang tidak masuk akal menjadi 0, bukan NaN', () => {
    const [op] = buildUpsertOps([sample({ txMbps: 'bukan-angka', rxMbps: undefined })]);

    assert.equal(op.updateOne.update.$setOnInsert.txMbps, 0);
    assert.equal(op.updateOne.update.$setOnInsert.rxMbps, 0);
});

test('angka berbentuk string tetap dikonversi', () => {
    const [op] = buildUpsertOps([sample({ txMbps: '1.5', rxMbps: '0' })]);

    assert.equal(op.updateOne.update.$setOnInsert.txMbps, 1.5);
    assert.equal(op.updateOne.update.$setOnInsert.rxMbps, 0);
});

test('interface yang tidak diisi menjadi string kosong', () => {
    const [op] = buildUpsertOps([sample()]);

    assert.equal(op.updateOne.update.$setOnInsert.interface, '');
});

test('masukan bukan array menghasilkan daftar kosong', () => {
    assert.deepEqual(buildUpsertOps(null), []);
    assert.deepEqual(buildUpsertOps(undefined), []);
    assert.deepEqual(buildUpsertOps([]), []);
});
