const test = require('node:test');
const assert = require('node:assert');
const { filterLaporan } = require('../services/laporan-utils');

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
