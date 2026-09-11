import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';

@Component({
  selector: 'app-laporan',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent],
  templateUrl: './laporan.component.html',
  styleUrls: ['./laporan.component.css']
})
export class LaporanComponent {
  searchText = '';
  filterType = '';
  showModal = false;

  get isClient(): boolean {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved).role === 'Client' : true;
  }

  newReport = {
    type: 'Jaringan',
    masalah: '',
    tindakan: '',
    site: 'Direktorat',
    priority: 'Normal'
  };

  reports = [
    {
      date: '2024-01-15',
      type: 'Jaringan',
      masalah: 'AP-Gigi-Lt2 tidak merespons ping',
      tindakan: 'Restart perangkat dan cek kabel power',
      site: 'Gigi',
      technician: 'Rian',
      priority: 'Urgent',
      priorityBg: '#FDF2F0',
      priorityColor: '#C4442E'
    },
    {
      date: '2024-01-15',
      type: 'Jaringan',
      masalah: 'Penggantian kabel UTP rusak di Lab Komputer',
      tindakan: 'Mengganti kabel UTP Cat6 sepanjang 15 meter',
      site: 'Direktorat',
      technician: 'Budi',
      priority: 'Normal',
      priorityBg: '#EAF1E7',
      priorityColor: '#5B7A52'
    },
    {
      date: '2024-01-14',
      type: 'Printer / komputer',
      masalah: 'Printer Canon tidak terdeteksi di jaringan',
      tindakan: 'Restart printer service dan update driver',
      site: 'Keperawatan',
      technician: 'Santi',
      priority: 'Normal',
      priorityBg: '#EAF1E7',
      priorityColor: '#5B7A52'
    },
    {
      date: '2024-01-14',
      type: 'Jaringan',
      masalah: 'Konfigurasi ulang VLAN switch utama',
      tindakan: 'Setting VLAN 10, 20, 30 sesuai blueprint baru',
      site: 'Direktorat',
      technician: 'Rian',
      priority: 'Urgent',
      priorityBg: '#FDF2F0',
      priorityColor: '#C4442E'
    },
    {
      date: '2024-01-13',
      type: 'Monitoring kegiatan khusus',
      masalah: 'Monitoring bandwidth saat acara webinar',
      tindakan: 'Mengawasi traffic selama 3 jam acara berlangsung',
      site: 'Gizi',
      technician: 'Budi',
      priority: 'Normal',
      priorityBg: '#EAF1E7',
      priorityColor: '#5B7A52'
    }
  ];

  closeModal() {
    this.showModal = false;
    this.newReport = {
      type: 'Jaringan',
      masalah: '',
      tindakan: '',
      site: 'Direktorat',
      priority: 'Normal'
    };
  }

  addReport() {
    const today = new Date().toISOString().split('T')[0];
    this.reports.unshift({
      date: today,
      type: this.newReport.type,
      masalah: this.newReport.masalah,
      tindakan: this.newReport.tindakan,
      site: this.newReport.site,
      technician: 'Anda',
      priority: this.newReport.priority,
      priorityBg: this.newReport.priority === 'Urgent' ? '#FDF2F0' : '#EAF1E7',
      priorityColor: this.newReport.priority === 'Urgent' ? '#C4442E' : '#5B7A52'
    });
    this.closeModal();
  }
}
