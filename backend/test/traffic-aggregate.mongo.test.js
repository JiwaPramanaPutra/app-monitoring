// Uji kesetaraan jalur agregasi terhadap MongoDB SUNGGUHAN, read-only:
// - data sintetis masuk lewat `$documents` (tidak menulis ke koleksi apa pun),
// - data nyata dibaca lewat `getRawSamples` (cara lama) dan `getAggregatedHistory`
//   (cara baru), lalu hasilnya dibandingkan bucket per bucket.
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
const { mergeSamples, rangeBounds } = require('../services/traffic-range');
const { getAggregatedHistory, getRawSamples } = require('../services/traffic-history');

const SITE = 'Uji-Kesetaraan';
const PERIODS = ['harian', 'mingguan', 'bulanan', 'tahunan', 'custom'];

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

/** `YYYY-MM-DD` menurut kalender WIB. */
function wibDateString(date) {
    const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
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
        await t.test('data sintetis lewat $documents, semua periode', async (sub) => {
            const db = mongoose.connection.db;
            const info = await db.admin().serverInfo();
            const [major, minor] = String(info.version).split('.').map(Number);
            if (major < 5 || (major === 5 && minor < 1)) {
                sub.diagnostic(`MongoDB ${info.version} tidak mendukung $documents; subtest dilewati.`);
                return;
            }

            const ownDocs = SYNTHETIC_DOCS.filter(d => d.site === SITE);
            const oldSamples = mergeSamples(ownDocs, SITE);

            for (const period of PERIODS) {
                const rows = await db.aggregate([
                    { $documents: SYNTHETIC_DOCS },
                    ...buildMongoBucketPipeline({ site: SITE, startMs: null, endMs: null, period })
                ]).toArray();
                const groups = mongoRowsToGroups(rows);

                assert.deepEqual(
                    finalizeBuckets(groups, period),
                    aggregateSamplesInNode(oldSamples, period),
                    `data sintetis periode ${period}`
                );
                assert.equal(
                    [...groups.values()].reduce((n, g) => n + g.count, 0),
                    oldSamples.length,
                    `jumlah sample sintetis periode ${period}`
                );
            }
        });

        await t.test('data nyata vs cara lama', async (sub) => {
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
            const startDate = wibDateString(info.min);
            const endDate = wibDateString(new Date(Date.now() - 26 * 60 * 60 * 1000));
            const { startMs, endMs } = rangeBounds(startDate, endDate);
            if (endMs <= startMs) {
                sub.diagnostic(`Jendela ${startDate}..${endDate} kosong; subtest dilewati.`);
                return;
            }

            const { source: oldSource, samples } = await getRawSamples(info._id, startDate, endDate);
            sub.diagnostic(`${info._id}: ${samples.length} sample digabung, jendela ${startDate}..${endDate}`);
            if (samples.length === 0) {
                sub.diagnostic('Jendela tertutup tidak berisi sample; subtest dilewati.');
                return;
            }

            for (const period of PERIODS) {
                const { source, data, totalSamples } = await getAggregatedHistory(
                    info._id, startDate, endDate, period
                );

                assert.equal(source, oldSource, `source periode ${period}`);
                assert.equal(totalSamples, samples.length, `totalSamples periode ${period}`);
                assert.deepEqual(data, aggregateSamplesInNode(samples, period), `data periode ${period}`);
            }
        });
    } finally {
        await mongoose.disconnect();
    }
});
