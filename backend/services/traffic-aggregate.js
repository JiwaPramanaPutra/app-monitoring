// Agregasi riwayat trafik per bucket waktu WIB.
//
// Dua jalur hidup berdampingan di sini:
// - `buildMongoBucketPipeline` — agregasi di MongoDB (`$group`), dipakai jalur
//   baca utama supaya dokumen mentah tidak perlu diangkut ke Node.
// - `aggregateSamplesInNode` — algoritma lama apa adanya, tetap dipakai saat
//   MongoDB tidak tersedia dan sebagai pembanding di test kesetaraan.
//
// Zona waktunya SATU: `WIB_OFFSET_MS` dari `traffic-range.js`, bukan salinan
// offset baru. Pipeline Mongo pun menurunkan geserannya dari konstanta itu.

const { SAMPLE_LIMIT, WIB_OFFSET_MS, toWIB } = require('./traffic-range');

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const PADDED_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MONTH_KEYS = Array.from({ length: 12 }, (_, i) => String(i));

/** Query Mongo untuk satu site pada satu rentang. */
function mongoSampleQuery(site, startMs, endMs) {
    const query = { site };
    if (startMs || endMs) {
        query.timestamp = {};
        if (startMs) query.timestamp.$gte = startMs;
        if (endMs) query.timestamp.$lte = endMs;
    }
    return query;
}

/**
 * Kunci dan label bucket dari instan yang SUDAH digeser ke kalender WIB
 * (`toWIB`). Key-lah yang menentukan pengelompokan; label diturunkan dari key
 * supaya jalur Mongo dan jalur Node tidak bisa memakai label berbeda.
 */
function bucketOf(wib, period) {
    switch (period) {
        case 'harian': {
            const hour = wib.getUTCHours();
            return { key: String(hour).padStart(2, '0') };
        }
        case 'mingguan': {
            return { key: String(wib.getUTCDay()) };
        }
        case 'bulanan': {
            const weekNum = Math.min(4, Math.ceil(wib.getUTCDate() / 7));
            return { key: `mg${weekNum}` };
        }
        case 'tahunan': {
            return { key: String(wib.getUTCMonth()) };
        }
        default: {
            const y = wib.getUTCFullYear();
            const mo = String(wib.getUTCMonth() + 1).padStart(2, '0');
            const da = String(wib.getUTCDate()).padStart(2, '0');
            return { key: `${y}-${mo}-${da}` };
        }
    }
}

function labelOf(key, period) {
    switch (period) {
        case 'harian':
            return `${key}:00`;
        case 'mingguan':
            return DAY_NAMES[Number(key)];
        case 'bulanan':
            return `Minggu ${Number(key.slice(2))}`;
        case 'tahunan':
            return MONTH_NAMES[Number(key)];
        default: {
            // `key` = `YYYY-MM-DD`; dipisah, bukan dipotong indeks, supaya
            // tanggal tidak sah menghasilkan label yang sama dengan cara lama.
            const [, month, day] = String(key).split('-');
            return `${day}/${month}`;
        }
    }
}

/** Kelompokkan baris sample menjadi `Map(key → {txSum, rxSum, count})`. */
function groupSamplesInNode(samples, period) {
    const groups = new Map();

    for (const s of samples) {
        const { key } = bucketOf(toWIB(s.timestamp), period);
        let group = groups.get(key);
        if (!group) {
            group = { txSum: 0, rxSum: 0, count: 0 };
            groups.set(key, group);
        }
        group.txSum += Number(s.txMbps) || 0;
        group.rxSum += Number(s.rxMbps) || 0;
        group.count++;
    }

    return groups;
}

/**
 * Ubah kelompok menjadi baris laporan: urutan tetap per periode, slot kosong
 * `harian`/`tahunan` diisi nol, dan rata-rata dibulatkan dua desimal.
 */
function finalizeBuckets(groups, period) {
    if (groups.size === 0) return [];

    let sortedKeys;
    switch (period) {
        case 'harian':
            sortedKeys = PADDED_HOURS;
            break;
        case 'mingguan':
            sortedKeys = ['1', '2', '3', '4', '5', '6', '0']; // Mon–Sun
            break;
        case 'bulanan':
            sortedKeys = ['mg1', 'mg2', 'mg3', 'mg4'];
            break;
        case 'tahunan':
            sortedKeys = MONTH_KEYS;
            break;
        default:
            sortedKeys = [...groups.keys()].sort();
            break;
    }

    const result = [];
    for (const key of sortedKeys) {
        const group = groups.get(key);
        if (group) {
            result.push({
                label: labelOf(key, period),
                tx: +(group.txSum / group.count).toFixed(2),
                rx: +(group.rxSum / group.count).toFixed(2),
                samples: group.count
            });
        } else if (period === 'harian' || period === 'tahunan') {
            // Tampilkan slot kosong untuk jam/bulan yang tidak ada data.
            result.push({ label: labelOf(key, period), tx: 0, rx: 0, samples: 0 });
        }
    }

    return result;
}

/**
 * Algoritma agregasi lama: sample yang sudah digabung dan dideduplikasi
 * (`mergeSamples`) dijumlahkan per bucket di Node.
 *
 * Dipertahankan sebagai fallback tanpa MongoDB dan sebagai acuan pembanding
 * kesetaraan. Perilakunya tidak boleh diubah.
 */
function aggregateSamplesInNode(samples, period) {
    if (!samples || samples.length === 0) return [];
    return finalizeBuckets(groupSamplesInNode(samples, period), period);
}

/**
 * Baris JSON yang TIDAK terwakili dokumen Mongo, dikelompokkan per bucket.
 *
 * Aturan saringnya sama dengan `mergeSamples`: buang baris tanpa timestamp yang
 * bisa dibaca, buang `site`+`timestamp` yang sudah diwakili sumber lain
 * (`mongoTimestamps`, satuan milidetik), dan duplikat di dalam JSON sendiri
 * hanya dihitung sekali.
 */
function groupJsonSamples(jsonSamples, period, mongoTimestamps, groups = new Map()) {
    const seen = new Set();

    for (const s of (Array.isArray(jsonSamples) ? jsonSamples : [])) {
        if (!s || !s.timestamp) continue;
        const stamp = new Date(s.timestamp);
        const ms = stamp.getTime();
        if (isNaN(ms)) continue;
        if (mongoTimestamps && mongoTimestamps.has(ms)) continue;
        if (seen.has(ms)) continue;
        seen.add(ms);

        const { key } = bucketOf(toWIB(stamp), period);
        let group = groups.get(key);
        if (!group) {
            group = { txSum: 0, rxSum: 0, count: 0 };
            groups.set(key, group);
        }
        group.txSum += Number(s.txMbps) || 0;
        group.rxSum += Number(s.rxMbps) || 0;
        group.count++;
    }

    return groups;
}

/** Ekspresi Mongo setara `Number(x) || 0`: NaN dan konversi gagal menjadi 0. */
function toNumericExpression(field) {
    return {
        $cond: [
            { $isNumber: field },
            { $cond: [{ $eq: [field, field] }, field, 0] },
            { $convert: { input: field, to: 'double', onError: 0, onNull: 0 } }
        ]
    };
}

/**
 * Kunci bucket sebagai ekspresi Mongo.
 *
 * Geseran WIB memakai `WIB_OFFSET_MS` yang sama dengan `toWIB`, jadi kunci
 * pipeline tidak bisa berbeda zona dari label frontend atau `rangeBounds`.
 */
function wibBucketKeyExpression(period) {
    const wib = { $dateAdd: { startDate: '$timestamp', unit: 'millisecond', amount: WIB_OFFSET_MS } };

    switch (period) {
        case 'harian':
            return { $dateToString: { format: '%H', date: wib, timezone: 'UTC' } };
        case 'mingguan':
            // `$dayOfWeek` 1=Minggu..7=Sabtu → 0..6 seperti `getUTCDay`.
            return { $toString: { $subtract: [{ $dayOfWeek: wib }, 1] } };
        case 'bulanan':
            // ceil(day/7) = floor((day+6)/7), dibatasi 4 seperti agregasi lama.
            return {
                $concat: ['mg', {
                    $toString: {
                        $min: [4, {
                            $floor: {
                                $divide: [{ $add: [{ $dayOfMonth: wib }, 6] }, 7]
                            }
                        }]
                    }
                }]
            };
        case 'tahunan':
            return { $toString: { $subtract: [{ $month: wib }, 1] } };
        default:
            return { $dateToString: { format: '%Y-%m-%d', date: wib, timezone: 'UTC' } };
    }
}

/**
 * Pipeline agregasi riwayat: batas jumlah, dedup `site`+`timestamp`, lalu
 * `$group` per bucket WIB.
 *
 * Urutan stage mengikuti cara lama: dokumen terbaru dibatasi `SAMPLE_LIMIT`
 * lebih dulu, baris tanpa timestamp sah dibuang setelahnya, baru dijumlahkan.
 */
function buildMongoBucketPipeline({ site, startMs, endMs, period }) {
    return [
        { $match: mongoSampleQuery(site, startMs, endMs) },
        { $sort: { timestamp: -1 } },
        { $limit: SAMPLE_LIMIT },
        { $match: { timestamp: { $type: 'date' } } },
        {
            $group: {
                _id: '$timestamp',
                // Field-nya dipertahankan: stage `$group` berikutnya menghitung
                // kunci bucket dari `$timestamp`, bukan dari `_id`.
                timestamp: { $first: '$timestamp' },
                txMbps: { $first: '$txMbps' },
                rxMbps: { $first: '$rxMbps' }
            }
        },
        {
            $group: {
                _id: wibBucketKeyExpression(period),
                tx: { $sum: toNumericExpression('$txMbps') },
                rx: { $sum: toNumericExpression('$rxMbps') },
                count: { $sum: 1 }
            }
        }
    ];
}

/** Ubah hasil `$group` pipeline menjadi `Map(key → {txSum, rxSum, count})`. */
function mongoRowsToGroups(rows) {
    const groups = new Map();
    for (const row of (Array.isArray(rows) ? rows : [])) {
        groups.set(row._id, { txSum: row.tx || 0, rxSum: row.rx || 0, count: row.count });
    }
    return groups;
}

module.exports = {
    DAY_NAMES,
    MONTH_NAMES,
    aggregateSamplesInNode,
    bucketOf,
    buildMongoBucketPipeline,
    finalizeBuckets,
    groupJsonSamples,
    groupSamplesInNode,
    labelOf,
    mongoRowsToGroups,
    mongoSampleQuery,
    wibBucketKeyExpression
};
