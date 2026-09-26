// Menguji persistensi state pinger perangkat (notifikasi up/down berulang)
// memakai direktori sementara, supaya `backend/data` yang asli tidak tersentuh.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nadi-ping-state-test-'));

// File state "dari sesi sebelumnya" — harus terbaca saat modul dimuat.
fs.writeFileSync(
    path.join(TEMP_DIR, 'device_ping_state.json'),
    JSON.stringify({ 'dev-9': { fails: 1, oks: 0, status: 'Online', lastNotifyAt: 123 } }),
    'utf8'
);

// Wajib disetel SEBELUM `storage.js` dimuat: modul itu membaca DATA_DIR saat load.
process.env.DATA_DIR = TEMP_DIR;

const storage = require('../storage');

test.after(() => {
    try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch (e) { /* biarkan */ }
});

test('state pinger dimuat dari disk saat startup', () => {
    assert.deepEqual(storage.getDevicePingState()['dev-9'], {
        fails: 1, oks: 0, status: 'Online', lastNotifyAt: 123
    });
});

test('perubahan state disimpan kembali ke disk (lintas restart)', () => {
    const state = storage.getDevicePingState();
    state['dev-1'] = { fails: 3, oks: 0, status: 'Offline', lastNotifyAt: 456 };
    storage.saveDevicePingState();

    const raw = JSON.parse(fs.readFileSync(path.join(TEMP_DIR, 'device_ping_state.json'), 'utf8'));
    assert.deepEqual(raw['dev-1'], { fails: 3, oks: 0, status: 'Offline', lastNotifyAt: 456 });
    assert.deepEqual(raw['dev-9'], { fails: 1, oks: 0, status: 'Online', lastNotifyAt: 123 },
        'entri lama tidak boleh hilang');
});
