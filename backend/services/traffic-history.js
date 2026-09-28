// Jalur baca riwayat trafik: penggabungan sumber MongoDB + JSON lokal, batas
// jumlah sample, dan agregasi per bucket periode.
//
// Dipisah dari `server.js` — yang menyalakan HTTP server saat di-`require`,
// sehingga logikanya tidak bisa diuji — supaya cara lama dan cara baru bisa
// dijalankan atas data yang sama lalu dibandingkan di test.

const mongoose = require('mongoose');
const storage = require('../storage');
const { SAMPLE_LIMIT, DEFAULT_TIME_ZONE, rangeBounds, mergeSamples, capSamples, resolveTimeZone } = require('./traffic-range');
const {
    aggregateSamplesInNode,
    buildMongoBucketPipeline,
    finalizeBuckets,
    groupJsonSamples,
    mongoRowsToGroups,
    mongoSampleQuery
} = require('./traffic-aggregate');

/**
 * Ada sample tersimpan untuk site ini di rentang itu?
 *
 * Dipakai tabel uptime, yang sebelumnya membaca SELURUH riwayat lalu
 * menggabungkan, membuang duplikat, dan mengurutkannya hanya untuk tahu "ada
 * sample atau tidak". Jawabannya boolean, jadi penggabungan tidak diperlukan —
 * cukup salah satu sumber yang berisi.
 */
async function hasSamplesInRange(site, startDate, endDate, tz = DEFAULT_TIME_ZONE) {
    const { startMs, endMs } = rangeBounds(startDate, endDate, resolveTimeZone(tz));

    if (mongoose.connection.readyState === 1) {
        try {
            const TrafficSample = require('../models/TrafficSample');
            if (await TrafficSample.countDocuments(mongoSampleQuery(site, startMs, endMs)) > 0) return true;
        } catch (e) {
            console.warn('MongoDB count failed, memakai JSON saja:', e.message);
        }
    }

    let jsonSamples = storage.getTrafficHistory(site);
    if (startMs) jsonSamples = jsonSamples.filter(s => new Date(s.timestamp) >= startMs);
    if (endMs) jsonSamples = jsonSamples.filter(s => new Date(s.timestamp) <= endMs);
    return jsonSamples.length > 0;
}

/**
 * Sample mentah satu site pada satu rentang, gabungan MongoDB + JSON lokal.
 *
 * Dipakai jalur `raw=1` (widget grafik) dan test kesetaraan sebagai "cara lama".
 * Mengembalikan seluruh sample yang digabung, dideduplikasi, dan diurutkan.
 */
async function getRawSamples(site, startDate, endDate, tz = DEFAULT_TIME_ZONE) {
    const { startMs, endMs } = rangeBounds(startDate, endDate, resolveTimeZone(tz));

    const collected = [];
    const sources = [];

    if (mongoose.connection.readyState === 1) {
        try {
            const TrafficSample = require('../models/TrafficSample');

            const docs = await TrafficSample.find(mongoSampleQuery(site, startMs, endMs))
                .sort({ timestamp: -1 })
                .limit(SAMPLE_LIMIT + 1)
                .lean();

            // Satu baris ekstra diambil supaya peringatan batas hanya muncul saat
            // benar-benar terpotong — riwayat yang pas SAMPLE_LIMIT bukan pemotongan.
            const { docs: capped, truncated } = capSamples(docs, SAMPLE_LIMIT);
            if (truncated) {
                console.warn(`[History] ${site}: batas ${SAMPLE_LIMIT} sample tercapai, sisanya tidak dimuat.`);
            }

            // Perulangan biasa, BUKAN `push(...docs)`: penyebaran argumen melempar
            // RangeError di atas ~131k elemen, dan karena ini berada di dalam
            // `try`, error itu tertangkap sebagai "MongoDB gagal" sehingga sumber
            // Mongo hilang diam-diam — persis pemotongan yang ingin dihilangkan.
            for (let i = capped.length - 1; i >= 0; i--) collected.push(capped[i]);
            sources.push('mongodb');
        } catch (e) {
            console.warn('MongoDB query failed, memakai JSON saja:', e.message);
        }
    }

    let jsonSamples = storage.getTrafficHistory(site);
    if (startMs) jsonSamples = jsonSamples.filter(s => new Date(s.timestamp) >= startMs);
    if (endMs) jsonSamples = jsonSamples.filter(s => new Date(s.timestamp) <= endMs);
    for (const s of jsonSamples) collected.push(s);
    sources.push('json');

    // Kedua sumber menyimpan periode yang berbeda (JSON sejak 14/9, MongoDB
    // hanya sejak koneksinya hidup). Dulu fungsi ini memilih salah satu, dan
    // akibatnya grafik riwayat terpotong. Sekarang keduanya digabung, dengan
    // duplikat `site`+`timestamp` dibuang.
    return { source: sources.join('+'), samples: mergeSamples(collected, site) };
}

/** Timestamp (ms) JSON yang sah dan unik, sebagai objek Date untuk query `$in`. */
function jsonTimestamps(jsonSamples) {
    const unique = new Map();
    for (const s of (Array.isArray(jsonSamples) ? jsonSamples : [])) {
        if (!s || !s.timestamp) continue;
        const stamp = new Date(s.timestamp);
        const ms = stamp.getTime();
        if (isNaN(ms) || unique.has(ms)) continue;
        unique.set(ms, stamp);
    }
    return [...unique.values()];
}

/**
 * Timestamp MongoDB yang bertabrakan dengan timestamp JSON.
 *
 * Hanya timestamp yang juga ada di daftar JSON yang ditanyakan, karena di
 * situlah duplikat bisa terjadi.
 */
async function mongoTimestampsForJson(TrafficSample, site, dates) {
    const stamps = new Set();
    if (dates.length === 0) return stamps;

    const values = await TrafficSample.distinct('timestamp', { site, timestamp: { $in: dates } });
    for (const value of values) {
        const ms = new Date(value).getTime();
        if (!isNaN(ms)) stamps.add(ms);
    }
    return stamps;
}

/**
 * Buang timestamp di luar jendela `SAMPLE_LIMIT`.
 *
 * Yang disimpan cara lama hanya `SAMPLE_LIMIT` dokumen Mongo TERBARU. Timestamp
 * lebih lama dari batas itu tidak boleh dianggap duplikat, karena cara lama
 * tidak pernah memuatnya. Hanya dipanggil saat rentangnya benar-benar terpotong.
 */
async function dropTimestampsOutsideCap(TrafficSample, site, startMs, endMs, stamps) {
    const oldestKept = await TrafficSample.find(mongoSampleQuery(site, startMs, endMs))
        .sort({ timestamp: -1 })
        .skip(SAMPLE_LIMIT - 1)
        .limit(1)
        .select('timestamp')
        .lean();

    if (oldestKept.length === 0) {
        stamps.clear();
        return;
    }

    const cutoffMs = new Date(oldestKept[0].timestamp).getTime();
    for (const ms of [...stamps]) {
        if (ms < cutoffMs) stamps.delete(ms);
    }
}

/**
 * Riwayat teragregasi satu site: `$group` per bucket zona `tz` di MongoDB, lalu
 * baris JSON yang belum terwakili di MongoDB digabungkan ke bucket yang sama.
 *
 * `tx`, `rx`, `samples`, `label`, urutan, `totalSamples`, dan `source` harus
 * identik dengan jalur lama (`getRawSamples` + `aggregateSamplesInNode`).
 */
async function getAggregatedHistory(site, startDate, endDate, period, tz = DEFAULT_TIME_ZONE) {
    const zone = resolveTimeZone(tz);
    const { startMs, endMs } = rangeBounds(startDate, endDate, zone);
    const sources = [];

    let jsonSamples = storage.getTrafficHistory(site);
    if (startMs) jsonSamples = jsonSamples.filter(s => new Date(s.timestamp) >= startMs);
    if (endMs) jsonSamples = jsonSamples.filter(s => new Date(s.timestamp) <= endMs);

    let groups = new Map();

    if (mongoose.connection.readyState === 1) {
        try {
            const TrafficSample = require('../models/TrafficSample');
            const dates = jsonTimestamps(jsonSamples);

            // Tiga pembacaan read-only berjalan bersamaan: waktunya didominasi
            // latensi MongoDB, jadi menunggunya satu per satu hanya menambah
            // waktu tunggu.
            const [total, rows, mongoTimestamps] = await Promise.all([
                TrafficSample.countDocuments(mongoSampleQuery(site, startMs, endMs)),
                TrafficSample.aggregate(
                    buildMongoBucketPipeline({ site, startMs, endMs, period, tz: zone })
                ).allowDiskUse(true),
                mongoTimestampsForJson(TrafficSample, site, dates)
            ]);

            if (total > SAMPLE_LIMIT) {
                console.warn(`[History] ${site}: batas ${SAMPLE_LIMIT} sample tercapai, sisanya tidak dimuat.`);
                await dropTimestampsOutsideCap(TrafficSample, site, startMs, endMs, mongoTimestamps);
            }

            groups = mongoRowsToGroups(rows);
            groupJsonSamples(jsonSamples, period, mongoTimestamps, groups, zone);

            sources.push('mongodb');
        } catch (e) {
            // Jalur agregasi gagal (mis. pipeline atau query dedup ditolak
            // server). Jangan menampilkan angka dari sumber yang hanya sebagian
            // terbaca: pakai cara lama yang hasilnya pasti setara.
            console.warn('MongoDB aggregate failed, memakai jalur lama:', e.message);
            const fallback = await getRawSamples(site, startDate, endDate, zone);
            return {
                source: fallback.source,
                data: aggregateSamplesInNode(fallback.samples, period, zone),
                totalSamples: fallback.samples.length
            };
        }
    } else {
        groupJsonSamples(jsonSamples, period, null, groups, zone);
    }

    sources.push('json');

    return {
        source: sources.join('+'),
        data: finalizeBuckets(groups, period),
        totalSamples: [...groups.values()].reduce((n, g) => n + g.count, 0)
    };
}

module.exports = {
    getAggregatedHistory,
    getRawSamples,
    hasSamplesInRange
};
