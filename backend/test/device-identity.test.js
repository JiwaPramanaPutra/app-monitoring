const test = require('node:test');
const assert = require('node:assert');
const { isUsableDeviceIp, findDeviceIpClash, deviceIpClashMessage } = require('../services/device-identity');

const DEVICES = [
    { _id: '6ab49dbf3232eb2c6fc7b657', name: 'Router', ip: '223.27.147.18', siteLocation: 'Poltekkes Gizi' },
    { _id: '6ab4cccc62800075e1d87925', name: 'AP-Akademik', ip: '192.168.104.5', siteLocation: 'Poltekkes Gizi' },
    { _id: '6ab47872d996d5c61a885586', name: 'AP-Gigi', ip: '192.168.104.5', siteLocation: 'Poltekkes Gigi' },
    { _id: '6aa672e3848d6f8248e7c045', name: 'Tanpa IP', ip: '—', siteLocation: 'Poltekkes Gizi' }
];

test('isUsableDeviceIp accepts a real address', () => {
    assert.strictEqual(isUsableDeviceIp('223.27.147.18'), true);
    assert.strictEqual(isUsableDeviceIp('router.local'), true);
});

test('isUsableDeviceIp rejects the table placeholders', () => {
    for (const value of ['', '   ', '—', '-', 'N/A', 'n/a', 'NA', null, undefined]) {
        assert.strictEqual(isUsableDeviceIp(value), false, `should reject ${JSON.stringify(value)}`);
    }
});

test('findDeviceIpClash finds another device on the same site with the same IP', () => {
    const clash = findDeviceIpClash(DEVICES, '223.27.147.18', 'Poltekkes Gizi');
    assert.strictEqual(clash && clash.name, 'Router');
});

test('findDeviceIpClash never reports the edited device as its own clash (Mongo _id)', () => {
    // Dokumen Mongo tidak punya `id`. Memeriksa `id` saja membuat setiap edit
    // yang mempertahankan IP ditolak.
    assert.strictEqual(findDeviceIpClash(DEVICES, '223.27.147.18', 'Poltekkes Gizi', '6ab49dbf3232eb2c6fc7b657'), null);
    assert.strictEqual(findDeviceIpClash(DEVICES, '192.168.104.5', 'Poltekkes Gizi', '6ab4cccc62800075e1d87925'), null);
});

test('findDeviceIpClash still finds a real clash when editing a different device', () => {
    const clash = findDeviceIpClash(DEVICES, '223.27.147.18', 'Poltekkes Gizi', '6ab4cccc62800075e1d87925');
    assert.strictEqual(clash && clash.name, 'Router');
});

test('findDeviceIpClash also excludes a local-mode record carrying both id and _id', () => {
    const local = [{ _id: 'd1', id: 'd1', name: 'Lokal', ip: '10.0.0.1', siteLocation: 'Poltekkes Gizi' }];
    assert.strictEqual(findDeviceIpClash(local, '10.0.0.1', 'Poltekkes Gizi', 'd1'), null);
});

test('findDeviceIpClash allows the same private address on a different site', () => {
    assert.strictEqual(findDeviceIpClash(DEVICES, '192.168.104.5', 'Kebidanan'), null);
    assert.strictEqual(findDeviceIpClash(DEVICES, '192.168.104.5', 'Poltekkes Gigi', '6ab47872d996d5c61a885586'), null);
});

test('findDeviceIpClash ignores placeholder IPs so devices without an address never collide', () => {
    for (const ip of ['—', '', '   ', null, undefined, 'N/A']) {
        assert.strictEqual(findDeviceIpClash(DEVICES, ip, 'Poltekkes Gizi'), null, `should ignore ${JSON.stringify(ip)}`);
    }
});

test('findDeviceIpClash compares case-insensitively and ignores surrounding spaces', () => {
    assert.strictEqual(findDeviceIpClash(DEVICES, ' 223.27.147.18 ', 'Poltekkes Gizi').name, 'Router');
    const hosts = [{ _id: 'h1', name: 'Router CNI', ip: 'RO-CNI.Poltekkes-Gigi', siteLocation: 'Poltekkes Gigi' }];
    assert.strictEqual(findDeviceIpClash(hosts, 'ro-cni.poltekkes-gigi', 'Poltekkes Gigi').name, 'Router CNI');
});

test('findDeviceIpClash requires an exact site match', () => {
    assert.strictEqual(findDeviceIpClash(DEVICES, '223.27.147.18', 'Poltekkes'), null);
    assert.strictEqual(findDeviceIpClash(DEVICES, '223.27.147.18', ''), null);
});

test('findDeviceIpClash tolerates a missing device list', () => {
    assert.strictEqual(findDeviceIpClash(null, '223.27.147.18', 'Poltekkes Gizi'), null);
    assert.strictEqual(findDeviceIpClash(undefined, '223.27.147.18', 'Poltekkes Gizi'), null);
    assert.strictEqual(findDeviceIpClash([null, undefined], '223.27.147.18', 'Poltekkes Gizi'), null);
});

test('deviceIpClashMessage names the conflicting device and the site', () => {
    const message = deviceIpClashMessage({ name: 'Router', siteLocation: 'Poltekkes Gizi' }, '223.27.147.18');
    assert.ok(message.includes('223.27.147.18'));
    assert.ok(message.includes('Router'));
    assert.ok(message.includes('Poltekkes Gizi'));
});

test('deviceIpClashMessage has a readable fallback for an unnamed device', () => {
    const message = deviceIpClashMessage({}, '10.0.0.1');
    assert.ok(message.includes('(tanpa nama)'));
    assert.ok(message.includes('(tanpa site)'));
});
