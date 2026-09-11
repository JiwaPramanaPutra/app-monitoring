import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';

export interface MonitoringDevice {
  id: number;
  status: 'Online' | 'Offline';
  type: 'Access Point' | 'Switch' | 'Router' | 'Server';
  name: string;
  brand: string;
  model: string;
  mac: string;
  ip: string;
  client: string;
  signal: string;
  gedung: string;
  lantai: string;
  ruangan: string;
  siteLocation: string;
}

@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent],
  templateUrl: './monitoring.component.html',
  styleUrls: ['./monitoring.component.css']
})
export class MonitoringComponent implements OnInit {
  sites = ['Direktorat', 'Gigi', 'Keperawatan', 'Gizi', 'Kebidanan'];
  selectedSite = 'Direktorat';
  searchText = '';
  statusFilter = ''; // 'down' or empty
  showAddModal = false;

  // Pagination
  currentPage = 1;
  pageSize = 10;

  // Dropdown action menu
  activeDropdown: number | null = null;

  // Detail modal
  selectedDevice: MonitoringDevice | null = null;
  showDetailModal = false;

  // Reboot modal
  showRebootModal = false;
  isRebooting = false;
  rebootTargetDevice: MonitoringDevice | null = null;

  // Management modal
  showManagementModal = false;
  managementTargetDevice: MonitoringDevice | null = null;
  pingStatus: 'idle' | 'pinging' | 'success' = 'idle';

  // Delete modal
  showDeleteModal = false;
  deleteTargetDevice: MonitoringDevice | null = null;

  // Toast notification
  toast: { message: string; type: 'success' | 'alert' | 'info'; visible: boolean } = {
    message: '',
    type: 'info',
    visible: false
  };
  private toastTimer: any = null;

  newDevice: any = this.getEmptyDevice();

  constructor(private route: ActivatedRoute) { }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['site'] && this.sites.includes(params['site'])) {
        this.selectedSite = params['site'];
      }
      if (params['status']) {
        this.statusFilter = params['status'].toLowerCase();
      }
    });
  }

  get isClient(): boolean {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved).role === 'Client' : true;
  }

  get currentRole(): string {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved).role : 'Client';
  }

  get filteredDevices(): MonitoringDevice[] {
    let list = this.devices;

    // Filter by status if query param status=down
    if (this.statusFilter === 'down' || this.statusFilter === 'offline') {
      list = list.filter(d => d.status.toLowerCase() === 'offline');
    }

    // Filter by site
    if (this.selectedSite) {
      list = list.filter(d => d.siteLocation === this.selectedSite);
    }

    // Filter by search text
    if (this.searchText && this.searchText.trim()) {
      const q = this.searchText.toLowerCase().trim();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.ip.toLowerCase().includes(q) ||
        d.mac.toLowerCase().includes(q) ||
        d.gedung.toLowerCase().includes(q) ||
        d.ruangan.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q)
      );
    }

    return list;
  }

  get pagedDevices(): MonitoringDevice[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredDevices.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredDevices.length / this.pageSize));
  }

  get startIndex(): number {
    if (this.filteredDevices.length === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get endIndex(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredDevices.length);
  }

  selectSite(site: string) {
    this.selectedSite = site;
    this.currentPage = 1;
  }

  clearStatusFilter() {
    this.statusFilter = '';
    this.currentPage = 1;
  }

  prevPage() {
    if (this.currentPage > 1) this.currentPage--;
  }

  nextPage() {
    if (this.currentPage < this.totalPages) this.currentPage++;
  }

  // ── Actions & Modals ──────────────────────────────────────────

  toggleDropdown(deviceId: number, event: Event) {
    event.stopPropagation();
    this.activeDropdown = this.activeDropdown === deviceId ? null : deviceId;
  }

  closeDropdown() {
    this.activeDropdown = null;
  }

  // Detail Modal
  openDeviceDetail(device: MonitoringDevice) {
    this.selectedDevice = device;
    this.showDetailModal = true;
    this.activeDropdown = null;
  }

  closeDetailModal() {
    this.showDetailModal = false;
    this.selectedDevice = null;
  }

  // Reboot Modal
  rebootDevice(device: MonitoringDevice) {
    this.activeDropdown = null;
    this.rebootTargetDevice = device;
    this.isRebooting = false;
    this.showRebootModal = true;
  }

  closeRebootModal() {
    if (this.isRebooting) return;
    this.showRebootModal = false;
    this.rebootTargetDevice = null;
  }

  confirmReboot() {
    if (!this.rebootTargetDevice) return;
    this.isRebooting = true;

    setTimeout(() => {
      this.isRebooting = false;
      const dev = this.rebootTargetDevice;
      this.showRebootModal = false;

      // Catat ke audit log
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      this.activityLogs.unshift({
        time: timeStr,
        user: this.currentRole,
        message: `melakukan reboot ${dev?.name}`,
        status: 'Success'
      });

      this.showToastNotification(`Perangkat ${dev?.name} berhasil direboot.`, 'success');
      this.rebootTargetDevice = null;
    }, 1200);
  }

  // Management Modal
  openManagement(device: MonitoringDevice) {
    this.activeDropdown = null;
    this.managementTargetDevice = device;
    this.pingStatus = 'idle';
    this.showManagementModal = true;
  }

  closeManagementModal() {
    this.showManagementModal = false;
    this.managementTargetDevice = null;
    this.pingStatus = 'idle';
  }

  testPing() {
    this.pingStatus = 'pinging';
    setTimeout(() => {
      this.pingStatus = 'success';
      this.showToastNotification(
        `Ping ${this.managementTargetDevice?.ip}: RTT = 2ms, 0% packet loss (Reachable)`,
        'info'
      );
    }, 800);
  }

  openExternalManagement() {
    if (!this.managementTargetDevice) return;
    const url = `http://${this.managementTargetDevice.ip}`;
    window.open(url, '_blank');
    this.showToastNotification(`Membuka Web Console ${this.managementTargetDevice.ip}...`, 'info');
  }

  // Delete Modal
  deleteDevice(device: MonitoringDevice) {
    this.activeDropdown = null;
    this.deleteTargetDevice = device;
    this.showDeleteModal = true;
  }

  closeDeleteModal() {
    this.showDeleteModal = false;
    this.deleteTargetDevice = null;
  }

  confirmDelete() {
    if (!this.deleteTargetDevice) return;
    const dev = this.deleteTargetDevice;
    this.devices = this.devices.filter(d => d.id !== dev.id);

    // Catat ke audit log
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.activityLogs.unshift({
      time: timeStr,
      user: this.currentRole,
      message: `menghapus perangkat: ${dev.name}`,
      status: 'Alert'
    });

    if (this.selectedDevice?.id === dev.id) {
      this.closeDetailModal();
    }
    this.showDeleteModal = false;
    this.showToastNotification(`Perangkat "${dev.name}" telah dihapus.`, 'alert');
    this.deleteTargetDevice = null;
  }

  // Toast Notification System
  showToastNotification(message: string, type: 'success' | 'alert' | 'info' = 'info') {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toast = { message, type, visible: true };
    this.toastTimer = setTimeout(() => {
      this.toast.visible = false;
    }, 3500);
  }

  closeToast() {
    this.toast.visible = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  copyToClipboard(text: string, label: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      this.showToastNotification(`${label} (${text}) disalin ke clipboard!`, 'info');
    }
  }

  // Add Device Modal
  openAddDeviceModal() {
    this.newDevice = this.getEmptyDevice();
    this.showAddModal = true;
  }

  closeModal() {
    this.showAddModal = false;
  }

  saveDevice() {
    if (!this.newDevice.nama || !this.newDevice.nama.trim()) {
      this.showToastNotification('Nama perangkat wajib diisi!', 'alert');
      return;
    }

    const nextId = this.devices.length > 0
      ? Math.max(...this.devices.map(d => d.id)) + 1
      : 1;

    const deviceToAdd: MonitoringDevice = {
      id: nextId,
      status: 'Online',
      type: this.newDevice.tipePerangkat,
      name: this.newDevice.nama.trim(),
      brand: this.newDevice.brand || 'Ruijie',
      model: this.newDevice.model || 'RAP2200',
      mac: this.newDevice.macAddress || '—',
      ip: this.newDevice.ipAddress || '—',
      client: '0',
      signal: this.newDevice.tipePerangkat === 'Access Point' ? '-68 dBm' : '—',
      gedung: this.newDevice.gedung || '—',
      lantai: this.newDevice.lantai || '—',
      ruangan: this.newDevice.ruangan || '—',
      siteLocation: this.newDevice.siteLocation || this.selectedSite
    };

    this.devices.unshift(deviceToAdd);

    // Catat ke audit log
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.activityLogs.unshift({
      time: timeStr,
      user: this.currentRole,
      message: `menambahkan perangkat baru: ${deviceToAdd.name}`,
      status: 'Normal'
    });

    this.showToastNotification(`Perangkat ${deviceToAdd.name} berhasil ditambahkan.`, 'success');
    this.closeModal();
  }

  getEmptyDevice() {
    return {
      siteLocation: this.selectedSite || 'Direktorat',
      tipePerangkat: 'Access Point',
      nama: '',
      brand: '',
      model: '',
      serialNumber: '',
      macAddress: '',
      ipAddress: '',
      gateway: '',
      managementProvider: 'Ruijie Cloud',
      externalDeviceId: '',
      managementUrl: '',
      gedung: '',
      lantai: '',
      ruangan: '',
      capabilities: {
        reboot: true,
        webManagement: true,
        cli: true,
        activityLogs: true
      }
    };
  }

  // ── Dummy Devices Dataset (Across 5 Sites) ──────────────────────────
  devices: MonitoringDevice[] = [
    // Direktorat (15 devices)
    { id: 1, status: 'Online', type: 'Access Point', name: 'AP-DIR-GD.TLM-Lt1-R.Sekretariat', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0C:C0', ip: '172.16.10.2', client: '5', signal: '-65 dBm', gedung: 'GD. TLM', lantai: 'Lt. 1', ruangan: 'R. Sekretariat', siteLocation: 'Direktorat' },
    { id: 2, status: 'Online', type: 'Access Point', name: 'AP-DIR-GD.TLM-Lt1-R.Kemahasiswaan', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0D:10', ip: '172.16.10.3', client: '3', signal: '-58 dBm', gedung: 'GD. TLM', lantai: 'Lt. 1', ruangan: 'R. Kemahasiswaan', siteLocation: 'Direktorat' },
    { id: 3, status: 'Online', type: 'Access Point', name: 'AP-DIR-GD.TLM-Lt2-R.Keuangan', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0D:20', ip: '172.16.10.4', client: '7', signal: '-61 dBm', gedung: 'GD. TLM', lantai: 'Lt. 2', ruangan: 'R. Keuangan', siteLocation: 'Direktorat' },
    { id: 4, status: 'Online', type: 'Access Point', name: 'AP-DIR-GD.TLM-Lt2-R.Kepegawaian', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0D:30', ip: '172.16.10.5', client: '4', signal: '-63 dBm', gedung: 'GD. TLM', lantai: 'Lt. 2', ruangan: 'R. Kepegawaian', siteLocation: 'Direktorat' },
    { id: 5, status: 'Online', type: 'Access Point', name: 'AP-DIR-GD.TLM-Lt3-R.Direktur', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0D:40', ip: '172.16.10.6', client: '2', signal: '-55 dBm', gedung: 'GD. TLM', lantai: 'Lt. 3', ruangan: 'R. Direktur', siteLocation: 'Direktorat' },
    { id: 6, status: 'Online', type: 'Access Point', name: 'AP-DIR-GD.TLM-Lt3-Aula', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0D:50', ip: '172.16.10.7', client: '20', signal: '-60 dBm', gedung: 'GD. TLM', lantai: 'Lt. 3', ruangan: 'Aula', siteLocation: 'Direktorat' },
    { id: 7, status: 'Offline', type: 'Access Point', name: 'AP-DIR-GD.TLM-Lt4-R.Rapat', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0D:60', ip: '172.16.10.8', client: '0', signal: '—', gedung: 'GD. TLM', lantai: 'Lt. 4', ruangan: 'R. Rapat', siteLocation: 'Direktorat' },
    { id: 8, status: 'Online', type: 'Switch', name: 'SW-DIR-GD.TLM-Lt1-Core', brand: 'Ruijie', model: 'RG-S2910', mac: 'AA:BB:CC:DD:01:01', ip: '172.16.10.1', client: '—', signal: '—', gedung: 'GD. TLM', lantai: 'Lt. 1', ruangan: 'R. Server', siteLocation: 'Direktorat' },
    { id: 9, status: 'Online', type: 'Access Point', name: 'AP-DIR-GD.SPMI-Lt1-R.SPMI', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0E:10', ip: '172.16.11.2', client: '6', signal: '-67 dBm', gedung: 'GD. SPMI', lantai: 'Lt. 1', ruangan: 'R. SPMI', siteLocation: 'Direktorat' },
    { id: 10, status: 'Online', type: 'Access Point', name: 'AP-DIR-GD.SPMI-Lt2-R.Kerja', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0E:20', ip: '172.16.11.3', client: '4', signal: '-62 dBm', gedung: 'GD. SPMI', lantai: 'Lt. 2', ruangan: 'R. Kerja', siteLocation: 'Direktorat' },
    { id: 11, status: 'Online', type: 'Switch', name: 'SW-DIR-GD.SPMI-Lt1', brand: 'Ruijie', model: 'RG-S1910', mac: 'AA:BB:CC:DD:02:01', ip: '172.16.11.1', client: '—', signal: '—', gedung: 'GD. SPMI', lantai: 'Lt. 1', ruangan: 'R. Panel', siteLocation: 'Direktorat' },
    { id: 12, status: 'Online', type: 'Access Point', name: 'AP-DIR-GD.Perpus-Lt1-Lantai1', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0F:10', ip: '172.16.12.2', client: '15', signal: '-59 dBm', gedung: 'GD. Perpustakaan', lantai: 'Lt. 1', ruangan: 'Ruang Baca', siteLocation: 'Direktorat' },
    { id: 13, status: 'Online', type: 'Access Point', name: 'AP-DIR-GD.Perpus-Lt2-Lantai2', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0F:20', ip: '172.16.12.3', client: '10', signal: '-64 dBm', gedung: 'GD. Perpustakaan', lantai: 'Lt. 2', ruangan: 'Ruang Referensi', siteLocation: 'Direktorat' },
    { id: 14, status: 'Offline', type: 'Access Point', name: 'AP-DIR-GD.Perpus-Lt3-Lantai3', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:71:0F:30', ip: '172.16.12.4', client: '0', signal: '—', gedung: 'GD. Perpustakaan', lantai: 'Lt. 3', ruangan: 'Ruang Multimedia', siteLocation: 'Direktorat' },
    { id: 15, status: 'Online', type: 'Switch', name: 'SW-DIR-GD.Perpus-Lt1', brand: 'Ruijie', model: 'RG-S1910', mac: 'AA:BB:CC:DD:03:01', ip: '172.16.12.1', client: '—', signal: '—', gedung: 'GD. Perpustakaan', lantai: 'Lt. 1', ruangan: 'R. Panel', siteLocation: 'Direktorat' },

    // Gigi (5 devices)
    { id: 16, status: 'Online', type: 'Access Point', name: 'AP-GIGI-Lt1-Klinik', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:72:0A:10', ip: '172.16.20.2', client: '8', signal: '-62 dBm', gedung: 'GD. Gigi', lantai: 'Lt. 1', ruangan: 'Klinik Gigi', siteLocation: 'Gigi' },
    { id: 17, status: 'Online', type: 'Access Point', name: 'AP-GIGI-Lt1-Laboratorium', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:72:0A:20', ip: '172.16.20.3', client: '12', signal: '-58 dBm', gedung: 'GD. Gigi', lantai: 'Lt. 1', ruangan: 'Lab Phantom', siteLocation: 'Gigi' },
    { id: 18, status: 'Online', type: 'Access Point', name: 'AP-GIGI-Lt2-R.Dosen', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:72:0A:30', ip: '172.16.20.4', client: '6', signal: '-60 dBm', gedung: 'GD. Gigi', lantai: 'Lt. 2', ruangan: 'R. Dosen Gigi', siteLocation: 'Gigi' },
    { id: 19, status: 'Online', type: 'Access Point', name: 'AP-GIGI-Lt2-R.Kuliah1', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:72:0A:40', ip: '172.16.20.5', client: '18', signal: '-63 dBm', gedung: 'GD. Gigi', lantai: 'Lt. 2', ruangan: 'RK 201', siteLocation: 'Gigi' },
    { id: 20, status: 'Online', type: 'Switch', name: 'SW-GIGI-Lt1-Dist', brand: 'Ruijie', model: 'RG-S2910', mac: 'AA:BB:CC:DD:04:01', ip: '172.16.20.1', client: '—', signal: '—', gedung: 'GD. Gigi', lantai: 'Lt. 1', ruangan: 'R. Server Gigi', siteLocation: 'Gigi' },

    // Keperawatan (6 devices)
    { id: 21, status: 'Online', type: 'Access Point', name: 'AP-KEP-Lt1-Auditorium', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:73:0A:10', ip: '172.16.30.2', client: '25', signal: '-57 dBm', gedung: 'GD. Keperawatan', lantai: 'Lt. 1', ruangan: 'Auditorium', siteLocation: 'Keperawatan' },
    { id: 22, status: 'Online', type: 'Access Point', name: 'AP-KEP-Lt1-R.Admin', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:73:0A:20', ip: '172.16.30.3', client: '5', signal: '-64 dBm', gedung: 'GD. Keperawatan', lantai: 'Lt. 1', ruangan: 'R. Administrasi', siteLocation: 'Keperawatan' },
    { id: 23, status: 'Online', type: 'Access Point', name: 'AP-KEP-Lt2-Lab.MiniHospital', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:73:0A:30', ip: '172.16.30.4', client: '14', signal: '-61 dBm', gedung: 'GD. Keperawatan', lantai: 'Lt. 2', ruangan: 'Mini Hospital', siteLocation: 'Keperawatan' },
    { id: 24, status: 'Online', type: 'Access Point', name: 'AP-KEP-Lt2-R.Dosen', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:73:0A:40', ip: '172.16.30.5', client: '9', signal: '-59 dBm', gedung: 'GD. Keperawatan', lantai: 'Lt. 2', ruangan: 'R. Dosen', siteLocation: 'Keperawatan' },
    { id: 25, status: 'Online', type: 'Access Point', name: 'AP-KEP-Lt3-Lab.Anatomi', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:73:0A:50', ip: '172.16.30.6', client: '11', signal: '-66 dBm', gedung: 'GD. Keperawatan', lantai: 'Lt. 3', ruangan: 'Lab Anatomi', siteLocation: 'Keperawatan' },
    { id: 26, status: 'Online', type: 'Switch', name: 'SW-KEP-Lt1-Dist', brand: 'Ruijie', model: 'RG-S2910', mac: 'AA:BB:CC:DD:05:01', ip: '172.16.30.1', client: '—', signal: '—', gedung: 'GD. Keperawatan', lantai: 'Lt. 1', ruangan: 'R. Server KEP', siteLocation: 'Keperawatan' },

    // Gizi (4 devices)
    { id: 27, status: 'Online', type: 'Access Point', name: 'AP-GIZ-Lt1-Lab.Kuliner', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:74:0A:10', ip: '172.16.40.2', client: '8', signal: '-65 dBm', gedung: 'GD. Gizi', lantai: 'Lt. 1', ruangan: 'Lab Kuliner', siteLocation: 'Gizi' },
    { id: 28, status: 'Online', type: 'Access Point', name: 'AP-GIZ-Lt1-R.Dosen', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:74:0A:20', ip: '172.16.40.3', client: '4', signal: '-60 dBm', gedung: 'GD. Gizi', lantai: 'Lt. 1', ruangan: 'R. Dosen Gizi', siteLocation: 'Gizi' },
    { id: 29, status: 'Online', type: 'Access Point', name: 'AP-GIZ-Lt2-Lab.Dietetik', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:74:0A:30', ip: '172.16.40.4', client: '12', signal: '-62 dBm', gedung: 'GD. Gizi', lantai: 'Lt. 2', ruangan: 'Lab Dietetik', siteLocation: 'Gizi' },
    { id: 30, status: 'Online', type: 'Switch', name: 'SW-GIZ-Lt1-Dist', brand: 'Ruijie', model: 'RG-S2910', mac: 'AA:BB:CC:DD:06:01', ip: '172.16.40.1', client: '—', signal: '—', gedung: 'GD. Gizi', lantai: 'Lt. 1', ruangan: 'R. Panel Gizi', siteLocation: 'Gizi' },

    // Kebidanan (5 devices)
    { id: 31, status: 'Online', type: 'Access Point', name: 'AP-KEB-Lt1-Lab.Kebidanan', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:75:0A:10', ip: '172.16.50.2', client: '16', signal: '-58 dBm', gedung: 'GD. Kebidanan', lantai: 'Lt. 1', ruangan: 'Lab Praktik', siteLocation: 'Kebidanan' },
    { id: 32, status: 'Online', type: 'Access Point', name: 'AP-KEB-Lt1-R.Dosen', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:75:0A:20', ip: '172.16.50.3', client: '7', signal: '-63 dBm', gedung: 'GD. Kebidanan', lantai: 'Lt. 1', ruangan: 'R. Dosen', siteLocation: 'Kebidanan' },
    { id: 33, status: 'Online', type: 'Access Point', name: 'AP-KEB-Lt2-R.Kuliah', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:75:0A:30', ip: '172.16.50.4', client: '22', signal: '-60 dBm', gedung: 'GD. Kebidanan', lantai: 'Lt. 2', ruangan: 'RK 302', siteLocation: 'Kebidanan' },
    { id: 34, status: 'Online', type: 'Access Point', name: 'AP-KEB-Lt2-Lab.Konseling', brand: 'Ruijie', model: 'RG-AP180', mac: 'E8:BA:70:75:0A:40', ip: '172.16.50.5', client: '6', signal: '-65 dBm', gedung: 'GD. Kebidanan', lantai: 'Lt. 2', ruangan: 'Lab Konseling', siteLocation: 'Kebidanan' },
    { id: 35, status: 'Online', type: 'Switch', name: 'SW-KEB-Lt1-Dist', brand: 'Ruijie', model: 'RG-S2910', mac: 'AA:BB:CC:DD:07:01', ip: '172.16.50.1', client: '—', signal: '—', gedung: 'GD. Kebidanan', lantai: 'Lt. 1', ruangan: 'R. Server KEB', siteLocation: 'Kebidanan' },
  ];

  activityLogs = [
    { time: '14:32', user: 'Rian', message: 'melakukan reboot AP-Lab2-Lt3', status: 'Success' },
    { time: '14:18', user: 'System', message: 'mendeteksi AP-DIR-GD.TLM-Lt4-R.Rapat offline', status: 'Alert' },
    { time: '13:45', user: 'Budi', message: 'menambahkan perangkat baru: SW-Kebidanan-R12', status: 'Normal' },
    { time: '12:20', user: 'System', message: 'backup konfigurasi router berhasil', status: 'Success' }
  ];
}