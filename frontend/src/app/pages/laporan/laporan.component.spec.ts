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
