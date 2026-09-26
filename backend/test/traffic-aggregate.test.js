const test = require('node:test');
const assert = require('node:assert/strict');

const {
    aggregateSamplesInNode,
    finalizeBuckets,
    groupJsonSamples,
    groupSamplesInNode,
    mongoRowsToGroups
} = require('../services/traffic-aggregate');
const { mergeSamples } = require('../services/traffic-range');

const SITE = 'Gizi';
const PERIODS = ['harian', 'mingguan', 'bulanan', 'tahunan', 'custom'];

function s(timestamp, txMbps, rxMbps, site = SITE) {
    return { site, timestamp, txMbps, rxMbps };
}

// ─────────────────────────────────────────────────────────────────────────────
// Perilaku algoritma lama yang harus dipertahankan
// ─────────────────────────────────────────────────────────────────────────────

test('harian: per jam WIB, slot kosong diisi nol, urutan 00–23', () => {
    const result = aggregateSamplesInNode([
        s('2026-09-01T16:59:59.000Z', 1, 10), // 1 Sep 23:59 WIB
        s('2026-09-01T17:00:00.000Z', 2, 20), // 2 Sep 00:00 WIB
        s('2026-09-02T17:00:00.000Z', 4, 40)  // 3 Sep 00:00 WIB — jam yang sama, hari lain
    ], 'harian');

    assert.equal(result.length, 24);
    assert.deepEqual(result[0], { label: '00:00', tx: 3, rx: 30, samples: 2 });
    assert.deepEqual(result[1], { label: '01:00', tx: 0, rx: 0, samples: 0 });
    assert.deepEqual(result[23], { label: '23:00', tx: 1, rx: 10, samples: 1 });
});

test('mingguan: label Senin–Minggu, hanya hari berisi data yang tampil', () => {
    const result = aggregateSamplesInNode([
        s('2026-09-06T16:59:00.000Z', 1, 1), // Minggu 23:59 WIB
        s('2026-09-06T17:00:00.000Z', 2, 2), // Senin 00:00 WIB
        s('2026-09-13T17:00:00.000Z', 3, 3)  // Senin minggu berikutnya
    ], 'mingguan');

    assert.deepEqual(result.map(r => r.label), ['Senin', 'Minggu']);
    assert.deepEqual(result[0], { label: 'Senin', tx: 2.5, rx: 2.5, samples: 2 });
    assert.deepEqual(result[1], { label: 'Minggu', tx: 1, rx: 1, samples: 1 });
});

test('bulanan: minggu 1–4 dihitung dari tanggal WIB (tanggal 8 masuk Minggu 2)', () => {
    const result = aggregateSamplesInNode([
        s('2026-09-06T17:00:00.000Z', 1, 1), // 7 Sep WIB  -> mg1
        s('2026-09-07T17:00:00.000Z', 2, 2), // 8 Sep WIB  -> mg2
        s('2026-09-28T17:00:00.000Z', 3, 3), // 29 Sep WIB -> mg4
        s('2026-09-30T17:00:00.000Z', 4, 4)  // 1 Okt WIB  -> mg1
    ], 'bulanan');

    assert.deepEqual(result.map(r => r.label), ['Minggu 1', 'Minggu 2', 'Minggu 4']);
    assert.deepEqual(result[0], { label: 'Minggu 1', tx: 2.5, rx: 2.5, samples: 2 });
    assert.deepEqual(result[1], { label: 'Minggu 2', tx: 2, rx: 2, samples: 1 });
    assert.deepEqual(result[2], { label: 'Minggu 4', tx: 3, rx: 3, samples: 1 });
});

test('tahunan: bulan dihitung menurut WIB, tengah malam WIB pindah bulan', () => {
    const result = aggregateSamplesInNode([
        s('2026-12-31T16:59:00.000Z', 1, 1), // 31 Des 23:59 WIB
        s('2026-12-31T17:00:00.000Z', 2, 2), // 1 Jan 2027 00:00 WIB
        s('2026-01-15T00:00:00.000Z', 3, 3)  // 15 Jan WIB
    ], 'tahunan');

    assert.equal(result.length, 12);
    assert.deepEqual(result[0], { label: 'Jan', tx: 2.5, rx: 2.5, samples: 2 });
    assert.deepEqual(result[11], { label: 'Des', tx: 1, rx: 1, samples: 1 });
});

test('custom: per hari WIB, urut menaik, tanpa slot kosong', () => {
    const result = aggregateSamplesInNode([
        s('2026-09-01T16:59:00.000Z', 1, 1), // 1 Sep WIB
        s('2026-09-01T17:00:00.000Z', 2, 2)  // 2 Sep WIB
    ], 'custom');

    assert.deepEqual(result, [
        { label: '01/09', tx: 1, rx: 1, samples: 1 },
        { label: '02/09', tx: 2, rx: 2, samples: 1 }
    ]);
});

test('nilai tak terbaca dihitung 0 dan rata-rata dibulatkan dua desimal', () => {
    const result = aggregateSamplesInNode([
        s('2026-09-01T01:00:00.000Z', 0.1, null),
        s('2026-09-01T02:00:00.000Z', 0.2, 'abc')
    ], 'custom');

    assert.deepEqual(result, [{ label: '01/09', tx: 0.15, rx: 0, samples: 2 }]);
});

test('tanpa sample mengembalikan array kosong, bukan slot kosong', () => {
    assert.deepEqual(aggregateSamplesInNode([], 'harian'), []);
    assert.deepEqual(aggregateSamplesInNode(null, 'tahunan'), []);
});

// ─────────────────────────────────────────────────────────────────────────────
// Komposisi jalur baru (bucket Mongo + sisa JSON) vs cara lama
// ─────────────────────────────────────────────────────────────────────────────

// Duplikat timestamp antar-sumber sengaja BERNILAI SAMA supaya pemenangnya tidak
// ambigu: perilaku lama pun tidak mendefinisikan nilai mana yang menang saat
// dokumen Mongo ganda berisi angka berbeda.
const MONGO_DOCS = [
    s('2026-09-01T16:59:59.000Z', 1, 2),          // 1 Sep 23:59 WIB
    s('2026-09-01T17:00:00.000Z', 3, 4),          // 2 Sep 00:00 WIB
    s('2026-09-01T17:00:00.000Z', 3, 4),          // duplikat identik di Mongo
    s('2026-09-02T03:15:00.000Z', null, 5),       // tx kosong
    s('2026-09-02T03:30:00.000Z', '1.5', 'abc'),  // string seperti hasil migrasi
    s('2026-09-06T16:59:00.000Z', 2, 2),          // Minggu 23:59 WIB
    s('2026-09-07T17:00:00.000Z', 4, 4),          // 8 Sep 00:00 WIB -> mg2
    s('2026-12-31T17:00:00.000Z', 6, 6)           // 1 Jan 2027 00:00 WIB
];

const JSON_ROWS = [
    s('2026-09-01T17:00:00.000Z', 99, 99),        // duplikat Mongo — nilai Mongo harus menang
    s('2026-09-01T18:00:00.000Z', 7, 7),          // hanya ada di JSON
    s('2026-09-01T18:00:00.000Z', 7, 7),          // duplikat di dalam JSON
    { site: SITE, timestamp: 'bukan-tanggal', txMbps: 9, rxMbps: 9 },
    { site: SITE, timestamp: null, txMbps: 9, rxMbps: 9 },
    s('2026-09-01T19:00:00.000Z', undefined, 8)
];

/**
 * Tiruan hasil pipeline `$group` untuk data uji: dedup per timestamp (yang
 * pertama menang), lalu kelompokkan per bucket. Eksekusi pipeline aslinya di
 * MongoDB diuji di `traffic-aggregate.mongo.test.js`.
 */
function mongoGroupsLikePipeline(docs, period) {
    const timestamps = new Set();
    const kept = [];
    for (const d of docs) {
        const ms = new Date(d.timestamp).getTime();
        if (timestamps.has(ms)) continue;
        timestamps.add(ms);
        kept.push(d);
    }
    return { timestamps, groups: groupSamplesInNode(kept, period) };
}

for (const period of PERIODS) {
    test(`jalur baru = jalur lama atas data yang sama (${period})`, () => {
        const oldSamples = mergeSamples([...MONGO_DOCS, ...JSON_ROWS], SITE);
        const oldResult = aggregateSamplesInNode(oldSamples, period);

        const mongo = mongoGroupsLikePipeline(MONGO_DOCS, period);
        const groups = groupJsonSamples(JSON_ROWS, period, mongo.timestamps, mongo.groups);
        const newResult = finalizeBuckets(groups, period);

        assert.deepEqual(newResult, oldResult);
        assert.equal(
            [...groups.values()].reduce((n, g) => n + g.count, 0),
            oldSamples.length,
            'jumlah sample total harus sama'
        );
    });
}

test('baris JSON yang duplikat dengan Mongo tidak menimpa nilai Mongo', () => {
    const groups = groupJsonSamples(
        [s('2026-09-01T17:00:00.000Z', 99, 99)],
        'custom',
        new Set([Date.parse('2026-09-01T17:00:00.000Z')])
    );

    assert.equal(groups.size, 0);
});

test('baris hasil pipeline dibaca sebagai kelompok bucket', () => {
    const groups = mongoRowsToGroups([
        { _id: 'mg1', tx: 10, rx: 20, count: 2 },
        { _id: 'mg4', tx: 4, rx: 4, count: 1 }
    ]);

    assert.deepEqual(finalizeBuckets(groups, 'bulanan'), [
        { label: 'Minggu 1', tx: 5, rx: 10, samples: 2 },
        { label: 'Minggu 4', tx: 4, rx: 4, samples: 1 }
    ]);
});
