import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';

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
  kpi = {
    perangkatDown: 0,
    perangkatTotal: 0,
    siteAktif: 0,
    siteTotal: 0,
    networkAvailability: 0,
    laporanBulanIni: 0
  };

  // ── Kesehatan Site ───────────────────────────────────────────────────
  sites: any[] = [];

  // ── Laporan & Aktivitas ──────────────────────────────────────────────
  perangkatBermasalah: any[] = [];
  recentReports: any[] = [];
  systemActivities: any[] = [];

  // ── Lifecycle ────────────────────────────────────────────────────────
  ngOnInit() {
  }

  ngOnDestroy() {
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
