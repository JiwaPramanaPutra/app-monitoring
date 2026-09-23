import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { ProjectService } from '../../services/project.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-project-site',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent],
  templateUrl: './project-site.component.html',
  styleUrls: ['./project-site.component.css']
})
export class ProjectSiteComponent implements OnInit {
  projects: any[] = [];
  selectedProject: any = null;
  selectedSite: any = null;
  selectedGedung: any = null;

  // Modals
  showProjectModal = false;
  showSiteModal = false;
  showGedungModal = false;
  showLantaiModal = false;
  showConfirmModal = false;
  confirmMessage = '';
  confirmAction: () => void = () => {};

  isSaving = false;

  // Forms
  projectForm: any = { name: '', code: '', description: '' };
  siteForm: any = { name: '', code: '', routerConfig: { host: '', port: 8728, displayPort: 8291, user: '', password: '', interface: 'ether1' } };
  gedungForm: any = { name: '', code: '' };
  lantaiForm: any = { name: '' };

  isEditing = false;
  editId = '';

  constructor(private projectService: ProjectService, private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  ngOnInit() {
    this.projectService.projects$.subscribe(p => {
      this.projects = p;
      if (this.selectedProject) {
        this.selectedProject = this.projects.find(proj => proj._id === this.selectedProject._id) || null;
        if (this.selectedProject && this.selectedSite) {
          this.selectedSite = this.selectedProject.sites.find((s: any) => s._id === this.selectedSite._id) || null;
          if (this.selectedSite && this.selectedGedung) {
            this.selectedGedung = this.selectedSite.gedungList?.find((g: any) => g._id === this.selectedGedung._id) || null;
          }
        }
      }
    });
    // Force fresh load every time the page is opened
    this.projectService.refreshProjects();
  }

  selectProject(proj: any) {
    this.selectedProject = proj;
    this.selectedSite = null;
    this.selectedGedung = null;
  }

  selectSite(site: any) {
    this.selectedSite = site;
    this.selectedGedung = null;
  }

  selectGedung(gedung: any) {
    this.selectedGedung = gedung;
  }

  // --- Project Methods ---
  openProjectModal(proj?: any) {
    this.isEditing = !!proj;
    if (proj) {
      this.projectForm = { ...proj };
      this.editId = proj._id || proj.id;
    } else {
      this.projectForm = { name: '', code: '', description: '' };
    }
    this.showProjectModal = true;
  }

  saveProject() {
    this.isSaving = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.projectService.refreshProjects();
      this.showProjectModal = false;
      this.isSaving = false;
      this.cdr.detectChanges();
    };

    const obs$ = this.isEditing
      ? this.projectService.updateProject(this.editId, this.projectForm)
      : this.projectService.createProject(this.projectForm);

    obs$.subscribe({
      next: () => finish(),
      error: (err) => {
        console.error('Save project error:', err);
        this.notifyError(err, 'Gagal menyimpan project.');
        finish();
      }
    });

    setTimeout(() => this.ngZone.run(() => finish()), 2000);
  }

  deleteProject(proj: any) {
    this.requestDelete(`Yakin ingin menghapus project ${proj.name}?`, () => {
      this.projectService.deleteProject(proj._id || proj.id).subscribe({
        next: () => {
          this.projectService.refreshProjects();
          if (this.selectedProject?._id === proj._id) {
            this.selectedProject = null;
            this.selectedSite = null;
            this.selectedGedung = null;
          }
          this.cdr.detectChanges();
        },
        error: (err) => this.notifyError(err, 'Gagal menghapus project.')
      });
    });
  }

  // --- Site Methods ---
  openSiteModal(site?: any) {
    this.isEditing = !!site;
    if (site) {
      this.siteForm = { ...site };
      if (!this.siteForm.routerConfig) this.siteForm.routerConfig = { host: '', port: 8728, displayPort: 8291, user: '', password: '', interface: 'ether1' };
      this.editId = site._id;
    } else {
      this.siteForm = { name: '', code: '', routerConfig: { host: '', port: 8728, displayPort: 8291, user: '', password: '', interface: 'ether1' } };
    }
    this.showSiteModal = true;
  }

  saveSite() {
    let sites = [...(this.selectedProject.sites || [])];
    if (this.isEditing) {
      const idx = sites.findIndex(s => s._id === this.editId);
      if (idx !== -1) sites[idx] = { ...sites[idx], ...this.siteForm };
    } else {
      sites.push({ ...this.siteForm, _id: 'temp_' + Date.now() });
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.projectService.refreshProjects();
      this.showSiteModal = false;
      this.cdr.detectChanges();
    };
    this.projectService.updateProject(this.selectedProject._id || this.selectedProject.id, { sites }).subscribe({
      next: () => finish(),
      error: (err) => { this.notifyError(err, 'Gagal menyimpan perubahan.'); finish(); }
    });
    setTimeout(() => this.ngZone.run(() => finish()), 2000);
  }

  deleteSite(site: any) {
    this.requestDelete(`Yakin ingin menghapus site ${site.name}?`, () => {
      const sites = this.selectedProject.sites.filter((s: any) => s._id !== site._id);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.projectService.refreshProjects();
        if (this.selectedSite?._id === site._id) {
          this.selectedSite = null;
          this.selectedGedung = null;
        }
        this.cdr.detectChanges();
      };
      this.projectService.updateProject(this.selectedProject._id || this.selectedProject.id, { sites }).subscribe({
        next: () => finish(),
        error: (err) => { this.notifyError(err, 'Gagal menghapus.'); finish(); }
      });
      setTimeout(() => this.ngZone.run(() => finish()), 2000);
    });
  }

  // --- Gedung Methods ---
  openGedungModal(gedung?: any) {
    this.isEditing = !!gedung;
    if (gedung) {
      this.gedungForm = { ...gedung };
      this.editId = gedung._id;
    } else {
      this.gedungForm = { name: '', code: '' };
    }
    this.showGedungModal = true;
  }

  saveGedung() {
    let sites = [...(this.selectedProject.sites || [])];
    let siteIdx = sites.findIndex(s => s._id === this.selectedSite._id);
    if (siteIdx === -1) return;

    let gedungList = [...(sites[siteIdx].gedungList || [])];
    if (this.isEditing) {
      const idx = gedungList.findIndex(g => g._id === this.editId);
      if (idx !== -1) gedungList[idx] = { ...gedungList[idx], ...this.gedungForm };
    } else {
      gedungList.push({ ...this.gedungForm, _id: 'temp_g_' + Date.now(), floors: [] });
    }

    sites[siteIdx].gedungList = gedungList;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.projectService.refreshProjects();
      this.showGedungModal = false;
      this.cdr.detectChanges();
    };
    this.projectService.updateProject(this.selectedProject._id || this.selectedProject.id, { sites }).subscribe({
      next: () => finish(),
      error: (err) => { this.notifyError(err, 'Gagal menyimpan perubahan.'); finish(); }
    });
    setTimeout(() => this.ngZone.run(() => finish()), 2000);
  }

  deleteGedung(gedung: any) {
    this.requestDelete(`Yakin ingin menghapus gedung ${gedung.name}?`, () => {
      let sites = [...(this.selectedProject.sites || [])];
      let siteIdx = sites.findIndex(s => s._id === this.selectedSite._id);
      sites[siteIdx].gedungList = sites[siteIdx].gedungList.filter((g: any) => g._id !== gedung._id);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.projectService.refreshProjects();
        if (this.selectedGedung?._id === gedung._id) {
          this.selectedGedung = null;
        }
        this.cdr.detectChanges();
      };
      this.projectService.updateProject(this.selectedProject._id || this.selectedProject.id, { sites }).subscribe({
        next: () => finish(),
        error: (err) => { this.notifyError(err, 'Gagal menghapus.'); finish(); }
      });
      setTimeout(() => this.ngZone.run(() => finish()), 2000);
    });
  }

  // --- Lantai Methods ---
  openLantaiModal() {
    this.lantaiForm = { name: '' };
    this.showLantaiModal = true;
  }

  saveLantai() {
    let sites = [...(this.selectedProject.sites || [])];
    let siteIdx = sites.findIndex(s => s._id === this.selectedSite._id);
    if (siteIdx === -1) return;

    let gedungList = [...(sites[siteIdx].gedungList || [])];
    let gIdx = gedungList.findIndex(g => g._id === this.selectedGedung._id);
    if (gIdx === -1) return;

    let floors = [...(gedungList[gIdx].floors || [])];
    floors.push({ ...this.lantaiForm, _id: 'temp_f_' + Date.now() });

    gedungList[gIdx].floors = floors;
    sites[siteIdx].gedungList = gedungList;
    
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.projectService.refreshProjects();
      this.showLantaiModal = false;
      this.cdr.detectChanges();
    };
    this.projectService.updateProject(this.selectedProject._id || this.selectedProject.id, { sites }).subscribe({
      next: () => finish(),
      error: (err) => { this.notifyError(err, 'Gagal menyimpan perubahan.'); finish(); }
    });
    setTimeout(() => this.ngZone.run(() => finish()), 2000);
  }

  deleteLantai(floor: any) {
    this.requestDelete(`Yakin hapus lantai ${floor.name}?`, () => {
      let sites = [...(this.selectedProject.sites || [])];
      let siteIdx = sites.findIndex(s => s._id === this.selectedSite._id);
      let gIdx = sites[siteIdx].gedungList.findIndex((g: any) => g._id === this.selectedGedung._id);
      sites[siteIdx].gedungList[gIdx].floors = sites[siteIdx].gedungList[gIdx].floors.filter((f: any) => f._id !== floor._id);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.projectService.refreshProjects();
        this.cdr.detectChanges();
      };
      this.projectService.updateProject(this.selectedProject._id || this.selectedProject.id, { sites }).subscribe({
        next: () => finish(),
        error: (err) => { this.notifyError(err, 'Gagal menghapus.'); finish(); }
      });
      setTimeout(() => this.ngZone.run(() => finish()), 2000);
    });
  }

  // --- Confirm Modal Helper ---
  requestDelete(message: string, action: () => void) {
    this.confirmMessage = message;
    this.confirmAction = action;
    this.showConfirmModal = true;
  }

  /** Tampilkan kegagalan simpan/hapus agar aksi tidak terlihat berhasil diam-diam. */
  private notifyError(err: any, fallback: string) {
    const message = err?.status === 403
      ? 'Akses ditolak. Aksi ini hanya untuk role EOS.'
      : fallback;
    Swal.fire({
      icon: 'error',
      title: 'Gagal',
      text: message,
      confirmButtonColor: '#3b82f6'
    });
  }

  confirmDelete() {
    if (this.confirmAction) {
      this.confirmAction();
    }
    this.showConfirmModal = false;
  }
}

