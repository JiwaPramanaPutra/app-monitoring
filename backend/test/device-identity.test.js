const test = require('node:test');
const assert = require('node:assert');
const {
    isUsableDeviceIp,
    findDeviceIpClash,
    deviceIpClashMessage,
    uniqueDeviceKey,
    findDeviceIndexByKey,
    removeDeviceByKey
} = require('../services/device-identity');

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

const MIXED = [
    { _id: 'dev_1', id: 1, name: 'Router', ip: '10.0.0.1', siteLocation: 'A' },
    { _id: 'dev_2', id: 1, name: 'AP bentrok', ip: '10.0.0.2', siteLocation: 'B' }
];

test('uniqueDeviceKey keeps a free key as-is', () => {
    assert.strictEqual(uniqueDeviceKey(MIXED, 'dev_9'), 'dev_9');
});

test('uniqueDeviceKey replaces a key that is already used by _id or id', () => {
    // Angka `id` dihitung dari perangkat site yang sedang dilihat, jadi bisa
    // sudah terpakai di site tujuan.
    const fromId = uniqueDeviceKey(MIXED, 1);
    assert.notStrictEqual(String(fromId), '1');
    assert.notStrictEqual(fromId, 'dev_1');
    assert.notStrictEqual(fromId, 'dev_2');

    const fromUnderscoreId = uniqueDeviceKey(MIXED, 'dev_2');
    assert.notStrictEqual(fromUnderscoreId, 'dev_2');
});

test('uniqueDeviceKey never returns a key already present in the list', () => {
    const taken = new Set(MIXED.flatMap(d => [String(d._id), String(d.id)]));
    for (const requested of [undefined, null, '', '   ', 1, 'dev_1', 'dev_2']) {
        const key = uniqueDeviceKey(MIXED, requested);
        assert.ok(!taken.has(String(key)), `key ${key} should be free`);
    }
});

test('uniqueDeviceKey generates a key when the client sends none', () => {
    assert.match(String(uniqueDeviceKey(MIXED, undefined)), /^dev_/);
    assert.match(String(uniqueDeviceKey(MIXED, '')), /^dev_/);
});

test('uniqueDeviceKey tolerates a missing device list', () => {
    assert.match(String(uniqueDeviceKey(null, undefined)), /^dev_/);
    assert.strictEqual(uniqueDeviceKey(null, 'dev_5'), 'dev_5');
});

test('findDeviceIndexByKey prefers _id over a shared id', () => {
    // Kedua record punya id 1. Tanpa preferensi _id, mencari 'dev_2' bisa
    // mengenai record pertama.
    assert.strictEqual(findDeviceIndexByKey(MIXED, 'dev_1'), 0);
    assert.strictEqual(findDeviceIndexByKey(MIXED, 'dev_2'), 1);
});

test('findDeviceIndexByKey falls back to id when no _id matches', () => {
    const legacy = [{ _id: 'dev_7', id: 7, name: 'Lama' }];
    assert.strictEqual(findDeviceIndexByKey(legacy, 7), 0);
});

test('findDeviceIndexByKey reports -1 for an unknown key', () => {
    assert.strictEqual(findDeviceIndexByKey(MIXED, 'tidak-ada'), -1);
    assert.strictEqual(findDeviceIndexByKey(null, 'dev_1'), -1);
});

test('removeDeviceByKey removes exactly one record even when id is shared', () => {
    // Inilah kerugian datanya: dulu filter lama membuang SEMUA record ber-id 1.
    const result = removeDeviceByKey(MIXED, 'dev_1');
    assert.strictEqual(result.removed, true);
    assert.strictEqual(result.devices.length, 1);
    assert.strictEqual(result.devices[0].name, 'AP bentrok');
});

test('removeDeviceByKey keeps the list untouched for an unknown key', () => {
    const result = removeDeviceByKey(MIXED, 'tidak-ada');
    assert.strictEqual(result.removed, false);
    assert.deepStrictEqual(result.devices, MIXED);
});

test('removeDeviceByKey does not mutate the input list', () => {
    const input = MIXED.map(d => ({ ...d }));
    removeDeviceByKey(input, 'dev_1');
    assert.strictEqual(input.length, 2);
});
