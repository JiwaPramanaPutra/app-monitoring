const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_FAILURE_THRESHOLD,
    DEFAULT_SUCCESS_THRESHOLD,
    NOT_MONITORED,
    OFFLINE,
    ONLINE,
    advancePingState,
    claimableStatus,
    deviceStateKey,
    shouldNotify
} = require('../services/device-status');

// ── claimableStatus: status yang boleh ditampilkan ──────────────────────────

test('ping berhasil berarti Online, apa pun riwayatnya', () => {
    assert.equal(claimableStatus(true, null), ONLINE);
    assert.equal(claimableStatus(true, NOT_MONITORED), ONLINE);
    assert.equal(claimableStatus(true, OFFLINE), ONLINE);
});

test('gagal tanpa riwayat hidup TIDAK boleh diklaim Offline', () => {
    // Inilah cacat yang pernah diperbaiki: AP di sub-jaringan lain tidak
    // terjangkau dari server, dan tabel menyebutnya Offline seolah matinya.
    assert.equal(claimableStatus(false, null), NOT_MONITORED);
    assert.equal(claimableStatus(false, undefined), NOT_MONITORED);
    assert.equal(claimableStatus(false, NOT_MONITORED), NOT_MONITORED);
});

test('gagal setelah pernah terlihat hidup adalah Offline yang nyata', () => {
    assert.equal(claimableStatus(false, ONLINE), OFFLINE);
    // Sekali terbukti mati, ia tetap Offline sampai benar-benar menjawab lagi.
    assert.equal(claimableStatus(false, OFFLINE), OFFLINE);
});

// ── advancePingState: ambang, histeresis, dan notifikasi ────────────────────

test('perangkat yang belum pernah hidup tidak pernah menjadi Offline', () => {
    let state = { fails: 0, oks: 0, status: NOT_MONITORED };
    const notifies = [];

    for (let i = 0; i < 10; i++) {
        const next = advancePingState(state, false);
        if (next.notify) notifies.push(next.notify);
        state = next;
    }

    assert.equal(state.status, NOT_MONITORED);
    assert.deepEqual(notifies, [], 'tidak boleh ada notifikasi untuk yang tidak terjangkau');
});

test('perangkat yang pernah Online menjadi Offline tepat saat melewati ambang', () => {
    let state = { fails: 0, oks: 0, status: ONLINE };
    const notifies = [];

    for (let i = 1; i <= 5; i++) {
        const next = advancePingState(state, false);
        if (next.notify) notifies.push({ i, notify: next.notify });
        state = next;
    }

    assert.equal(state.status, OFFLINE);
    assert.deepEqual(notifies, [{ i: DEFAULT_FAILURE_THRESHOLD, notify: 'offline' }],
        'notifikasi hanya sekali, tepat saat transisi');
});

test('pulih dari Offline butuh dua sukses berturut-turut', () => {
    const first = advancePingState({ fails: 7, oks: 0, status: OFFLINE }, true);
    assert.equal(first.status, OFFLINE, 'satu paket balasan belum cukup untuk mengklaim Online');
    assert.equal(first.notify, null);
    assert.equal(first.fails, 0);
    assert.equal(first.oks, 1);

    const second = advancePingState(first, true);
    assert.equal(second.status, ONLINE);
    assert.equal(second.notify, 'online');

    // Siklus berikutnya yang juga berhasil bukan lagi "pulih".
    const again = advancePingState(second, true);
    assert.equal(again.notify, null);
});

test('satu balasan nyasar tidak mengarm notifikasi Offline (histeresis)', () => {
    // Akar notifikasi up/down berulang di lapangan: dulu satu balasan sudah
    // membuat status Online, lalu tiga gagal berikutnya mengirim OFFLINE —
    // berpasangan tiap kali jalur perangkat yang buruk sempat menjawab sekali.
    let state = advancePingState(null, true);
    assert.equal(state.status, NOT_MONITORED, 'satu sukses belum membuktikan koneksi stabil');
    assert.equal(state.notify, null);

    for (let i = 0; i < 5; i++) {
        state = advancePingState(state, false);
        assert.equal(state.notify, null, 'tidak boleh ada Offline dari satu balasan nyasar');
    }
    assert.equal(state.status, NOT_MONITORED);
});

test('perangkat yang belum pernah hidup lalu menjawab tidak disebut "pulih"', () => {
    let state = advancePingState({ fails: 4, oks: 0, status: NOT_MONITORED }, true);
    assert.equal(state.status, NOT_MONITORED, 'satu sukses belum cukup');
    assert.equal(state.notify, null);

    state = advancePingState(state, true);
    assert.equal(state.status, ONLINE);
    assert.equal(state.notify, null, 'tidak ada yang pulih kalau belum pernah terbukti mati');
});

test('kegagalan di bawah ambang belum mengubah status', () => {
    let state = { fails: 0, oks: 0, status: ONLINE };
    for (let i = 1; i < DEFAULT_FAILURE_THRESHOLD; i++) {
        state = advancePingState(state, false);
        assert.equal(state.status, ONLINE);
        assert.equal(state.notify, null);
    }
});

test('state awal yang kosong diperlakukan sebagai belum terpantau', () => {
    const next = advancePingState(null, false);
    assert.equal(next.status, NOT_MONITORED);
    assert.equal(next.fails, 1);
    assert.equal(next.oks, 0);
    assert.equal(next.notify, null);
});

test('ambang yang tidak masuk akal jatuh ke default', () => {
    let state = { fails: DEFAULT_FAILURE_THRESHOLD - 1, oks: 0, status: ONLINE };
    state = advancePingState(state, false, { failThreshold: 0 });
    assert.equal(state.status, OFFLINE);

    let other = { fails: DEFAULT_FAILURE_THRESHOLD - 1, oks: 0, status: ONLINE };
    other = advancePingState(other, false, { failThreshold: NaN });
    assert.equal(other.status, OFFLINE);

    let ok = { fails: 0, oks: DEFAULT_SUCCESS_THRESHOLD - 1, status: NOT_MONITORED };
    ok = advancePingState(ok, true, { okThreshold: -1 });
    assert.equal(ok.status, ONLINE, 'okThreshold tidak masuk akal juga jatuh ke default');
});

test('ambang yang lebih longgar dihormati', () => {
    let state = { fails: 0, oks: 0, status: ONLINE };
    for (let i = 1; i <= 4; i++) state = advancePingState(state, false, { failThreshold: 5 });
    assert.equal(state.status, ONLINE, 'belum mencapai ambang 5');
    state = advancePingState(state, false, { failThreshold: 5 });
    assert.equal(state.status, OFFLINE);
});

test('berhasil di tengah rentetan kegagalan mengosongkan hitungan', () => {
    let state = advancePingState({ fails: 2, oks: 0, status: ONLINE }, true);
    assert.equal(state.fails, 0);
    assert.equal(state.status, ONLINE, 'status Online dipertahankan; satu sukses belum mengubah klaim');
    state = advancePingState(state, false);
    assert.equal(state.fails, 1);
    assert.equal(state.status, ONLINE, 'hitungan mulai dari nol lagi');
});

// ── shouldNotify: cooldown antar notifikasi per perangkat ───────────────────

test('notifikasi pertama selalu boleh dikirim', () => {
    assert.equal(shouldNotify(0, Date.now(), 30 * 60 * 1000), true);
    assert.equal(shouldNotify(null, Date.now(), 30 * 60 * 1000), true);
    assert.equal(shouldNotify(undefined, Date.now(), 30 * 60 * 1000), true);
});

test('notifikasi beruntun ditahan sampai cooldown lewat', () => {
    const cooldown = 30 * 60 * 1000;
    const last = 1_000_000_000_000;
    assert.equal(shouldNotify(last, last + 60_000, cooldown), false, '1 menit: ditahan');
    assert.equal(shouldNotify(last, last + cooldown - 1, cooldown), false, 'tepat sebelum batas: ditahan');
    assert.equal(shouldNotify(last, last + cooldown, cooldown), true, 'tepat di batas: boleh');
    assert.equal(shouldNotify(last, last + cooldown + 1, cooldown), true, 'setelah batas: boleh');
});

test('cooldown yang tidak masuk akal tidak menelan notifikasi', () => {
    assert.equal(shouldNotify(1_000, 2_000, 0), true);
    assert.equal(shouldNotify(1_000, 2_000, NaN), true);
    assert.equal(shouldNotify(1_000, 2_000, -5), true);
});

// ── deviceStateKey: identitas dulu, IP cadangan ─────────────────────────────

test('kunci state memakai identitas perangkat, bukan IP', () => {
    assert.equal(deviceStateKey({ _id: 'a1', id: 7, ip: '10.0.0.1' }), 'a1');
    assert.equal(deviceStateKey({ id: 7, ip: '10.0.0.1' }), '7');
    assert.equal(deviceStateKey({ ip: '10.0.0.1' }), '10.0.0.1');
    assert.equal(deviceStateKey(null), '');
    assert.equal(deviceStateKey({}), '');
});

test('dua perangkat ber-IP sama tidak lagi berbagi state', () => {
    const a = deviceStateKey({ _id: 'dev-a', ip: '223.27.147.18' });
    const b = deviceStateKey({ _id: 'dev-b', ip: '223.27.147.18' });
    assert.notEqual(a, b);
});
