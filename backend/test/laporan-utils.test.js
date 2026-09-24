const test = require('node:test');
const assert = require('node:assert');
const { filterLaporan, csvCell, buildLaporanCsv } = require('../services/laporan-utils');

const rows = [
    {
        date: '2026-09-24', type: 'Jaringan', site: 'Site A', gedung: 'A', lantai: '1', ruangan: 'R1',
        perangkatTerkait: 'AP-1', masalah: 'kabel putus', tindakan: 'ganti kabel', technician: 'Tester'
    },
    {
        date: '2026-09-23', type: 'Printer / komputer', site: 'Site B', gedung: '', lantai: '', ruangan: '',
        perangkatTerkait: '', masalah: 'printer macet', tindakan: 'restart', technician: 'Tester'
    }
];

test('filterLaporan filters by type and passes everything through when empty', () => {
    assert.strictEqual(filterLaporan(rows, '', 'Jaringan').length, 1);
    assert.strictEqual(filterLaporan(rows, '', '').length, 2);
});

test('filterLaporan searches masalah and tindakan case-insensitively', () => {
    assert.strictEqual(filterLaporan(rows, 'KABEL', '').length, 1);
    assert.strictEqual(filterLaporan(rows, 'restart', '').length, 1);
    assert.strictEqual(filterLaporan(rows, 'tidak-ada', '').length, 0);
});

test('csvCell quotes values, escapes embedded quotes, and handles null', () => {
    assert.strictEqual(csvCell('plain'), '"plain"');
    assert.strictEqual(csvCell('a,b'), '"a,b"');
    assert.strictEqual(csvCell('say "hi"'), '"say ""hi"""');
    assert.strictEqual(csvCell(null), '""');
});

test('csvCell neutralizes formula-leading values', () => {
    assert.strictEqual(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
    assert.strictEqual(csvCell('+62'), '"\'+62"');
    assert.strictEqual(csvCell('@cmd'), '"\'@cmd"');
    assert.strictEqual(csvCell('-minus'), '"\'-minus"');
});

test('buildLaporanCsv writes the header and one row per laporan', () => {
    const lines = buildLaporanCsv(rows).split('\r\n');
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(lines[0], 'Tanggal,Jenis,Site,Gedung,Lantai,Ruangan,Perangkat,Masalah,Tindakan,Teknisi');
    assert.ok(lines[1].includes('"kabel putus"'));
    assert.ok(lines[1].includes('"AP-1"'));
});
