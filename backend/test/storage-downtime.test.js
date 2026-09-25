// Menguji ledger downtime memakai direktori data sementara supaya
// `backend/data` yang asli tidak tersentuh.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nadi-downtime-test-'));
process.env.DATA_DIR = TEMP_DIR;

const storage = require('../storage');

test.after(() => {
    try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch (e) { /* biarkan */ }
});

test('a connection failure defaults to the unreachable kind', () => {
    const event = storage.recordDowntimeStart('Site A', 'Gagal terhubung ke RouterOS API 10.0.0.1:8729');

    assert.strictEqual(event.kind, 'unreachable');
    assert.strictEqual(event.end, null, 'event baru harus masih terbuka');
    assert.ok(event.reason.includes('RouterOS API'));
});

test('an interface-down event keeps its own kind', () => {
    const event = storage.recordDowntimeStart('Site B', 'Interface ether1 link-down', 'interface-down');

    assert.strictEqual(event.kind, 'interface-down');
});

test('starting another event while one is ongoing never duplicates it', () => {
    const first = storage.recordDowntimeStart('Site C', 'koneksi gagal');
    const second = storage.recordDowntimeStart('Site C', 'link down', 'interface-down');

    assert.strictEqual(second.id, first.id, 'kejadian yang sama tidak boleh dipecah');
    assert.strictEqual(storage.getDowntimeEvents('Site C').length, 1);
    // Kind kejadian yang sedang berjalan tidak ditimpa.
    assert.strictEqual(storage.getOngoingDowntime('Site C').kind, 'unreachable');
});

test('recordDowntimeEnd closes the ongoing event and records a duration', () => {
    storage.recordDowntimeStart('Site D', 'x');
    const ended = storage.recordDowntimeEnd('Site D');

    assert.ok(ended.end, 'event harus tertutup');
    assert.ok(ended.endTimeIso, 'waktu pulih harus tercatat');
    assert.ok(ended.durationSec >= 1, 'durasi minimal 1 detik');
});

test('recordDowntimeEnd is a no-op when nothing is ongoing', () => {
    assert.strictEqual(storage.recordDowntimeEnd('Site Tanpa Kejadian'), null);
});

test('events stay separated per site', () => {
    const sites = storage.getDowntimeEvents().map(e => e.site);
    assert.ok(sites.includes('Site A'));
    assert.ok(sites.includes('Site B'));
    assert.ok(!sites.includes('Site Tanpa Kejadian'));
});

test('clearing one site leaves the others intact', () => {
    const before = storage.getDowntimeEvents().length;
    const removed = storage.getDowntimeEvents('Site A').length;

    storage.clearDowntimeEvents('Site A');

    assert.strictEqual(storage.getDowntimeEvents('Site A').length, 0);
    assert.strictEqual(storage.getDowntimeEvents().length, before - removed);
});

test('closing before starting records a kind change as its own event (fix F-55)', () => {
    // `recordDowntimeStart` mengembalikan event yang sedang terbuka apa adanya,
    // jadi pemanggil HARUS menutupnya lebih dulu. Tanpa itu, link-down yang
    // terjadi saat "tidak terpantau" masih terbuka akan tenggelam di dalamnya
    // dan tidak pernah menurunkan uptime.
    storage.recordDowntimeStart('Site E', 'koneksi gagal', 'unreachable');
    storage.recordDowntimeEnd('Site E');
    const link = storage.recordDowntimeStart('Site E', 'Interface ether1 link-down', 'interface-down');

    assert.strictEqual(link.kind, 'interface-down');
    assert.strictEqual(link.end, null, 'kejadian baru harus masih terbuka');
    assert.strictEqual(storage.getDowntimeEvents('Site E').length, 2, 'dua kejadian terpisah');
});
