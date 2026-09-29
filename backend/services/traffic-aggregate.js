// Agregasi riwayat trafik per bucket waktu zona pengguna.
//
// Dua jalur hidup berdampingan di sini:
// - `buildMongoBucketPipeline` — agregasi di MongoDB (`$group`), dipakai jalur
//   baca utama supaya dokumen mentah tidak perlu diangkut ke Node.
// - `aggregateSamplesInNode` — algoritma lama apa adanya, tetap dipakai saat
//   MongoDB tidak tersedia dan sebagai pembanding di test kesetaraan.
//
// Zona waktunya SATU per request: `tz` yang sudah divalidasi `resolveTimeZone`.
// Jalur Mongo membentuk kunci bucket dari `$dateToParts { timezone }` dan jalur
// Node dari `toTZ` — keduanya offset per tanggal, bukan geseran tetap — supaya
// bucket kedua jalur identik untuk tz mana pun (parity test adalah kontraknya).

const { SAMPLE_LIMIT, DEFAULT_TIME_ZONE, resolveTimeZone, toTZ } = require('./traffic-range');

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
 * Kunci dan label bucket dari instan yang SUDAH digeser ke kalender zona
 * pengguna (`toTZ`). Key-lah yang menentukan pengelompokan; label diturunkan
 * dari key supaya jalur Mongo dan jalur Node tidak bisa memakai label berbeda.
 */
function bucketOf(shifted, period) {
    switch (period) {
        case 'harian': {
            const hour = shifted.getUTCHours();
            return { key: String(hour).padStart(2, '0') };
        }
        case 'mingguan': {
            return { key: String(shifted.getUTCDay()) };
        }
        case 'bulanan': {
            const weekNum = Math.min(4, Math.ceil(shifted.getUTCDate() / 7));
            return { key: `mg${weekNum}` };
        }
        case 'tahunan': {
            return { key: String(shifted.getUTCMonth()) };
        }
        default: {
            const y = shifted.getUTCFullYear();
            const mo = String(shifted.getUTCMonth() + 1).padStart(2, '0');
            const da = String(shifted.getUTCDate()).padStart(2, '0');
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
function groupSamplesInNode(samples, period, tz = DEFAULT_TIME_ZONE) {
    const groups = new Map();

    for (const s of samples) {
        const { key } = bucketOf(toTZ(s.timestamp, tz), period);
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
        } else {
            // Slot kosong ditampilkan untuk SEMUA periode grid (harian,
            // mingguan, bulanan, tahunan) supaya label sumbu tidak bolong saat
            // datanya memang tidak ada. Nilainya `samples: 0`; grafik
            // menggambarnya sebagai celah (bukan trafik nol) dan tooltip
            // menandainya "Tidak ada data". `custom` tidak pernah masuk sini
            // karena `sortedKeys`-nya hanya berisi key yang punya data.
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
 * kesetaraan. Perilakunya tidak boleh diubah — `tz` hanya memilih zona bucket.
 */
function aggregateSamplesInNode(samples, period, tz = DEFAULT_TIME_ZONE) {
    if (!samples || samples.length === 0) return [];
    return finalizeBuckets(groupSamplesInNode(samples, period, tz), period);
}

/**
 * Baris JSON yang TIDAK terwakili dokumen Mongo, dikelompokkan per bucket.
 *
 * Aturan saringnya sama dengan `mergeSamples`: buang baris tanpa timestamp yang
 * bisa dibaca, buang `site`+`timestamp` yang sudah diwakili sumber lain
 * (`mongoTimestamps`, satuan milidetik), dan duplikat di dalam JSON sendiri
 * hanya dihitung sekali.
 */
function groupJsonSamples(jsonSamples, period, mongoTimestamps, groups = new Map(), tz = DEFAULT_TIME_ZONE) {
    const seen = new Set();

    for (const s of (Array.isArray(jsonSamples) ? jsonSamples : [])) {
        if (!s || !s.timestamp) continue;
        const stamp = new Date(s.timestamp);
        const ms = stamp.getTime();
        if (isNaN(ms)) continue;
        if (mongoTimestamps && mongoTimestamps.has(ms)) continue;
        if (seen.has(ms)) continue;
        seen.add(ms);

        const { key } = bucketOf(toTZ(stamp, tz), period);
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

/** Ekspresi `$dateToParts` di zona `tz`; pangkal semua kunci bucket Mongo. */
function tzPartsExpression(tz, iso8601 = false) {
    return { $dateToParts: { date: '$timestamp', timezone: resolveTimeZone(tz), iso8601 } };
}

/** Angka 0–99 menjadi dua digit, dari bagian `$dateToParts` — tanpa `Date`. */
function pad2Expression(numberExpression) {
    return {
        $concat: [
            { $cond: [{ $lt: [numberExpression, 10] }, '0', ''] },
            { $toString: numberExpression }
        ]
    };
}

/**
 * Kunci bucket sebagai ekspresi Mongo, dihitung dari `$dateToParts { timezone }`
 * — bukan `$dateAdd` offset tetap. Offset per tanggal inilah yang membuat zona
 * ber-DST (dan WITA/Jayapura) identik dengan jalur Node yang memakai `toTZ`.
 */
function tzBucketKeyExpression(period, tz = DEFAULT_TIME_ZONE) {
    // Hari dalam pekan diambil dari bagian ISO: `$dateToParts` non-ISO tidak
    // mengembalikan `dayOfWeek`, sedangkan `isoDayOfWeek` 1=Senin..7=Minggu.
    // `mod 7` memetakannya ke 0=Minggu..6=Sabtu, sama dengan `getUTCDay`.
    if (period === 'mingguan') {
        const isoParts = tzPartsExpression(tz, true);
        return {
            $let: {
                vars: { isoParts },
                in: { $toString: { $mod: ['$$isoParts.isoDayOfWeek', 7] } }
            }
        };
    }

    const parts = tzPartsExpression(tz);
    let key;

    switch (period) {
        case 'harian':
            key = pad2Expression('$$parts.hour');
            break;
        case 'bulanan':
            // ceil(day/7) = floor((day+6)/7), dibatasi 4 seperti agregasi lama.
            key = {
                $concat: ['mg', {
                    $toString: {
                        $min: [4, {
                            $floor: {
                                $divide: [{ $add: ['$$parts.day', 6] }, 7]
                            }
                        }]
                    }
                }]
            };
            break;
        case 'tahunan':
            key = { $toString: { $subtract: ['$$parts.month', 1] } };
            break;
        default:
            key = {
                $concat: [
                    { $toString: '$$parts.year' }, '-',
                    pad2Expression('$$parts.month'), '-',
                    pad2Expression('$$parts.day')
                ]
            };
            break;
    }

    return { $let: { vars: { parts }, in: key } };
}

/**
 * Pipeline agregasi riwayat: batas jumlah, dedup `site`+`timestamp`, lalu
 * `$group` per bucket zona `tz`.
 *
 * Urutan stage mengikuti cara lama: dokumen terbaru dibatasi `SAMPLE_LIMIT`
 * lebih dulu, baris tanpa timestamp sah dibuang setelahnya, baru dijumlahkan.
 */
function buildMongoBucketPipeline({ site, startMs, endMs, period, tz = DEFAULT_TIME_ZONE }) {
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
                _id: tzBucketKeyExpression(period, tz),
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
    tzBucketKeyExpression
};
