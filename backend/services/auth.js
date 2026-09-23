const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '12h';
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const THROTTLE_MAX_ATTEMPTS = 10;

// Endpoint publik: health check dan login. Semua /api lain wajib token (fail-closed).
const PUBLIC_PATHS = new Set(['/health', '/auth/login']);

// Samakan '/health/' dengan '/health' agar health check dengan trailing slash tetap publik.
function normalizePath(path) {
    if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
    return path;
}

function assertAuthConfig() {
    const missing = [];
    if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
    if (!process.env.ADMIN_USERNAME) missing.push('ADMIN_USERNAME');
    if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
    if (missing.length > 0) {
        console.error(`❌ Konfigurasi auth belum lengkap. Set variabel berikut di backend/.env: ${missing.join(', ')}`);
        process.exit(1);
    }
}

// Akun v1 dari environment. User management + akses per-site menyusul post-v1.
function getAccounts() {
    const accounts = [];
    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
        accounts.push({
            username: process.env.ADMIN_USERNAME,
            password: process.env.ADMIN_PASSWORD,
            name: 'Administrator',
            role: 'EOS'
        });
    }
    if (process.env.VIEWER_USERNAME && process.env.VIEWER_PASSWORD) {
        accounts.push({
            username: process.env.VIEWER_USERNAME,
            password: process.env.VIEWER_PASSWORD,
            name: 'Viewer',
            role: 'Client'
        });
    }
    return accounts;
}

// Perbandingan konstan-waktu agar tidak membocorkan isi lewat timing.
function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function authenticate(username, password) {
    const account = getAccounts().find(a => a.username === username);
    if (!account) return null;
    if (!safeEqual(password, account.password)) return null;
    return { username: account.username, name: account.name, role: account.role };
}

function signToken(user) {
    return jwt.sign(
        { sub: user.username, name: user.name, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: TOKEN_TTL }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        return null;
    }
}

const loginAttempts = new Map();
const MAX_TRACKED_KEYS = 1000;

function checkLoginThrottle(key) {
    const now = Date.now();

    // Endpoint login publik tidak boleh jadi vektor memory growth:
    // map dibatasi, entri paling lama dibuang saat melewati batas.
    if (loginAttempts.size > MAX_TRACKED_KEYS) {
        const overflow = loginAttempts.size - MAX_TRACKED_KEYS;
        let removed = 0;
        for (const k of loginAttempts.keys()) {
            loginAttempts.delete(k);
            if (++removed >= overflow) break;
        }
    }

    const entry = loginAttempts.get(key);
    if (!entry || now - entry.firstAt > THROTTLE_WINDOW_MS) {
        loginAttempts.set(key, { count: 1, firstAt: now });
        return { allowed: true };
    }

    entry.count += 1;
    if (entry.count > THROTTLE_MAX_ATTEMPTS) {
        return { allowed: false, retryAfterSec: Math.ceil((entry.firstAt + THROTTLE_WINDOW_MS - now) / 1000) };
    }
    return { allowed: true };
}

function clearLoginThrottle(key) {
    loginAttempts.delete(key);
}

function requireAuth(req, res, next) {
    if (PUBLIC_PATHS.has(normalizePath(req.path))) return next();

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = token ? verifyToken(token) : null;

    if (!payload) {
        return res.status(401).json({ success: false, error: 'Sesi tidak valid atau berakhir.' });
    }

    req.user = { username: payload.sub, name: payload.name, role: payload.role };
    next();
}

// Client hanya-baca: semua request non-GET wajib role EOS.
function requireEosForMutations(req, res, next) {
    if (PUBLIC_PATHS.has(normalizePath(req.path))) return next();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

    if (!req.user || req.user.role !== 'EOS') {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Aksi ini hanya untuk role EOS.' });
    }
    next();
}

module.exports = {
    assertAuthConfig,
    authenticate,
    signToken,
    checkLoginThrottle,
    clearLoginThrottle,
    requireAuth,
    requireEosForMutations
};
