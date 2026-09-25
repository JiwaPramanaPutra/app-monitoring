import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { SiteDropdownComponent } from '../../components/site-dropdown/site-dropdown.component';
import { ProjectService } from '../../services/project.service';
import { ApiService } from '../../services/api.service';
import Swal from 'sweetalert2';
import { alignFor, countMissing, indexFromRatio, lastIndexWithData, leftPercent, missingLimit, TooltipAlign } from '../../shared/chart-math';
import { clipSeconds, currentSlot, overlapsWindow, periodWindow, PeriodWindow } from '../../shared/period-window';

interface TrafficData {
  label: string;
  tx: number;
  rx: number;
  /** Jumlah sample di bucket ini. `0` berarti jam itu datanya hilang, bukan nol. */
  samples?: number;
}

/** Titik grafik yang sedang ditunjuk kursor, sudah siap dipakai template. */
interface HoveredPoint {
  label: string;
  tx: number;
  rx: number;
  samples: number;
  /** Posisi titik di dalam kotak grafik, dalam persen. */
  leftPct: number;
  txTopPct: number;
  rxTopPct: number;
  /** Perataan kotak tooltip terhadap titiknya. */
  align: TooltipAlign;
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
  /** ISO waktu pulih. Dipakai predikat tumpang tindih, sama seperti ringkasan. */
  endTime?: string;
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
  /** Titik grafik yang sedang ditunjuk kursor (tooltip keterangan Mbps). */
  hoveredPoint: HoveredPoint | null = null;
  /** Skala maksimum grafik; dipakai bersama oleh path dan penanda kursor. */
  chartMaxValue = 300;
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
            // ISO waktu pulih dipakai predikat tumpang tindih di log, sama
            // seperti ringkasan uptime — bukan sekadar waktu mulai.
            endTime: e.endTimeIso || undefined,
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

  /**
   * Isi input tanggal dari jendela periode yang sama dengan grafik, ekspor,
   * ringkasan, dan log. Sebelumnya fungsi ini menghitung sendiri, sehingga untuk
   * `bulanan` dan `tahunan` grafik dan tabel menampilkan himpunan hari berbeda.
   */
  setDefaultDateRange() {
    if (this.selectedPeriod === 'custom') return;

    const win = this.periodWindow();
    this.startDate = win.startDate;
    this.endDate = win.endDate;
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

  /**
   * Satu jendela periode untuk seluruh halaman.
   *
   * Aritmetikanya ada di `shared/period-window.ts` — termasuk definisi WIB
   * (UTC+7, bukan WITA/UTC+8) — supaya bisa diuji dan supaya ringkasan, log,
   * probe, input tanggal, grafik, serta ekspor tidak bisa memakai batas berbeda.
   */
  private periodWindow(): PeriodWindow {
    return periodWindow(this.selectedPeriod, new Date(), this.startDate, this.endDate);
  }

  async generateUptimeData() {
    const win = this.periodWindow();

    // Fetch downtime events dari backend untuk semua site
    const results: UptimeData[] = [];

    for (const site of this.sites) {
      let downtimeTotal = 0;      // hanya interface-down = gangguan sungguhan
      let unreachableTotal = 0;   // gagal koneksi = aplikasi kehilangan visibilitas
      let hasSamples = false;     // bukti periode ini memang terukur
      let lastDown = '—';
      let lastRecover = '—';

      try {
        const res = await this.api.fetch(`/api/router/downtime-events?site=${encodeURIComponent(site)}`);
        if (res.ok) {
          const data = await res.json();
          const events: any[] = data.events || [];

          // Event yang TUMPANG TINDIH dengan jendela, bukan yang sekadar mulai di
          // dalamnya. Predikat dan pemotongan durasinya memakai fungsi yang SAMA
          // dengan log downtime, jadi ringkasan dan log tidak bisa berbeda
          // pendapat tentang event yang melewati batas jendela.
          const nowMs = win.end.getTime();
          const relevantEvents = events.filter((e: any) => {
            const eventStart = new Date(e.start).getTime();
            const eventEnd = e.end ? new Date(e.end).getTime() : nowMs;
            return overlapsWindow(eventStart, eventEnd, win);
          });

          for (const ev of relevantEvents) {
            if (!ev.end) continue;
            const seconds = clipSeconds(new Date(ev.start).getTime(), new Date(ev.end).getTime(), win);
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

      // Uptime hanya diklaim kalau periode ini memang terukur, dan yang
      // dibutuhkan cuma "ada sample atau tidak". Backend ditanya dengan mode
      // hitung; sebelumnya seluruh riwayat dimuat, digabung, dibuang
      // duplikatnya, lalu diurutkan hanya untuk satu angka.
      try {
        const params = new URLSearchParams({ site, count: '1' });
        params.set('startDate', win.startDate);
        params.set('endDate', win.endDate);
        const res = await this.api.fetch(`/api/router/history?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          hasSamples = !!data.hasSamples;
        }
      } catch (e) {
        // Tanpa bukti -> uptime tidak diklaim.
      }

      const totalPeriodSeconds = Math.max(0, (win.end.getTime() - win.start.getTime()) / 1000);
      // Uptime hanya diklaim kalau periode ini benar-benar terukur. Adanya
      // kejadian "tidak terpantau" justru berarti kita TIDAK mengukur, jadi itu
      // bukan dasar untuk mengklaim 100%.
      const hasEvidence = hasSamples;
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
    const win = this.periodWindow();

    // Predikat yang SAMA dengan ringkasan uptime: event yang tumpang tindih
    // dengan jendela, lewat fungsi yang sama pula. Menyaring berdasarkan waktu
    // MULAI saja membuat gangguan yang melewati tengah malam menurunkan uptime
    // tanpa muncul di log — dan event yang baru mulai di ujung jendela tampil
    // dengan durasi nol.
    this.downtimeLog = this.allDowntimeEvents
      .filter(event => event.site === this.selectedSite)
      .filter(event => {
        const start = event.timestamp.getTime();
        const end = event.endTime ? new Date(event.endTime).getTime() : win.end.getTime();
        return overlapsWindow(start, end, win);
      })
      .map(event => {
        // Event yang belum pulih masih berdurasi '0s' dari backend. Tampilkan
        // berapa lama sudah berjalan sampai ujung jendela, bukan nol.
        if (event.endTime) return event;
        const seconds = Math.max(0, (win.end.getTime() - event.timestamp.getTime()) / 1000);
        return { ...event, duration: this.formatDurationText(seconds) };
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /** Berapa titik grafik yang tidak punya sample sama sekali (jam yang datanya hilang). */
  get chartMissingBuckets(): number {
    return countMissing(
      this.chartData,
      missingLimit(lastIndexWithData(this.chartData), this.currentSlotIndex())
    );
  }

  /**
   * Indeks slot yang mewakili "sekarang" pada periode aktif, atau -1 bila tidak
   * bisa ditentukan (periode yang tidak punya slot waktu, mis. bulanan).
   *
   * Dipakai bersama `lastIndexWithData`: yang lebih jauh di antara keduanya
   * menjadi batas hitung, sehingga jam/bulan yang belum lewat tetap dikecualikan
   * tanpa mengorbankan celah setelah sample terakhir.
   *
   * Zonanya ada di `shared/period-window.ts` (WIB, bukan WITA) — label yang
   * dicocokkan diterbitkan backend dengan offset yang sama.
   */
  private currentSlotIndex(): number {
    return currentSlot(this.selectedPeriod, this.chartLabels, new Date());
  }

  /** Label sumbu Y pada `fraction` dari skala. Sumbu mengikuti `chartMaxValue`. */
  axisLabel(fraction: number): string {
    const value = (this.chartMaxValue || 300) * fraction;
    return String(value >= 100 ? Math.round(value) : Math.round(value * 10) / 10);
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

    // Disimpan supaya penanda kursor memakai skala yang sama dengan path.
    this.chartMaxValue = maxValue;

    this.txPath = buildLine(d => d.tx);
    this.txAreaPath = buildArea(d => d.tx);
    this.rxPath = buildLine(d => d.rx);
    this.rxAreaPath = buildArea(d => d.rx);
  }

  /**
   * Petakan posisi kursor ke titik terdekat pada grafik.
   * Semua titik berjarak sama (`stepX = lebar/(n-1)`), jadi cukup satu pembagian.
   */
  onChartHover(event: MouseEvent) {
    const points = this.chartData.length;
    if (points === 0) return;

    const host = event.currentTarget as HTMLElement | null;
    const rect = host ? host.getBoundingClientRect() : null;
    if (!rect || rect.width <= 0) return;

    const index = indexFromRatio((event.clientX - rect.left) / rect.width, points);
    const point = this.chartData[index];
    const max = this.chartMaxValue || 300;
    const left = leftPercent(index, points);

    // Area grafik tingginya 130 dari viewBox 150 -> ubah ke persen kotak.
    const topPct = (mbps: number) =>
      ((130 - Math.min(130, ((Number(mbps) || 0) / max) * 130)) / 150) * 100;

    this.hoveredPoint = {
      label: point.label,
      tx: point.tx,
      rx: point.rx,
      samples: point.samples || 0,
      leftPct: left,
      txTopPct: topPct(point.tx),
      rxTopPct: topPct(point.rx),
      align: alignFor(left)
    };
    this.cdr.markForCheck();
  }

  onChartLeave() {
    this.hoveredPoint = null;
    this.cdr.markForCheck();
  }

  /** Nilai keterangan grafik: Mbps bila >= 1, selain itu Kbps. */
  formatChartValue(mbps: number): string {
    const value = Number(mbps) || 0;
    if (value <= 0) return '0 Kbps';
    return value >= 1 ? `${value.toFixed(2)} Mbps` : `${Math.round(value * 1000)} Kbps`;
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
