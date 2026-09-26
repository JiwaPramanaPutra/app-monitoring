const test = require('node:test');
const assert = require('node:assert');
const { decideDowntimeAction, isIdleSample, shouldLogFailure } = require('../services/downtime-classify');

test('isIdleSample shares one definition of "no traffic" (fix F-67)', () => {
    assert.strictEqual(isIdleSample(0, 0), true);
    assert.strictEqual(isIdleSample('0', '0'), true);
    assert.strictEqual(isIdleSample(NaN, undefined), true);
    assert.strictEqual(isIdleSample(null, null), true);
    assert.strictEqual(isIdleSample(1, 0), false);
    assert.strictEqual(isIdleSample(0, 1), false);
});

test('the idle predicate and the ledger decision agree for malformed rates', () => {
    // Collector memakai isIdleSample untuk memutuskan apakah status link perlu
    // ditanyakan; fungsi ini memakainya untuk memutuskan ledger. Sebelum F-67
    // diperbaiki keduanya berbeda pendapat untuk `NaN`.
    assert.strictEqual(isIdleSample(NaN, NaN), true);
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: NaN, rxBps: NaN, running: false, ongoingKind: null }),
        { closeOpen: false, open: 'interface-down' }
    );
});

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

test('an open legacy event arrives normalized as unreachable (fix F-66)', () => {
    // Pemanggil mengubah `kind` yang kosong menjadi 'unreachable' SEBELUM
    // memanggil fungsi ini, karena `undefined`/`null` berarti "tidak ada kejadian
    // terbuka". Tanpa normalisasi itu, link-down terverifikasi akan tenggelam di
    // dalam event lama dan tidak pernah menurunkan uptime.
    assert.deepStrictEqual(
        decideDowntimeAction({ txBps: 0, rxBps: 0, running: false, ongoingKind: 'unreachable' }),
        { closeOpen: true, open: 'interface-down' }
    );
});

test('no ongoing event means nothing to close', () => {
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

// ── shouldLogFailure: peringatan collector tidak boleh membanjiri log ────────

test('peringatan ditulis tepat saat melewati ambang, bukan tiap kegagalan', () => {
    const THRESHOLD = 5;
    const EVERY = 50;

    const logged = [];
    for (let fails = 1; fails <= 14; fails++) {
        if (shouldLogFailure(fails, THRESHOLD, EVERY)) logged.push(fails);
    }

    // Sebelumnya setiap kegagalan menulis satu baris: 1..14 semuanya.
    assert.deepStrictEqual(logged, [5]);
});

test('setelah ambang, peringatan hanya tiap kelipatan', () => {
    const THRESHOLD = 5;
    const EVERY = 50;

    assert.equal(shouldLogFailure(49, THRESHOLD, EVERY), false);
    assert.equal(shouldLogFailure(50, THRESHOLD, EVERY), true);
    assert.equal(shouldLogFailure(51, THRESHOLD, EVERY), false);
    assert.equal(shouldLogFailure(99, THRESHOLD, EVERY), false);
    assert.equal(shouldLogFailure(100, THRESHOLD, EVERY), true);
});

test('satu site yang putus sehari penuh menghasilkan ratusan baris, bukan belasan ribu', () => {
    // Collector berjalan tiap 6 detik -> 14.400 kegagalan per hari.
    const POLLS_PER_DAY = 14400;
    const THRESHOLD = 5;
    const EVERY = 50;

    let logged = 0;
    for (let fails = 1; fails <= POLLS_PER_DAY; fails++) {
        if (shouldLogFailure(fails, THRESHOLD, EVERY)) logged++;
    }

    // 1 (saat ambang) + 288 (tiap kelipatan 50 sampai 14.400).
    assert.equal(logged, 289);
    assert.ok(logged < POLLS_PER_DAY / 40, `harusnya jauh lebih sedikit, dapat ${logged}`);
});

test('masukan tidak masuk akal tidak pernah memicu peringatan beruntun', () => {
    assert.equal(shouldLogFailure(0, 5, 50), false);
    assert.equal(shouldLogFailure(-1, 5, 50), false);
    assert.equal(shouldLogFailure(NaN, 5, 50), false);
    assert.equal(shouldLogFailure(null, 5, 50), false);
    // Tanpa jarak yang sah, hanya ambangnya sendiri yang dilaporkan.
    assert.equal(shouldLogFailure(5, 5, 0), true);
    assert.equal(shouldLogFailure(50, 5, 0), false);
});
