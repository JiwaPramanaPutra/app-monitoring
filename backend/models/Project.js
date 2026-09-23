const mongoose = require('mongoose');

const floorSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    rooms: [{
        type: String,
        trim: true
    }]
}, { _id: true });

const gedungSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    code: {
        type: String,
        trim: true,
        default: ''
    },
    floors: [floorSchema]
}, { _id: true });

const siteSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    code: {
        type: String,
        trim: true,
        default: ''
    },
    // Konfigurasi router MikroTik per-site (opsional untuk live traffic monitoring)
    routerConfig: {
        host: { type: String, default: '' },
        port: { type: Number, default: 8728 },
        displayPort: { type: Number, default: 8291 },
        user: { type: String, default: '' },
        password: { type: String, default: '' },
        interface: { type: String, default: 'ether1' },
        routerModel: { type: String, default: '' },
        timeout: { type: Number, default: 3 }
    },
    gedungList: [gedungSchema]
}, { _id: true });

const projectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    code: {
        type: String,
        trim: true,
        default: ''
    },
    description: {
        type: String,
        default: ''
    },
    sites: [siteSchema]
}, {
    timestamps: true
});

module.exports = mongoose.model('Project', projectSchema);
