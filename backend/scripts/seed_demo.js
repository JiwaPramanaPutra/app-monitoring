/**
 * seed_demo.js
 * Mengisi data demo (fiktif) untuk mencoba aplikasi tanpa perangkat nyata.
 *
 * Cara pakai:
 *   cd backend
 *   npm run seed:demo
 *
 * Data ditulis ke penyimpanan lokal (data/*.json) dan ke MongoDB bila
 * MONGO_URI tersedia dan bisa terkoneksi. Tidak ada kredensial atau data
 * institusi nyata di file ini.
 */

require('dotenv').config();
const dns = require('dns');
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) { }

const mongoose = require('mongoose');
const storage = require('../storage');
const Project = require('../models/Project');
const Device = require('../models/Device');

// IP memakai range dokumentasi RFC 5737 (192.0.2.0/24) dan MAC locally administered.
const DEMO_PROJECT = {
    name: 'Demo Organization',
    code: 'DEMO',
    description: 'Data contoh untuk mencoba aplikasi. Aman untuk dihapus.',
    sites: [
        {
            name: 'Site Alpha',
            code: 'DEMO-ALPHA',
            gedungList: [
                {
                    name: 'Main Building',
                    code: 'ALPHA-MB',
                    floors: [{ name: 'Floor 1', rooms: ['Server Room', 'Office'] }]
                }
            ]
        },
        { name: 'Site Beta', code: 'DEMO-BETA' }
    ]
};

const DEMO_DEVICES = [
    {
        id: 'demo-alpha-ap1',
        name: 'AP Alpha-1', type: 'Access Point', brand: 'Demo', model: 'AP-100',
        mac: '02:00:00:00:00:01', ip: '192.0.2.11',
        siteLocation: 'Site Alpha', gedung: 'Main Building', lantai: 'Floor 1', ruangan: 'Office'
    },
    {
        id: 'demo-alpha-sw1',
        name: 'Switch Alpha-1', type: 'Switch', brand: 'Demo', model: 'SW-24',
        mac: '02:00:00:00:00:02', ip: '192.0.2.12',
        siteLocation: 'Site Alpha', gedung: 'Main Building', lantai: 'Floor 1', ruangan: 'Server Room'
    },
    {
        id: 'demo-beta-ap1',
        name: 'AP Beta-1', type: 'Access Point', brand: 'Demo', model: 'AP-100',
        mac: '02:00:00:00:00:03', ip: '192.0.2.21',
        siteLocation: 'Site Beta', gedung: '—', lantai: '—', ruangan: '—'
    }
];

function seedLocal() {
    const existingProjects = storage.getLocalProjects();
    if (existingProjects.some(p => p.name === DEMO_PROJECT.name)) {
        console.log('ℹ️  Project demo sudah ada di penyimpanan lokal — dilewati.');
    } else {
        storage.saveLocalProject(DEMO_PROJECT);
        console.log('✅ Project demo ditulis ke data/projects.json');
    }

    const existingDevices = storage.getLocalDevices();
    let added = 0;
    for (const d of DEMO_DEVICES) {
        if (existingDevices.some(x => x.ip === d.ip)) continue;
        storage.saveLocalDevice(d);
        added++;
    }
    console.log(`✅ ${added} perangkat demo ditulis ke data/devices.json`);
}

async function seedMongo() {
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI || MONGO_URI.includes('YOUR_PASSWORD_HERE')) {
        console.log('ℹ️  MONGO_URI tidak diset — hanya penyimpanan lokal yang diisi.');
        return;
    }

    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    } catch (err) {
        console.warn('⚠️  Gagal konek MongoDB — dilewati:', err.message);
        return;
    }

    try {
        await Project.findOneAndUpdate(
            { name: DEMO_PROJECT.name },
            { $setOnInsert: DEMO_PROJECT },
            { upsert: true }
        );

        let added = 0;
        for (const d of DEMO_DEVICES) {
            const res = await Device.updateOne({ ip: d.ip }, { $setOnInsert: d }, { upsert: true });
            if (res.upsertedCount) added++;
        }
        console.log(`✅ MongoDB: project demo siap, ${added} perangkat baru.`);
    } finally {
        await mongoose.disconnect();
    }
}

(async () => {
    console.log('🌱 Mengisi data demo...');
    seedLocal();
    await seedMongo();
    console.log('Selesai. Data demo bisa dihapus lewat halaman Project & Site / Monitoring.');
    process.exit(0);
})().catch(err => {
    console.error('❌ Gagal seed demo:', err.message);
    process.exit(1);
});
