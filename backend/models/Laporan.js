const mongoose = require('mongoose');

const laporanSchema = new mongoose.Schema({
    date: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['Jaringan', 'Printer / komputer', 'Monitoring kegiatan khusus']
    },
    masalah: {
        type: String,
        required: true,
        trim: true
    },
    tindakan: {
        type: String,
        required: true,
        trim: true
    },
    site: {
        type: String,
        required: true,
        trim: true
    },
    technician: {
        type: String,
        required: true,
        trim: true
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
    perangkatTerkait: {
        type: String,
        default: '—'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Laporan', laporanSchema);
