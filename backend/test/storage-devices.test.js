// Menguji penyimpanan perangkat mode JSON lokal memakai direktori sementara,
// supaya `backend/data` yang asli tidak pernah tersentuh.
//
// Test ini menutup celah F-49: perbaikan F-47 (POST /api/devices harus memakai
// nilai balik `saveLocalDevice`) tidak terlihat oleh `npm run verify` selama
// wiring penyimpanannya tidak diuji.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Wajib disetel SEBELUM `storage.js` dimuat: modul itu membaca DATA_DIR saat load.
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nadi-storage-test-'));
process.env.DATA_DIR = TEMP_DIR;

const storage = require('../storage');

test.after(() => {
    try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch (e) { /* biarkan */ }
});

test('saveLocalDevice returns the record it stored, including its key', () => {
    // Inilah kontrak yang dilanggar F-47: POST /api/devices membuang nilai balik
    // ini dan memakai `req.body`, sehingga klien memegang record tanpa `_id`.
    const saved = storage.saveLocalDevice({ name: 'Router', id: 2, ip: '10.0.0.1', siteLocation: 'Site A' });

    assert.ok(saved._id !== undefined && saved._id !== null && String(saved._id) !== '', '_id harus terisi');
    const found = storage.getLocalDevices().find(d => String(d._id) === String(saved._id));
    assert.ok(found, 'record dengan _id yang dikembalikan harus ada di penyimpanan');
    assert.strictEqual(found.name, 'Router');
});

test('a colliding client id gets a fresh key instead of sharing one', () => {
    const first = storage.saveLocalDevice({ name: 'A', id: 99, ip: '10.0.1.1', siteLocation: 'Site A' });
    const second = storage.saveLocalDevice({ name: 'B', id: 99, ip: '10.0.1.2', siteLocation: 'Site B' });

    assert.notStrictEqual(String(first._id), String(second._id), 'kunci tidak boleh dibagi');
});

test('deleting one device never removes another that shares its numeric id', () => {
    const before = storage.getLocalDevices().length;

    const first = storage.saveLocalDevice({ name: 'C', id: 77, ip: '10.0.2.1', siteLocation: 'Site A' });
    storage.saveLocalDevice({ name: 'D', id: 77, ip: '10.0.2.2', siteLocation: 'Site B' });

    assert.strictEqual(storage.deleteLocalDevice(first._id), true);

    const after = storage.getLocalDevices();
    assert.strictEqual(after.length, before + 1, 'tepat satu record yang terbuang');
    assert.ok(after.some(d => d.name === 'D'), 'perangkat lain harus selamat');
    assert.ok(!after.some(d => String(d._id) === String(first._id)));
});

test('deleting by the stored key removes exactly one record', () => {
    const before = storage.getLocalDevices().length;
    const only = storage.saveLocalDevice({ name: 'Hapus aku', id: 123, ip: '10.0.9.9', siteLocation: 'Site Z' });

    assert.strictEqual(storage.deleteLocalDevice(only._id), true);
    assert.strictEqual(storage.getLocalDevices().length, before);
});

test('updateLocalDevice edits exactly the record with that key', () => {
    const target = storage.saveLocalDevice({ name: 'E', id: 55, ip: '10.0.3.1', siteLocation: 'Site A' });
    storage.saveLocalDevice({ name: 'F', id: 55, ip: '10.0.3.2', siteLocation: 'Site B' });

    const updated = storage.updateLocalDevice(target._id, { name: 'E diubah' });

    assert.ok(updated, 'update harus menemukan record');
    assert.strictEqual(updated.name, 'E diubah');
    assert.ok(storage.getLocalDevices().some(d => d.name === 'F'), 'perangkat lain tidak boleh ikut berubah');
});

test('an unknown key deletes and updates nothing', () => {
    const before = storage.getLocalDevices().length;

    assert.strictEqual(storage.deleteLocalDevice('tidak-ada'), false);
    assert.strictEqual(storage.updateLocalDevice('tidak-ada', { name: 'x' }), null);
    assert.strictEqual(storage.getLocalDevices().length, before);
});
