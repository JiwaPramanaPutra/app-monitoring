import { BehaviorSubject } from 'rxjs';
import { SiteDropdownComponent, choosePanelAlign } from './site-dropdown.component';

/**
 * Komponen dibuat langsung tanpa TestBed: `ProjectService.siteTree$`,
 * `ChangeDetectorRef`, dan `ElementRef` dipalsukan seperlunya.
 */
function makeComponent(tree: any[]): SiteDropdownComponent {
  const service = { siteTree$: new BehaviorSubject<any[]>(tree) } as any;
  const cdr = { markForCheck: () => undefined } as any;
  const host = { nativeElement: document.createElement('div') } as any;
  const component = new SiteDropdownComponent(service, cdr, host);
  component.ngOnInit();
  return component;
}

const TREE = [
  {
    label: 'Poltekkes Kemenkes',
    children: [
      {
        label: 'Poltekkes Gizi',
        siteValue: 'Poltekkes Gizi',
        children: [
          {
            label: 'Gedung A',
            siteValue: 'Poltekkes Gizi',
            buildingValue: 'Gedung A',
            children: [{ label: '1', siteValue: 'Poltekkes Gizi', buildingValue: 'Gedung A' }]
          }
        ]
      },
      { label: 'Kebidanan', siteValue: 'Kebidanan', children: [] }
    ]
  },
  { label: 'Universitas Udayana', children: [] }
];

describe('SiteDropdownComponent', () => {
  it('meratakan pohon jadi daftar site — tanpa gedung/lantai', () => {
    const component = makeComponent(TREE);

    expect(component.allSites.map(s => s.siteValue)).toEqual(['Poltekkes Gizi', 'Kebidanan']);
    expect(component.allSites[0].project).toBe('Poltekkes Kemenkes');
  });

  it('pencarian menyaring berdasarkan nama site atau proyek', () => {
    const component = makeComponent(TREE);

    component.search = 'gizi';
    expect(component.filteredSites.map(s => s.label)).toEqual(['Poltekkes Gizi']);

    component.search = 'kemenkes';
    expect(component.filteredSites.map(s => s.label)).toEqual(['Poltekkes Gizi', 'Kebidanan']);

    component.search = 'tidak-ada';
    expect(component.filteredSites).toEqual([]);
  });

  it('select memancarkan siteValue + label, lalu menutup panel dan membersihkan pencarian', () => {
    const component = makeComponent(TREE);
    component.isOpen = true;
    component.search = 'gizi';

    const emitted: any[] = [];
    component.siteSelected.subscribe(e => emitted.push(e));

    component.select(component.allSites[0]);

    expect(emitted).toEqual([{ siteValue: 'Poltekkes Gizi', label: 'Poltekkes Gizi' }]);
    expect(component.selectedLabel).toBe('Poltekkes Gizi');
    expect(component.isOpen).toBe(false);
    expect(component.search).toBe('');
  });

  it('toggle menutup panel sekaligus membersihkan pencarian', () => {
    const component = makeComponent(TREE);

    component.toggle();
    expect(component.isOpen).toBe(true);

    component.search = 'gizi';
    component.toggle();
    expect(component.isOpen).toBe(false);
    expect(component.search).toBe('');
  });
});

describe('choosePanelAlign', () => {
  it('tetap melebar ke kanan saat ruang kanan cukup', () => {
    expect(choosePanelAlign(1000, 50, 340)).toBe('left');
    expect(choosePanelAlign(340, 100, 340)).toBe('left');
  });

  it('membuka ke kiri saat ruang kanan tidak cukup dan kiri lebih lapang', () => {
    // Kasus modal Tambah Laporan: sisa ruang kanan di dalam modal ±162px,
    // sedangkan ke kiri masih ±363px.
    expect(choosePanelAlign(162, 363, 340)).toBe('right');
    expect(choosePanelAlign(0, 500, 340)).toBe('right');
  });

  it('tetap ke kanan kalau kiri juga tidak lebih lapang', () => {
    expect(choosePanelAlign(100, 100, 340)).toBe('left');
    expect(choosePanelAlign(300, 200, 340)).toBe('left');
  });
});
