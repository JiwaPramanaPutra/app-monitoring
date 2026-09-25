const test = require('node:test');
const assert = require('node:assert');
const { routerFailureReason, describeRouterError } = require('../services/router-errors');

test('a bare RosException errno is translated into an actionable reason', () => {
    // Persis bentuk error yang dilihat pengguna: `{"name":"RosException","errno":-4078}`
    const reason = routerFailureReason({ name: 'RosException', errno: -4078 });
    assert.ok(reason.includes('ECONNREFUSED'), reason);
    assert.ok(reason.includes('ditolak'), reason);
    assert.ok(!reason.includes('RosException'), 'must not leak the raw library object');
    assert.ok(!reason.includes('-4078'), 'must not leak the raw errno');
});

test('other numeric errnos map to their own hints', () => {
    assert.ok(routerFailureReason({ errno: -4039 }).includes('ETIMEDOUT'));
    assert.ok(routerFailureReason({ errno: -3008 }).includes('ENOTFOUND'));
    assert.ok(routerFailureReason({ errno: -113 }).includes('EHOSTUNREACH'));
});

test('a string err.code is mapped to its hint too', () => {
    const reason = routerFailureReason({ code: 'ECONNRESET' });
    assert.ok(reason.includes('ECONNRESET'));
    assert.ok(reason.includes('diputus'));
});

test('a real RouterOS sentence is passed through verbatim', () => {
    assert.strictEqual(
        routerFailureReason(new Error('Username or password is invalid')),
        'Username or password is invalid'
    );
});

test('a JSON-shaped message falls back to the errno mapping instead of being shown', () => {
    const reason = routerFailureReason({ message: '{"name":"RosException","errno":-4078}', errno: -4078 });
    assert.ok(reason.includes('ECONNREFUSED'), reason);
    assert.ok(!reason.includes('RosException'));
});

test('unknown errors fall back to a readable sentence', () => {
    assert.strictEqual(routerFailureReason(null), 'tidak ada respons dari RouterOS API (cek kredensial, port, dan TLS)');
    assert.strictEqual(routerFailureReason({}), 'tidak ada respons dari RouterOS API (cek kredensial, port, dan TLS)');
    assert.strictEqual(routerFailureReason('teks'), 'tidak ada respons dari RouterOS API (cek kredensial, port, dan TLS)');
});

test('describeRouterError names the host and port that were tried', () => {
    const line = describeRouterError({ errno: -4078 }, { host: '223.27.147.18', port: 8729 });
    assert.ok(line.startsWith('Gagal terhubung ke RouterOS API 223.27.147.18:8729'));
    assert.ok(line.includes('ECONNREFUSED'));
});

test('describeRouterError tolerates a missing config', () => {
    const line = describeRouterError(null, null);
    assert.ok(line.includes('?'));
    assert.ok(line.length > 0);
});
