// Helper laporan: filter dipakai GET /api/laporan dan ekspor .xlsx.

const LAPORAN_HEADERS = [
    'Tanggal', 'Jenis', 'Site', 'Gedung', 'Lantai',
    'Ruangan', 'Perangkat', 'Masalah', 'Tindakan', 'Teknisi'
];

function filterLaporan(laporans, search, type) {
    let result = laporans || [];
    if (type) result = result.filter(l => l.type === type);
    if (search) {
        const q = String(search).toLowerCase();
        result = result.filter(l =>
            String(l.masalah || '').toLowerCase().includes(q) ||
            String(l.tindakan || '').toLowerCase().includes(q)
        );
    }
    return result;
}

module.exports = {
    filterLaporan,
    LAPORAN_HEADERS
};
