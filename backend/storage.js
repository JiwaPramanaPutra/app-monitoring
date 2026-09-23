const fs = require('fs');
const mongoose = require('mongoose');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const TRAFFIC_FILE = path.join(DATA_DIR, 'traffic_history.json');
const DOWNTIME_FILE = path.join(DATA_DIR, 'downtime_events.json');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const LAPORAN_FILE = path.join(DATA_DIR, 'laporan.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let trafficHistory = [];
let downtimeEvents = [];
let localDevices = [];
let localProjects = [];
let localLaporans = [];
const MAX_TRAFFIC_SAMPLES = 25000;

function loadStoredData() {
    try {
        if (fs.existsSync(TRAFFIC_FILE)) {
            const raw = fs.readFileSync(TRAFFIC_FILE, 'utf8');
            trafficHistory = JSON.parse(raw);
            if (!Array.isArray(trafficHistory)) trafficHistory = [];
        }
    } catch (e) {
        console.error('Failed to load traffic_history.json:', e.message);
        trafficHistory = [];
    }

    try {
        if (fs.existsSync(DOWNTIME_FILE)) {
            const raw = fs.readFileSync(DOWNTIME_FILE, 'utf8');
            downtimeEvents = JSON.parse(raw);
            if (!Array.isArray(downtimeEvents)) downtimeEvents = [];
        }
    } catch (e) {
        console.error('Failed to load downtime_events.json:', e.message);
        downtimeEvents = [];
    }

    try {
        if (fs.existsSync(DEVICES_FILE)) {
            const raw = fs.readFileSync(DEVICES_FILE, 'utf8');
            localDevices = JSON.parse(raw);
            if (!Array.isArray(localDevices)) localDevices = [];
        }
    } catch (e) {
        console.error('Failed to load devices.json:', e.message);
        localDevices = [];
    }

    try {
        if (fs.existsSync(PROJECTS_FILE)) {
            const raw = fs.readFileSync(PROJECTS_FILE, 'utf8');
            localProjects = JSON.parse(raw);
            if (!Array.isArray(localProjects)) localProjects = [];
        }
    } catch (e) {
        console.error('Failed to load projects.json:', e.message);
        localProjects = [];
    }

    try {
        if (fs.existsSync(LAPORAN_FILE)) {
            const raw = fs.readFileSync(LAPORAN_FILE, 'utf8');
            localLaporans = JSON.parse(raw);
            if (!Array.isArray(localLaporans)) localLaporans = [];
        }
    } catch (e) {
        console.error('Failed to load laporan.json:', e.message);
        localLaporans = [];
    }
}

function saveLocalDevices() {
    try {
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(localDevices, null, 2), 'utf8');
    } catch (err) {
        console.error('Error saving local devices:', err.message);
    }
}

function saveLocalProjects() {
    try {
        fs.writeFileSync(PROJECTS_FILE, JSON.stringify(localProjects, null, 2), 'utf8');
    } catch (err) {
        console.error('Error saving local projects:', err.message);
    }
}

function saveLocalLaporans() {
    try {
        fs.writeFileSync(LAPORAN_FILE, JSON.stringify(localLaporans, null, 2), 'utf8');
    } catch (err) {
        console.error('Error saving local laporan:', err.message);
    }
}

let saveTrafficTimeout = null;
function scheduleSaveTraffic() {
    if (saveTrafficTimeout) return;
    saveTrafficTimeout = setTimeout(() => {
        saveTrafficTimeout = null;
        try {
            if (trafficHistory.length > MAX_TRAFFIC_SAMPLES) {
                trafficHistory = trafficHistory.slice(trafficHistory.length - MAX_TRAFFIC_SAMPLES);
            }
            fs.writeFileSync(TRAFFIC_FILE, JSON.stringify(trafficHistory, null, 2), 'utf8');
        } catch (err) {
            console.error('Error saving traffic history:', err.message);
        }
    }, 2000);
}

function saveDowntimeEvents() {
    try {
        fs.writeFileSync(DOWNTIME_FILE, JSON.stringify(downtimeEvents, null, 2), 'utf8');
    } catch (err) {
        console.error('Error saving downtime events:', err.message);
    }
}

function formatDuration(seconds) {
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSec = Math.round(seconds % 60);
    if (minutes < 60) {
        return remainingSec > 0 ? `${minutes}m ${remainingSec}s` : `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMin = minutes % 60;
    if (hours < 24) {
        return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatDateTimeIndo(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

loadStoredData();

module.exports = {
    recordTrafficSample(sample) {
        const record = {
            site: sample.site,
            timestamp: sample.timestamp || new Date().toISOString(),
            txMbps: sample.txMbps,
            rxMbps: sample.rxMbps,
            interface: sample.interface || ''
        };

        // 1. Simpan ke JSON local (existing behavior — tetap jalan)
        trafficHistory.push(record);
        scheduleSaveTraffic();

        // 2. Dual-write ke MongoDB jika koneksi tersedia
        if (mongoose.connection.readyState === 1) {
            try {
                const TrafficSample = require('./models/TrafficSample');
                TrafficSample.create({
                    site: record.site,
                    timestamp: new Date(record.timestamp),
                    txMbps: record.txMbps,
                    rxMbps: record.rxMbps,
                    interface: record.interface
                }).catch(err => {
                    // Silent — jangan sampai gagal tulis MongoDB blokir live traffic
                });
            } catch (e) {
                // Model belum ter-load, abaikan
            }
        }
    },

    getTrafficHistory(site, sinceTimestamp) {
        let filtered = site ? trafficHistory.filter(item => item.site === site) : trafficHistory;
        if (sinceTimestamp) {
            const sinceTime = new Date(sinceTimestamp).getTime();
            if (!isNaN(sinceTime)) {
                filtered = filtered.filter(item => new Date(item.timestamp).getTime() >= sinceTime);
            }
        }
        return filtered;
    },

    recordDowntimeStart(site, reason = 'Router offline / tidak merespon') {
        const ongoing = downtimeEvents.find(e => e.site === site && !e.end);
        if (ongoing) return ongoing;

        const now = new Date();
        const newEvent = {
            id: 'DT-' + Date.now(),
            site,
            start: formatDateTimeIndo(now),
            startTimeIso: now.toISOString(),
            end: null,
            endTimeIso: null,
            duration: '0s',
            durationSec: 0,
            color: '#C4442E',
            reported: false,
            reason
        };
        downtimeEvents.unshift(newEvent);
        saveDowntimeEvents();
        return newEvent;
    },

    recordDowntimeEnd(site) {
        const ongoingIndex = downtimeEvents.findIndex(e => e.site === site && !e.end);
        if (ongoingIndex === -1) return null;

        const ongoing = downtimeEvents[ongoingIndex];
        const now = new Date();
        ongoing.end = formatDateTimeIndo(now);
        ongoing.endTimeIso = now.toISOString();

        const startMs = new Date(ongoing.startTimeIso || ongoing.start).getTime();
        const durationSec = Math.max(1, Math.round((now.getTime() - startMs) / 1000));
        ongoing.durationSec = durationSec;
        ongoing.duration = formatDuration(durationSec);

        if (durationSec < 180) ongoing.color = '#5B7A52';
        else if (durationSec < 3600) ongoing.color = '#D9A441';
        else ongoing.color = '#C4442E';

        saveDowntimeEvents();
        return ongoing;
    },

    clearDowntimeEvents(site) {
        if (!site) {
            downtimeEvents = [];
        } else {
            downtimeEvents = downtimeEvents.filter(e => e.site !== site);
        }
        saveDowntimeEvents();
        return { success: true, count: downtimeEvents.length };
    },

    getDowntimeEvents(site) {
        if (!site) return downtimeEvents;
        return downtimeEvents.filter(e => e.site === site);
    },

    getOngoingDowntime(site) {
        return downtimeEvents.find(e => e.site === site && !e.end) || null;
    },

    // ── Local Fallback Device Operations ──
    getLocalDevices(site) {
        if (site && site !== 'All') {
            return localDevices.filter(d => d.siteLocation === site);
        }
        return localDevices;
    },

    saveLocalDevice(device) {
        const id = device._id || device.id || 'dev_' + Date.now();
        const newDev = { ...device, _id: id, id: device.id || Date.now(), createdAt: new Date().toISOString() };
        localDevices.unshift(newDev);
        saveLocalDevices();
        return newDev;
    },

    updateLocalDevice(id, updateData) {
        const index = localDevices.findIndex(d => String(d._id) === String(id) || String(d.id) === String(id));
        if (index === -1) return null;
        const { _id, createdAt, updatedAt, ...safeUpdate } = updateData || {};
        localDevices[index] = { ...localDevices[index], ...safeUpdate, updatedAt: new Date().toISOString() };
        saveLocalDevices();
        return localDevices[index];
    },

    deleteLocalDevice(id) {
        const initialLen = localDevices.length;
        localDevices = localDevices.filter(d => String(d._id) !== String(id) && String(d.id) !== String(id));
        if (localDevices.length < initialLen) {
            saveLocalDevices();
            return true;
        }
        return false;
    },

    // ── Local Fallback Project Operations ──
    getLocalProjects() {
        return localProjects;
    },

    saveLocalProject(project) {
        const id = project._id || project.id || 'proj_' + Date.now();
        const newProj = { ...project, _id: id, id: project.id || Date.now(), createdAt: new Date().toISOString() };
        localProjects.push(newProj);
        saveLocalProjects();
        return newProj;
    },
    
    updateLocalProject(id, updateData) {
        const index = localProjects.findIndex(p => String(p._id) === String(id) || String(p.id) === String(id));
        if (index === -1) return null;
        const { _id, createdAt, updatedAt, ...safeUpdate } = updateData || {};
        localProjects[index] = { ...localProjects[index], ...safeUpdate, updatedAt: new Date().toISOString() };
        saveLocalProjects();
        return localProjects[index];
    },

    deleteLocalProject(id) {
        const initialLen = localProjects.length;
        localProjects = localProjects.filter(p => String(p._id) !== String(id) && String(p.id) !== String(id));
        if (localProjects.length < initialLen) {
            saveLocalProjects();
            return true;
        }
        return false;
    },

    // ── Local Fallback Laporan Operations ──
    getLocalLaporan() {
        return localLaporans;
    },

    saveLocalLaporan(laporan) {
        const id = 'lap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const newLaporan = { ...laporan, _id: id, createdAt: new Date().toISOString() };
        localLaporans.unshift(newLaporan);
        saveLocalLaporans();
        return newLaporan;
    },

    updateLocalLaporan(id, updateData) {
        const index = localLaporans.findIndex(l => String(l._id) === String(id));
        if (index === -1) return null;
        const { _id, createdAt, updatedAt, ...safeUpdate } = updateData || {};
        localLaporans[index] = { ...localLaporans[index], ...safeUpdate, updatedAt: new Date().toISOString() };
        saveLocalLaporans();
        return localLaporans[index];
    },

    deleteLocalLaporan(id) {
        const initialLen = localLaporans.length;
        localLaporans = localLaporans.filter(l => String(l._id) !== String(id));
        if (localLaporans.length < initialLen) {
            saveLocalLaporans();
            return true;
        }
        return false;
    }
};

