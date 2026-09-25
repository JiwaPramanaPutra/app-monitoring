const test = require('node:test');
const assert = require('node:assert');
const { decideDowntimeAction } = require('../services/downtime-classify');

test('traffic flowing closes any open event and starts nothing', () => {
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: 1200, rxBps: 800, running: true, ongoingKind: 'unreachable' }),
        { closeOpen: true, open: null }
    );
    // Saat trafik mengalir, status link tidak perlu ditanyakan.
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: 1, rxBps: 0, running: null, ongoingKind: null }),
        { closeOpen: true, open: null }
    );
});

test('idle with a link-down opens an interface-down event', () => {
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: 0, rxBps: 0, running: false, ongoingKind: null }),
        { closeOpen: false, open: 'interface-down' }
    );
});

test('a link-down that starts while unreachable is open closes it first (fix F-55)', () => {
    // Tanpa penutupan dulu, gangguan link-nya tenggelam di dalam event
    // "tidak terpantau" dan tidak pernah menurunkan uptime.
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: 0, rxBps: 0, running: false, ongoingKind: 'unreachable' }),
        { closeOpen: true, open: 'interface-down' }
    );
});

test('a legacy event without a kind is treated as unreachable (fix F-55 for old data)', () => {
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: 0, rxBps: 0, running: false, ongoingKind: null }),
        { closeOpen: false, open: 'interface-down' }
    );
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: 0, rxBps: 0, running: false, ongoingKind: undefined }),
        { closeOpen: false, open: 'interface-down' }
    );
});

test('a persistent link-down stays ONE event instead of one per poll (fix F-64)', () => {
    // Polling berikutnya saat link masih putus: kejadian yang terbuka sudah
    // `interface-down`, jadi tidak boleh ditutup — start-nya idempoten dan
    // mengembalikan kejadian yang sama.
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: 0, rxBps: 0, running: false, ongoingKind: 'interface-down' }),
        { closeOpen: false, open: 'interface-down' }
    );

    // Dan itu stabil untuk polling-polling berikutnya.
    for (let i = 0; i < 5; i++) {
        assert.strictEqual(
            decideDowntimeAction({ txBps: 0, rxBps: 0, running: false, ongoingKind: 'interface-down' }).closeOpen,
            false
        );
    }
});

test('an unknown link status closes nothing and opens nothing (fix F-56)', () => {
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: 0, rxBps: 0, running: null, ongoingKind: 'interface-down' }),
        { closeOpen: false, open: null }
    );
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: 0, rxBps: 0, running: null, ongoingKind: 'unreachable' }),
        { closeOpen: false, open: null }
    );
});

test('a verified link-up closes the open event', () => {
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: 0, rxBps: 0, running: true, ongoingKind: 'interface-down' }),
        { closeOpen: true, open: null }
    );
});

test('missing or malformed numbers count as idle, not as traffic', () => {
    assert.strictEqual(decideDowntimeAction({ running: true }).closeOpen, true);
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: NaN, rxBps: undefined, running: false, ongoingKind: null }),
        { closeOpen: false, open: 'interface-down' }
    );
});

test('calling with no arguments never throws and closes nothing', () => {
    // `running` yang tidak ditentukan sama artinya dengan "tidak tahu".
    assert.deepStrictEqual(decideDowntimeAction(), { closeOpen: false, open: null });
});
