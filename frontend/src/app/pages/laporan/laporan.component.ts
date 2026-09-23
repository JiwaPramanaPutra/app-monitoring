import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { SiteDropdownComponent } from '../../components/site-dropdown/site-dropdown.component';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-laporan',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, SiteDropdownComponent],
  templateUrl: './laporan.component.html',
  styleUrls: ['./laporan.component.css']
})
export class LaporanComponent implements OnInit {
  constructor(private cdr: ChangeDetectorRef) {}

  searchText = '';
  filterType = '';
  showModal = false;
  isEditing = false;
  editingId: string | null = null;
  loading = false;

  allDevices: any[] = [];
  filteredDevices: any[] = [];

  get isClient(): boolean {
    try {
      const saved = localStorage.getItem('currentUser');
      return saved ? JSON.parse(saved).role === 'Client' : true;
    } catch { return true; }
  }

  get currentUser(): string {
    try {
      const saved = localStorage.getItem('currentUser');
      if (!saved) return 'Admin';
      const user = JSON.parse(saved);
      // field bisa 'name' atau 'username' tergantung versi login
      return user.name || user.username || user.email || 'Admin';
    } catch { return 'Admin'; }
  }

  newReport: any = {
    type: 'Jaringan',
    masalah: '',
    tindakan: '',
    site: 'Direktorat',
    gedung: '',
    lantai: '',
    ruangan: '',
    perangkatTerkait: ''
  };

  reports: any[] = [];

  ngOnInit() {
    this.loadReports();
    this.loadAllDevices();
  }

  async loadAllDevices() {
    try {
      const res = await fetch('http://localhost:3000/api/devices');
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

      const res = await fetch(`http://localhost:3000/api/laporan?${params.toString()}`);
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
    this.newReport = {
      type: 'Jaringan',
      masalah: '',
      tindakan: '',
      site: 'Direktorat',
      gedung: '',
      lantai: '',
      ruangan: '',
      perangkatTerkait: ''
    };
    this.filterDevicesBySite('Direktorat');
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
        ? `http://localhost:3000/api/laporan/${this.editingId}`
        : 'http://localhost:3000/api/laporan';

      const method = this.isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
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
      const res = await fetch(`http://localhost:3000/api/laporan/${id}`, {
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

  exportCSV() {
    const params = new URLSearchParams();
    if (this.searchText) params.append('search', this.searchText);
    if (this.filterType) params.append('type', this.filterType);
    window.open(`http://localhost:3000/api/laporan/export/csv?${params.toString()}`, '_blank');
  }
}
