const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SAMPLE_LIMIT,
    DEFAULT_TIME_ZONE,
    WIB_OFFSET_MS,
    capSamples,
    isFlagOn,
    isValidTimeZone,
    mergeSamples,
    rangeBounds,
    resolveTimeZone,
    toTZ,
    toWIB,
    tzOffsetMs
} = require('../services/traffic-range');

test('WIB_OFFSET_MS adalah UTC+7, bukan UTC+8', () => {
    assert.equal(WIB_OFFSET_MS, 7 * 60 * 60 * 1000);
    assert.notEqual(WIB_OFFSET_MS, 8 * 60 * 60 * 1000);
});

test('rangeBounds menafsirkan tanggal sebagai hari WIB', () => {
    const { startMs, endMs } = rangeBounds('2026-09-01', '2026-09-10');

    assert.equal(startMs.toISOString(), '2026-08-31T17:00:00.000Z');
    assert.equal(endMs.toISOString(), '2026-09-10T16:59:59.000Z');
});

test('rangeBounds: hari terakhir mencakup sampai 23:59:59 WIB', () => {
    const { startMs, endMs } = rangeBounds('2026-09-10', '2026-09-10');

    assert.equal(startMs.toISOString(), '2026-09-09T17:00:00.000Z');
    assert.equal(endMs.toISOString(), '2026-09-10T16:59:59.000Z');
    assert.equal(endMs.getTime() - startMs.getTime(), 24 * 60 * 60 * 1000 - 1000);
});

test('rangeBounds tanpa tanggal berarti tanpa batas', () => {    assert.deepEqual(rangeBounds(null, null), { startMs: null, endMs: null });

    const partial = rangeBounds('2026-09-01', null);
    assert.equal(partial.startMs.toISOString(), '2026-08-31T17:00:00.000Z');
    assert.equal(partial.endMs, null);
});

test('capSamples: riwayat yang persis SAMPLE_LIMIT bukan pemotongan', () => {
    const docs = Array.from({ length: SAMPLE_LIMIT }, (_, i) => ({ i }));

    const { docs: kept, truncated } = capSamples(docs);

    assert.equal(truncated, false);
    assert.equal(kept.length, SAMPLE_LIMIT);
});

test('capSamples: baris ekstra menandai pemotongan dan dibuang', () => {
    const limit = 3;
    // Query memakai urutan menurun, jadi tiga baris pertama adalah yang terbaru.
    const docs = [{ i: 'baru' }, { i: 'tengah' }, { i: 'lama' }, { i: 'terbuang' }];

    const { docs: kept, truncated } = capSamples(docs, limit);

    assert.equal(truncated, true);
    assert.deepEqual(kept.map(d => d.i), ['baru', 'tengah', 'lama']);
});

test('capSamples: input bukan array diperlakukan sebagai kosong', () => {
    assert.deepEqual(capSamples(null), { docs: [], truncated: false });
    assert.deepEqual(capSamples(undefined, 5), { docs: [], truncated: false });
});

test('capSamples: tepat di bawah batas tidak dipotong', () => {
    const { docs, truncated } = capSamples([{ a: 1 }, { a: 2 }], 3);

    assert.equal(truncated, false);
    assert.equal(docs.length, 2);
});

test('isFlagOn: hanya "0" dan "false" yang mematikan', () => {
    assert.equal(isFlagOn(undefined), false);
    assert.equal(isFlagOn('0'), false);
    assert.equal(isFlagOn('false'), false);

    assert.equal(isFlagOn('1'), true);
    assert.equal(isFlagOn('true'), true);
    assert.equal(isFlagOn(''), true);
});

test('mergeSamples membuang duplikat site+timestamp dari dua sumber', () => {
    const stamp = '2026-09-01T03:00:00.000Z';
    const merged = mergeSamples([
        { site: 'Gizi', timestamp: stamp, txMbps: 1 },
        { site: 'Gizi', timestamp: stamp, txMbps: 1 },
        { site: 'Gizi', timestamp: stamp, txMbps: 1 }
    ], 'Gizi');

    assert.equal(merged.length, 1);
});

test('mergeSamples mengurutkan menaik walau sumbernya bercampur', () => {
    const merged = mergeSamples([
        { site: 'Gizi', timestamp: '2026-09-01T05:00:00.000Z' },
        { site: 'Gizi', timestamp: '2026-09-01T01:00:00.000Z' },
        { site: 'Gizi', timestamp: '2026-09-01T03:00:00.000Z' }
    ], 'Gizi');

    assert.deepEqual(merged.map(s => s.timestamp), [
        '2026-09-01T01:00:00.000Z',
        '2026-09-01T03:00:00.000Z',
        '2026-09-01T05:00:00.000Z'
    ]);
});

test('mergeSamples membuang baris tanpa timestamp yang bisa dibaca', () => {
    const merged = mergeSamples([
        { site: 'Gizi', timestamp: '2026-09-01T01:00:00.000Z' },
        { site: 'Gizi' },
        { site: 'Gizi', timestamp: null },
        { site: 'Gizi', timestamp: 'bukan-tanggal' },
        null
    ], 'Gizi');

    assert.equal(merged.length, 1);
});

test('mergeSamples tidak mencampur site lain dan memakai site pemanggil sebagai cadangan', () => {
    const merged = mergeSamples([
        { site: 'Kebidanan', timestamp: '2026-09-01T01:00:00.000Z' },
        { timestamp: '2026-09-01T02:00:00.000Z' }
    ], 'Gizi');

    assert.equal(merged.length, 2);
    assert.equal(merged[0].site, 'Kebidanan');
    assert.equal(merged[1].site, undefined);
});

test('mergeSamples pada input kosong mengembalikan array kosong', () => {
    assert.deepEqual(mergeSamples(null, 'Gizi'), []);
    assert.deepEqual(mergeSamples([], 'Gizi'), []);
});

test('toWIB memakai konstanta modul ini, bukan offset yang ditulis ulang', () => {
    // `server.js` dulu punya `WIB_OFFSET_MS` sendiri di samping konstanta ini,
    // dan karena modul itu tidak bisa diimpor test, baris itu bisa kembali ke
    // 8 jam tanpa ada yang protes sambil menggeser semua label bucket.
    const stamp = Date.parse('2026-09-01T03:00:00.000Z');

    assert.equal(toWIB(stamp).getTime() - stamp, WIB_OFFSET_MS);
});

test('toWIB menghasilkan kalender WIB, bukan waktu lokal mesin', () => {
    // 2026-09-01T03:00:00Z = Selasa 10:00 WIB
    const wib = toWIB('2026-09-01T03:00:00.000Z');

    assert.equal(wib.getUTCFullYear(), 2026);
    assert.equal(wib.getUTCMonth(), 8);
    assert.equal(wib.getUTCDate(), 1);
    assert.equal(wib.getUTCHours(), 10);
});

test('toWIB memindahkan hari tepat di tengah malam WIB', () => {
    // 2026-09-01T16:59:59Z = 1 Sep 23:59:59 WIB - hari masih sama.
    const sebelum = toWIB('2026-09-01T16:59:59.000Z');
    assert.equal(sebelum.getUTCDate(), 1);
    assert.equal(sebelum.getUTCHours(), 23);

    // 2026-09-01T17:00:00Z = 2 Sep 00:00 WIB - hari berganti.
    const tepat = toWIB('2026-09-01T17:00:00.000Z');
    assert.equal(tepat.getUTCDate(), 2);
    assert.equal(tepat.getUTCHours(), 0);

    // 2026-09-01T23:00:00Z = 2 Sep 06:00 WIB.
    const pagi = toWIB('2026-09-01T23:00:00.000Z');
    assert.equal(pagi.getUTCDate(), 2);
    assert.equal(pagi.getUTCHours(), 6);
});

test('toWIB cocok dengan batas hari yang dipakai rangeBounds', () => {
    // Awal hari WIB 1 September menurut rangeBounds harus terbaca 1 Sep 00:00
    // oleh toWIB - keduanya memakai offset yang sama.
    const { startMs } = rangeBounds('2026-09-01', '2026-09-01');
    const wib = toWIB(startMs);

    assert.equal(wib.getUTCDate(), 1);
    assert.equal(wib.getUTCHours(), 0);
    assert.equal(wib.getUTCMinutes(), 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Zona waktu per pengguna (fitur 13): WIB hanyalah default, bukan satu-satunya
// ─────────────────────────────────────────────────────────────────────────────

test('resolveTimeZone: absen, kosong, dan nama tak dikenal jatuh ke WIB', () => {
    assert.equal(DEFAULT_TIME_ZONE, 'Asia/Jakarta');
    assert.equal(resolveTimeZone(undefined), 'Asia/Jakarta');
    assert.equal(resolveTimeZone(null), 'Asia/Jakarta');
    assert.equal(resolveTimeZone(''), 'Asia/Jakarta');
    assert.equal(resolveTimeZone('   '), 'Asia/Jakarta');
    assert.equal(resolveTimeZone('Bukan/Zona'), 'Asia/Jakarta');
    assert.equal(resolveTimeZone('Asia/Jakarta/Bogus'), 'Asia/Jakarta');
    assert.equal(resolveTimeZone(42), 'Asia/Jakarta');
});

test('resolveTimeZone: nama IANA yang dikenal diteruskan apa adanya', () => {
    assert.equal(resolveTimeZone('Asia/Jakarta'), 'Asia/Jakarta');
    assert.equal(resolveTimeZone('Asia/Makassar'), 'Asia/Makassar');
    assert.equal(resolveTimeZone('Asia/Jayapura'), 'Asia/Jayapura');
    assert.equal(resolveTimeZone('UTC'), 'UTC');
});

test('isValidTimeZone memvalidasi lewat Intl, bukan daftar nama tetap', () => {
    assert.equal(isValidTimeZone('America/New_York'), true);
    assert.equal(isValidTimeZone('Asia/Jakarta'), true);
    assert.equal(isValidTimeZone('UTC'), true);
    assert.equal(isValidTimeZone('Asia/Bukan/Zona'), false);
    assert.equal(isValidTimeZone(undefined), false);
});

test('tzOffsetMs: WIB +7 jam, WITA +8, Jayapura +9, UTC 0', () => {
    const stamp = '2026-09-01T03:00:00.000Z';

    assert.equal(tzOffsetMs(stamp, 'Asia/Jakarta'), WIB_OFFSET_MS);
    assert.equal(tzOffsetMs(stamp, 'Asia/Makassar'), 8 * 60 * 60 * 1000);
    assert.equal(tzOffsetMs(stamp, 'Asia/Jayapura'), 9 * 60 * 60 * 1000);
    assert.equal(tzOffsetMs(stamp, 'UTC'), 0);
});

test('tzOffsetMs membaca offset PER TANGGAL, bukan offset tetap', () => {
    // Amerika/New_York: EST (UTC-5) sebelum 8 Mar 2026, EDT (UTC-4) sesudahnya.
    const musimDingin = tzOffsetMs('2026-03-01T12:00:00.000Z', 'America/New_York');
    const musimPanas = tzOffsetMs('2026-03-20T12:00:00.000Z', 'America/New_York');

    assert.equal(musimDingin, -5 * 60 * 60 * 1000);
    assert.equal(musimPanas, -4 * 60 * 60 * 1000);
});

test('rangeBounds: batas harian Asia/Makassar bergeser +1 jam vs WIB', () => {
    const jakarta = rangeBounds('2026-09-10', '2026-09-10', 'Asia/Jakarta');
    const makassar = rangeBounds('2026-09-10', '2026-09-10', 'Asia/Makassar');
    const jayapura = rangeBounds('2026-09-10', '2026-09-10', 'Asia/Jayapura');

    assert.equal(jakarta.startMs.toISOString(), '2026-09-09T17:00:00.000Z');
    assert.equal(makassar.startMs.toISOString(), '2026-09-09T16:00:00.000Z');
    assert.equal(jayapura.startMs.toISOString(), '2026-09-09T15:00:00.000Z');

    // WITA mulai satu jam lebih awal, jadi batasnya persis berselisih satu jam.
    assert.equal(jakarta.startMs.getTime() - makassar.startMs.getTime(), 60 * 60 * 1000);
    assert.equal(jakarta.endMs.getTime() - makassar.endMs.getTime(), 60 * 60 * 1000);
});

test('rangeBounds: UTC memakai batas tengah malam UTC', () => {
    const { startMs, endMs } = rangeBounds('2026-09-10', '2026-09-10', 'UTC');

    assert.equal(startMs.toISOString(), '2026-09-10T00:00:00.000Z');
    assert.equal(endMs.toISOString(), '2026-09-10T23:59:59.000Z');
});

test('rangeBounds: hari ber-DST bisa 23 jam, bukan selalu 24', () => {
    // New York 8 Mar 2026 kehilangan satu jam (02:00 -> 03:00 waktu setempat).
    const { startMs, endMs } = rangeBounds('2026-03-08', '2026-03-08', 'America/New_York');

    assert.equal(startMs.toISOString(), '2026-03-08T05:00:00.000Z');
    assert.equal(endMs.toISOString(), '2026-03-09T03:59:59.000Z');
    assert.equal(endMs.getTime() - startMs.getTime(), 23 * 60 * 60 * 1000 - 1000);
});

test('rangeBounds tz tidak valid jatuh ke WIB, bukan melempar', () => {
    const wib = rangeBounds('2026-09-10', '2026-09-10', 'Asia/Jakarta');
    const bogus = rangeBounds('2026-09-10', '2026-09-10', 'Bukan/Zona');

    assert.equal(bogus.startMs.toISOString(), wib.startMs.toISOString());
    assert.equal(bogus.endMs.toISOString(), wib.endMs.toISOString());
});

test('toTZ konsisten dengan rangeBounds untuk tiap zona', () => {
    for (const tz of ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'UTC']) {
        const { startMs } = rangeBounds('2026-09-10', '2026-09-10', tz);
        const shifted = toTZ(startMs, tz);

        assert.equal(shifted.getUTCDate(), 10, `tanggal ${tz}`);
        assert.equal(shifted.getUTCHours(), 0, `jam ${tz}`);
        assert.equal(shifted.getUTCMinutes(), 0, `menit ${tz}`);
    }
});

test('toTZ memindahkan hari tepat di tengah malam tiap zona', () => {
    // 16:59:59Z = 10 Sep 23:59:59 WIB (masih hari yang sama) tetapi sudah
    // 11 Sep 00:59:59 WITA — pergantian hari terjadi satu jam lebih awal.
    const sebelumWIB = toTZ('2026-09-10T16:59:59.000Z', 'Asia/Jakarta');
    const setelahWITA = toTZ('2026-09-10T16:59:59.000Z', 'Asia/Makassar');

    assert.equal(sebelumWIB.getUTCDate(), 10);
    assert.equal(sebelumWIB.getUTCHours(), 23);
    assert.equal(setelahWITA.getUTCDate(), 11);
    assert.equal(setelahWITA.getUTCHours(), 0);
});

test('toTZ memakai offset tanggal itu untuk zona ber-DST', () => {
    // Tengah malam waktu setempat harus terbaca 00:00 di kedua sisi DST.
    const musimDingin = toTZ('2026-01-15T05:00:00.000Z', 'America/New_York'); // 00:00 EST
    const musimPanas = toTZ('2026-07-15T04:00:00.000Z', 'America/New_York'); // 00:00 EDT

    assert.equal(musimDingin.getUTCHours(), 0);
    assert.equal(musimPanas.getUTCHours(), 0);
});

test('toTZ dengan tz tak dikenal sama dengan toWIB', () => {
    const stamp = '2026-09-01T03:00:00.000Z';

    assert.equal(toTZ(stamp, 'Bukan/Zona').getTime(), toWIB(stamp).getTime());
});
