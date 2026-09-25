const test = require('node:test');
const assert = require('node:assert');
const { buildOfflineFallback, toChartSamples } = require('../services/traffic-response');

const OWN_CACHE = {
    ip: '223.27.155.58:8291',
    interface: 'ether1-WAN',
    txMbps: 1.17,
    rxMbps: 9.49,
    txBps: 1170000,
    rxBps: 9490000,
    connected: true,
    source: 'live-mikrotik-Mikrotik RB1200',
    site: 'Poltekkes Gizi'
};

test('a failed lookup is always reported as disconnected', () => {
    // Cache terakhirnya sukses (connected: true) — tetap tidak boleh ikut terbawa.
    const out = buildOfflineFallback({
        cached: OWN_CACHE,
        site: 'Poltekkes Gizi',
        routerModel: 'Mikrotik RB1200',
        error: 'Gagal terhubung ke RouterOS API 223.27.155.58:8729 - timeout'
    });
    assert.strictEqual(out.connected, false);
    assert.strictEqual(out.source, 'cached-fallback');
    assert.strictEqual(out.siteConfigured, true);
});

test('the backend error message is passed through verbatim', () => {
    const message = 'Gagal terhubung ke RouterOS API 223.27.155.58:8729 - TLS alert handshake failure';
    const out = buildOfflineFallback({ cached: OWN_CACHE, site: 'S', routerModel: 'M', error: message });
    assert.strictEqual(out.error, message);
});

test('a missing error still yields a readable message', () => {
    const out = buildOfflineFallback({ cached: OWN_CACHE, site: 'S', routerModel: 'M' });
    assert.ok(out.error && out.error.length > 0);
    assert.strictEqual(out.error, 'Koneksi ke RouterOS API terputus.');
});

test('identity and last rates come only from the same site cache', () => {
    const out = buildOfflineFallback({ cached: OWN_CACHE, site: 'Poltekkes Gizi', routerModel: 'Mikrotik RB1200' });
    assert.strictEqual(out.ip, '223.27.155.58:8291');
    assert.strictEqual(out.interface, 'ether1-WAN');
    assert.strictEqual(out.txBps, 1170000);
    assert.strictEqual(out.rxBps, 9490000);
    assert.strictEqual(out.txMbps, 1.17);
    assert.strictEqual(out.rxMbps, 9.49);
});

test('a site with no cache of its own gets empty identity and zero rates', () => {
    // Sengaja tanpa `cached`: site yang belum pernah terjangkau TIDAK boleh
    // mewarisi apa pun dari site lain.
    const out = buildOfflineFallback({ site: 'Kebidanan', routerModel: 'Mikrotik RB3011', error: 'timeout' });
    assert.strictEqual(out.ip, '');
    assert.strictEqual(out.interface, '');
    assert.strictEqual(out.txBps, 0);
    assert.strictEqual(out.rxBps, 0);
    assert.strictEqual(out.txMbps, 0);
    assert.strictEqual(out.rxMbps, 0);
});

test('a malformed cache cannot smuggle foreign or bogus values', () => {
    const out = buildOfflineFallback({
        cached: { connected: true, site: 'SITUS LAIN', source: 'live-mikrotik', ip: 0, txBps: 'n/a', error: 'bawaan' },
        site: 'Kebidanan',
        routerModel: 'Mikrotik RB3011',
        error: 'timeout'
    });
    assert.strictEqual(out.connected, false);
    assert.strictEqual(out.site, 'Kebidanan');
    assert.strictEqual(out.source, 'cached-fallback');
    assert.strictEqual(out.error, 'timeout');
    assert.strictEqual(out.ip, '');
    assert.strictEqual(out.txBps, 0);
});

test('non-object cache input is tolerated', () => {
    for (const bad of [undefined, null, 'teks', 42]) {
        const out = buildOfflineFallback({ cached: bad, site: 'S', routerModel: 'M', error: 'e' });
        assert.strictEqual(out.connected, false);
        assert.strictEqual(out.txBps, 0);
    }
});

test('callers without arguments get a safe disconnected response', () => {
    const out = buildOfflineFallback();
    assert.strictEqual(out.connected, false);
    assert.strictEqual(out.site, 'Unknown');
    assert.strictEqual(out.siteConfigured, true);
    assert.ok(out.timestamp instanceof Date);
});

const HISTORY = [
    { site: 'S', timestamp: '2026-09-24T10:00:00Z', txMbps: 0.1, rxMbps: 0.5 },
    { site: 'S', timestamp: '2026-09-24T10:00:02Z', txMbps: 0.06, rxMbps: 3.01 },
    { site: 'S', timestamp: '2026-09-24T10:00:04Z', txMbps: 1.17, rxMbps: 9.49 }
];

test('toChartSamples converts stored Mbps back to bps', () => {
    const out = toChartSamples(HISTORY, 3);
    assert.deepStrictEqual(out[2], { txBps: 1170000, rxBps: 9490000, timestamp: '2026-09-24T10:00:04Z' });
    assert.deepStrictEqual(out[1], { txBps: 60000, rxBps: 3010000, timestamp: '2026-09-24T10:00:02Z' });
    assert.deepStrictEqual(out[0], { txBps: 100000, rxBps: 500000, timestamp: '2026-09-24T10:00:00Z' });
});

test('toChartSamples keeps each timestamp so the chart can label its time range', () => {
    const out = toChartSamples(HISTORY, 3);
    for (const p of out) assert.strictEqual(typeof p.timestamp, 'string');
    assert.strictEqual(toChartSamples([{ txMbps: 1 }])[0].timestamp, null);
});

test('toChartSamples keeps only the newest `limit` samples, in order', () => {
    const out = toChartSamples(HISTORY, 2);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].txBps, 60000);
    assert.strictEqual(out[1].txBps, 1170000);
});

test('toChartSamples clamps the limit to a sane range', () => {
    assert.strictEqual(toChartSamples(HISTORY, 0).length, 3, 'limit 0 falls back to the default');
    assert.strictEqual(toChartSamples(HISTORY, -5).length, 3);
    assert.strictEqual(toChartSamples(HISTORY, 99999).length, 3);
});

test('toChartSamples returns an empty list without usable history', () => {
    assert.deepStrictEqual(toChartSamples(undefined), []);
    assert.deepStrictEqual(toChartSamples(null), []);
    assert.deepStrictEqual(toChartSamples('bukan array'), []);
    assert.deepStrictEqual(toChartSamples([]), []);
});

test('toChartSamples tolerates malformed rows without producing NaN', () => {
    const out = toChartSamples([{ txMbps: 'n/a' }, {}, { rxMbps: null }], 10);
    assert.strictEqual(out.length, 3);
    for (const p of out) {
        assert.strictEqual(Number.isFinite(p.txBps), true);
        assert.strictEqual(Number.isFinite(p.rxBps), true);
    }
    assert.deepStrictEqual(out[0], { txBps: 0, rxBps: 0, timestamp: null });
});
