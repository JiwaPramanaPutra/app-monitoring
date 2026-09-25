const test = require('node:test');
const assert = require('node:assert');
const { parseMonitorRates, mapInterfaces, mergeProbeCredentials } = require('../services/router-interfaces');

// Balasan asli `/interface/monitor-traffic interface=X once` dari RouterOS 7.7
// (RB450Gx4) dan 6.49 (RB3011UiAS). Perhatikan `fp-rx-bits-per-second` ikut
// hadir dan tidak boleh ikut terbaca.
const MONITOR_REPLY_77 = {
    name: 'ether1-WAN',
    'rx-packets-per-second': '1524',
    'rx-bits-per-second': '8963000',
    'fp-rx-packets-per-second': '1520',
    'fp-rx-bits-per-second': '8900000',
    'rx-drops-per-second': '0',
    'rx-errors-per-second': '0',
    'tx-packets-per-second': '412',
    'tx-bits-per-second': '1440000',
    'fp-tx-packets-per-second': '410',
    'fp-tx-bits-per-second': '1430000',
    'tx-drops-per-second': '0',
    'tx-queue-drops-per-second': '0',
    'tx-errors-per-second': '0'
};

test('parseMonitorRates reads rx/tx-bits-per-second from a real RouterOS reply', () => {
    assert.deepStrictEqual(parseMonitorRates(MONITOR_REPLY_77), { rxBps: 8963000, txBps: 1440000 });
});

test('parseMonitorRates ignores the fastpath fp- counters', () => {
    // Kalau salah baca `fp-`, nilainya 8900000/1430000 — bukan yang diharapkan.
    const { rxBps, txBps } = parseMonitorRates(MONITOR_REPLY_77);
    assert.notStrictEqual(rxBps, 8900000);
    assert.notStrictEqual(txBps, 1430000);
});

test('parseMonitorRates returns zeros for a missing or malformed reply', () => {
    assert.deepStrictEqual(parseMonitorRates(undefined), { rxBps: 0, txBps: 0 });
    assert.deepStrictEqual(parseMonitorRates(null), { rxBps: 0, txBps: 0 });
    assert.deepStrictEqual(parseMonitorRates('bukan object'), { rxBps: 0, txBps: 0 });
    assert.deepStrictEqual(parseMonitorRates({}), { rxBps: 0, txBps: 0 });
    assert.deepStrictEqual(parseMonitorRates({ 'rx-bits-per-second': 'n/a' }), { rxBps: 0, txBps: 0 });
});

const RAW_INTERFACES = [
    {
        name: 'ether1-WAN', type: 'ether', running: 'true', disabled: 'false',
        comment: '', 'mac-address': '64:D1:54:00:11:22'
    },
    {
        name: 'ether2', type: 'ether', running: 'false', disabled: 'false',
        comment: 'Gedung Utama', 'mac-address': '64:D1:54:00:11:23'
    },
    {
        name: 'vlan100-to-CBT', type: 'vlan', running: 'true', disabled: 'true',
        comment: '', 'mac-address': ''
    }
];

test('mapInterfaces turns RouterOS string flags into booleans', () => {
    const out = mapInterfaces(RAW_INTERFACES);
    assert.deepStrictEqual(
        out.map(i => [i.name, i.running, i.disabled]),
        [['ether1-WAN', true, false], ['ether2', false, false], ['vlan100-to-CBT', true, true]]
    );
});

test('mapInterfaces maps mac-address and comment onto the API shape', () => {
    const out = mapInterfaces(RAW_INTERFACES);
    assert.strictEqual(out[0].macAddress, '64:D1:54:00:11:22');
    assert.strictEqual(out[0].comment, '');
    assert.strictEqual(out[1].comment, 'Gedung Utama');
    assert.strictEqual(out[1].type, 'ether');
});

test('mapInterfaces merges rates by exact interface name', () => {
    const out = mapInterfaces(RAW_INTERFACES, {
        'ether1-WAN': { rxBps: 8963000, txBps: 1440000 }
    });
    assert.deepStrictEqual([out[0].rxBps, out[0].txBps], [8963000, 1440000]);
    // Interface tanpa rate (mis. link-down, tidak dimonitor) harus 0, bukan NaN.
    assert.deepStrictEqual([out[1].rxBps, out[1].txBps], [0, 0]);
    assert.deepStrictEqual([out[2].rxBps, out[2].txBps], [0, 0]);
});

test('mapInterfaces tolerates a non-array or empty input', () => {
    assert.deepStrictEqual(mapInterfaces(undefined), []);
    assert.deepStrictEqual(mapInterfaces(null), []);
    assert.deepStrictEqual(mapInterfaces({ name: 'bukan array' }), []);
    assert.deepStrictEqual(mapInterfaces([]), []);
});

test('mapInterfaces fills defaults for partially populated rows', () => {
    const out = mapInterfaces([{ name: 'bridge1' }]);
    assert.deepStrictEqual(out[0], {
        name: 'bridge1', type: '', running: false, disabled: false,
        comment: '', macAddress: '', rxBps: 0, txBps: 0
    });
});

const STORED = {
    host: '223.27.155.58', port: 8729, user: 'app-monitoring',
    password: 'rahasia-tersimpan', interface: 'ether1-WAN',
    routerModel: 'Mikrotik RB1200', timeout: 3
};

test('mergeProbeCredentials falls back to the stored password when the form leaves it empty', () => {
    const out = mergeProbeCredentials(
        { host: '223.27.155.58', port: 8729, user: 'app-monitoring', password: '' }, STORED
    );
    assert.strictEqual(out.password, 'rahasia-tersimpan');
});

test('mergeProbeCredentials treats whitespace-only form values as empty', () => {
    const out = mergeProbeCredentials({ host: '  ', user: '  ', password: '   ' }, STORED);
    assert.strictEqual(out.host, '223.27.155.58');
    assert.strictEqual(out.user, 'app-monitoring');
    assert.strictEqual(out.password, 'rahasia-tersimpan');
});

test('mergeProbeCredentials lets an explicitly supplied password win', () => {
    const out = mergeProbeCredentials(
        { host: '223.27.155.58', user: 'app-monitoring', password: 'password-baru' }, STORED
    );
    assert.strictEqual(out.password, 'password-baru');
});

test('mergeProbeCredentials keeps a new host but still uses the stored password', () => {
    const out = mergeProbeCredentials({ host: '223.27.155.162', user: 'app-monitoring', password: '' }, STORED);
    assert.strictEqual(out.host, '223.27.155.162');
    assert.strictEqual(out.password, 'rahasia-tersimpan');
});

test('mergeProbeCredentials falls back to stored host, user, port and model', () => {
    const out = mergeProbeCredentials({}, STORED);
    assert.strictEqual(out.host, '223.27.155.58');
    assert.strictEqual(out.user, 'app-monitoring');
    assert.strictEqual(out.port, 8729);
    assert.strictEqual(out.routerModel, 'Mikrotik RB1200');
});

test('mergeProbeCredentials applies sane defaults when nothing is stored', () => {
    const out = mergeProbeCredentials({ host: '192.0.2.1', user: 'admin', password: 'x' }, null);
    assert.strictEqual(out.port, 8728);
    assert.strictEqual(out.timeout, 3);
    assert.strictEqual(out.password, 'x');
    assert.strictEqual(out.routerModel, '');
});

test('mergeProbeCredentials tolerates missing or non-object input', () => {
    for (const bad of [undefined, null, 'teks', 42]) {
        assert.deepStrictEqual(mergeProbeCredentials(bad, bad), {
            host: '', port: 8728, user: '', password: '', timeout: 3, routerModel: ''
        });
    }
});
