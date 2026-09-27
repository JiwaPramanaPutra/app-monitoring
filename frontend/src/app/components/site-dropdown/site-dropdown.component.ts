import {
  ChangeDetectorRef,
  Component,
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

  constructor(private projectService: ProjectService, private cdr: ChangeDetectorRef) {}

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
    if (!this.isOpen) this.search = '';
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
}
