// Pembentuk berkas Excel (.xlsx) untuk ekspor laporan.
// Dipisah dari server.js supaya strukturnya bisa diuji tanpa menyalakan server.
//
// Catatan zona waktu: tanggal laporan disimpan sebagai teks `YYYY-MM-DD`.
// Nilai sel dibuat sebagai Date pada tengah malam UTC, karena ExcelJS menulis
// serial dari getTime() UTC. Serial adalah angka tanpa zona waktu, sehingga
// tanggal yang tampil di Excel sama di semua zona (Date dari waktu lokal
// perangkat server bisa bergeser satu hari).

const ExcelJS = require('exceljs');
const { LAPORAN_HEADERS } = require('./laporan-utils');

const SHEET_LAPORAN = 'Laporan';
const SHEET_RINGKASAN = 'Ringkasan';

const COLUMN_WIDTHS = [13, 24, 18, 14, 8, 18, 22, 42, 42, 18];
const DATE_FORMAT = 'DD-MMM-YYYY';

const HEADER_FILL = 'FF1E293B';
const HEADER_TEXT = 'FFFFFFFF';
const ZEBRA_FILL = 'FFF8FAFC';
const TITLE_COLOR = 'FF0F172A';
const SUBTITLE_COLOR = 'FF64748B';

const JENIS_FILL = {
    'Jaringan': 'FFDBEAFE',
    'Printer / komputer': 'FFFEF3C7',
    'Monitoring kegiatan khusus': 'FFDCFCE7'
};
const JENIS_FALLBACK_FILL = 'FFF1F5F9';

const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const THIN_BORDER = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
};

function solidFill(argb) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function cellText(value) {
    return value === null || value === undefined ? '' : String(value);
}

/** `YYYY-MM-DD` (atau ISO senada) -> Date tengah malam UTC; null bila tak valid. */
function parseTanggal(value) {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (match) {
        const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Date (UTC) -> `DD-MMM-YYYY`, sama seperti numFmt Excel `DD-MMM-YYYY`. */
function formatTanggalRingkas(date) {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = BULAN_SINGKAT[date.getUTCMonth()];
    return `${day}-${month}-${date.getUTCFullYear()}`;
}

function formatStempel(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = BULAN_SINGKAT[date.getMonth()];
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}-${month}-${date.getFullYear()} ${hours}:${minutes}`;
}

function labelSite(laporans) {
    const sites = [...new Set((laporans || []).map(l => cellText(l.site).trim()).filter(Boolean))];
    return sites.length === 1 ? sites[0] : 'Semua Site';
}

function labelPeriode(laporans) {
    const dates = (laporans || [])
        .map(l => parseTanggal(l.date))
        .filter(Boolean)
        .sort((a, b) => a.getTime() - b.getTime());
    if (dates.length === 0) return null;
    const awal = formatTanggalRingkas(dates[0]);
    const akhir = formatTanggalRingkas(dates[dates.length - 1]);
    return awal === akhir ? awal : `${awal} s.d. ${akhir}`;
}

function hitungPer(laporans, field) {
    const counts = new Map();
    for (const l of laporans || []) {
        const label = cellText(l[field]).trim() || '—';
        counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function tulisJudul(sheet, lastColumn, judul, periode) {
    sheet.mergeCells(`A1:${lastColumn}1`);
    const titleCell = sheet.getCell('A1');
    titleCell.value = judul + (periode ? ` · Periode: ${periode}` : '');
    titleCell.font = { bold: true, size: 16, color: { argb: TITLE_COLOR } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 26;
}

function buildSheetLaporan(workbook, laporans, { exportedAt }) {
    const lastColumn = String.fromCharCode(64 + LAPORAN_HEADERS.length); // 10 kolom -> 'J'
    const sheet = workbook.addWorksheet(SHEET_LAPORAN, {
        views: [{ state: 'frozen', ySplit: 3 }]
    });

    COLUMN_WIDTHS.forEach((width, index) => {
        sheet.getColumn(index + 1).width = width;
    });

    tulisJudul(sheet, lastColumn, `Laporan Gangguan — ${labelSite(laporans)}`, labelPeriode(laporans));

    sheet.mergeCells(`A2:${lastColumn}2`);
    const subtitle = sheet.getCell('A2');
    subtitle.value = `Diekspor: ${formatStempel(exportedAt)}`;
    subtitle.font = { size: 9, italic: true, color: { argb: SUBTITLE_COLOR } };

    const headerRow = sheet.getRow(3);
    LAPORAN_HEADERS.forEach((label, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = label;
        cell.font = { bold: true, color: { argb: HEADER_TEXT } };
        cell.fill = solidFill(HEADER_FILL);
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = THIN_BORDER;
    });
    headerRow.height = 20;

    laporans.forEach((l, index) => {
        const row = sheet.getRow(4 + index);
        const zebra = index % 2 === 1;

        for (let column = 1; column <= LAPORAN_HEADERS.length; column++) {
            const cell = row.getCell(column);
            cell.border = THIN_BORDER;
            if (zebra) cell.fill = solidFill(ZEBRA_FILL);
        }

        const dateCell = row.getCell(1);
        const tanggal = parseTanggal(l.date);
        if (tanggal) {
            dateCell.value = tanggal;
            dateCell.numFmt = DATE_FORMAT;
        } else {
            dateCell.value = cellText(l.date);
        }
        dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

        const jenisCell = row.getCell(2);
        jenisCell.value = cellText(l.type);
        jenisCell.fill = solidFill(JENIS_FILL[l.type] || JENIS_FALLBACK_FILL);
        jenisCell.alignment = { vertical: 'middle' };

        row.getCell(3).value = cellText(l.site);
        row.getCell(4).value = cellText(l.gedung);
        row.getCell(5).value = cellText(l.lantai);
        row.getCell(6).value = cellText(l.ruangan);
        row.getCell(7).value = cellText(l.perangkatTerkait);

        for (const column of [8, 9]) {
            const cell = row.getCell(column);
            cell.alignment = { wrapText: true, vertical: 'top' };
        }
        row.getCell(8).value = cellText(l.masalah);
        row.getCell(9).value = cellText(l.tindakan);
        row.getCell(10).value = cellText(l.technician);

        for (const column of [3, 4, 5, 6, 7, 10]) {
            row.getCell(column).alignment = { vertical: 'middle' };
        }
    });

    const lastRow = 3 + laporans.length;
    sheet.autoFilter = `A3:${lastColumn}${lastRow}`;
    return sheet;
}

function tulisBagianRingkasan(sheet, startRow, judul, labelKolom, entries) {
    const titleCell = sheet.getCell(`A${startRow}`);
    titleCell.value = judul;
    titleCell.font = { bold: true, size: 12, color: { argb: TITLE_COLOR } };

    const headerRow = sheet.getRow(startRow + 1);
    headerRow.getCell(1).value = labelKolom;
    headerRow.getCell(2).value = 'Jumlah';
    for (const column of [1, 2]) {
        const cell = headerRow.getCell(column);
        cell.font = { bold: true, color: { argb: HEADER_TEXT } };
        cell.fill = solidFill(HEADER_FILL);
        cell.border = THIN_BORDER;
    }

    let rowIndex = startRow + 2;
    for (const [label, count] of entries) {
        const row = sheet.getRow(rowIndex);
        row.getCell(1).value = label;
        row.getCell(2).value = count;
        row.getCell(1).border = THIN_BORDER;
        row.getCell(2).border = THIN_BORDER;
        row.getCell(2).alignment = { horizontal: 'center' };
        rowIndex++;
    }

    const totalRow = sheet.getRow(rowIndex);
    totalRow.getCell(1).value = 'Total';
    totalRow.getCell(2).value = entries.reduce((sum, [, count]) => sum + count, 0);
    for (const column of [1, 2]) {
        const cell = totalRow.getCell(column);
        cell.font = { bold: true };
        cell.border = THIN_BORDER;
    }
    totalRow.getCell(2).alignment = { horizontal: 'center' };

    return rowIndex + 2;
}

function buildSheetRingkasan(workbook, laporans, { exportedAt }) {
    const sheet = workbook.addWorksheet(SHEET_RINGKASAN);
    sheet.getColumn(1).width = 32;
    sheet.getColumn(2).width = 12;

    tulisJudul(sheet, 'B', `Ringkasan Laporan — ${labelSite(laporans)}`, labelPeriode(laporans));
    sheet.mergeCells('A2:B2');
    const subtitle = sheet.getCell('A2');
    subtitle.value = `Diekspor: ${formatStempel(exportedAt)}`;
    subtitle.font = { size: 9, italic: true, color: { argb: SUBTITLE_COLOR } };

    let row = 4;
    row = tulisBagianRingkasan(sheet, row, 'Jumlah per Jenis', 'Jenis', hitungPer(laporans, 'type'));
    row = tulisBagianRingkasan(sheet, row, 'Jumlah per Site', 'Site', hitungPer(laporans, 'site'));
    tulisBagianRingkasan(sheet, row, 'Jumlah per Teknisi', 'Teknisi', hitungPer(laporans, 'technician'));

    return sheet;
}

/**
 * Bangun workbook dua lembar dari daftar laporan (bentuknya sama dengan
 * dokumen `Laporan` / hasil `filterLaporan`). Belum ditulis ke buffer.
 */
function buildLaporanWorkbook(laporans = [], { exportedAt = new Date() } = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'app-monitoring';
    workbook.created = exportedAt;
    buildSheetLaporan(workbook, laporans, { exportedAt });
    buildSheetRingkasan(workbook, laporans, { exportedAt });
    return workbook;
}

/** Buffer .xlsx siap dikirim sebagai response unduhan. */
function buildLaporanXlsxBuffer(laporans = [], options = {}) {
    return buildLaporanWorkbook(laporans, options).xlsx.writeBuffer();
}

module.exports = {
    buildLaporanWorkbook,
    buildLaporanXlsxBuffer,
    formatTanggalRingkas,
    parseTanggal
};
