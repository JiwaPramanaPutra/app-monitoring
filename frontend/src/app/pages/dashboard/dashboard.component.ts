import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';

// ── SVG coordinate constants ──────────────────────────────────────────
// ViewBox: "0 0 860 192"
// Y-axis label area : x = 0..46
// Chart area        : x = 48..856, y = 6..178
const CX0 = 48;   // chart left x
const CX1 = 856;  // chart right x
const CY0 = 6;    // chart top y
const CY1 = 178;  // chart bottom y
const CW  = CX1 - CX0;  // 808
const CH  = CY1 - CY0;  // 172

// Rolling window size (60 ticks = ~1 min at 1-s interval)
const POINTS = 60;

// Per-site dummy traffic baseline config (Mbps)
const SITE_CFG: { [k: string]: { base: number; amp: number } } = {
  'Direktorat':  { base: 480, amp: 155 },
  'Gigi':        { base: 190, amp:  70 },
  'Keperawatan': { base: 310, amp:  95 },
  'Gizi':        { base: 145, amp:  55 },
  'Kebidanan':   { base: 240, amp:  88 }
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SidebarComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  constructor(private router: Router) {}

  // ── KPI ─────────────────────────────────────────────────────────────
  // ── KPI ─────────────────────────────────────────────────────────────
  kpi = {
    perangkatDown: 2,
    perangkatTotal: 8,
    siteAktif: 5,
    siteTotal: 5,
    networkAvailability: 96.8,
    laporanBulanIni: 5
  };

  // ── Kesehatan Site ───────────────────────────────────────────────────
  sites = [
    { name: 'Direktorat',  online: 12, total: 12, percentage: 100,  color: '#5B7A52', status: 'Semua online' },
    { name: 'Gigi',        online: 6,  total: 8,  percentage: 75,   color: '#D9A441', status: '2 offline' },
    { name: 'Keperawatan', online: 10, total: 11, percentage: 90.9, color: '#5B7A52', status: '1 offline' },
    { name: 'Gizi',        online: 5,  total: 5,  percentage: 100,  color: '#5B7A52', status: 'Semua online' },
    { name: 'Kebidanan',   online: 9,  total: 11, percentage: 81.8, color: '#D9A441', status: '2 offline' }
  ];

  // ── Real-Time Traffic ────────────────────────────────────────────────
  trafficSites = ['Direktorat', 'Gigi', 'Keperawatan', 'Gizi', 'Kebidanan'];
  selectedSite = 'Direktorat';

  txData: number[] = [];
  rxData: number[] = [];

  // SVG paths (rendered by Angular binding)
  txAreaPath = '';
  txLinePath = '';
  rxAreaPath = '';
  rxLinePath = '';

  // Y-axis grid lines: [{y, label}]
  yGridLines: { y: number; label: string }[] = [];
  yMax = 800;

  // Timestamps shown on chart
  currentTimestamp = '--:--:--';
  oldestTimestamp  = '--:--:--';

  // Stats footer
  stats = { txCurrent: 0, rxCurrent: 0, txAvg: 0, rxAvg: 0, txMax: 0, rxMax: 0 };

  // Internal
  private tickCount = 0;
  private intervalId: any;

  // ── Laporan & Aktivitas ──────────────────────────────────────────────
  perangkatBermasalah = [
    { name: 'AP-Gigi-Lt2',      type: 'Access Point', location: 'Gigi, Lt. 2',        problem: 'Tidak merespons ping',   duration: '12 menit', statusColor: '#C4442E' },
    { name: 'SW-Gigi-Lab',      type: 'Switch',       location: 'Gigi, Lab Komputer', problem: 'Packet loss 23%',        duration: '8 menit',  statusColor: '#D9A441' },
    { name: 'AP-Kebidanan-Lt1', type: 'Access Point', location: 'Kebidanan, Lt. 1',   problem: 'Signal lemah (-78 dBm)', duration: '45 menit', statusColor: '#C4442E' }
  ];

  recentReports = [
    { date: '2024-01-15', time: '14:20', content: 'Penggantian kabel UTP rusak di Lab Komputer', site: 'Direktorat',   technician: 'Rian',  priority: 'Normal', color: '#5B7A52' },
    { date: '2024-01-15', time: '10:05', content: 'Konfigurasi ulang VLAN switch utama',          site: 'Gigi',        technician: 'Budi',  priority: 'Urgent', color: '#C4442E' },
    { date: '2024-01-14', time: '16:30', content: 'Instalasi AP baru di ruang dosen',              site: 'Keperawatan', technician: 'Santi', priority: 'Normal', color: '#5B7A52' }
  ];

  systemActivities = [
    { time: '14:32', content: 'Rian melakukan reboot AP-Lab2-Lt3' },
    { time: '14:18', content: 'Sistem mendeteksi AP-Gigi-Lt2 offline' },
    { time: '13:45', content: 'Budi menambahkan perangkat baru: SW-Kebidanan-R12' },
    { time: '12:20', content: 'Backup konfigurasi router berhasil' },
    { time: '11:55', content: 'Ahmad Fauzi mengubah data AP-Keperawatan-Lt1' }
  ];

  // ── Lifecycle ────────────────────────────────────────────────────────
  ngOnInit() {
    // Pre-fill 60 historical data points
    for (let i = 0; i < POINTS; i++) {
      this.generateTick();
    }
    this.rebuildChart();

    // Live update every 1 second
    this.intervalId = setInterval(() => {
      this.generateTick();
      this.rebuildChart();
    }, 1000);
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  // ── Site change ──────────────────────────────────────────────────────
  onSiteChange() {
    // Reset buffer and prefill for the new site
    this.txData = [];
    this.rxData = [];
    this.tickCount = 0;
    for (let i = 0; i < POINTS; i++) {
      this.generateTick();
    }
    this.rebuildChart();
  }

  /** Navigate to Monitoring page filtered by site */
  goToMonitoringSite(siteName: string) {
    this.router.navigate(['/monitoring'], { queryParams: { site: siteName } });
  }

  /** Navigate to Monitoring page with Down filter */
  goToMonitoringDown() {
    this.router.navigate(['/monitoring'], { queryParams: { status: 'down' } });
  }

  /** Navigate to Monitoring page for all sites */
  goToMonitoringSites() {
    this.router.navigate(['/monitoring']);
  }

  /** Navigate to Laporan page for current month */
  goToLaporanBulanIni() {
    this.router.navigate(['/laporan'], { queryParams: { period: 'currentMonth' } });
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Generate one tick of dummy live traffic for the selected site.
   * Pushes into the rolling buffers and trims to POINTS.
   */
  private generateTick() {
    const cfg = SITE_CFG[this.selectedSite] ?? SITE_CFG['Direktorat'];
    const t   = this.tickCount;

    // Smooth sinusoidal base + small random noise
    const tx = Math.max(10, Math.round(
      cfg.base
      + Math.sin(t / 9)  * cfg.amp
      + Math.cos(t / 16) * cfg.amp * 0.35
      + (Math.random() - 0.5) * cfg.amp * 0.25
    ));
    const rx = Math.max(5, Math.round(tx * (0.36 + Math.random() * 0.12)));

    this.txData.push(tx);
    this.rxData.push(rx);

    if (this.txData.length > POINTS) { this.txData.shift(); this.rxData.shift(); }

    this.tickCount++;
  }

  /**
   * Compute a "nice" Y-axis ceiling from current data.
   * Rounds up to the nearest step in [100,200,300…].
   */
  private computeYMax(): number {
    const rawMax = Math.max(...this.txData, ...this.rxData, 100);
    const margin = rawMax * 1.18;
    const STEPS  = [100,200,300,400,500,600,700,800,900,1000,1200,1500,2000];
    return STEPS.find(s => s >= margin) ?? Math.ceil(margin / 100) * 100;
  }

  /** Rebuild all SVG paths and stats from current rolling buffers. */
  private rebuildChart() {
    const n = this.txData.length;
    if (n < 2) return;

    this.yMax = this.computeYMax();

    // Y-axis grid lines at 0%, 25%, 50%, 75%, 100%
    this.yGridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
      y:     +(CY1 - pct * CH).toFixed(1),
      label: String(Math.round(pct * this.yMax))
    }));

    // Build SVG path strings
    let txArea = `${CX0},${CY1}`;
    let rxArea = `${CX0},${CY1}`;
    let txLine = '';
    let rxLine = '';

    for (let i = 0; i < n; i++) {
      const x   = +(CX0 + (i / (POINTS - 1)) * CW).toFixed(1);
      const txY = +(CY1 - (this.txData[i] / this.yMax) * CH).toFixed(1);
      const rxY = +(CY1 - (this.rxData[i] / this.yMax) * CH).toFixed(1);

      txArea += ` ${x},${txY}`;
      rxArea += ` ${x},${rxY}`;
      txLine += `${i === 0 ? 'M' : 'L'}${x},${txY} `;
      rxLine += `${i === 0 ? 'M' : 'L'}${x},${rxY} `;
    }

    // Close area polygon back to bottom-right
    txArea += ` ${CX1},${CY1}`;
    rxArea += ` ${CX1},${CY1}`;

    this.txAreaPath = txArea;
    this.txLinePath = txLine.trim();
    this.rxAreaPath = rxArea;
    this.rxLinePath = rxLine.trim();

    // Live timestamp
    const now    = new Date();
    const oldest = new Date(now.getTime() - (POINTS - 1) * 1000);
    this.currentTimestamp = this.fmtTime(now);
    this.oldestTimestamp  = this.fmtTime(oldest);

    // Footer stats
    this.stats = {
      txCurrent: this.txData[n - 1],
      rxCurrent: this.rxData[n - 1],
      txAvg: Math.round(this.txData.reduce((a, b) => a + b, 0) / n),
      rxAvg: Math.round(this.rxData.reduce((a, b) => a + b, 0) / n),
      txMax: Math.max(...this.txData),
      rxMax: Math.max(...this.rxData)
    };
  }

  private fmtTime(d: Date): string {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
