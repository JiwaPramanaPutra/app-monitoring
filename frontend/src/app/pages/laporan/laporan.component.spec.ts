import { LaporanComponent } from './laporan.component';

/**
 * Komponen dibuat langsung tanpa TestBed: `exportExcel` hanya memakai
 * `ApiService.download`, `searchText`, dan `filterType`.
 */
function makeComponent(download: (path: string) => Promise<void>): LaporanComponent {
  return new LaporanComponent(
    { detectChanges: () => undefined, markForCheck: () => undefined } as any,
    {} as any,
    { download } as any,
    {} as any
  );
}

const PROJECTS = [
  {
    name: 'Poltekkes Kemenkes',
    sites: [
      {
        name: 'Poltekkes Gizi',
        gedungList: [
          { name: 'Gedung Baru', floors: [{ name: '1' }, { name: '2' }] },
          { name: 'Gedung Lama', floors: [{ name: '1' }] }
        ]
      },
      { name: 'Kebidanan', gedungList: [] }
    ]
  }
];

describe('LaporanComponent export', () => {
  it('exportExcel menembak endpoint .xlsx dengan filter aktif', async () => {
    const paths: string[] = [];
    const component = makeComponent(async path => { paths.push(path); });
    component.searchText = 'kabel';
    component.filterType = 'Jaringan';

    await component.exportExcel();

    expect(paths).toEqual(['/api/laporan/export/xlsx?search=kabel&type=Jaringan']);
  });
});

describe('LaporanComponent opsi gedung & lantai', () => {
  it('gedungOptions & lantaiOptions mengikuti hierarki site', () => {
    const component = makeComponent(async () => undefined);
    component.projects = PROJECTS;

    expect(component.gedungOptions('Poltekkes Gizi')).toEqual(['Gedung Baru', 'Gedung Lama']);
    expect(component.lantaiOptions('Poltekkes Gizi', 'Gedung Baru')).toEqual(['1', '2']);
    expect(component.lantaiOptions('Poltekkes Gizi', 'Tidak Ada')).toEqual([]);
    expect(component.gedungOptions('Site Tak Dikenal')).toEqual([]);
  });

  it('gedungChoices/lantaiChoices menyertakan nilai lama yang tak ada di daftar', () => {
    const component = makeComponent(async () => undefined);
    component.projects = PROJECTS;

    expect(component.gedungChoices('Poltekkes Gizi', 'Gedung Lama')).toEqual(['Gedung Baru', 'Gedung Lama']);
    expect(component.gedungChoices('Poltekkes Gizi', 'Gedung Kuno')).toEqual(['Gedung Kuno', 'Gedung Baru', 'Gedung Lama']);
    expect(component.lantaiChoices('Poltekkes Gizi', 'Gedung Baru', '3')).toEqual(['3', '1', '2']);
  });

  it('onGedungChange mengosongkan lantai; onSiteChange mengosongkan gedung & lantai', () => {
    const component = makeComponent(async () => undefined);
    component.newReport.gedung = 'Gedung Baru';
    component.newReport.lantai = '2';

    component.onGedungChange();
    expect(component.newReport.lantai).toBe('');

    component.newReport.gedung = 'Gedung Baru';
    component.newReport.lantai = '2';
    component.newReport.site = 'Poltekkes Gizi';
    component.onSiteChange();
    expect(component.newReport.gedung).toBe('');
    expect(component.newReport.lantai).toBe('');
  });

  it('openEditModal menormalkan placeholder — dari data lama menjadi kosong', () => {
    const component = makeComponent(async () => undefined);

    component.openEditModal({
      _id: 'lap-1',
      site: 'Poltekkes Gizi',
      gedung: '—',
      lantai: '—',
      masalah: 'x',
      tindakan: 'y'
    });

    expect(component.newReport.gedung).toBe('');
    expect(component.newReport.lantai).toBe('');
    expect(component.isEditing).toBe(true);
  });
});
