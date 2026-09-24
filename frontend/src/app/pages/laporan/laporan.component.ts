import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { SiteDropdownComponent } from '../../components/site-dropdown/site-dropdown.component';
import { ProjectService } from '../../services/project.service';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-laporan',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SidebarComponent, SiteDropdownComponent],
  templateUrl: './laporan.component.html',
  styleUrls: ['./laporan.component.css']
})
export class LaporanComponent implements OnInit {
  constructor(
    private cdr: ChangeDetectorRef,
    private projectService: ProjectService,
    private api: ApiService,
    private auth: AuthService
  ) {}

  searchText = '';
  filterType = '';
  showModal = false;
  isEditing = false;
  editingId: string | null = null;
  loading = false;

  allDevices: any[] = [];
  filteredDevices: any[] = [];
  sites: string[] = [];

  get isClient(): boolean {
    return this.auth.isClient;
  }

  get currentUser(): string {
    return this.auth.user?.name || this.auth.user?.username || 'Admin';
  }

  newReport: any = {
    type: 'Jaringan',
    masalah: '',
    tindakan: '',
    site: '',
    gedung: '',
    lantai: '',
    ruangan: '',
    perangkatTerkait: ''
  };

  reports: any[] = [];

  ngOnInit() {
    this.projectService.sites$.subscribe(sites => {
      this.sites = sites || [];
      if (!this.newReport.site && this.sites.length > 0) {
        this.newReport.site = this.sites[0];
        this.filterDevicesBySite(this.newReport.site);
      }
      // App berjalan zoneless: beri tahu Angular agar pilihan site langsung ter-render.
      this.cdr.markForCheck();
    });

    this.loadReports();
    this.loadAllDevices();
  }

  async loadAllDevices() {
    try {
      const res = await this.api.fetch('/api/devices');
      const result = await res.json();
      if (result.success) {
        this.allDevices = result.devices || [];
        this.filterDevicesBySite(this.newReport.site);
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
    }
  }

  filterDevicesBySite(site: string) {
    if (!site) {
      this.filteredDevices = this.allDevices;
    } else {
      this.filteredDevices = this.allDevices.filter(
        d => d.siteLocation === site || d.site === site
      );
    }
  }

  onSiteChange() {
    this.filterDevicesBySite(this.newReport.site);
    this.newReport.perangkatTerkait = '';
  }

  onLaporanSiteSelected(event: { siteValue: string; buildingValue?: string; label: string }) {
    this.newReport.site = event.siteValue;
    this.onSiteChange();
  }

  async loadReports() {
    this.loading = true;
    try {
      const params = new URLSearchParams();
      if (this.searchText) params.append('search', this.searchText);
      if (this.filterType) params.append('type', this.filterType);

      const res = await this.api.fetch(`/api/laporan?${params.toString()}`);
      const result = await res.json();
      if (result.success) {
        this.reports = result.data;
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  closeModal() {
    this.showModal = false;
    this.isEditing = false;
    this.editingId = null;
    const defaultSite = this.sites[0] || '';
    this.newReport = {
      type: 'Jaringan',
      masalah: '',
      tindakan: '',
      site: defaultSite,
      gedung: '',
      lantai: '',
      ruangan: '',
      perangkatTerkait: ''
    };
    this.filterDevicesBySite(defaultSite);
    this.cdr.detectChanges();
  }

  openAddModal() {
    this.isEditing = false;
    this.showModal = true;
    this.filterDevicesBySite(this.newReport.site);
  }

  openEditModal(report: any) {
    this.isEditing = true;
    this.editingId = report._id;
    this.newReport = { ...report };
    this.filterDevicesBySite(report.site);
    this.showModal = true;
  }

  async saveReport() {
    if (!this.newReport.masalah || !this.newReport.tindakan) {
      Swal.fire({
        icon: 'error',
        title: 'Validasi Gagal',
        text: 'Masalah dan Tindakan wajib diisi',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    if (!this.newReport.site) {
      Swal.fire({
        icon: 'error',
        title: 'Validasi Gagal',
        text: 'Site wajib diisi. Buat project & site terlebih dahulu di halaman Project & Site.',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    const technicianName = this.currentUser;
    const payload: any = {
      type: this.newReport.type,
      masalah: this.newReport.masalah,
      tindakan: this.newReport.tindakan,
      site: this.newReport.site,
      gedung: this.newReport.gedung || '—',
      lantai: this.newReport.lantai || '—',
      ruangan: this.newReport.ruangan || '—',
      perangkatTerkait: this.newReport.perangkatTerkait || '—',
      technician: this.isEditing ? (this.newReport.technician || technicianName) : technicianName,
      date: this.isEditing ? this.newReport.date : new Date().toISOString().split('T')[0]
    };

    try {
      const url = this.isEditing
        ? `/api/laporan/${this.editingId}`
        : '/api/laporan';

      const method = this.isEditing ? 'PUT' : 'POST';

      const res = await this.api.fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (result.success) {
        this.closeModal();
        this.loadReports();
        Swal.fire({
          icon: 'success',
          title: 'Berhasil',
          text: this.isEditing ? 'Laporan berhasil diperbarui' : 'Laporan berhasil disimpan',
          timer: 2000,
          showConfirmButton: false
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Gagal',
          text: 'Gagal: ' + (result.error || 'Kesalahan server'),
          confirmButtonColor: '#3b82f6'
        });
        console.error('Save failed:', result);
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Gagal terhubung ke server',
        confirmButtonColor: '#3b82f6'
      });
      console.error('Error saving report:', err);
    }
  }

  async deleteReport(id: string) {
    const confirmResult = await Swal.fire({
      title: 'Hapus Laporan?',
      text: 'Apakah Anda yakin ingin menghapus laporan ini?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Ya, hapus!',
      cancelButtonText: 'Batal'
    });

    if (!confirmResult.isConfirmed) return;

    try {
      const res = await this.api.fetch(`/api/laporan/${id}`, {
        method: 'DELETE'
      });
      const result = await res.json();
      if (result.success) {
        this.loadReports();
        Swal.fire({
          icon: 'success',
          title: 'Dihapus!',
          text: 'Laporan berhasil dihapus',
          timer: 2000,
          showConfirmButton: false
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Gagal',
          text: 'Gagal menghapus: ' + result.error,
          confirmButtonColor: '#3b82f6'
        });
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Gagal terhubung ke server',
        confirmButtonColor: '#3b82f6'
      });
      console.error('Error deleting report:', err);
    }
  }

  async exportCSV() {
    const params = new URLSearchParams();
    if (this.searchText) params.append('search', this.searchText);
    if (this.filterType) params.append('type', this.filterType);
    try {
      await this.api.download(`/api/laporan/export/csv?${params.toString()}`);
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal',
        text: err?.message || 'Gagal mengunduh file.',
        confirmButtonColor: '#3b82f6'
      });
    }
  }
}
