const test = require('node:test');
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const {
    buildLaporanWorkbook,
    buildLaporanXlsxBuffer,
    parseTanggal
} = require('../services/laporan-xlsx');
const { LAPORAN_HEADERS } = require('../services/laporan-utils');

const EXPORTED_AT = new Date(2026, 8, 26, 10, 5);

const rows = [
    {
        date: '2026-09-24', type: 'Jaringan', site: 'Site A', gedung: 'A', lantai: '1', ruangan: 'R1',
        perangkatTerkait: 'AP-1', masalah: 'kabel putus', tindakan: 'ganti kabel', technician: 'Andi'
    },
    {
        date: '2026-09-23', type: 'Printer / komputer', site: 'Site B', gedung: '—', lantai: '—', ruangan: '—',
        perangkatTerkait: '—', masalah: 'printer macet', tindakan: 'restart', technician: 'Budi'
    },
    {
        date: '2026-09-22', type: 'Monitoring kegiatan khusus', site: 'Site A', gedung: 'B', lantai: '2', ruangan: 'R2',
        perangkatTerkait: '—', masalah: 'kegiatan', tindakan: 'pantau', technician: 'Andi'
    },
    {
        date: '2026-09-21', type: 'Jaringan', site: 'Site B', gedung: 'C', lantai: '3', ruangan: 'R3',
        perangkatTerkait: 'SW-1', masalah: 'lambda', tindakan: 'reboot', technician: 'Citra'
    }
];

const singleSiteRows = rows.filter(row => row.site === 'Site A');

test('parseTanggal membaca YYYY-MM-DD sebagai tengah malam UTC, bukan waktu lokal', () => {
    assert.strictEqual(parseTanggal('2026-09-24').toISOString(), '2026-09-24T00:00:00.000Z');
    assert.strictEqual(parseTanggal(''), null);
    assert.strictEqual(parseTanggal(null), null);
});

test('workbook berisi lembar Laporan lalu Ringkasan', () => {
    const workbook = buildLaporanWorkbook(rows, { exportedAt: EXPORTED_AT });

    assert.deepStrictEqual(workbook.worksheets.map(sheet => sheet.name), ['Laporan', 'Ringkasan']);
});

test('baris 1: judul tebal digabung, memuat site dan periode', () => {
    const sheet = buildLaporanWorkbook(singleSiteRows, { exportedAt: EXPORTED_AT }).getWorksheet('Laporan');

    assert.strictEqual(sheet.getCell('A1').value, 'Laporan Gangguan — Site A · Periode: 22-Sep-2026 s.d. 24-Sep-2026');
    assert.strictEqual(sheet.getCell('A1').font.bold, true);
    assert.ok(sheet.getCell('A1').font.size >= 14, 'judul harus berukuran besar');
    assert.strictEqual(sheet.getCell('A1').isMerged, true);
    assert.strictEqual(sheet.getCell('J1').master.address, 'A1', 'judul digabung sampai kolom terakhir');
    assert.strictEqual(sheet.getCell('A2').isMerged, true);
    assert.match(sheet.getCell('A2').value, /^Diekspor: \d{2}-[A-Z][a-z]{2}-\d{4} \d{2}:\d{2}$/);
});

test('baris 3: header tebal berlatar gelap, freeze pane di bawahnya, dan AutoFilter', () => {
    const sheet = buildLaporanWorkbook(rows, { exportedAt: EXPORTED_AT }).getWorksheet('Laporan');

    LAPORAN_HEADERS.forEach((label, index) => {
        const cell = sheet.getRow(3).getCell(index + 1);
        assert.strictEqual(cell.value, label);
        assert.strictEqual(cell.font.bold, true);
        assert.strictEqual(cell.font.color.argb, 'FFFFFFFF');
        assert.strictEqual(cell.fill.fgColor.argb, 'FF1E293B');
    });

    assert.strictEqual(sheet.views[0].state, 'frozen');
    assert.strictEqual(sheet.views[0].ySplit, 3);
    assert.strictEqual(sheet.autoFilter, 'A3:J7');
});

test('lebar kolom diatur per kolom, bukan seragam', () => {
    const sheet = buildLaporanWorkbook(rows, { exportedAt: EXPORTED_AT }).getWorksheet('Laporan');
    const widths = LAPORAN_HEADERS.map((_, index) => sheet.getColumn(index + 1).width);

    assert.deepStrictEqual(widths, [13, 24, 18, 14, 8, 18, 22, 42, 42, 18]);
});

test('tanggal jadi Date asli ber-numFmt Excel dan rata tengah', () => {
    const sheet = buildLaporanWorkbook(rows, { exportedAt: EXPORTED_AT }).getWorksheet('Laporan');
    const cell = sheet.getCell('A4');

    assert.ok(cell.value instanceof Date, 'tanggal harus Date, bukan teks mentah');
    assert.strictEqual(cell.value.toISOString(), '2026-09-24T00:00:00.000Z');
    assert.strictEqual(cell.numFmt, 'DD-MMM-YYYY');
    assert.strictEqual(cell.alignment.horizontal, 'center');
});

test('Jenis berwarna per kategori dan baris genap dapat zebra', () => {
    const sheet = buildLaporanWorkbook(rows, { exportedAt: EXPORTED_AT }).getWorksheet('Laporan');

    assert.strictEqual(sheet.getCell('B4').fill.fgColor.argb, 'FFDBEAFE');
    assert.strictEqual(sheet.getCell('B5').fill.fgColor.argb, 'FFFEF3C7');
    assert.strictEqual(sheet.getCell('B6').fill.fgColor.argb, 'FFDCFCE7');
    assert.notStrictEqual(
        sheet.getCell('B4').fill.fgColor.argb,
        sheet.getCell('B5').fill.fgColor.argb,
        'setiap kategori harus punya warna berbeda'
    );

    assert.strictEqual(sheet.getCell('C5').fill.fgColor.argb, 'FFF8FAFC');
    assert.notStrictEqual(sheet.getCell('C5').fill.fgColor.argb, sheet.getCell('C4').fill?.fgColor?.argb);
});

test('border tipis, wrap text kolom panjang, dan tanpa baris kosong di ujung', () => {
    const sheet = buildLaporanWorkbook(rows, { exportedAt: EXPORTED_AT }).getWorksheet('Laporan');

    assert.strictEqual(sheet.getCell('A3').border.top.style, 'thin');
    assert.strictEqual(sheet.getCell('A4').border.left.style, 'thin');
    assert.strictEqual(sheet.getCell('J7').border.bottom.style, 'thin');

    assert.strictEqual(sheet.getCell('H4').alignment.wrapText, true);
    assert.strictEqual(sheet.getCell('H4').alignment.vertical, 'top');
    assert.strictEqual(sheet.getCell('I4').alignment.wrapText, true);

    assert.strictEqual(sheet.rowCount, 3 + rows.length, 'tidak boleh ada baris kosong setelah data');
});

test('lembar Ringkasan menghitung per jenis, per site, dan per teknisi', () => {
    const sheet = buildLaporanWorkbook(rows, { exportedAt: EXPORTED_AT }).getWorksheet('Ringkasan');

    assert.strictEqual(sheet.getCell('A1').value, 'Ringkasan Laporan — Semua Site · Periode: 21-Sep-2026 s.d. 24-Sep-2026');
    assert.strictEqual(sheet.getCell('A1').isMerged, true);

    assert.strictEqual(sheet.getCell('A4').value, 'Jumlah per Jenis');
    assert.deepStrictEqual([sheet.getCell('A5').value, sheet.getCell('B5').value], ['Jenis', 'Jumlah']);
    assert.deepStrictEqual([sheet.getCell('A6').value, sheet.getCell('B6').value], ['Jaringan', 2]);
    assert.strictEqual(typeof sheet.getCell('B6').value, 'number', 'jumlah harus angka, bukan teks');
    assert.deepStrictEqual([sheet.getCell('A7').value, sheet.getCell('B7').value], ['Monitoring kegiatan khusus', 1]);
    assert.deepStrictEqual([sheet.getCell('A8').value, sheet.getCell('B8').value], ['Printer / komputer', 1]);
    assert.deepStrictEqual([sheet.getCell('A9').value, sheet.getCell('B9').value], ['Total', 4]);

    assert.strictEqual(sheet.getCell('A11').value, 'Jumlah per Site');
    assert.deepStrictEqual([sheet.getCell('A13').value, sheet.getCell('B13').value], ['Site A', 2]);
    assert.deepStrictEqual([sheet.getCell('A14').value, sheet.getCell('B14').value], ['Site B', 2]);
    assert.strictEqual(sheet.getCell('B15').value, 4);

    assert.strictEqual(sheet.getCell('A17').value, 'Jumlah per Teknisi');
    assert.deepStrictEqual([sheet.getCell('A19').value, sheet.getCell('B19').value], ['Andi', 2]);
    assert.deepStrictEqual([sheet.getCell('A20').value, sheet.getCell('B20').value], ['Budi', 1]);
    assert.deepStrictEqual([sheet.getCell('A21').value, sheet.getCell('B21').value], ['Citra', 1]);
    assert.strictEqual(sheet.getCell('B22').value, 4);
});

test('buffer .xlsx bisa dibaca ulang dan sel kuncinya tetap sama', async () => {
    const buffer = await buildLaporanXlsxBuffer(rows, { exportedAt: EXPORTED_AT });
    assert.ok(Buffer.isBuffer(buffer), 'hasil writeBuffer harus Buffer');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Laporan');

    assert.strictEqual(sheet.getCell('A1').value, 'Laporan Gangguan — Semua Site · Periode: 21-Sep-2026 s.d. 24-Sep-2026');
    assert.deepStrictEqual(
        LAPORAN_HEADERS.map((_, index) => sheet.getCell(3, index + 1).value),
        LAPORAN_HEADERS
    );

    const dateCell = sheet.getCell('A4');
    assert.ok(dateCell.value instanceof Date);
    assert.strictEqual(dateCell.value.toISOString().slice(0, 10), '2026-09-24');
    assert.strictEqual(dateCell.numFmt, 'DD-MMM-YYYY');
    assert.strictEqual(sheet.getCell('B4').value, 'Jaringan');
    assert.strictEqual(sheet.getCell('B4').fill.fgColor.argb, 'FFDBEAFE');
    assert.strictEqual(sheet.getCell('H4').value, 'kabel putus');

    assert.strictEqual(sheet.views[0].state, 'frozen');
    assert.strictEqual(sheet.views[0].ySplit, 3);
    assert.strictEqual(sheet.autoFilter, 'A3:J7');
    assert.strictEqual(sheet.rowCount, 7);

    const ringkasan = workbook.getWorksheet('Ringkasan');
    assert.strictEqual(ringkasan.getCell('B9').value, 4);
    assert.strictEqual(ringkasan.getCell('B19').value, 2);
});

test('koma, titik-koma, dan tanda kutip kembali apa adanya tanpa kutip pembungkus', async () => {
    const tricky = [{ ...rows[0], masalah: 'kabel, putus; "total"', tindakan: "jangan ' reset" }];

    const buffer = await buildLaporanXlsxBuffer(tricky, { exportedAt: EXPORTED_AT });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Laporan');

    assert.strictEqual(sheet.getCell('H4').value, 'kabel, putus; "total"');
    assert.strictEqual(sheet.getCell('I4').value, "jangan ' reset");
});

test('nilai berawalan formula tetap teks di .xlsx, bukan formula', async () => {
    const tricky = [{ ...rows[0], masalah: '=SUM(A1:A2)', tindakan: '+62 812' }];

    const built = buildLaporanWorkbook(tricky, { exportedAt: EXPORTED_AT }).getWorksheet('Laporan');
    assert.strictEqual(built.getCell('H4').value, '=SUM(A1:A2)');
    assert.strictEqual(built.getCell('H4').formula, undefined);

    const buffer = await buildLaporanXlsxBuffer(tricky, { exportedAt: EXPORTED_AT });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Laporan');

    assert.strictEqual(sheet.getCell('H4').value, '=SUM(A1:A2)');
    assert.strictEqual(typeof sheet.getCell('H4').value, 'string');
    assert.strictEqual(sheet.getCell('H4').formula, undefined);
    assert.strictEqual(sheet.getCell('I4').value, '+62 812');
});

test('tanpa data: judul tanpa periode, header tetap ada, ringkasan nol', async () => {
    const buffer = await buildLaporanXlsxBuffer([], { exportedAt: EXPORTED_AT });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Laporan');

    assert.strictEqual(sheet.getCell('A1').value, 'Laporan Gangguan — Semua Site');
    assert.strictEqual(sheet.getCell('A3').value, 'Tanggal');
    assert.strictEqual(sheet.getCell('J3').value, 'Teknisi');
    assert.strictEqual(sheet.autoFilter, 'A3:J3');
    assert.strictEqual(sheet.rowCount, 3);

    const ringkasan = workbook.getWorksheet('Ringkasan');
    assert.deepStrictEqual(
        [ringkasan.getCell('B6').value, ringkasan.getCell('B10').value, ringkasan.getCell('B14').value],
        [0, 0, 0]
    );
});
