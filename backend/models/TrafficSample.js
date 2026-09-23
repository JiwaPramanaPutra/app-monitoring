const mongoose = require('mongoose');

const trafficSampleSchema = new mongoose.Schema({
    site: {
        type: String,
        required: true,
        index: true
    },
    timestamp: {
        type: Date,
        required: true,
        index: true
    },
    txMbps: {
        type: Number,
        default: 0
    },
    rxMbps: {
        type: Number,
        default: 0
    },
    interface: {
        type: String,
        default: ''
    }
}, {
    timestamps: false // timestamp sudah disimpan eksplisit
});

// Compound index untuk query cepat berdasarkan site + waktu
trafficSampleSchema.index({ site: 1, timestamp: 1 });

module.exports = mongoose.model('TrafficSample', trafficSampleSchema);
