import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { ApiService } from '../../services/api.service';
import { browserTimeZone, formatTzTime } from '../../shared/period-window';
import { extractSiteNames } from '../../shared/site-hierarchy';
import {
  ActivityItem,
  ProblemDevice,
  RecentReport,
  SiteHealth,
  buildActivities,
  buildProblemDevices,
  buildRecentReports,
  buildSiteHealth,
  countDevicesByStatus,
  countReportsInMonth,
  deviceAvailabilityPct
} from '../../shared/dashboard-data';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SidebarComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  constructor(
    private router: Router,
    private api: ApiService,
    private cdr: ChangeDetectorRef
  ) {}

  /** Header menjanjikan "update tiap 2 menit" — inilah intervalnya. */
  readonly REFRESH_MS = 120000;
  private refreshTimer: any = null;

  loading = false;
  lastUpdated: Date | null = null;
  readonly timeZone = browserTimeZone();

  // ── KPI ─────────────────────────────────────────────────────────────
  kpi = {
    perangkatDown: 0,
    perangkatTotal: 0,
    siteAktif: 0,
    siteTotal: 0,
    networkAvailability: null as number | null,
    laporanBulanIni: 0
  };

  // ── Kesehatan Site ───────────────────────────────────────────────────
  sites: SiteHealth[] = [];

  // ── Laporan & Aktivitas ──────────────────────────────────────────────
  perangkatBermasalah: ProblemDevice[] = [];
  recentReports: RecentReport[] = [];
  systemActivities: ActivityItem[] = [];

  // ── Lifecycle ────────────────────────────────────────────────────────
  ngOnInit() {
    this.loadDashboard();
    this.refreshTimer = setInterval(() => this.loadDashboard(), this.REFRESH_MS);
  }

  ngOnDestroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Ambil semua sumber data dashboard sekaligus. Satu respons yang bukan JSON
   * tidak menjatuhkan yang lain; KPI terakhir dipertahankan sampai refresh
   * berikutnya atau tombol "Muat ulang".
   */
  async loadDashboard() {
    this.loading = true;
    try {
      const [devicesRes, projectsRes, laporanRes, eventsRes] = await Promise.all([
        this.api.fetch('/api/devices/status'),
        this.api.fetch('/api/projects'),
        this.api.fetch('/api/laporan'),
        this.api.fetch('/api/router/downtime-events')
      ]);

      const devicesData = await devicesRes.json().catch(() => null);
      const projectsData = await projectsRes.json().catch(() => null);
      const laporanData = await laporanRes.json().catch(() => null);
      const eventsData = await eventsRes.json().catch(() => null);

      const devices = devicesData?.devices || [];
      const projects = projectsData?.projects || [];
      const laporans = laporanData?.data || [];
      const events = eventsData?.events || [];

      const siteNames = extractSiteNames(projects);

      const counts = countDevicesByStatus(devices);
      const health = buildSiteHealth(siteNames, devices);

      this.kpi = {
        perangkatDown: counts.offline,
        perangkatTotal: counts.total,
        // "Aktif" = punya minimal satu perangkat online; site tanpa bukti tidak diklaim.
        siteAktif: health.filter(h => h.online > 0).length,
        siteTotal: siteNames.length,
        networkAvailability: deviceAvailabilityPct(devices),
        laporanBulanIni: countReportsInMonth(laporans, this.timeZone)
      };
      this.sites = health;
      this.perangkatBermasalah = buildProblemDevices(devices);
      this.recentReports = buildRecentReports(laporans, this.timeZone);
      this.systemActivities = buildActivities(events, this.timeZone);
      this.lastUpdated = new Date();
    } catch {
      // Data lama dipertahankan; pengguna bisa menekan "Muat ulang".
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  /** Jam update di zona pengguna (fitur 13), mis. `14:03:27`. */
  get updatedLabel(): string {
    return this.lastUpdated ? formatTzTime(this.lastUpdated, this.timeZone) : '';
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
}
