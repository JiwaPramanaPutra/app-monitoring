import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { SiteDropdownComponent } from '../../components/site-dropdown/site-dropdown.component';
import { ProjectService } from '../../services/project.service';
import { ApiService } from '../../services/api.service';
import Swal from 'sweetalert2';

interface TrafficData {
  label: string;
  tx: number;
  rx: number;
  /** Jumlah sample di bucket ini. `0` berarti jam itu datanya hilang, bukan nol. */
  samples?: number;
}

interface UptimeData {
  site: string;
  /** `null` = periode ini belum punya dasar pengukuran, jadi uptime tidak diklaim. */
  uptimePct: number | null;
  color: string;
  /** Durasi gangguan sungguhan (interface link-down). */
  downtimeTotal: string;
  /** Durasi aplikasi kehilangan visibilitas ke router — bukan gangguan situs. */
  unreachableTotal: string;
  lastDown: string;
  lastRecover: string;
}

interface DowntimeEvent {
  site: string;
  /** `unreachable` (gagal koneksi) atau `interface-down` (link putus). */
  kind?: string;
  /** Sebab yang dicatat backend, ditampilkan sebagai tooltip. */
  reason?: string;
  start: string;
  duration: string;
  color: string;
  end: string;
  reported: boolean;
  timestamp: Date;
}

@Component({
  selector: 'app-laporan-trafik',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SidebarComponent, SiteDropdownComponent],
  templateUrl: './laporan-trafik.component.html',
  styleUrls: ['./laporan-trafik.component.css']
})
export class LaporanTrafikComponent implements OnInit, OnDestroy {
  sites: string[] = [];
  periods = [
    { value: 'harian', label: 'Harian' },
    { value: 'mingguan', label: 'Mingguan' },
    { value: 'bulanan', label: 'Bulanan' },
    { value: 'tahunan', label: 'Tahunan' },
    { value: 'custom', label: 'Custom' }
  ];

  selectedSite = '';
  selectedSiteLabel = '';
  selectedPeriod = 'harian';

  // Date range filter
  startDate = '';
  endDate = '';
  today = '';

  // Quick presets
  quickPresets = [
    { label: '7 Hari', days: 7 },
    { label: '30 Hari', days: 30 },
    { label: '90 Hari', days: 90 }
  ];

  // Expose Math untuk template
  Math = Math;

  chartData: TrafficData[] = [];
  chartLabels: string[] = [];
  txCurrent = 0;
  txAverage = 0;
  txMaximum = 0;
  rxCurrent = 0;
  rxAverage = 0;
  rxMaximum = 0;

  uptimeData: UptimeData[] = [];
  downtimeLog: DowntimeEvent[] = [];
  allDowntimeEvents: DowntimeEvent[] = [];

  // SVG path untuk grafik
  txPath = '';
  txAreaPath = '';
  rxPath = '';
  rxAreaPath = '';
  yAxisMax = 500;
  yAxisStep = 125;

  // Live Router Traffic Data
  isLiveRouterConnected = false;
  liveTrafficTimer: any = null;
  liveTxMbps = 0;
  liveRxMbps = 0;
  liveRouterIp = '';
  liveRouterModel = '';
  realHistoryLoaded = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private projectService: ProjectService,
    private api: ApiService
  ) {}

  ngOnInit() {
    // Set today's date
    const now = new Date();
    this.today = this.formatDateForInput(now);

    // Set default date range (today)
    this.startDate = this.today;
    this.endDate = this.today;

    // Daftar site mengikuti data project (dinamis)
    this.projectService.sites$.subscribe(sites => {
      this.sites = sites || [];
      if (this.sites.length === 0) return;

      const requested = this.selectedSite || this.route.snapshot.queryParams['site'];
      const next = requested && this.sites.includes(requested) ? requested : this.sites[0];
      if (next !== this.selectedSite) {
        this.selectedSite = next;
        this.selectedSiteLabel = next;
        this.updateQueryParams();
        this.fetchRealHistoryAndEvents();
        this.fetchLiveTraffic();
      }
    });

    // Baca query parameters
    this.route.queryParams.subscribe(params => {
      const requestedSite = params['site'];
      this.selectedPeriod = params['period'] || 'harian';

      // Pakai site dari URL bila dikenal; selain itu sites$ yang menentukan
      if (requestedSite && this.sites.includes(requestedSite) && requestedSite !== this.selectedSite) {
        this.selectedSite = requestedSite;
        this.selectedSiteLabel = requestedSite;
        this.fetchRealHistoryAndEvents();
        this.fetchLiveTraffic();
      }

      // Validasi period
      const validPeriods = ['harian', 'mingguan', 'bulanan', 'tahunan', 'custom'];
      if (!validPeriods.includes(this.selectedPeriod)) {
        this.selectedPeriod = 'harian';
      }

      // Handle custom date range dari URL
      if (params['startDate'] && params['endDate']) {
        this.startDate = params['startDate'];
        this.endDate = params['endDate'];
        if (this.selectedPeriod !== 'custom') {
          this.selectedPeriod = 'custom';
        }
      } else {
        // Set default berdasarkan periode yang dipilih
        this.setDefaultDateRange();
      }
    });

    // Polling live traffic setiap 3 detik
    this.liveTrafficTimer = setInterval(() => {
      if (this.selectedSite) this.fetchLiveTraffic();
    }, 3000);
  }

  ngOnDestroy() {
    if (this.liveTrafficTimer) {
      clearInterval(this.liveTrafficTimer);
      this.liveTrafficTimer = null;
    }
  }

  fetchRealHistoryAndEvents() {
    // 1. Fetch downtime events from backend
    this.api.fetch(`/api/router/downtime-events?site=${encodeURIComponent(this.selectedSite)}`)
      .then(res => res.json())
      .then(res => {
        if (res && res.success && Array.isArray(res.events)) {
          this.allDowntimeEvents = res.events.map((e: any) => ({
            site: e.site,
            // Kejadian tanpa `kind` adalah data lama dan isinya kegagalan
            // koneksi, jadi diperlakukan sebagai `unreachable`.
            kind: e.kind === 'interface-down' ? 'interface-down' : 'unreachable',
            reason: e.reason || '',
            start: e.start,
            duration: e.duration,
            color: e.color || '#C4442E',
            end: e.end || '—',
            reported: !!e.reported,
            timestamp: new Date(e.startTimeIso || e.start)
          }));
        } else {
          this.allDowntimeEvents = [];
        }
        this.filterDowntimeLog();
      })
      .catch(() => {
        this.allDowntimeEvents = [];
        this.filterDowntimeLog();
      });

    // 2. Fetch traffic history (pre-aggregated per period) dari backend
    const params = new URLSearchParams({
      site: this.selectedSite,
      period: this.selectedPeriod
    });
    if (this.startDate) params.set('startDate', this.startDate);
    if (this.endDate) params.set('endDate', this.endDate);

    this.api.fetch(`/api/router/history?${params.toString()}`)
      .then(res => res.json())
      .then(res => {
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          this.realHistoryLoaded = true;
          this.processRealHistory(res.data);
        } else {
          this.realHistoryLoaded = false;
          this.chartData = [];
          this.chartLabels = [];
          this.txCurrent = 0; this.txAverage = 0; this.txMaximum = 0;
          this.rxCurrent = 0; this.rxAverage = 0; this.rxMaximum = 0;
          this.generateUptimeData();
          this.cdr.markForCheck();
        }
      })
      .catch(() => {
        this.realHistoryLoaded = false;
        this.chartData = [];
        this.chartLabels = [];
        this.cdr.markForCheck();
      });
  }

  processRealHistory(aggregated: any[]) {
    // Data sudah diaggregasi oleh backend — langsung pakai
    this.chartData = aggregated.map((d: any) => ({
      label: d.label,
      tx: Number(d.tx) || 0,
      rx: Number(d.rx) || 0,
      // Bucket tanpa sample bukan "trafik nol": jam itu datanya memang hilang.
      samples: Number(d.samples) || 0
    }));
    this.chartLabels = this.chartData.map(d => d.label);
    this.calculateStatistics();
    this.generateUptimeData();
    this.generateChartPaths();
    this.cdr.markForCheck();
  }

  async exportData(format: 'json' | 'csv' = 'csv') {
    const params = new URLSearchParams({
      site: this.selectedSite,
      period: this.selectedPeriod,
      format
    });
    if (this.startDate) params.set('startDate', this.startDate);
    if (this.endDate) params.set('endDate', this.endDate);

    try {
      await this.api.download(`/api/router/history/export?${params.toString()}`);
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal',
        text: err?.message || 'Gagal mengunduh file.',
        confirmButtonColor: '#3b82f6'
      });
    }
  }


  fetchLiveTraffic() {
    this.api.fetch(`/api/router/traffic?site=${encodeURIComponent(this.selectedSite)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.siteConfigured && data.connected && typeof data.txMbps === 'number') {
          this.isLiveRouterConnected = true;
          this.liveTxMbps = data.txMbps;
          this.liveRxMbps = data.rxMbps;
          this.liveRouterIp = data.ip || '';
          this.liveRouterModel = data.routerModel || '';

          // Jika periode harian dan site terkonfigurasi, sinkronkan data point terakhir & metrik current
          if (this.selectedPeriod === 'harian' && this.chartData.length > 0) {
            const lastPoint = this.chartData[this.chartData.length - 1];
            lastPoint.tx = this.liveTxMbps;
            lastPoint.rx = this.liveRxMbps;
            this.calculateStatistics();
            this.generateChartPaths();
          }
        } else {
          this.isLiveRouterConnected = false;
          this.liveTxMbps = 0;
          this.liveRxMbps = 0;
          this.liveRouterIp = '';
          this.liveRouterModel = '';
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isLiveRouterConnected = false;
        this.cdr.markForCheck();
      });
  }

  onSiteChange(site: string) {
    this.selectedSite = site;
    this.isLiveRouterConnected = false;
    this.updateQueryParams();
    this.fetchRealHistoryAndEvents();
    this.fetchLiveTraffic();
  }

  onSiteDropdownSelected(event: { siteValue: string; buildingValue?: string; label: string }) {
    this.selectedSiteLabel = event.label;
    this.onSiteChange(event.siteValue);
  }

  onPeriodChange(period?: string) {
    if (period) {
      this.selectedPeriod = period;
    }

    // Set default date range untuk periode preset
    if (this.selectedPeriod !== 'custom') {
      this.setDefaultDateRange();
      this.updateQueryParams();
    }
    this.fetchRealHistoryAndEvents();
  }

  applyCustomRange() {
    // Validasi: startDate dan endDate harus terisi
    if (!this.startDate || !this.endDate) {
      return;
    }

    // Validasi: startDate tidak boleh lebih dari endDate
    if (this.startDate > this.endDate) {
      this.endDate = this.startDate;
    }

    // Set ke custom mode
    this.selectedPeriod = 'custom';
    this.updateQueryParams();
    this.fetchRealHistoryAndEvents();
  }

  applyQuickPreset(days: number) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);

    this.startDate = this.formatDateForInput(start);
    this.endDate = this.formatDateForInput(end);
    this.selectedPeriod = 'custom';
    this.updateQueryParams();
  }

  setDefaultDateRange() {
    const now = new Date();

    switch (this.selectedPeriod) {
      case 'harian':
        this.startDate = this.formatDateForInput(now);
        this.endDate = this.formatDateForInput(now);
        break;
      case 'mingguan':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 6);
        this.startDate = this.formatDateForInput(weekStart);
        this.endDate = this.formatDateForInput(now);
        break;
      case 'bulanan':
        const monthStart = new Date(now);
        monthStart.setDate(now.getDate() - 29);
        this.startDate = this.formatDateForInput(monthStart);
        this.endDate = this.formatDateForInput(now);
        break;
      case 'tahunan':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        this.startDate = this.formatDateForInput(yearStart);
        this.endDate = this.formatDateForInput(now);
        break;
    }
  }

  formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  updateQueryParams() {
    const queryParams: any = {
      site: this.selectedSite,
      period: this.selectedPeriod
    };

    // Tambahkan date range jika custom atau jika ingin simpan range di URL
    if (this.selectedPeriod === 'custom' && this.startDate && this.endDate) {
      queryParams.startDate = this.startDate;
      queryParams.endDate = this.endDate;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge'
    });
  }






  calculateStatistics() {
    if (this.chartData.length === 0) return;

    // Filter out 0 values so they don't skew the average/current if data is sparse
    const nonZeroTx = this.chartData.map(d => d.tx).filter(v => v > 0);
    const nonZeroRx = this.chartData.map(d => d.rx).filter(v => v > 0);

    // Current: jika ada live router connected gunakan live value, jika tidak gunakan nilai chart point terakhir yg ada data
    if (this.isLiveRouterConnected) {
      this.txCurrent = Number(this.liveTxMbps.toFixed(2));
      this.rxCurrent = Number(this.liveRxMbps.toFixed(2));
    } else {
      this.txCurrent = nonZeroTx.length > 0 ? Number(nonZeroTx[nonZeroTx.length - 1].toFixed(2)) : 0;
      this.rxCurrent = nonZeroRx.length > 0 ? Number(nonZeroRx[nonZeroRx.length - 1].toFixed(2)) : 0;
    }

    // Average
    const txLen = nonZeroTx.length || 1;
    const rxLen = nonZeroRx.length || 1;
    this.txAverage = Number((nonZeroTx.reduce((a, b) => a + b, 0) / txLen).toFixed(2));
    this.rxAverage = Number((nonZeroRx.reduce((a, b) => a + b, 0) / rxLen).toFixed(2));

    // Maximum
    this.txMaximum = nonZeroTx.length > 0 ? Number(Math.max(...nonZeroTx).toFixed(2)) : 0;
    this.rxMaximum = nonZeroRx.length > 0 ? Number(Math.max(...nonZeroRx).toFixed(2)) : 0;
  }

  async generateUptimeData() {
    const now = new Date();
    let periodMs = 24 * 60 * 60 * 1000; // default: harian (1 hari)

    switch (this.selectedPeriod) {
      case 'harian':
        periodMs = 24 * 60 * 60 * 1000;
        break;
      case 'mingguan':
        periodMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case 'bulanan':
        periodMs = 30 * 24 * 60 * 60 * 1000;
        break;
      case 'tahunan':
        periodMs = 365 * 24 * 60 * 60 * 1000;
        break;
      case 'custom':
        if (this.startDate && this.endDate) {
          const s = new Date(this.startDate);
          const e = new Date(this.endDate);
          periodMs = e.getTime() - s.getTime() || 24 * 60 * 60 * 1000;
        }
        break;
    }

    // Fetch downtime events dari backend untuk semua site
    const results: UptimeData[] = [];

    for (const site of this.sites) {
      let downtimeTotal = 0;      // hanya interface-down = gangguan sungguhan
      let unreachableTotal = 0;   // gagal koneksi = aplikasi kehilangan visibilitas
      let measuredSamples = 0;    // bukti periode ini memang terukur
      let lastDown = '—';
      let lastRecover = '—';

      try {
        const res = await this.api.fetch(`/api/router/downtime-events?site=${encodeURIComponent(site)}`);
        if (res.ok) {
          const data = await res.json();
          const events: any[] = data.events || [];

          // Filter events within the selected period
          const periodStart = new Date(now.getTime() - periodMs);
          const relevantEvents = events.filter((e: any) => {
            const eventTime = new Date(e.start);
            return eventTime >= periodStart;
          });

          for (const ev of relevantEvents) {
            if (!ev.end) continue;
            const seconds = (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 1000;
            if (seconds <= 0) continue;
            // Kejadian tanpa `kind` adalah data lama (sebelum klasifikasi) dan
            // isinya kegagalan koneksi, jadi diperlakukan sebagai `unreachable`.
            if (ev.kind === 'interface-down') downtimeTotal += seconds;
            else unreachableTotal += seconds;
          }

          // Get last down and recover times
          if (relevantEvents.length > 0) {
            const latest = relevantEvents[0]; // events are sorted newest first
            lastDown = latest.start ? new Date(latest.start).toLocaleString('sv-SE').replace('T', ' ').substring(0, 16) : '—';
            lastRecover = latest.end ? new Date(latest.end).toLocaleString('sv-SE').replace('T', ' ').substring(0, 16) : '—';
          }
        }
      } catch (e) {
        // Dibiarkan kosong: situs ini akan tampil tanpa dasar pengukuran.
      }

      // Uptime hanya diklaim kalau periode ini memang terukur. Jumlah sample
      // adalah buktinya; tanpa itu, "100%" cuma asumsi.
      try {
        const params = new URLSearchParams({ site, raw: '1', limit: '1' });
        if (this.startDate) params.set('startDate', this.startDate);
        if (this.endDate) params.set('endDate', this.endDate);
        const res = await this.api.fetch(`/api/router/history?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          measuredSamples = Number(data.totalSamples) || 0;
        }
      } catch (e) {
        // Tanpa bukti -> uptime tidak diklaim.
      }

      const totalPeriodSeconds = periodMs / 1000;
      // Uptime hanya diklaim kalau periode ini benar-benar terukur. Adanya
      // kejadian "tidak terpantau" justru berarti kita TIDAK mengukur, jadi itu
      // bukan dasar untuk mengklaim 100%.
      const hasEvidence = measuredSamples > 0;
      const uptimePct = hasEvidence && totalPeriodSeconds > 0
        ? Math.max(0, Math.min(100, parseFloat((((totalPeriodSeconds - downtimeTotal) / totalPeriodSeconds) * 100).toFixed(1))))
        : null;

      const color = uptimePct === null
        ? '#9AA0A6'
        : uptimePct >= 99 ? '#5B7A52' : uptimePct >= 97 ? '#D9A441' : '#C4442E';

      results.push({
        site,
        uptimePct,
        color,
        downtimeTotal: this.formatDurationText(downtimeTotal),
        unreachableTotal: this.formatDurationText(unreachableTotal),
        lastDown,
        lastRecover
      });
    }

    this.uptimeData = results;
  }



  /** Ubah durasi detik menjadi teks ringkas, mis. `1h 5m 3s`. */
  private formatDurationText(seconds: number): string {
    if (!seconds || seconds <= 0) return '0s';

    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
  }

  filterDowntimeLog() {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (this.selectedPeriod) {
      case 'harian':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'mingguan':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'bulanan':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'tahunan':
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'custom':
        if (this.startDate && this.endDate) {
          startDate = new Date(this.startDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(this.endDate);
          endDate.setHours(23, 59, 59, 999);
        } else {
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 1);
        }
        break;
      default:
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 1);
    }

    // Filter berdasarkan site dan periode
    this.downtimeLog = this.allDowntimeEvents
      .filter(event => event.site === this.selectedSite && event.timestamp >= startDate && event.timestamp <= endDate)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /** Berapa titik grafik yang tidak punya sample sama sekali (jam yang datanya hilang). */
  get chartMissingBuckets(): number {
    return this.chartData.filter(d => (d.samples || 0) === 0).length;
  }

  generateChartPaths() {
    if (this.chartData.length === 0) return;

    const width = 100;
    const height = 130;
    const maxValue = Math.max(
      Math.max(...this.chartData.map(d => d.tx)),
      Math.max(...this.chartData.map(d => d.rx)),
      300
    );

    const points = this.chartData.length;
    const stepX = points > 1 ? width / (points - 1) : 0;

    // Rangkaian titik berurutan yang punya sample. Bucket tanpa sample digambar
    // sebagai CELAH — grafiknya putus — supaya jam yang datanya hilang tidak
    // terlihat seperti trafik nol.
    const runs: number[][] = [];
    let current: number[] = [];
    this.chartData.forEach((data, i) => {
      if ((data.samples || 0) > 0) {
        current.push(i);
      } else if (current.length > 0) {
        runs.push(current);
        current = [];
      }
    });
    if (current.length > 0) runs.push(current);

    const xAt = (i: number) => i * stepX;
    const yAt = (i: number, pick: (d: TrafficData) => number) =>
      height - (pick(this.chartData[i]) / maxValue) * height;

    // Beberapa sub-path dalam satu atribut `d` tidak tersambung, jadi garis
    // terputus di setiap celah secara alami.
    const buildLine = (pick: (d: TrafficData) => number) =>
      runs.map(run => run
        .map((i, k) => `${k === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(i, pick).toFixed(2)}`)
        .join(' ')
      ).join(' ');

    const buildArea = (pick: (d: TrafficData) => number) =>
      runs.map(run => {
        const left = xAt(run[0]).toFixed(2);
        const right = xAt(run[run.length - 1]).toFixed(2);
        const line = run
          .map(i => `L ${xAt(i).toFixed(2)} ${yAt(i, pick).toFixed(2)}`)
          .join(' ');
        return `M ${left} ${height} ${line} L ${right} ${height} Z`;
      }).join(' ');

    this.txPath = buildLine(d => d.tx);
    this.txAreaPath = buildArea(d => d.tx);
    this.rxPath = buildLine(d => d.rx);
    this.rxAreaPath = buildArea(d => d.rx);
  }

  getPeriodLabel(): string {
    if (this.selectedPeriod === 'custom' && this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      return `${this.formatDate(start)} - ${this.formatDate(end)}`;
    }

    const labels: { [key: string]: string } = {
      'harian': 'Hari ini',
      'mingguan': '7 hari terakhir',
      'bulanan': '30 hari terakhir',
      'tahunan': 'Tahun ini'
    };
    return labels[this.selectedPeriod] || '';
  }

  formatDate(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
}
