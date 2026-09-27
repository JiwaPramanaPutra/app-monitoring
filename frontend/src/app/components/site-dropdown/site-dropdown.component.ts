import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SiteNode } from '../../shared/site-hierarchy';
import { ProjectService } from '../../services/project.service';

/** Satu baris di daftar datar: site + proyek pemiliknya (untuk konteks). */
interface FlatSite {
  siteValue: string;
  label: string;
  project: string;
}

/** Lebar maksimum panel dropdown (px) — dipakai saat memilih sisi buka. */
export const SITE_PANEL_WIDTH = 340;

/**
 * Pilih sisi buka panel dropdown.
 *
 * Default `left` (panel melebar ke kanan dari trigger). Saat ruang di kanan
 * tidak cukup — misalnya di dalam modal yang memotong overflow — panel dibuka
 * `right` (melebar ke kiri) supaya tidak terpotong tanpa menggeser trigger.
 */
export function choosePanelAlign(
  spaceRight: number,
  spaceLeft: number,
  panelWidth: number
): 'left' | 'right' {
  if (spaceRight >= panelWidth) return 'left';
  return spaceLeft > spaceRight ? 'right' : 'left';
}

@Component({
  selector: 'app-site-dropdown',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './site-dropdown.component.html',
  styleUrls: ['./site-dropdown.component.css'],
})
export class SiteDropdownComponent implements OnInit {
  /** Label yang muncul di trigger button. Default: nilai yang dipilih saat ini */
  @Input() selectedLabel: string = 'Pilih Site';

  /** Lebar trigger mengikuti kolom form (dipakai di dalam modal), bukan menyusut. */
  @Input() fullWidth = false;

  /** Emit event ketika user memilih sebuah site */
  @Output() siteSelected = new EventEmitter<{
    siteValue: string;
    buildingValue?: string;
    label: string;
  }>();

  /** Semua site, datar — level gedung/lantai tidak ikut. */
  allSites: FlatSite[] = [];
  search = '';
  isOpen = false;
  /** Sisi buka panel: `left` melebar ke kanan, `right` melebar ke kiri. */
  panelAlign: 'left' | 'right' = 'left';

  constructor(
    private projectService: ProjectService,
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>
  ) {}

  ngOnInit() {
    this.projectService.siteTree$.subscribe(tree => {
      this.allSites = this.flattenSites(tree || []);
      this.cdr.markForCheck();
    });
  }

  /**
   * Ratakan pohon proyek menjadi daftar site. Hanya anak langsung proyek
   * (level site) yang diambil; node gedung/lantai di bawahnya diabaikan.
   */
  private flattenSites(tree: SiteNode[]): FlatSite[] {
    const result: FlatSite[] = [];
    for (const project of tree) {
      for (const node of project.children || []) {
        if (!node.siteValue) continue;
        result.push({ siteValue: node.siteValue, label: node.label, project: project.label });
      }
    }
    return result;
  }

  /** Daftar yang tampil: disaring oleh kotak pencarian (nama site atau proyek). */
  get filteredSites(): FlatSite[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.allSites;
    return this.allSites.filter(site =>
      site.label.toLowerCase().includes(q) || site.project.toLowerCase().includes(q)
    );
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.panelAlign = this.pickPanelAlign();
    } else {
      this.search = '';
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.site-dropdown-wrapper')) {
      this.isOpen = false;
      this.search = '';
    }
  }

  select(site: FlatSite) {
    this.selectedLabel = site.label;
    this.siteSelected.emit({
      siteValue: site.siteValue,
      label: site.label,
    });
    this.isOpen = false;
    this.search = '';
  }

  /** Sisi buka panel berdasarkan ruang di dalam kotak yang memotongnya. */
  private pickPanelAlign(): 'left' | 'right' {
    const el = this.host?.nativeElement;
    if (!el || typeof el.getBoundingClientRect !== 'function') return 'left';
    const rect = el.getBoundingClientRect();
    const clip = this.clippingRect(el);
    return choosePanelAlign(clip.right - rect.left, rect.right - clip.left, SITE_PANEL_WIDTH);
  }

  /**
   * Rect kotak terdekat yang memotong overflow (mis. `.modal-box` yang punya
   * `overflow-y: auto` sehingga overflow-x ikut terpotong), atau viewport.
   */
  private clippingRect(el: HTMLElement): { left: number; right: number } {
    let node: HTMLElement | null = el.parentElement;
    while (node) {
      const style = window.getComputedStyle(node);
      if (style.overflowX !== 'visible') {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }
      node = node.parentElement;
    }
    return { left: 0, right: window.innerWidth || 0 };
  }
}
