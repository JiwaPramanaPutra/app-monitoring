// Uji kesetaraan jalur agregasi terhadap MongoDB SUNGGUHAN, read-only:
// - data sintetis masuk lewat `$documents` (tidak menulis ke koleksi apa pun),
// - data acak deterministik lewat `$documents` sebagai fuzz kesetaraan,
// - data nyata dibaca lewat `getRawSamples` (cara lama) dan `getAggregatedHistory`
//   (cara baru), lalu hasilnya dibandingkan bucket per bucket.
//
// Semua perbandingan dijalankan untuk tiap zona (WIB, WITA, Jayapura, UTC):
// pipeline Mongo memakai `$dateToParts { timezone }`, jalur Node memakai `toTZ`,
// dan keduanya harus menghasilkan bucket yang sama persis.
//
// Dilewati dengan pesan jelas bila `MONGO_URI` tidak diatur atau MongoDB tidak
// terjangkau, supaya suite tetap hijau tanpa jaringan.

require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TrafficSample = require('../models/TrafficSample');
const {
    aggregateSamplesInNode,
    buildMongoBucketPipeline,
    finalizeBuckets,
    mongoRowsToGroups
} = require('../services/traffic-aggregate');
const { mergeSamples, rangeBounds, tzOffsetMs } = require('../services/traffic-range');
const { getAggregatedHistory, getRawSamples } = require('../services/traffic-history');

const SITE = 'Uji-Kesetaraan';
const PERIODS = ['harian', 'mingguan', 'bulanan', 'tahunan', 'custom'];
const ZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'UTC'];

function doc(timestamp, txMbps, rxMbps, site = SITE) {
    return { site, timestamp: new Date(timestamp), txMbps, rxMbps };
}

// Berbatas WIB: tengah malam, pergantian pekan, tanggal 7/8 dan 28/29,
// pergantian bulan dan tahun. Duplikat timestamp sengaja bernilai sama.
const SYNTHETIC_DOCS = [
    doc('2026-08-31T16:59:00.000Z', 1, 2),   // 31 Agu 23:59 WIB (Senin)
    doc('2026-08-31T17:00:00.000Z', 3, 4),   // 1 Sep 00:00 WIB (Selasa)
    doc('2026-08-31T17:00:00.000Z', 3, 4),   // duplikat identik
    doc('2026-09-06T16:59:00.000Z', 5, 6),   // Minggu 23:59 WIB
    doc('2026-09-07T17:00:00.000Z', 7, 8),   // 8 Sep 00:00 WIB -> minggu ke-2
    doc('2026-09-28T17:00:00.000Z', 9, 10),  // 29 Sep 00:00 WIB -> minggu ke-4
    doc('2026-12-31T16:59:00.000Z', 11, 12), // 31 Des 23:59 WIB
    doc('2026-12-31T17:00:00.000Z', 13, 14), // 1 Jan 2027 00:00 WIB
    { site: SITE, timestamp: new Date('2026-09-01T17:30:00.000Z'), rxMbps: 5 }, // tx kosong
    doc('2026-09-01T17:45:00.000Z', '1.5', 'abc'), // string seperti hasil migrasi
    doc('2026-09-01T18:00:00.000Z', 1, 1, 'Site-Lain') // harus tersaring $match
];

// 240 timestamp unik pseudo-acak sepanjang 2026 (LCG dengan benih tetap, bukan
// Math.random, supaya kegagalan bisa direproduksi). Nilai tx/rx bervariasi,
// termasuk string dan null, supaya jalur konversi angka ikut terbanding.
const FUZZ_DOCS = (() => {
    let seed = 20260928;
    const rand = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
    const pad = () => String(Math.floor(rand() * 10)).padStart(2, '0');
    const docs = [];
    const seen = new Set();
    const base = Date.UTC(2026, 0, 1, 0, 0, 0);
    const spanMs = 365 * 24 * 60 * 60 * 1000;
    while (docs.length < 240) {
        const ms = base + Math.floor(rand() * spanMs);
        const whole = ms - (ms % 1000);
        if (seen.has(whole)) continue;
        seen.add(whole);
        const nilai = [rand() * 100, null, '1.5', rand() * 10];
        docs.push(doc(whole, nilai[docs.length % nilai.length], rand() * 50));
    }
    return docs;
})();

/** `YYYY-MM-DD` menurut kalender zona `tz`. */
function dateStringInZone(date, tz) {
    const shifted = new Date(date.getTime() + tzOffsetMs(date, tz));
    const pad = (n) => String(n).padStart(2, '0');
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** MongoDB di bawah 5.1 tidak punya `$documents`; subtest dilewati dengan pesan. */
async function documentsSupported(sub) {
    const info = await mongoose.connection.db.admin().serverInfo();
    const [major, minor] = String(info.version).split('.').map(Number);
    if (major < 5 || (major === 5 && minor < 1)) {
        sub.diagnostic(`MongoDB ${info.version} tidak mendukung $documents; subtest dilewati.`);
        return false;
    }
    return true;
}

test('kesetaraan agregasi MongoDB vs cara lama', async (t) => {
    const uri = process.env.MONGO_URI;
    if (!uri || uri.includes('YOUR_PASSWORD_HERE')) {
        return t.skip('MONGO_URI tidak diatur di backend/.env.');
    }

    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    } catch (err) {
        return t.skip(`MongoDB tidak terjangkau: ${err.message}`);
    }

    try {
        await t.test('data sintetis lewat $documents, semua zona & periode', async (sub) => {
            if (!await documentsSupported(sub)) return;

            const db = mongoose.connection.db;
            const ownDocs = SYNTHETIC_DOCS.filter(d => d.site === SITE);
            const oldSamples = mergeSamples(ownDocs, SITE);

            for (const tz of ZONES) {
                for (const period of PERIODS) {
                    const rows = await db.aggregate([
                        { $documents: SYNTHETIC_DOCS },
                        ...buildMongoBucketPipeline({ site: SITE, startMs: null, endMs: null, period, tz })
                    ]).toArray();
                    const groups = mongoRowsToGroups(rows);

                    assert.deepEqual(
                        finalizeBuckets(groups, period),
                        aggregateSamplesInNode(oldSamples, period, tz),
                        `data sintetis ${tz} periode ${period}`
                    );
                    assert.equal(
                        [...groups.values()].reduce((n, g) => n + g.count, 0),
                        oldSamples.length,
                        `jumlah sample sintetis ${tz} periode ${period}`
                    );
                }
            }
        });

        await t.test('fuzz deterministik: pipeline = Node untuk data acak per zona', async (sub) => {
            if (!await documentsSupported(sub)) return;

            const db = mongoose.connection.db;
            const oldSamples = mergeSamples(FUZZ_DOCS, SITE);

            for (const tz of ZONES) {
                for (const period of PERIODS) {
                    const rows = await db.aggregate([
                        { $documents: FUZZ_DOCS },
                        ...buildMongoBucketPipeline({ site: SITE, startMs: null, endMs: null, period, tz })
                    ]).toArray();
                    const groups = mongoRowsToGroups(rows);

                    assert.deepEqual(
                        finalizeBuckets(groups, period),
                        aggregateSamplesInNode(oldSamples, period, tz),
                        `fuzz ${tz} periode ${period}`
                    );
                }
            }
            sub.diagnostic(`${FUZZ_DOCS.length} sample acak dibandingkan di ${ZONES.length} zona.`);
        });

        await t.test('data nyata vs cara lama, semua zona & periode', async (sub) => {
            const sites = await TrafficSample.aggregate([
                { $group: { _id: '$site', n: { $sum: 1 }, min: { $min: '$timestamp' } } },
                { $sort: { n: -1 } }
            ]);
            const info = sites.find(x => x._id && x.min);
            if (!info) {
                sub.diagnostic('Tidak ada sample tersimpan di MongoDB.');
                return;
            }

            // Jendela ditutup 26 jam ke belakang supaya penulis live tidak bisa
            // menyisipkan dokumen di antara pembacaan cara lama dan cara baru.
            const startDate = dateStringInZone(info.min, 'Asia/Jakarta');
            const endDate = dateStringInZone(new Date(Date.now() - 26 * 60 * 60 * 1000), 'Asia/Jakarta');
            const { startMs, endMs } = rangeBounds(startDate, endDate, 'Asia/Jakarta');
            if (endMs <= startMs) {
                sub.diagnostic(`Jendela ${startDate}..${endDate} kosong; subtest dilewati.`);
                return;
            }

            for (const tz of ZONES) {
                const { source: oldSource, samples } = await getRawSamples(info._id, startDate, endDate, tz);
                if (samples.length === 0) {
                    sub.diagnostic(`${info._id} tanpa sample di ${tz}; dilewati.`);
                    continue;
                }
                sub.diagnostic(`${info._id} · ${tz}: ${samples.length} sample, jendela ${startDate}..${endDate}`);

                for (const period of PERIODS) {
                    const { source, data, totalSamples } = await getAggregatedHistory(
                        info._id, startDate, endDate, period, tz
                    );

                    assert.equal(source, oldSource, `source ${tz} periode ${period}`);
                    assert.equal(totalSamples, samples.length, `totalSamples ${tz} periode ${period}`);
                    assert.deepEqual(
                        data,
                        aggregateSamplesInNode(samples, period, tz),
                        `data ${tz} periode ${period}`
                    );
                }
            }
        });
    } finally {
        await mongoose.disconnect();
    }
});
