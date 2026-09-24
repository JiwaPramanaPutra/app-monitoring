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
import { SiteNode } from '../../shared/site-hierarchy';
import { ProjectService } from '../../services/project.service';

@Component({
  selector: 'app-site-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './site-dropdown.component.html',
  styleUrls: ['./site-dropdown.component.css'],
})
export class SiteDropdownComponent implements OnInit {
  /** Label yang muncul di trigger button. Default: nilai yang dipilih saat ini */
  @Input() selectedLabel: string = 'Pilih Site';

  /** Emit event ketika user memilih sebuah site leaf-node */
  @Output() siteSelected = new EventEmitter<{
    siteValue: string;
    buildingValue?: string;
    label: string;
  }>();

  hierarchy: SiteNode[] = [];
  isOpen = false;
  /** Stack index yang sedang hover untuk multi-level submenu */
  activeParentPath: number[] = [];

  constructor(private projectService: ProjectService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.projectService.siteTree$.subscribe(tree => {
      this.hierarchy = tree || [];
      this.cdr.markForCheck();
    });
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (!this.isOpen) this.activeParentPath = [];
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.site-dropdown-wrapper')) {
      this.isOpen = false;
      this.activeParentPath = [];
    }
  }

  /** Dipanggil saat user hover pada item di level tertentu */
  setActiveAt(level: number, index: number) {
    this.activeParentPath = [...this.activeParentPath.slice(0, level), index];
  }

  /** Ambil node anak dari path aktif pada level tertentu */
  getChildrenAt(level: number): SiteNode[] | null {
    let nodes: SiteNode[] = this.hierarchy;
    for (let i = 0; i < level; i++) {
      const idx = this.activeParentPath[i];
      if (idx === undefined || !nodes[idx]?.children?.length) return null;
      nodes = nodes[idx].children!;
    }
    return nodes;
  }

  select(node: SiteNode) {
    if (node.siteValue) {
      this.selectedLabel = node.label;
      this.siteSelected.emit({
        siteValue: node.siteValue,
        buildingValue: node.buildingValue,
        label: node.label,
      });
      this.isOpen = false;
      this.activeParentPath = [];
    }
  }

  hasChildren(node: SiteNode): boolean {
    return !!(node.children && node.children.length > 0);
  }
}
