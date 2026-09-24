// Helper laporan: filter dipakai GET /api/laporan dan export CSV,
// dan pembentukan CSV yang aman dikonsumsi spreadsheet.

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

function csvCell(value) {
    let s = value === null || value === undefined ? '' : String(value);
    // Netralkan formula injection saat CSV dibuka di Excel/Sheets.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
}

function buildLaporanCsv(laporans) {
    const lines = ['Tanggal,Jenis,Site,Gedung,Lantai,Ruangan,Perangkat,Masalah,Tindakan,Teknisi'];
    for (const l of laporans || []) {
        lines.push([
            l.date, l.type, l.site, l.gedung, l.lantai, l.ruangan,
            l.perangkatTerkait, l.masalah, l.tindakan, l.technician
        ].map(csvCell).join(','));
    }
    return lines.join('\r\n');
}

module.exports = {
    filterLaporan,
    csvCell,
    buildLaporanCsv
};
