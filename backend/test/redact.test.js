const test = require('node:test');
const assert = require('node:assert');
const {
    stripDeviceSecrets,
    stripProjectSecrets,
    preserveRouterPasswords
} = require('../services/redact');

const existing = {
    sites: [
        { _id: 's1', name: 'Site Alpha', routerConfig: { host: '192.0.2.1', user: 'admin', password: 'secret-1' } },
        { _id: 'temp_111', name: 'Site Local', routerConfig: { host: '192.0.2.2', user: 'admin', password: 'secret-2' } }
    ]
};

test('rename preserves the stored router password', () => {
    const payload = { sites: [{ _id: 's1', name: 'Site Alpha Renamed', routerConfig: { host: '192.0.2.1', password: '' } }] };
    preserveRouterPasswords(payload, existing);
    assert.strictEqual(payload.sites[0].routerConfig.password, 'secret-1');
});

test('a payload without routerConfig keeps the stored configuration', () => {
    const payload = { sites: [{ _id: 's1', name: 'Site Alpha' }] };
    preserveRouterPasswords(payload, existing);
    assert.deepStrictEqual(payload.sites[0].routerConfig, existing.sites[0].routerConfig);
});

test('an explicitly supplied new password wins', () => {
    const payload = { sites: [{ _id: 's1', name: 'Site Alpha', routerConfig: { password: 'new-secret' } }] };
    preserveRouterPasswords(payload, existing);
    assert.strictEqual(payload.sites[0].routerConfig.password, 'new-secret');
});

test('a persisted temp-id site keeps its password on edit', () => {
    const payload = { sites: [{ _id: 'temp_111', name: 'Site Local', routerConfig: { host: '192.0.2.2', password: '' } }] };
    preserveRouterPasswords(payload, existing);
    assert.strictEqual(payload.sites[0].routerConfig.password, 'secret-2');
});

test('an unknown temp-id site does not inherit another site password', () => {
    const payload = { sites: [{ _id: 'temp_999', name: 'Site Local', routerConfig: { host: '192.0.2.9', password: '' } }] };
    preserveRouterPasswords(payload, existing);
    assert.strictEqual(payload.sites[0].routerConfig.password, '');
});

test('stripDeviceSecrets removes ssh credentials', () => {
    const device = stripDeviceSecrets({ name: 'AP', ip: '192.0.2.11', sshUsername: 'root', sshPassword: 'pw' });
    assert.ok(!('sshPassword' in device));
    assert.ok(!('sshUsername' in device));
    assert.strictEqual(device.name, 'AP');
});

test('stripProjectSecrets removes router passwords without mutating the source', () => {
    const project = stripProjectSecrets(existing);
    assert.ok(!('password' in project.sites[0].routerConfig));
    assert.strictEqual(existing.sites[0].routerConfig.password, 'secret-1');
});
