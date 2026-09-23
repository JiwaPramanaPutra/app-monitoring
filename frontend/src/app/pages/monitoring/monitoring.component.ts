import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { SiteDropdownComponent } from '../../components/site-dropdown/site-dropdown.component';
import { ProjectService } from '../../services/project.service';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

export interface MonitoringDevice {
  _id?: string;
  id: number | string;
  status: 'Online' | 'Offline';
  type: 'Access Point' | 'Switch' | 'Router' | 'Server';
  name: string;
  brand: string;
  model: string;
  mac: string;
  ip: string;
  client: string;
  pingTime?: string;
  signal: string;
  gedung: string;
  lantai: string;
  ruangan: string;
  siteLocation: string;
}

export interface TrafficBar {
  x: number;
  txY: number;
  txHeight: number;
  rxY: number;
  rxHeight: number;
}

@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SidebarComponent, SiteDropdownComponent],
  templateUrl: './monitoring.component.html',
  styleUrls: ['./monitoring.component.css']
})
export class MonitoringComponent implements OnInit, OnDestroy {
  sites: string[] = [];
  selectedSite = '';
  selectedSiteLabel = '';
  searchText = '';
  statusFilter = ''; // 'down' or empty
  showAddModal = false;

  // ── Router Traffic State ───────────────────────────────────────────
  routerTraffic = {
    ip: '—',
    interface: 'ether1-WAN',
    source: '',
    txMbps: 0,
    rxMbps: 0,
    txBps: 0,
    rxBps: 0,
    connected: false,
    siteConfigured: false,
    routerModel: ''
  };

  // Sparkline bar visualization & metrics
  chartBars: TrafficBar[] = [];
  scaleCeil: number = 10;
  chartYUnit: string = 'Kbps';
  lastRx: string = '0 Kbps';
  lastTx: string = '0 Kbps';
  peakRate: string = '0 Kbps';
  avgRate: string = '0 Kbps';

  private trafficHistory: { txBps: number; rxBps: number }[] = [];
  private trafficTimer: any = null;
  private deviceStatusTimer: any = null;
  readonly DEVICE_REFRESH_INTERVAL = 30000;
  private readonly MAX_HISTORY = 45;

  // Pagination
  currentPage = 1;
  pageSize = 10;

  // Dropdown action menu
  activeDropdown: number | string | null = null;

  // Detail modal
  selectedDevice: MonitoringDevice | null = null;
  showDetailModal = false;

  // Management modal
  showManagementModal = false;
  managementTargetDevice: MonitoringDevice | null = null;
  pingStatus: 'idle' | 'pinging' | 'success' | 'failed' = 'idle';
  pingResultInfo: string = '';

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

  // Edit modal
  showEditModal = false;
  isSavingEdit = false;
  editingDevice: any = {};

  newDevice: any = this.getEmptyDevice();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private projectService: ProjectService,
    private api: ApiService,
    private auth: AuthService
  ) {}

  ngOnInit() {
    // Daftar site mengikuti data project (dinamis, bukan hardcoded)
    this.projectService.sites$.subscribe(sites => {
      this.sites = sites || [];
      if (this.sites.length === 0) return;

      const requested = this.selectedSite || this.route.snapshot.queryParams['site'];
      const next = requested && this.sites.includes(requested) ? requested : this.sites[0];
      if (next !== this.selectedSite) {
        this.selectedSiteLabel = next;
        this.selectSite(next);
      }
    });

    this.route.queryParams.subscribe(params => {
      if (params['site'] && this.sites.includes(params['site']) && params['site'] !== this.selectedSite) {
        this.selectedSiteLabel = params['site'];
        this.selectSite(params['site']);
      }
      if (params['status']) {
        this.statusFilter = params['status'].toLowerCase();
      }
    });

    // Mulai polling data traffic router setiap 2 detik
    this.trafficTimer = setInterval(() => {
      if (this.selectedSite) this.fetchRouterTraffic();
    }, 2000);

    // Auto-refresh status perangkat setiap 30 detik
    this.deviceStatusTimer = setInterval(() => {
      this.refreshDeviceStatus();
    }, this.DEVICE_REFRESH_INTERVAL);
  }

  ngOnDestroy() {
    if (this.trafficTimer) {
      clearInterval(this.trafficTimer);
      this.trafficTimer = null;
    }
    if (this.deviceStatusTimer) {
      clearInterval(this.deviceStatusTimer);
      this.deviceStatusTimer = null;
    }
  }

// Inisialisasi perangkat + cek status real via ping
  async initDevices() {
    try {
      const site = encodeURIComponent(this.selectedSite);
      const res = await this.api.fetch(`/api/devices/status?site=${site}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.devices) {
          this.devices = data.devices;
          this.cdr.markForCheck();
          return;
        }
      }
    } catch (e) { /* fallback below */ }
    try {
      const fallback = await this.api.fetch('/api/devices');
      if (fallback.ok) {
        const data = await fallback.json();
        if (data && data.devices) this.devices = data.devices;
      }
    } catch (e) {
      console.warn('Gagal memuat perangkat:', e);
    }
    this.cdr.markForCheck();
  }

  onSiteSelected(event: { siteValue: string; buildingValue?: string; label: string }) {
    this.selectedSiteLabel = event.label;
    this.selectSite(event.siteValue);
  }

  // Refresh status + client count tanpa reload seluruh halaman (dipanggil tiap 30 detik)
  async refreshDeviceStatus() {
    if (this.devices.length === 0) return;
    try {
      const site = encodeURIComponent(this.selectedSite);
      const res = await this.api.fetch(`/api/devices/status?site=${site}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.devices) {
        const updMap: Record<string, any> = {};
        data.devices.forEach((d: any) => { updMap[String(d._id || d.id)] = d; });
        this.devices = this.devices.map(d => {
          const key = String(d._id || d.id);
          if (updMap[key]) {
            return { ...d, status: updMap[key].status as any, client: updMap[key].client, pingTime: updMap[key].pingTime };
          }
          return d;
        });
        this.cdr.markForCheck();
      }
    } catch (e) { /* silent */ }
  }

  fetchRouterTraffic() {
    this.api.fetch(`/api/router/traffic?site=${encodeURIComponent(this.selectedSite)}`)
      .then(res => res.json())
      .then(data => {
        // Hanya proses traffic jika site memang terkonfigurasi pada backend
        if (data && data.siteConfigured && data.connected && typeof data.txMbps === 'number') {
          this.routerTraffic.ip = data.ip || '—';
          this.routerTraffic.interface = data.interface || '—';
          this.routerTraffic.source = data.source || '';
          this.routerTraffic.txMbps = data.txMbps;
          this.routerTraffic.rxMbps = data.rxMbps;
          this.routerTraffic.txBps = data.txBps || 0;
          this.routerTraffic.rxBps = data.rxBps || 0;
          this.routerTraffic.connected = true;
          this.routerTraffic.siteConfigured = true;
          this.routerTraffic.routerModel = data.routerModel || '';

          this.updateTrafficMetrics(this.routerTraffic.txBps, this.routerTraffic.rxBps);
        } else {
          // Site belum terkonfigurasi atau tidak connected
          this.routerTraffic.connected = false;
          this.routerTraffic.siteConfigured = data?.siteConfigured || false;
          this.routerTraffic.ip = data?.siteConfigured ? (data.ip || '—') : '—';
          this.routerTraffic.interface = data?.siteConfigured ? (data.interface || '—') : '—';
          this.routerTraffic.routerModel = data?.siteConfigured ? (data.routerModel || '') : '';
          this.routerTraffic.txBps = 0;
          this.routerTraffic.rxBps = 0;
          this.routerTraffic.txMbps = 0;
          this.routerTraffic.rxMbps = 0;
          this.lastTx = '0 Kbps';
          this.lastRx = '0 Kbps';
          this.trafficHistory = [];
          this.chartBars = [];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.routerTraffic.connected = false;
        this.routerTraffic.siteConfigured = false;
        this.lastTx = '0 Kbps';
        this.lastRx = '0 Kbps';
        this.trafficHistory = [];
        this.chartBars = [];
        this.cdr.markForCheck();
      });
  }

  private updateTrafficMetrics(txBps: number, rxBps: number) {
    this.trafficHistory.push({ txBps, rxBps });
    if (this.trafficHistory.length > this.MAX_HISTORY) {
      this.trafficHistory.shift();
    }

    this.lastTx = this.formatBps(txBps);
    this.lastRx = this.formatBps(rxBps);

    // Hitung peak dan average dari total traffic (tx + rx) di window riwayat
    let maxCombinedBps = 0;
    let sumCombinedBps = 0;
    let maxSingleKbps = 0;

    for (const p of this.trafficHistory) {
      const combined = p.txBps + p.rxBps;
      if (combined > maxCombinedBps) maxCombinedBps = combined;
      sumCombinedBps += combined;

      const txKbps = p.txBps / 1000;
      const rxKbps = p.rxBps / 1000;
      if (txKbps > maxSingleKbps) maxSingleKbps = txKbps;
      if (rxKbps > maxSingleKbps) maxSingleKbps = rxKbps;
    }

    this.peakRate = this.formatBps(maxCombinedBps);
    this.avgRate = this.formatBps(this.trafficHistory.length > 0 ? sumCombinedBps / this.trafficHistory.length : 0);

    // Hitung dynamic ceiling scale
    this.calculateScale(maxSingleKbps);

    // Hitung SVG bar points
    this.generateChartBars();
  }

  private calculateScale(rawMaxKbps: number) {
    if (rawMaxKbps >= 1000) {
      this.chartYUnit = 'Mbps';
      const maxMbps = rawMaxKbps / 1000;
      const target = maxMbps * 1.18;
      const steps = [1, 2, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000];
      this.scaleCeil = steps.find(s => s >= target) || Math.ceil(target / 50) * 50;
    } else if (rawMaxKbps >= 50) {
      this.chartYUnit = 'Kbps';
      const target = rawMaxKbps * 1.18;
      const steps = [60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000];
      this.scaleCeil = steps.find(s => s >= target) || Math.ceil(target / 50) * 50;
    } else if (rawMaxKbps >= 10) {
      this.chartYUnit = 'Kbps';
      const target = rawMaxKbps * 1.2;
      const steps = [15, 20, 25, 30, 40, 50];
      this.scaleCeil = steps.find(s => s >= target) || 50;
    } else if (rawMaxKbps > 0) {
      this.chartYUnit = 'Kbps';
      const target = rawMaxKbps * 1.25;
      const steps = [2, 4, 6, 8, 10];
      this.scaleCeil = steps.find(s => s >= target) || 10;
    } else {
      this.chartYUnit = 'Kbps';
      this.scaleCeil = 10;
    }
  }

  private generateChartBars() {
    const ceilKbps = this.chartYUnit === 'Mbps' ? this.scaleCeil * 1000 : this.scaleCeil;
    const maxBarHeight = 78;
    const rightMargin = 10;
    const slotWidth = 20; // Ruang antar grup bar (rapat)

    const bars: TrafficBar[] = [];
    const count = this.trafficHistory.length;

    for (let i = 0; i < count; i++) {
      const item = this.trafficHistory[i];
      const reverseIdx = count - 1 - i;
      const x = 1000 - rightMargin - (reverseIdx * slotWidth);

      const txKbps = item.txBps / 1000;
      const rxKbps = item.rxBps / 1000;

      const txRatio = ceilKbps > 0 ? Math.min(1, txKbps / ceilKbps) : 0;
      const rxRatio = ceilKbps > 0 ? Math.min(1, rxKbps / ceilKbps) : 0;

      const txHeight = txKbps > 0 ? Math.max(3, Math.round(txRatio * maxBarHeight)) : 0;
      const rxHeight = rxKbps > 0 ? Math.max(3, Math.round(rxRatio * maxBarHeight)) : 0;

      bars.push({
        x,
        txY: 90 - txHeight,
        txHeight,
        rxY: 90 - rxHeight,
        rxHeight
      });
    }

    this.chartBars = bars;
  }

  private formatBps(bps: number): string {
    if (!bps || bps <= 0) return '0 Kbps';
    const kbps = bps / 1000;
    if (kbps < 1000) {
      return `${kbps.toFixed(kbps < 10 ? 1 : 0)} Kbps`;
    }
    const mbps = kbps / 1000;
    return `${mbps.toFixed(2)} Mbps`;
  }

  get isClient(): boolean {
    return this.auth.isClient;
  }

  get currentRole(): string {
    return this.auth.user?.role || 'Client';
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
    if (this.newDevice) {
      this.newDevice.siteLocation = site;
    }
    this.currentPage = 1;
    // Reset buffer riwayat traffic saat berpindah site
    this.trafficHistory = [];
    this.chartBars = [];
    this.routerTraffic.txMbps = 0;
    this.routerTraffic.rxMbps = 0;
    this.routerTraffic.txBps = 0;
    this.routerTraffic.rxBps = 0;
    this.lastTx = '0 Kbps';
    this.lastRx = '0 Kbps';
    this.peakRate = '0 Kbps';
    this.avgRate = '0 Kbps';
    this.fetchRouterTraffic();
    this.initDevices(); // Load devices for the new site
    this.cdr.markForCheck();
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

  toggleDropdown(deviceId: number | string, event: Event) {
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

  // Edit Modal
  openEditModal(device: MonitoringDevice) {
    this.activeDropdown = null;
    this.editingDevice = JSON.parse(JSON.stringify(device));
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editingDevice = {};
    this.isSavingEdit = false;
  }

  async saveEditedDevice() {
    if (!this.editingDevice || !this.editingDevice.name || !this.editingDevice.ip) {
      this.showToastNotification('Nama dan IP wajib diisi', 'alert');
      return;
    }

    this.isSavingEdit = true;
    const devId = this.editingDevice._id || this.editingDevice.id;

    try {
      const res = await this.api.fetch(`/api/devices/${devId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.editingDevice)
      });
      const data = await res.json();
      this.isSavingEdit = false;

      if (res.ok && data.success) {
        const idx = this.devices.findIndex(d => (d._id || d.id) === devId);
        if (idx !== -1) {
          this.devices[idx] = { ...this.devices[idx], ...this.editingDevice };
        }
        if (this.selectedDevice && (this.selectedDevice._id || this.selectedDevice.id) === devId) {
          this.selectedDevice = { ...this.selectedDevice, ...this.editingDevice };
        }
        this.closeEditModal();
        this.showToastNotification('Perangkat berhasil diperbarui.', 'success');
      } else {
        this.showToastNotification(data.error || 'Gagal menyimpan perubahan.', 'alert');
      }
    } catch (e: any) {
      this.isSavingEdit = false;
      this.showToastNotification(`Error: ${e.message}`, 'alert');
    }
  }

  // Management Modal
  openManagement(device: MonitoringDevice) {
    this.activeDropdown = null;
    this.managementTargetDevice = device;
    this.pingStatus = 'idle';
    this.pingResultInfo = '';
    this.showManagementModal = true;
  }

  closeManagementModal() {
    this.showManagementModal = false;
    this.managementTargetDevice = null;
    this.pingStatus = 'idle';
    this.pingResultInfo = '';
  }

  testPing() {
    if (!this.managementTargetDevice) return;
    this.pingStatus = 'pinging';
    this.pingResultInfo = '';

    this.api.fetch('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: this.managementTargetDevice.ip })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.alive) {
          this.pingStatus = 'success';
          this.pingResultInfo = `RTT ${data.time} · Status: Reachable`;
          this.showToastNotification(
            `Ping ${this.managementTargetDevice?.ip}: ${data.time} (Online)`,
            'info'
          );
        } else {
          this.pingStatus = 'failed';
          this.pingResultInfo = `RTO / Unreachable · 100% loss`;
          this.showToastNotification(
            `Ping ${this.managementTargetDevice?.ip}: Gagal terjangkau (Offline/RTO)`,
            'alert'
          );
        }
      })
      .catch(err => {
        this.pingStatus = 'failed';
        this.pingResultInfo = `Error koneksi backend`;
        this.showToastNotification(
          `Gagal menghubungi backend: ${err.message}`,
          'alert'
        );
      });
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

  async confirmDelete() {
    if (!this.deleteTargetDevice) return;
    const dev = this.deleteTargetDevice;
    const devIdentifier = dev._id || dev.id;

    // Hapus dari state lokal
    this.devices = this.devices.filter(d => (d._id || d.id) !== devIdentifier);

    // Kirim request DELETE ke backend
    try {
      await this.api.fetch(`/api/devices/${devIdentifier}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn('Gagal menghapus perangkat di backend:', e);
    }

    // Catat ke audit log
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.activityLogs.unshift({
      time: timeStr,
      user: this.currentRole,
      message: `menghapus perangkat: ${dev.name}`,
      status: 'Alert'
    });

    if (this.selectedDevice && ((this.selectedDevice._id && this.selectedDevice._id === dev._id) || this.selectedDevice.id === dev.id)) {
      this.closeDetailModal();
    }
    this.showDeleteModal = false;
    this.showToastNotification(`Perangkat "${dev.name}" telah dihapus.`, 'alert');
    this.deleteTargetDevice = null;
    this.cdr.markForCheck();
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

  async saveDevice() {
    if (!this.newDevice.nama || !this.newDevice.nama.trim()) {
      this.showToastNotification('Nama perangkat wajib diisi!', 'alert');
      return;
    }

    if (!this.newDevice.siteLocation) {
      this.showToastNotification('Pilih site terlebih dahulu. Buat project & site di halaman Project & Site.', 'alert');
      return;
    }

    const nextId = this.devices.length > 0
      ? Math.max(...this.devices.map(d => typeof d.id === 'number' ? d.id : 0)) + 1
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

    // Kirim request POST ke backend agar tersimpan permanen
    try {
      const res = await this.api.fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceToAdd)
      });
      if (res.ok) {
        const resData = await res.json();
        if (resData && resData.device) {
          deviceToAdd._id = resData.device._id;
          deviceToAdd.id = resData.device.id || deviceToAdd.id;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        this.showToastNotification(`Gagal menyimpan ke server: ${errData.error || 'Server error'}`, 'alert');
        return;
      }
    } catch (e: any) {
      console.error('Gagal menyimpan perangkat ke server backend:', e);
      this.showToastNotification(`Gagal koneksi ke server backend: ${e.message}`, 'alert');
      return;
    }

    // Tambah ke array lokal setelah berhasil disimpan ke server
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

    // Pastikan siteLocation sinkron jika user sedang melihat site tertentu
    if (this.selectedSite && deviceToAdd.siteLocation !== this.selectedSite) {
      this.selectedSite = deviceToAdd.siteLocation;
    }

    this.showToastNotification(`Perangkat ${deviceToAdd.name} berhasil disimpan secara permanen.`, 'success');
    this.closeModal();
    this.currentPage = 1;
    this.cdr.markForCheck();
  }

  getEmptyDevice() {
    return {
      siteLocation: this.selectedSite || '',
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
        webManagement: true,
        cli: true,
        activityLogs: true
      }
    };
  }

  // ── Perangkat Murni dari Database / Backend (Tidak Ada Data Dummy) ──
  devices: MonitoringDevice[] = [];

  activityLogs: any[] = [];
}
