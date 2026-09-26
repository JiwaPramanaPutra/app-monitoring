const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_FAILURE_THRESHOLD,
    NOT_MONITORED,
    OFFLINE,
    ONLINE,
    advancePingState,
    claimableStatus
} = require('../services/device-status');

// ── claimableStatus: status yang boleh ditampilkan ──────────────────────────

test('ping berhasil berarti Online, apa pun riwayatnya', () => {
    assert.equal(claimableStatus(true, null), ONLINE);
    assert.equal(claimableStatus(true, NOT_MONITORED), ONLINE);
    assert.equal(claimableStatus(true, OFFLINE), ONLINE);
});

test('gagal tanpa riwayat hidup TIDAK boleh diklaim Offline', () => {
    // Inilah cacat yang diperbaiki: AP di sub-jaringan lain tidak terjangkau dari
    // server, dan tabel menyebutnya Offline seolah perangkatnya mati.
    assert.equal(claimableStatus(false, null), NOT_MONITORED);
    assert.equal(claimableStatus(false, undefined), NOT_MONITORED);
    assert.equal(claimableStatus(false, NOT_MONITORED), NOT_MONITORED);
});

test('gagal setelah pernah terlihat hidup adalah Offline yang nyata', () => {
    assert.equal(claimableStatus(false, ONLINE), OFFLINE);
    // Sekali terbukti mati, ia tetap Offline sampai benar-benar menjawab lagi.
    assert.equal(claimableStatus(false, OFFLINE), OFFLINE);
});

// ── advancePingState: ambang dan notifikasi ────────────────────────────────

test('perangkat yang belum pernah hidup tidak pernah menjadi Offline', () => {
    let state = { fails: 0, status: NOT_MONITORED };
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
    let state = { fails: 0, status: ONLINE };
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

test('pulih dari Offline memicu notifikasi online sekali', () => {
    const recovered = advancePingState({ fails: 7, status: OFFLINE }, true);
    assert.equal(recovered.status, ONLINE);
    assert.equal(recovered.fails, 0);
    assert.equal(recovered.notify, 'online');

    // Siklus berikutnya yang juga berhasil bukan lagi "pulih".
    const again = advancePingState(recovered, true);
    assert.equal(again.notify, null);
});

test('perangkat yang belum pernah hidup lalu menjawab tidak disebut "pulih"', () => {
    const first = advancePingState({ fails: 4, status: NOT_MONITORED }, true);
    assert.equal(first.status, ONLINE);
    assert.equal(first.notify, null, 'tidak ada yang pulih kalau belum pernah terbukti mati');
});

test('kegagalan di bawah ambang belum mengubah status', () => {
    let state = { fails: 0, status: ONLINE };
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
    assert.equal(next.notify, null);
});

test('ambang yang tidak masuk akal jatuh ke default', () => {
    let state = { fails: DEFAULT_FAILURE_THRESHOLD - 1, status: ONLINE };
    state = advancePingState(state, false, 0);
    assert.equal(state.status, OFFLINE);

    let other = { fails: DEFAULT_FAILURE_THRESHOLD - 1, status: ONLINE };
    other = advancePingState(other, false, NaN);
    assert.equal(other.status, OFFLINE);
});

test('ambang yang lebih longgar dihormati', () => {
    let state = { fails: 0, status: ONLINE };
    for (let i = 1; i <= 4; i++) state = advancePingState(state, false, 5);
    assert.equal(state.status, ONLINE, 'belum mencapai ambang 5');
    state = advancePingState(state, false, 5);
    assert.equal(state.status, OFFLINE);
});

test('berhasil di tengah rentetan kegagalan mengosongkan hitungan', () => {
    let state = advancePingState({ fails: 2, status: ONLINE }, true);
    assert.equal(state.fails, 0);
    state = advancePingState(state, false);
    assert.equal(state.fails, 1);
    assert.equal(state.status, ONLINE, 'hitungan mulai dari nol lagi');
});
