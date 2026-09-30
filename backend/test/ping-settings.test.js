const test = require('node:test');
const assert = require('node:assert');
const { PING_TIMEOUT_SECONDS, isSafePingTimeout } = require('../services/ping-settings');

test('PING_TIMEOUT_SECONDS aman untuk binary ping di semua platform', () => {
    assert.equal(isSafePingTimeout(PING_TIMEOUT_SECONDS), true);
    assert.ok(PING_TIMEOUT_SECONDS >= 1);
});

test('isSafePingTimeout menolak timeout pecahan (busybox: invalid number)', () => {
    // Nilai inilah yang dulu membuat /api/devices/status selalu gagal di
    // container Linux dan perangkat tampak Offline.
    assert.equal(isSafePingTimeout(1.5), false);
    assert.equal(isSafePingTimeout(0.5), false);
});

test('isSafePingTimeout menolak nilai tidak masuk akal', () => {
    assert.equal(isSafePingTimeout(0), false);
    assert.equal(isSafePingTimeout(-2), false);
    assert.equal(isSafePingTimeout(NaN), false);
    assert.equal(isSafePingTimeout('2'), false);
    assert.equal(isSafePingTimeout(Infinity), false);
    assert.equal(isSafePingTimeout(null), false);
});

test('isSafePingTimeout menerima bilangan bulat positif', () => {
    assert.equal(isSafePingTimeout(1), true);
    assert.equal(isSafePingTimeout(2), true);
    assert.equal(isSafePingTimeout(5), true);
});
