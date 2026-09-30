const test = require('node:test');
const assert = require('node:assert');
const { withoutMeasuredStatus } = require('../services/device-payload');

test('withoutMeasuredStatus membuang status, mempertahankan field lain', () => {
    const payload = {
        status: 'Tidak Terpantau',
        name: 'Router Gigi',
        ip: '223.27.147.18',
        type: 'Router'
    };

    const out = withoutMeasuredStatus(payload);

    assert.deepEqual(out, { name: 'Router Gigi', ip: '223.27.147.18', type: 'Router' });
    assert.equal('status' in out, false);
});

test('withoutMeasuredStatus tidak mengubah objek sumber', () => {
    const payload = { status: 'Online', name: 'AP' };

    withoutMeasuredStatus(payload);

    assert.equal(payload.status, 'Online');
});

test('withoutMeasuredStatus aman untuk null/non-objek', () => {
    assert.deepEqual(withoutMeasuredStatus(null), {});
    assert.deepEqual(withoutMeasuredStatus(undefined), {});
    assert.deepEqual(withoutMeasuredStatus('bukan objek'), {});
    assert.deepEqual(withoutMeasuredStatus(['a']), {});
});

test('model Device menolak status tampilan; helper menyelamatkannya', () => {
    const Device = require('../models/Device');
    const payload = { status: 'Tidak Terpantau', name: 'Router Uji', ip: '10.0.0.1', siteLocation: 'Poltekkes Gizi' };

    // Cara lama (payload apa adanya): persis error yang dilihat pemilik di hosting.
    assert.ok(new Device(payload).validateSync());

    // Sesudah helper: lolos validasi, memakai default model.
    assert.equal(new Device(withoutMeasuredStatus(payload)).validateSync(), undefined);
});
