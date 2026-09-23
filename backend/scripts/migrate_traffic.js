/**
 * migrate_traffic.js
 * One-time migration script: traffic_history.json → MongoDB collection `trafficsamples`
 *
 * Cara pakai:
 *   cd backend
 *   node scripts/migrate_traffic.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const dns = require('dns');
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) { }
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const TrafficSample = require('../models/TrafficSample');

const TRAFFIC_FILE = path.join(__dirname, '../data/traffic_history.json');

async function migrate() {
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI || MONGO_URI.includes('YOUR_PASSWORD_HERE')) {
        console.error('❌ MONGO_URI belum diatur di backend/.env');
        process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected.');

    // Baca JSON file
    if (!fs.existsSync(TRAFFIC_FILE)) {
        console.error('❌ File traffic_history.json tidak ditemukan.');
        await mongoose.disconnect();
        process.exit(1);
    }

    const raw = fs.readFileSync(TRAFFIC_FILE, 'utf8');
    const samples = JSON.parse(raw);
    if (!Array.isArray(samples) || samples.length === 0) {
        console.log('⚠️ Tidak ada data untuk dimigrasikan.');
        await mongoose.disconnect();
        return;
    }

    console.log(`📦 Total samples di JSON: ${samples.length}`);

    // Cek berapa yang sudah ada di MongoDB (hindari duplikat)
    const existingCount = await TrafficSample.countDocuments();
    console.log(`📊 Existing documents di MongoDB: ${existingCount}`);

    // Batch insert (gunakan ordered:false agar error satu doc tidak stop semuanya)
    const BATCH_SIZE = 500;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < samples.length; i += BATCH_SIZE) {
        const batch = samples.slice(i, i + BATCH_SIZE).map(s => ({
            site: s.site || 'Gizi',
            timestamp: new Date(s.timestamp),
            txMbps: Number(s.txMbps) || 0,
            rxMbps: Number(s.rxMbps) || 0,
            interface: s.interface || ''
        })).filter(s => !isNaN(s.timestamp.getTime())); // filter invalid timestamp

        try {
            const result = await TrafficSample.insertMany(batch, { ordered: false });
            inserted += result.length;
        } catch (err) {
            // ordered:false akan lanjut meskipun ada error (misal duplicate key)
            if (err.insertedDocs) inserted += err.insertedDocs.length;
            skipped += (batch.length - (err.insertedDocs ? err.insertedDocs.length : 0));
        }

        process.stdout.write(`\r⏳ Progress: ${Math.min(i + BATCH_SIZE, samples.length)}/${samples.length}`);
    }

    console.log(`\n✅ Migrasi selesai!`);
    console.log(`   → Inserted: ${inserted}`);
    console.log(`   → Skipped : ${skipped}`);

    const finalCount = await TrafficSample.countDocuments();
    console.log(`   → Total dokumen di MongoDB sekarang: ${finalCount}`);

    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected.');
}

migrate().catch(err => {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
});
