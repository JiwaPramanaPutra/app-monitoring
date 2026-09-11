import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';

@Component({
  selector: 'app-pengguna',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent],
  templateUrl: './pengguna.component.html',
  styleUrls: ['./pengguna.component.css']
})
export class PenggunaComponent {
  showModal = false;

  get isClient(): boolean {
    const saved = localStorage.getItem('currentUser');
    if (saved) {
      return JSON.parse(saved).role === 'Client';
    }
    return true; // default aman: anggap Client jika tidak ada data
  }

  newUser = {
    name: '',
    role: 'Client',
    site: 'Semua site'
  };

  users = [
    {
      name: 'Rian Saputra',
      role: 'EOS',
      roleBg: '#E4E2F0',
      roleColor: '#3E3A6B',
      site: 'Semua site',
      lastLogin: '2024-01-15 14:32'
    },
    {
      name: 'Budi Santoso',
      role: 'Client',
      roleBg: '#FEF3C7',
      roleColor: '#92400E',
      site: 'Direktorat',
      lastLogin: '2024-01-15 13:45'
    },
    {
      name: 'Santi Wijaya',
      role: 'Client',
      roleBg: '#FEF3C7',
      roleColor: '#92400E',
      site: 'Keperawatan',
      lastLogin: '2024-01-14 16:20'
    },
    {
      name: 'Dr. Hendra',
      role: 'Client',
      roleBg: '#FEF3C7',
      roleColor: '#92400E',
      site: 'Semua site',
      lastLogin: '2024-01-15 09:15'
    },
    {
      name: 'Ahmad Fauzi',
      role: 'Client',
      roleBg: '#FEF3C7',
      roleColor: '#92400E',
      site: 'Gigi',
      lastLogin: '2024-01-13 15:30'
    }
  ];

  activityLogs = [
    { time: '14:32', timeColor: '#3E3A6B', message: 'Rian Saputra login ke sistem' },
    { time: '13:45', timeColor: '#6B7280', message: 'Budi Santoso menambahkan laporan baru' },
    { time: '13:20', timeColor: '#6B7280', message: 'Santi Wijaya mengubah data perangkat AP-Keperawatan-Lt1' },
    { time: '09:15', timeColor: '#92400E', message: 'Dr. Hendra melihat dashboard' },
    { time: '08:30', timeColor: '#6B7280', message: 'Ahmad Fauzi melakukan reboot AP-Gigi-Lt2' }
  ];

  closeModal() {
    this.showModal = false;
    this.newUser = {
      name: '',
      role: 'Client',
      site: 'Semua site'
    };
  }

  addUser() {
    let roleBg = '#F0F1F4';
    let roleColor = '#6B7280';

    if (this.newUser.role === 'EOS') {
      roleBg = '#E4E2F0';
      roleColor = '#3E3A6B';
    } else if (this.newUser.role === 'Client') {
      roleBg = '#FEF3C7';
      roleColor = '#92400E';
    }

    this.users.unshift({
      name: this.newUser.name,
      role: this.newUser.role,
      roleBg: roleBg,
      roleColor: roleColor,
      site: this.newUser.site,
      lastLogin: 'Belum pernah login'
    });

    this.closeModal();
  }
}
