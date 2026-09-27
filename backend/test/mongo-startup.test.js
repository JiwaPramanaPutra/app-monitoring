// Menguji retry koneksi Mongo saat start (F-25) tanpa MongoDB maupun timer
// sungguhan: `connect`, `sleep`, dan `now` disuntikkan oleh test.
const test = require('node:test');
const assert = require('node:assert');
const { connectWithRetry } = require('../services/mongo-startup');

function failing(times, message = 'mongo down') {
    let calls = 0;
    return async () => {
        calls++;
        if (calls <= times) throw new Error(message);
        return 'ok';
    };
}

test('sukses percobaan pertama: tidak ada jeda sama sekali', async () => {
    const sleeps = [];
    const ok = await connectWithRetry({
        connect: async () => 'ok',
        timeoutMs: 45000,
        retryDelayMs: 3000,
        sleep: async (ms) => { sleeps.push(ms); },
        now: () => 0
    });

    assert.equal(ok, true);
    assert.deepEqual(sleeps, []);
});

test('gagal dua kali lalu sukses: jeda dan onRetry tercatat', async () => {
    let nowValue = 0;
    const retries = [];
    const sleeps = [];
    const ok = await connectWithRetry({
        connect: failing(2),
        timeoutMs: 45000,
        retryDelayMs: 3000,
        onRetry: (err) => retries.push(err.message),
        sleep: async (ms) => { sleeps.push(ms); nowValue += ms; },
        now: () => nowValue
    });

    assert.equal(ok, true);
    assert.deepEqual(retries, ['mongo down', 'mongo down']);
    assert.deepEqual(sleeps, [3000, 3000]);
});

test('menyerah saat jendela tunggu habis, dengan jumlah percobaan yang benar', async () => {
    let nowValue = 0;
    let giveUps = 0;
    const sleeps = [];
    const ok = await connectWithRetry({
        connect: failing(Infinity),
        timeoutMs: 45000,
        retryDelayMs: 3000,
        onGiveUp: () => { giveUps++; },
        sleep: async (ms) => { sleeps.push(ms); nowValue += ms; },
        now: () => nowValue
    });

    assert.equal(ok, false);
    assert.equal(giveUps, 1);
    // 45 dtk / 3 dtk = 15 jeda; percobaan ke-16 jatuh tepat di batas dan menyerah.
    assert.equal(sleeps.length, 15);
});

test('timeout 0 tetap satu percobaan dan tidak menunggu', async () => {
    let calls = 0;
    const ok = await connectWithRetry({
        connect: async () => { calls++; throw new Error('down'); },
        timeoutMs: 0,
        retryDelayMs: 3000,
        sleep: async () => { throw new Error('tidak boleh menunggu'); },
        now: () => 0
    });

    assert.equal(ok, false);
    assert.equal(calls, 1);
});
