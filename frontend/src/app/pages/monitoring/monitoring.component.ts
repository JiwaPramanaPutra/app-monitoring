import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { SiteDropdownComponent } from '../../components/site-dropdown/site-dropdown.component';
import { ProjectService } from '../../services/project.service';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { deviceKey, findDuplicateIp } from '../../shared/device-identity';
import { DeviceStatus, deviceStatusColor, deviceStatusIsDown } from '../../shared/device-status';
import { managementActions, managementLabel, managementUrlFor } from '../../shared/management-url';
import { BridgeDraft, bridgeDraftError, hasRouterDeviceFor, hasTrafficRouterConfig, leavesSiteWithoutRouter, trafficRouterNoteFor } from '../../shared/router-traffic-link';

export interface MonitoringDevice {
  _id?: string;
  id: number | string;
  status: DeviceStatus;
  type: 'Access Point' | 'Switch' | 'Router' | 'Server';
  name: string;
  brand: string;
  model: string;
  mac: string;
  serialNumber?: string;
  /** URL console manajemen, mis. `http://172.16.1.1:8291` untuk RouterOS. */
  managementUrl?: string;
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

export interface RouterInterfaceOption {
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  comment: string;
  macAddress: string;
  rxBps: number;
  txBps: number;
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
  projects: any[] = [];
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
    routerModel: '',
    error: ''
  };

  // Sparkline bar visualization & metrics
  chartBars: TrafficBar[] = [];
  scaleCeil: number = 10;
  chartYUnit: string = 'Kbps';
  lastRx: string = '0 Kbps';
  lastTx: string = '0 Kbps';
  peakRate: string = '0 Kbps';
  avgRate: string = '0 Kbps';

  private trafficHistory: { txBps: number; rxBps: number; timestamp?: string | null }[] = [];
  private trafficTimer: any = null;
  private deviceStatusTimer: any = null;
  readonly DEVICE_REFRESH_INTERVAL = 30000;
  private readonly MAX_HISTORY = 45;

  // Pagination
  currentPage = 1;
  pageSize = 10;

  /** Dipakai template: kunci identitas baris perangkat (lihat `shared/device-identity`). */
  readonly deviceKey = deviceKey;
  readonly deviceStatusColor = deviceStatusColor;
  readonly deviceStatusIsDown = deviceStatusIsDown;
  readonly managementUrlFor = managementUrlFor;
  readonly managementLabel = managementLabel;
  readonly managementActions = managementActions;

  // Dropdown action menu
  activeDropdown: string | null = null;

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
  // Konfirmasi sinkron IP perangkat Router -> routerConfig.host (lihat routerHostSync).
  syncRouterHost = false;
  private editOriginalIp = '';

  newDevice: any = this.getEmptyDevice();
  // Isi konfigurasi router trafik site dari perangkat bertipe Router (opsional).
  // Port default 8729 = api-ssl; backend selalu memakai TLS ke RouterOS API.
  routerBridge = { enabled: false, port: 8729, user: '', password: '', interface: '' };
  // Daftar interface asli dari router pada form bridge. Nama interface harus
  // persis sama dengan di RouterOS, jadi dipilih lewat dropdown, bukan diketik.
  bridgeInterfaces: RouterInterfaceOption[] = [];
  bridgeIfaceLoading = false;
  bridgeIfaceError = '';

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

    // Hierarki site (Project -> Site -> Gedung -> Lantai) untuk dropdown form perangkat.
    this.projectService.projects$.subscribe(projects => {
      this.projects = projects || [];
      this.cdr.markForCheck();
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
    // Sama seperti traffic: daftar perangkat dikunci ke site saat request dikirim,
    // supaya respons yang telat tidak mengisi daftar site lain.
    const site = this.selectedSite;

    try {
      const res = await this.api.fetch(`/api/devices/status?site=${encodeURIComponent(site)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.devices) {
          if (site !== this.selectedSite) return;
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
        if (data && data.devices) {
          if (site !== this.selectedSite) return;
          this.devices = data.devices;
        }
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
    // Koneksi ke router bisa memakan waktu detik-an, jadi responsnya bisa tiba
    // setelah pengguna pindah site. Setiap request dikunci ke site-nya, dan
    // hasilnya dibuang kalau site sudah berganti — kalau tidak, ip/interface/angka
    // site lain tertulis ke widget ini dan sample-nya mendorong grafik site lain.
    const site = this.selectedSite;

    this.api.fetch(`/api/router/traffic?site=${encodeURIComponent(site)}`)
      .then(res => res.json())
      .then(data => {
        if (site !== this.selectedSite) return;

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
          // Site belum terkonfigurasi, atau terkonfigurasi tapi sedang tidak connected.
          this.routerTraffic.connected = false;
          this.routerTraffic.siteConfigured = data?.siteConfigured || false;
          this.routerTraffic.ip = data?.siteConfigured ? (data.ip || '—') : '—';
          this.routerTraffic.interface = data?.siteConfigured ? (data.interface || '—') : '—';
          this.routerTraffic.routerModel = data?.siteConfigured ? (data.routerModel || '') : '';
          this.routerTraffic.error = data?.error || '';
          this.routerTraffic.txBps = 0;
          this.routerTraffic.rxBps = 0;
          this.routerTraffic.txMbps = 0;
          this.routerTraffic.rxMbps = 0;
          this.lastTx = '0 Kbps';
          this.lastRx = '0 Kbps';

          // Hapus grafik HANYA saat site memang tidak dipantau. Site yang
          // terkonfigurasi tapi router-nya sedang putus tetap mempertahankan
          // grafik riwayatnya di bawah overlay "Koneksi ke router terputus" —
          // menghapusnya tiap polling membuat grafik berkedip.
          if (!this.routerTraffic.siteConfigured) {
            this.trafficHistory = [];
            this.chartBars = [];
          }
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        if (site !== this.selectedSite) return;
        this.routerTraffic.connected = false;
        this.routerTraffic.siteConfigured = false;
        this.routerTraffic.error = 'Tidak dapat menghubungi backend monitoring.';
        this.lastTx = '0 Kbps';
        this.lastRx = '0 Kbps';
        this.trafficHistory = [];
        this.chartBars = [];
        this.cdr.markForCheck();
      });
  }

  private updateTrafficMetrics(txBps: number, rxBps: number) {
    this.trafficHistory.push({ txBps, rxBps, timestamp: new Date().toISOString() });
    if (this.trafficHistory.length > this.MAX_HISTORY) {
      this.trafficHistory.shift();
    }

    this.lastTx = this.formatBps(txBps);
    this.lastRx = this.formatBps(rxBps);
    this.recomputeTrafficMetrics();
  }

  /** Hitung ulang puncak/rata-rata, skala, dan bar dari isi buffer saat ini. */
  private recomputeTrafficMetrics() {
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

  /**
   * Label skala sumbu Y pada posisi gridline (0 = dasar, 1 = puncak skala).
   * Satuan hanya ditulis sekali di label paling atas agar tidak berulang.
   */
  axisTickLabel(fraction: number): string {
    const value = this.scaleCeil * fraction;
    const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
    return fraction >= 1 ? `${rounded} ${this.chartYUnit}` : String(rounded);
  }

  /** Rentang waktu isi grafik saat ini, mis. `10:01:23 – 10:02:53`. */
  get chartTimeRange(): string {
    const first = this.trafficHistory[0]?.timestamp;
    const last = this.trafficHistory[this.trafficHistory.length - 1]?.timestamp;
    if (!first || !last) return '';
    const hhmmss = (iso: string | null | undefined) => {
      const d = iso ? new Date(iso) : null;
      return d && !isNaN(d.getTime())
        ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
        : '';
    };
    const from = hhmmss(first);
    const to = hhmmss(last);
    return from && to ? `${from} – ${to}` : '';
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
    this.resetTrafficHistory();
    this.prefillTrafficHistory();
    this.fetchRouterTraffic();
    this.initDevices(); // Load devices for the new site
    this.cdr.markForCheck();
  }

  /**
   * Kosongkan buffer grafik beserta metriknya. Dipakai saat berpindah site dan
   * saat router trafik site berganti — sample lama milik router/site lain tidak
   * boleh ikut digambar.
   */
  private resetTrafficHistory() {
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
  }

  /**
   * Isi grafik dari riwayat tersimpan supaya langsung penuh saat site dipilih,
   * bukan menunggu ±90 detik (45 sample x polling 2 detik) terkumpul sendiri.
   * Sumbernya sample pengukuran RouterOS yang sama, hanya yang lebih lama.
   */
  private async prefillTrafficHistory(): Promise<void> {
    const site = this.selectedSite;
    if (!site) return;
    // Site tanpa monitoring router tidak boleh digambar dari riwayat: history
    // lamanya masih tersimpan sehingga grafik sempat muncul lalu dibersihkan oleh
    // balasan `siteConfigured: false` — terbaca sebagai kedipan.
    if (!hasTrafficRouterConfig(this.siteOf(site))) return;
    try {
      const res = await this.api.fetch(
        `/api/router/history?site=${encodeURIComponent(site)}&raw=1&limit=${this.MAX_HISTORY}`
      );
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const points: { txBps: number; rxBps: number }[] = Array.isArray(data?.data) ? data.data : [];
      if (points.length === 0) return;

      // Jangan timpa kalau user sudah pindah site selama request berjalan.
      if (site !== this.selectedSite) return;

      this.trafficHistory = points.slice(-this.MAX_HISTORY);
      const newest = this.trafficHistory[this.trafficHistory.length - 1];
      this.lastTx = this.formatBps(newest?.txBps || 0);
      this.lastRx = this.formatBps(newest?.rxBps || 0);
      this.recomputeTrafficMetrics();
      this.cdr.markForCheck();
    } catch (e) {
      // Riwayat tidak tersedia -> grafik tetap terisi oleh polling berjalan.
    }
  }

  // ── Hierarki lokasi untuk form perangkat ──────────────────────
  private siteOf(site: string): any {
    for (const p of this.projects) {
      const found = (p.sites || []).find((s: any) => s.name === site);
      if (found) return found;
    }
    return null;
  }

  gedungOptions(site: string): string[] {
    return (this.siteOf(site)?.gedungList || []).map((g: any) => g.name);
  }

  lantaiOptions(site: string, gedung: string): string[] {
    const g = (this.siteOf(site)?.gedungList || []).find((x: any) => x.name === gedung);
    return (g?.floors || []).map((f: any) => f.name);
  }

  onNewSiteLocationChange() {
    this.newDevice.gedung = '';
    this.newDevice.lantai = '';
  }

  onNewGedungChange() {
    this.newDevice.lantai = '';
  }

  onEditGedungChange() {
    this.editingDevice.lantai = '';
  }

  suggestDeviceName() {
    const parts = [
      this.newDevice.tipePerangkat,
      this.newDevice.model || this.newDevice.brand,
      this.newDevice.gedung,
      this.newDevice.lantai
    ].filter((p: string) => p && String(p).trim());
    this.newDevice.nama = parts.join(' ');
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

  /**
   * Buka/tutup menu aksi satu baris.
   *
   * Kunci kosong diabaikan: kalau tidak, semua baris yang tidak punya kunci akan
   * cocok satu sama lain dan seluruh menu terbuka bersamaan.
   */
  toggleDropdown(key: string, event: Event) {
    event.stopPropagation();
    if (!key) return;
    this.activeDropdown = this.activeDropdown === key ? null : key;
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
    this.editOriginalIp = (device.ip || '').trim();
    this.syncRouterHost = true;
    this.initRouterBridgeForEdit(device);
    this.showEditModal = true;
  }

  /**
   * Siapkan blok "Jadikan router trafik site ini" untuk modal Edit.
   *
   * Blok ini dulu hanya ada di modal Tambah, sehingga perangkat yang tipenya
   * diperbaiki belakangan (mis. salah pilih Access Point lalu diganti Router)
   * tidak punya jalan untuk menjadi router trafik site dari perangkatnya —
   * pengguna harus mengaturnya manual di Project & Site.
   */
  private initRouterBridgeForEdit(device: MonitoringDevice) {
    this.routerBridge = { enabled: false, port: 8729, user: '', password: '', interface: '' };
    this.bridgeInterfaces = [];
    this.bridgeIfaceLoading = false;
    this.bridgeIfaceError = '';

    if (device.type !== 'Router') return;

    const cfg = this.siteOf(device.siteLocation || '')?.routerConfig;
    if (cfg) {
      this.routerBridge.port = Number(cfg.port) || 8729;
      this.routerBridge.user = cfg.user || '';
      this.routerBridge.interface = cfg.interface || '';
    }

    // Dicentang HANYA bila site ini memang sudah menunjuk perangkat ini.
    // Sebelumnya site yang belum punya router ikut dicentang, sehingga edit
    // biasa (alias/ruangan) diam-diam menyalakan monitoring dan site yang belum
    // dikonfigurasi justru menolak penyimpanan.
    this.routerBridge.enabled =
      !!cfg?.host && String(cfg.host).trim() === (device.ip || '').trim();
  }

  /**
   * Site Location di modal Edit berubah: draft bridge harus ikut pindah site.
   * Tanpa ini draft-nya tertinggal milik site sebelumnya dan bisa menulis
   * `routerConfig` ke site yang salah.
   */
  onEditSiteLocationChange() {
    this.initRouterBridgeForEdit(this.editingDevice);
    this.cdr.markForCheck();
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

    // Satu IP hanya untuk satu perangkat per site; perangkat ini dikecualikan
    // supaya tidak dianggap bentrok dengan dirinya sendiri.
    const ipClash = findDuplicateIp(
      this.devices,
      this.editingDevice.ip,
      this.editingDevice.siteLocation,
      this.editingDevice._id || this.editingDevice.id
    );
    if (ipClash) {
      this.showToastNotification(
        `IP ${String(this.editingDevice.ip).trim()} sudah dipakai "${ipClash.name}" di site ${this.editingDevice.siteLocation}. Satu IP hanya untuk satu perangkat per site.`,
        'alert'
      );
      return;
    }

    // Sama seperti modal Tambah: blok bridge hanya berlaku saat perangkatnya
    // Router, dan tidak boleh disimpan setengah jadi.
    const bridgeDraft = this.activeBridgeDraft(this.editingDevice.type, this.editingDevice.ip);
    const bridgeProblem = bridgeDraftError(
      bridgeDraft,
      this.siteOf(this.editingDevice.siteLocation)?.routerConfig
    );
    if (bridgeProblem) {
      this.showToastNotification(bridgeProblem, 'alert');
      return;
    }

    this.isSavingEdit = true;
    const devId = this.editingDevice._id || this.editingDevice.id;

    // Diambil sebelum closeEditModal() mengosongkan editingDevice.
    const sync = this.routerHostSync;
    const shouldSync = this.syncRouterHost && sync.applicable;
    const stopsTraffic = this.editStopsTraffic;
    const stopsTrafficSite = this.editedDeviceOriginalSite();
    const bridge = bridgeDraft.enabled
      ? {
          ip: (this.editingDevice.ip || '').trim(),
          siteName: this.editingDevice.siteLocation || '',
          model: [this.editingDevice.brand, this.editingDevice.model].filter(Boolean).join(' ')
        }
      : null;

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

        if (bridge && bridge.ip && bridge.ip !== '—') {
          // Perangkat ini dijadikan router trafik site. Host langsung menunjuk IP
          // perangkatnya sendiri, jadi sinkron IP tidak diperlukan.
          const saved = await this.bridgeRouterToSite(bridge.ip, bridge.siteName, bridge.model);
          if (saved) {
            this.resetTrafficHistory();
            this.fetchRouterTraffic();
            await this.verifyRouterBridge(bridge.siteName);
          }
        } else if (shouldSync) {
          await this.syncRouterConfigHost(sync);
        } else if (stopsTraffic && stopsTrafficSite) {
          // Perangkat berhenti menjadi Router di site lamanya dan tidak ada
          // Router lain yang tersisa -> monitoring trafiknya ikut berhenti,
          // sama persis seperti saat perangkatnya dihapus.
          const cleared = await this.clearRouterConfigHost(stopsTrafficSite);
          if (cleared) {
            this.showToastNotification(
              `Monitoring trafik site ${stopsTrafficSite} dihentikan — perangkatnya bukan Router lagi.`,
              'alert'
            );
          }
        }
      } else {
        this.showToastNotification(data.error || 'Gagal menyimpan perubahan.', 'alert');
      }
    } catch (e: any) {
      this.isSavingEdit = false;
      this.showToastNotification(`Error: ${e.message}`, 'alert');
    }
  }

  /**
   * Perangkat Router ini menjadi router trafik site-nya hanya bila
   * `routerConfig.host` site masih persis IP aslinya. Kalau IP-nya diubah dan
   * konfirmasi diberikan, host ikut diganti supaya widget tidak terus menunjuk
   * router lama walaupun tabel perangkat sudah benar.
   */
  get routerHostSync(): { applicable: boolean; siteName: string; oldHost: string; newHost: string } {
    const none = { applicable: false, siteName: '', oldHost: '', newHost: '' };
    const dev = this.editingDevice;
    if (!dev || dev.type !== 'Router') return none;

    const siteName = dev.siteLocation || '';
    const newHost = (dev.ip || '').trim();
    const oldHost = (this.editOriginalIp || '').trim();
    if (!siteName || !newHost || !oldHost || newHost === oldHost) return none;

    const site = this.siteOf(siteName);
    const currentHost = site?.routerConfig?.host;
    if (!currentHost || String(currentHost).trim() !== oldHost) return none;

    return { applicable: true, siteName, oldHost, newHost };
  }

  /**
   * Perbarui `routerConfig.host` site mengikuti IP baru perangkat Router-nya.
   * Password router dipertahankan backend (payload tanpa password = pakai yang
   * tersimpan), lalu widget disegarkan seketika.
   */
  private async syncRouterConfigHost(sync: { siteName: string; oldHost: string; newHost: string }): Promise<boolean> {
    const project = this.projects.find(p => (p.sites || []).some((s: any) => s.name === sync.siteName));
    const site = (project?.sites || []).find((s: any) => s.name === sync.siteName);
    if (!project || !site) return false;

    const sites = (project.sites || []).map((s: any) => s.name === sync.siteName
      ? { ...s, routerConfig: { ...(s.routerConfig || {}), host: sync.newHost } }
      : s);

    if (!await this.saveProjectSites(project._id || project.id, sites)) return false;
    this.projectService.refreshProjects();

    // Sample lama berasal dari router yang berbeda, jadi jangan digabung.
    this.resetTrafficHistory();
    this.fetchRouterTraffic();

    this.showToastNotification(
      `Router trafik site ${sync.siteName} kini menunjuk ${sync.newHost}.`,
      'success'
    );
    this.cdr.markForCheck();
    return true;
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

  openManagementAction(action: { url: string; label: string }) {
    if (!action || !action.url) return;
    window.open(action.url, '_blank');
    this.showToastNotification(`Membuka ${action.label}: ${action.url}`, 'info');
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

  /**
   * Apakah menghapus perangkat ini akan menghentikan monitoring trafik site-nya?
   *
   * Aturannya: perangkat bertipe Router yang merupakan **perangkat Router
   * terakhir** di site-nya. Sengaja TIDAK membandingkan IP dengan
   * `routerConfig.host` — alamat sering salah ketik, dan yang menentukan "site
   * ini masih punya router atau tidak" adalah keberadaan perangkatnya.
   */
  get deleteStopsTraffic(): boolean {
    const dev = this.deleteTargetDevice;
    if (!dev || dev.type !== 'Router') return false;

    const siteName = dev.siteLocation || '';
    // Tidak ada yang perlu dihentikan bila site memang tidak dipantau.
    if (!hasTrafficRouterConfig(this.siteOf(siteName))) return false;

    const devIdentifier = dev._id || dev.id;
    const remaining = this.devices.filter(d => (d._id || d.id) !== devIdentifier);
    return !hasRouterDeviceFor(siteName, remaining);
  }

  /**
   * Apakah penyuntingan ini meninggalkan site-nya tanpa Router?
   *
   * Berlaku saat tipenya diganti menjauh dari Router, atau saat perangkatnya
   * pindah ke site lain. Dampaknya sama dengan menghapus perangkatnya, jadi
   * aturannya juga harus sama: monitoring trafik site ikut berhenti.
   */
  get editStopsTraffic(): boolean {
    const dev = this.editingDevice;
    if (!dev) return false;
    const before = this.devices.find(d => (d._id || d.id) === (dev._id || dev.id));
    if (!before) return false;
    return leavesSiteWithoutRouter(
      before,
      { type: dev.type, siteLocation: dev.siteLocation },
      this.devices
    );
  }

  /** Site asal perangkat yang kehilangan router terakhirnya akibat edit ini. */
  private editedDeviceOriginalSite(): string {
    const dev = this.editingDevice;
    if (!dev) return '';
    const before = this.devices.find(d => (d._id || d.id) === (dev._id || dev.id));
    return before?.siteLocation || dev.siteLocation || '';
  }

  /**
   * Catatan konsistensi antara `routerConfig` site dan daftar perangkat.
   * `null` bila selaras. Bisa membedakan "site tidak punya perangkat Router"
   * dari "IP perangkatnya tidak cocok dengan host router trafik" — keduanya
   * masalah berbeda dan penanganannya beda.
   */
  get trafficRouterNote(): string | null {
    if (!this.routerTraffic.siteConfigured) return null;
    return trafficRouterNoteFor(
      this.selectedSite,
      this.siteOf(this.selectedSite)?.routerConfig,
      this.devices
    );
  }

  async confirmDelete() {
    if (!this.deleteTargetDevice) return;
    const dev = this.deleteTargetDevice;
    const devIdentifier = dev._id || dev.id;
    // Diambil sebelum deleteTargetDevice dikosongkan.
    const stopsTraffic = this.deleteStopsTraffic;
    const siteName = dev.siteLocation || '';

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

    if (this.selectedDevice && (this.selectedDevice._id || this.selectedDevice.id) === devIdentifier) {
      this.closeDetailModal();
    }
    this.showDeleteModal = false;
    this.showToastNotification(`Perangkat "${dev.name}" telah dihapus.`, 'alert');
    this.deleteTargetDevice = null;
    this.cdr.markForCheck();

    if (stopsTraffic && siteName) {
      const cleared = await this.clearRouterConfigHost(siteName);
      if (cleared) {
        this.showToastNotification(
          `Monitoring trafik site ${siteName} dihentikan — router trafiknya ikut dihapus.`,
          'alert'
        );
      }
    }
  }

  /**
   * Hentikan monitoring trafik site saat perangkat Router-nya dihapus.
   * `routerConfig` adalah data terpisah dari record perangkat, jadi harus
   * dikosongkan sendiri; kalau tidak, widget tetap memantau router yang sudah
   * tidak terdaftar.
   */
  private async clearRouterConfigHost(siteName: string): Promise<boolean> {
    const project = this.projects.find(p => (p.sites || []).some((s: any) => s.name === siteName));
    const site = (project?.sites || []).find((s: any) => s.name === siteName);
    if (!project || !site?.routerConfig) return false;

    // Host dikosongkan, bukan objeknya dihapus: `preserveRouterPasswords` di
    // backend mempertahankan `routerConfig` yang hilang dari payload, dan host
    // kosong membuat `resolveRouterConfig` mengembalikan `null` -> "Belum
    // Dikonfigurasi". Password router tetap tersimpan sehingga mudah diaktifkan lagi.
    const sites = (project.sites || []).map((s: any) => s.name === siteName
      ? { ...s, routerConfig: { ...(s.routerConfig || {}), host: '' } }
      : s);

    if (!await this.saveProjectSites(project._id || project.id, sites)) return false;
    this.projectService.refreshProjects();

    this.resetTrafficHistory();
    this.fetchRouterTraffic();
    this.cdr.markForCheck();
    return true;
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
    this.routerBridge = { enabled: false, port: 8729, user: '', password: '', interface: '' };
    this.bridgeInterfaces = [];
    this.bridgeIfaceLoading = false;
    this.bridgeIfaceError = '';
    this.showAddModal = true;
  }

  /**
   * Muat daftar interface asli dari router yang diisi di form bridge.
   * Router belum punya routerConfig tersimpan, jadi kredensialnya dikirim apa
   * adanya; endpoint hanya membaca `/interface/print` + rate sekali jalan.
   */
  /** IP router yang dipakai blok bridge, dari modal yang sedang terbuka. */
  get bridgeHost(): string {
    return this.showEditModal
      ? (this.editingDevice?.ip || '')
      : (this.newDevice?.ipAddress || '');
  }

  /** Site yang diblok bridge, dari modal yang sedang terbuka. */
  get bridgeSiteName(): string {
    return this.showEditModal
      ? (this.editingDevice?.siteLocation || '')
      : (this.newDevice?.siteLocation || '');
  }

  /**
   * Draft bridge yang benar-benar berlaku: hanya saat dicentang DAN perangkatnya
   * bertipe Router.
   *
   * Gerbang ini wajib. Tanpa itu, blok yang tersembunyi karena tipe perangkat
   * diganti setelah dicentang tetap ikut divalidasi — penyimpanan ditolak dengan
   * pesan tentang field yang tidak terlihat — dan jalur simpan bisa menulis
   * `routerConfig` site dari perangkat yang bukan Router, sehingga widget terus
   * memantau router yang salah.
   */
  private activeBridgeDraft(deviceType: string | undefined, host: string | undefined): BridgeDraft {
    if (!this.routerBridge.enabled || deviceType !== 'Router') return { enabled: false };
    return { ...this.routerBridge, host };
  }

  /**
   * Username/password boleh dikosongkan bila site sudah menyimpannya — backend
   * menggabungkannya sendiri lewat `mergeProbeCredentials`.
   */
  get bridgeHasStoredCreds(): boolean {
    const cfg = this.siteOf(this.bridgeSiteName)?.routerConfig;
    return !!String(cfg?.user || '').trim() || !!cfg?.hasPassword;
  }

  async loadBridgeInterfaces(): Promise<void> {
    const host = this.bridgeHost.trim();
    const user = (this.routerBridge.user || '').trim();
    if (!host || (!user && !this.bridgeHasStoredCreds)) {
      this.bridgeInterfaces = [];
      this.bridgeIfaceError = 'Isi IP Address perangkat dan username RouterOS dulu, lalu muat ulang.';
      this.cdr.markForCheck();
      return;
    }

    this.bridgeIfaceLoading = true;
    this.bridgeIfaceError = '';
    this.cdr.markForCheck();
    try {
      const res = await this.api.fetch('/api/router/interfaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site: this.bridgeSiteName,
          host,
          port: Number(this.routerBridge.port) || 8729,
          user,
          password: this.routerBridge.password || '',
          timeout: 3
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        this.bridgeInterfaces = [];
        this.bridgeIfaceError = data.error || `Gagal memuat daftar interface (HTTP ${res.status}).`;
        return;
      }
      this.bridgeInterfaces = data.data || [];
      if (this.bridgeInterfaces.length === 0) {
        this.bridgeIfaceError = 'Router tidak mengembalikan interface apa pun.';
      }
    } catch (e: any) {
      this.bridgeInterfaces = [];
      this.bridgeIfaceError = `Gagal menghubungi backend: ${e.message}`;
    } finally {
      this.bridgeIfaceLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Aktifkan bridge -> langsung muat daftar interface, tanpa menunggu tombol. */
  onBridgeToggle() {
    if (this.routerBridge.enabled) this.loadBridgeInterfaces();
  }

  /** Label option dropdown interface: nama, komentar, status link, dan rate live. */
  bridgeIfaceLabel(i: RouterInterfaceOption): string {
    const parts = [i.name];
    if (i.comment) parts.push(i.comment);
    if (i.disabled) parts.push('nonaktif');
    else if (!i.running) parts.push('link down');
    parts.push(`Rx ${this.formatBps(i.rxBps)} · Tx ${this.formatBps(i.txBps)}`);
    return parts.join('  ·  ');
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

    // Satu IP hanya untuk satu perangkat per site. Perbandingan dibatasi per site
    // karena gedung berbeda umumnya memakai rentang privat yang sama.
    const ipClash = findDuplicateIp(this.devices, this.newDevice.ipAddress, this.newDevice.siteLocation);
    if (ipClash) {
      this.showToastNotification(
        `IP ${String(this.newDevice.ipAddress).trim()} sudah dipakai "${ipClash.name}" di site ${this.newDevice.siteLocation}. Satu IP hanya untuk satu perangkat per site.`,
        'alert'
      );
      return;
    }

    // Blok "jadikan router trafik site" hanya berlaku saat perangkatnya Router.
    // Gerbang ini wajib: tipe bisa diganti setelah blok dicentang, dan tanpa
    // gerbang ini blok tersembunyi itu masih menolak penyimpanan sekaligus bisa
    // menulis routerConfig site dari perangkat yang bukan Router.
    const bridgeDraft = this.activeBridgeDraft(this.newDevice.tipePerangkat, this.newDevice.ipAddress);
    const bridgeProblem = bridgeDraftError(
      bridgeDraft,
      this.siteOf(this.newDevice.siteLocation)?.routerConfig
    );
    if (bridgeProblem) {
      this.showToastNotification(bridgeProblem, 'alert');
      return;
    }

    const nextId = this.devices.length > 0
      ? Math.max(...this.devices.map(d => typeof d.id === 'number' ? d.id : 0)) + 1
      : 1;

    const deviceToAdd: MonitoringDevice = {
      id: nextId,
      // Belum ada yang mengukur perangkat ini, jadi jangan mengklaim Online.
      // Status sebenarnya datang dari /api/devices/status pada refresh berikutnya.
      status: 'Tidak Terpantau',
      type: this.newDevice.tipePerangkat,
      name: this.newDevice.nama.trim(),
      brand: this.newDevice.brand || 'Ruijie',
      model: this.newDevice.model || 'RAP2200',
      mac: this.newDevice.macAddress || '—',
      serialNumber: this.newDevice.serialNumber || '—',
      ip: this.newDevice.ipAddress || '—',
      managementUrl: this.newDevice.managementUrl || '',
      client: '0',
      signal: '—',
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

    // Pastikan siteLocation sinkron jika user sedang melihat site tertentu.
    // Wajib lewat selectSite() penuh: mutasi `selectedSite` langsung membuat
    // tabel perangkat, buffer grafik, dan widget tidak sinkron.
    if (this.selectedSite && deviceToAdd.siteLocation !== this.selectedSite) {
      this.selectedSiteLabel = deviceToAdd.siteLocation;
      this.selectSite(deviceToAdd.siteLocation);
    }

    const bridged = bridgeDraft.enabled && !!deviceToAdd.ip && deviceToAdd.ip !== '—';

    this.showToastNotification(`Perangkat ${deviceToAdd.name} berhasil disimpan secara permanen.`, 'success');

    if (bridged) {
      const bridgeSaved = await this.bridgeRouterToSite(
        deviceToAdd.ip,
        deviceToAdd.siteLocation,
        [this.newDevice.brand, this.newDevice.model].filter(Boolean).join(' ')
      );
      if (bridgeSaved) {
        // Segarkan widget seketika tanpa menunggu interval polling 2 detik.
        // Sample lama dibuang karena berasal dari router yang berbeda.
        this.resetTrafficHistory();
        this.fetchRouterTraffic();
        // Tes koneksi sengaja paling akhir: showToastNotification menimpa toast
        // sebelumnya, jadi kalau ditaruh sebelum notifikasi simpan hasilnya hilang.
        await this.verifyRouterBridge(deviceToAdd.siteLocation);
      }
      // bridgeSaved === false -> peringatan sudah ditampilkan saveProjectSites().
    }

    this.closeModal();
    this.currentPage = 1;
    this.cdr.markForCheck();
  }

  /**
   * Isi routerConfig site dari perangkat bertipe Router (opsional).
   * Dipakai modal Tambah maupun modal Edit.
   * Password pada site lain dipertahankan backend (payload password kosong = pakai yang tersimpan).
   */
  private async bridgeRouterToSite(deviceIp: string, siteName: string, routerModel: string): Promise<boolean> {
    const project = this.projects.find(p => (p.sites || []).some((s: any) => s.name === siteName));
    const site = (project?.sites || []).find((s: any) => s.name === siteName);
    if (!project || !site) return false;

    const sites = (project.sites || []).map((s: any) => s.name === siteName
      ? {
          ...s,
          routerConfig: {
            host: deviceIp,
            // Hanya `password` yang punya semantik "pertahankan yang tersimpan" di
            // backend, jadi port dan user harus dijaga di sini. Default 8729
            // (api-ssl), bukan 8728 (api polos) yang sudah pasti gagal.
            port: Number(this.routerBridge.port) || Number(s.routerConfig?.port) || 8729,
            user: String(this.routerBridge.user || '').trim() || (s.routerConfig?.user || ''),
            password: this.routerBridge.password || '',
            interface: String(this.routerBridge.interface || '').trim(),
            routerModel: routerModel || s.routerConfig?.routerModel || ''
          }
        }
      : s);

    if (!await this.saveProjectSites(project._id || project.id, sites)) return false;
    this.projectService.refreshProjects();
    return true;
  }

  /**
   * Simpan daftar `sites` ke project. Mengembalikan `false` bila gagal, supaya
   * pemanggil tidak menampilkan pesan sukses untuk perubahan yang tidak tersimpan.
   */
  private async saveProjectSites(projectId: string, sites: any[]): Promise<boolean> {
    const ok = await new Promise<boolean>((resolve) => {
      this.projectService.updateProject(projectId, { sites }).subscribe({
        next: () => resolve(true),
        error: () => resolve(false)
      });
    });
    if (!ok) {
      this.showToastNotification(
        'Gagal menyimpan konfigurasi router site. Perubahan tidak tersimpan.',
        'alert'
      );
    }
    return ok;
  }

  /**
   * Tes koneksi setelah `routerConfig` site terisi: panggil `/api/router/traffic`
   * sekali lalu tampilkan hasilnya. Kegagalan wajib menyebut sebabnya, tidak diam.
   */
  private async verifyRouterBridge(siteName: string): Promise<void> {
    try {
      const res = await this.api.fetch(`/api/router/traffic?site=${encodeURIComponent(siteName)}`);
      const data = await res.json().catch(() => ({}));
      // Balasan gagal selalu membawa `error` (termasuk fallback cache), jadi
      // jangan hanya mengandalkan `connected`.
      const ok = !!data && !!data.connected && !data.error;
      if (ok) {
        this.showToastNotification(
          `Router trafik site ${siteName} tersambung — ${data.ip} · ${data.interface}.`,
          'success'
        );
      } else {
        this.showToastNotification(
          data?.error || `Router trafik site ${siteName} belum tersambung.`,
          'alert'
        );
      }
    } catch (e: any) {
      this.showToastNotification(`Gagal memeriksa koneksi router: ${e.message}`, 'alert');
    }
    this.cdr.markForCheck();
  }

  getEmptyDevice() {
    return {
      siteLocation: this.selectedSite || '',
      tipePerangkat: 'Access Point',
      nama: '',
      brand: '',
      model: '',
      macAddress: '',
      serialNumber: '',
      ipAddress: '',
      managementUrl: '',
      gedung: '',
      lantai: '',
      ruangan: ''
    };
  }

  // ── Perangkat Murni dari Database / Backend (Tidak Ada Data Dummy) ──
  devices: MonitoringDevice[] = [];

  activityLogs: any[] = [];
}
