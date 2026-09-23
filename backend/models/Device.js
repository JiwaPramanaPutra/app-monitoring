const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['Online', 'Offline', 'Degraded'],
        default: 'Online'
    },
    type: {
        type: String,
        default: 'Access Point'
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    brand: {
        type: String,
        default: 'Ruijie'
    },
    model: {
        type: String,
        default: 'RG-AP180'
    },
    mac: {
        type: String,
        default: '—'
    },
    ip: {
        type: String,
        required: true,
        trim: true
    },
    client: {
        type: String,
        default: '0'
    },
    signal: {
        type: String,
        default: '-65 dBm'
    },
    siteLocation: {
        type: String,
        required: true,
        default: 'Direktorat'
    },
    gedung: {
        type: String,
        default: '—'
    },
    lantai: {
        type: String,
        default: '—'
    },
    ruangan: {
        type: String,
        default: '—'
    },
    managementProvider: {
        type: String,
        default: 'Ruijie Cloud'
    },
    managementUrl: {
        type: String,
        default: ''
    },
    sshPort: {
        type: Number,
        default: 22
    },
    sshUsername: {
        type: String,
        default: ''
    },
    sshPassword: {
        type: String,
        default: ''
    },
    lastChecked: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Device', deviceSchema);
