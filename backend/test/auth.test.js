// Env akun uji di-set sebelum modul auth di-load.
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'admin-pass';
process.env.VIEWER_USERNAME = 'viewer';
process.env.VIEWER_PASSWORD = 'viewer-pass';

const test = require('node:test');
const assert = require('node:assert');
const {
    authenticate,
    signToken,
    checkLoginThrottle,
    clearLoginThrottle,
    requireAuth,
    requireEosForMutations
} = require('../services/auth');

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; }
    };
}

test('authenticate maps env accounts to EOS and Client roles', () => {
    assert.deepStrictEqual(
        authenticate('admin', 'admin-pass'),
        { username: 'admin', name: 'Administrator', role: 'EOS' }
    );
    assert.deepStrictEqual(
        authenticate('viewer', 'viewer-pass'),
        { username: 'viewer', name: 'Viewer', role: 'Client' }
    );
});

test('authenticate rejects wrong passwords and unknown users', () => {
    assert.strictEqual(authenticate('admin', 'wrong'), null);
    assert.strictEqual(authenticate('nobody', 'admin-pass'), null);
});

test('requireAuth rejects a missing token with 401', () => {
    const req = { path: '/devices', headers: {} };
    const res = mockRes();
    let nexted = false;
    requireAuth(req, res, () => { nexted = true; });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(nexted, false);
});

test('requireAuth accepts a signed token and attaches the user', () => {
    const token = signToken({ username: 'admin', name: 'Administrator', role: 'EOS' });
    const req = { path: '/devices', headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    let nexted = false;
    requireAuth(req, res, () => { nexted = true; });
    assert.strictEqual(nexted, true);
    assert.strictEqual(req.user.username, 'admin');
    assert.strictEqual(req.user.role, 'EOS');
});

test('requireAuth rejects a tampered token', () => {
    const token = signToken({ username: 'admin', name: 'Administrator', role: 'EOS' });
    const req = { path: '/devices', headers: { authorization: `Bearer ${token}x` } };
    const res = mockRes();
    requireAuth(req, res, () => {});
    assert.strictEqual(res.statusCode, 401);
});

test('public paths skip auth', () => {
    const req = { path: '/health', headers: {} };
    let nexted = false;
    requireAuth(req, mockRes(), () => { nexted = true; });
    assert.strictEqual(nexted, true);
});

test('requireEosForMutations blocks a Client mutation with 403', () => {
    const req = { path: '/devices', method: 'POST', user: { role: 'Client' } };
    const res = mockRes();
    requireEosForMutations(req, res, () => {});
    assert.strictEqual(res.statusCode, 403);
});

test('requireEosForMutations allows a Client GET and an EOS mutation', () => {
    const getReq = { path: '/devices', method: 'GET', user: { role: 'Client' } };
    let nexted = false;
    requireEosForMutations(getReq, mockRes(), () => { nexted = true; });
    assert.strictEqual(nexted, true);

    const postReq = { path: '/devices', method: 'POST', user: { role: 'EOS' } };
    nexted = false;
    requireEosForMutations(postReq, mockRes(), () => { nexted = true; });
    assert.strictEqual(nexted, true);
});

test('login throttle blocks the 11th attempt and clearLoginThrottle resets it', () => {
    const key = 'test-key-1';
    for (let i = 0; i < 10; i++) {
        assert.strictEqual(checkLoginThrottle(key).allowed, true, `attempt ${i + 1} should be allowed`);
    }
    const blocked = checkLoginThrottle(key);
    assert.strictEqual(blocked.allowed, false);
    assert.ok(blocked.retryAfterSec > 0);

    clearLoginThrottle(key);
    assert.strictEqual(checkLoginThrottle(key).allowed, true);
});
