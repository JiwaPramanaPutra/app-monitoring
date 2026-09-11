import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';

interface TrafficData {
  label: string;
  tx: number;
  rx: number;
}

interface UptimeData {
  site: string;
  uptimePct: number;
  color: string;
  downtimeTotal: string;
  lastDown: string;
  lastRecover: string;
}

interface DowntimeEvent {
  site: string;
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
  imports: [CommonModule, FormsModule, SidebarComponent],
  templateUrl: './laporan-trafik.component.html',
  styleUrls: ['./laporan-trafik.component.css']
})
export class LaporanTrafikComponent implements OnInit {
  sites = ['Direktorat', 'Gigi', 'Keperawatan', 'Gizi', 'Kebidanan'];
  periods = [
    { value: 'harian', label: 'Harian' },
    { value: 'mingguan', label: 'Mingguan' },
    { value: 'bulanan', label: 'Bulanan' },
    { value: 'tahunan', label: 'Tahunan' },
    { value: 'custom', label: 'Custom' }
  ];

  selectedSite = 'Direktorat';
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

  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // Set today's date
    const now = new Date('2026-09-09');
    this.today = this.formatDateForInput(now);

    // Set default date range (today)
    this.startDate = this.today;
    this.endDate = this.today;

    // Baca query parameters
    this.route.queryParams.subscribe(params => {
      this.selectedSite = params['site'] || 'Direktorat';
      this.selectedPeriod = params['period'] || 'harian';

      // Validasi site
      if (!this.sites.includes(this.selectedSite)) {
        this.selectedSite = 'Direktorat';
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

      this.generateAllDowntimeEvents();
      this.updateData();
    });
  }

  onSiteChange(site: string) {
    this.selectedSite = site;
    this.updateQueryParams();
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
  }

  applyQuickPreset(days: number) {
    const end = new Date('2026-09-09');
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);

    this.startDate = this.formatDateForInput(start);
    this.endDate = this.formatDateForInput(end);
    this.selectedPeriod = 'custom';
    this.updateQueryParams();
  }

  setDefaultDateRange() {
    const now = new Date('2026-09-09');

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

  updateData() {
    this.generateChartData();
    this.calculateStatistics();
    this.generateUptimeData();
    this.filterDowntimeLog();
    this.generateChartPaths();
  }

  generateChartData() {
    const baseMultipliers: { [key: string]: { tx: number; rx: number } } = {
      'Direktorat': { tx: 1.0, rx: 0.45 },
      'Gigi': { tx: 0.6, rx: 0.35 },
      'Keperawatan': { tx: 0.8, rx: 0.40 },
      'Gizi': { tx: 0.5, rx: 0.30 },
      'Kebidanan': { tx: 0.7, rx: 0.38 }
    };

    const multiplier = baseMultipliers[this.selectedSite];

    switch (this.selectedPeriod) {
      case 'harian':
        this.generateHourlyData(multiplier);
        break;
      case 'mingguan':
        this.generateWeeklyData(multiplier);
        break;
      case 'bulanan':
        this.generateMonthlyData(multiplier);
        break;
      case 'tahunan':
        this.generateYearlyData(multiplier);
        break;
      case 'custom':
        this.generateCustomRangeData(multiplier);
        break;
    }
  }

  generateHourlyData(multiplier: { tx: number; rx: number }) {
    this.chartData = [];
    this.chartLabels = [];

    for (let hour = 0; hour < 24; hour++) {
      const label = `${hour.toString().padStart(2, '0')}:00`;

      // Pola trafik: rendah malam (0-5), naik pagi (6-8), tinggi siang (9-16), turun sore-malam (17-23)
      let baseValue = 300;
      if (hour >= 0 && hour < 6) baseValue = 150 + hour * 20;
      else if (hour >= 6 && hour < 9) baseValue = 300 + (hour - 6) * 50;
      else if (hour >= 9 && hour < 17) baseValue = 450 + Math.sin(hour * 0.5) * 80;
      else baseValue = 450 - (hour - 16) * 30;

      const variance = (Math.random() - 0.5) * 60;
      const tx = Math.round((baseValue + variance) * multiplier.tx);
      const rx = Math.round((baseValue + variance) * multiplier.rx);

      this.chartData.push({ label, tx, rx });
      this.chartLabels.push(label);
    }
  }

  generateWeeklyData(multiplier: { tx: number; rx: number }) {
    const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    this.chartData = [];
    this.chartLabels = [];

    days.forEach((day, index) => {
      // Weekday lebih tinggi dari weekend
      let baseValue = 420;
      if (index >= 5) baseValue = 280; // Sabtu-Minggu lebih rendah

      const variance = (Math.random() - 0.5) * 80;
      const tx = Math.round((baseValue + variance) * multiplier.tx);
      const rx = Math.round((baseValue + variance) * multiplier.rx);

      this.chartData.push({ label: day, tx, rx });
      this.chartLabels.push(day);
    });
  }

  generateMonthlyData(multiplier: { tx: number; rx: number }) {
    const weeks = ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4', 'Minggu 5'];
    this.chartData = [];
    this.chartLabels = [];

    weeks.forEach((week, index) => {
      const baseValue = 400 + index * 10;
      const variance = (Math.random() - 0.5) * 70;
      const tx = Math.round((baseValue + variance) * multiplier.tx);
      const rx = Math.round((baseValue + variance) * multiplier.rx);

      this.chartData.push({ label: week, tx, rx });
      this.chartLabels.push(week);
    });
  }

  generateYearlyData(multiplier: { tx: number; rx: number }) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    this.chartData = [];
    this.chartLabels = [];

    const currentMonth = 8; // September (index 8)

    months.forEach((month, index) => {
      // Jangan tampilkan data masa depan
      if (index > currentMonth) {
        return;
      }

      // Pola tahunan: naik pertengahan tahun
      const baseValue = 380 + Math.sin((index / 12) * Math.PI * 2) * 60;
      const variance = (Math.random() - 0.5) * 50;
      const tx = Math.round((baseValue + variance) * multiplier.tx);
      const rx = Math.round((baseValue + variance) * multiplier.rx);

      this.chartData.push({ label: month, tx, rx });
      this.chartLabels.push(month);
    });
  }

  generateCustomRangeData(multiplier: { tx: number; rx: number }) {
    if (!this.startDate || !this.endDate) return;

    this.chartData = [];
    this.chartLabels = [];

    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Tentukan granularity berdasarkan rentang
    if (daysDiff === 1) {
      // 1 hari = per jam
      this.generateHourlyData(multiplier);
    } else if (daysDiff <= 14) {
      // 2-14 hari = per hari
      this.generateDailyDataForRange(start, end, multiplier);
    } else if (daysDiff <= 60) {
      // 15-60 hari = per minggu
      this.generateWeeklyDataForRange(start, end, multiplier);
    } else {
      // > 60 hari = per bulan
      this.generateMonthlyDataForRange(start, end, multiplier);
    }
  }

  generateDailyDataForRange(start: Date, end: Date, multiplier: { tx: number; rx: number }) {
    const current = new Date(start);
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    while (current <= end) {
      const dayOfWeek = current.getDay();
      const label = `${current.getDate()}/${current.getMonth() + 1}`;

      // Weekday lebih tinggi dari weekend
      let baseValue = 420;
      if (dayOfWeek === 0 || dayOfWeek === 6) baseValue = 280;

      const variance = (Math.random() - 0.5) * 80;
      const tx = Math.round((baseValue + variance) * multiplier.tx);
      const rx = Math.round((baseValue + variance) * multiplier.rx);

      this.chartData.push({ label, tx, rx });
      this.chartLabels.push(label);

      current.setDate(current.getDate() + 1);
    }
  }

  generateWeeklyDataForRange(start: Date, end: Date, multiplier: { tx: number; rx: number }) {
    const current = new Date(start);
    let weekNum = 1;

    while (current <= end) {
      const weekEnd = new Date(current);
      weekEnd.setDate(current.getDate() + 6);

      const label = `Mg ${weekNum}`;
      const baseValue = 400 + (weekNum % 4) * 10;
      const variance = (Math.random() - 0.5) * 70;
      const tx = Math.round((baseValue + variance) * multiplier.tx);
      const rx = Math.round((baseValue + variance) * multiplier.rx);

      this.chartData.push({ label, tx, rx });
      this.chartLabels.push(label);

      current.setDate(current.getDate() + 7);
      weekNum++;
    }
  }

  generateMonthlyDataForRange(start: Date, end: Date, multiplier: { tx: number; rx: number }) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= endMonth) {
      const label = monthNames[current.getMonth()];
      const baseValue = 380 + Math.sin((current.getMonth() / 12) * Math.PI * 2) * 60;
      const variance = (Math.random() - 0.5) * 50;
      const tx = Math.round((baseValue + variance) * multiplier.tx);
      const rx = Math.round((baseValue + variance) * multiplier.rx);

      this.chartData.push({ label, tx, rx });
      this.chartLabels.push(label);

      current.setMonth(current.getMonth() + 1);
    }
  }

  calculateStatistics() {
    if (this.chartData.length === 0) return;

    const txValues = this.chartData.map(d => d.tx);
    const rxValues = this.chartData.map(d => d.rx);

    // Current = nilai terakhir
    this.txCurrent = txValues[txValues.length - 1];
    this.rxCurrent = rxValues[rxValues.length - 1];

    // Average
    this.txAverage = Math.round(txValues.reduce((a, b) => a + b, 0) / txValues.length);
    this.rxAverage = Math.round(rxValues.reduce((a, b) => a + b, 0) / rxValues.length);

    // Maximum
    this.txMaximum = Math.max(...txValues);
    this.rxMaximum = Math.max(...rxValues);
  }

  generateUptimeData() {
    const uptimeConfigs: { [key: string]: { [key: string]: { uptime: number; downtime: string; lastDown: string; lastRecover: string } } } = {
      'Direktorat': {
        'harian': { uptime: 100, downtime: '0s', lastDown: '—', lastRecover: '—' },
        'mingguan': { uptime: 99.8, downtime: '2m 15s', lastDown: '2026-09-08 03:15', lastRecover: '2026-09-08 03:17' },
        'bulanan': { uptime: 99.5, downtime: '3h 35m', lastDown: '2026-08-28 14:20', lastRecover: '2026-08-28 17:55' },
        'tahunan': { uptime: 99.2, downtime: '2d 18h', lastDown: '2026-07-14 09:30', lastRecover: '2026-07-17 03:15' },
        'custom': { uptime: 99.6, downtime: '1h 45m', lastDown: '2026-09-05 11:15', lastRecover: '2026-09-05 13:00' }
      },
      'Gigi': {
        'harian': { uptime: 95.8, downtime: '1h 0m', lastDown: '2026-09-09 02:15', lastRecover: '2026-09-09 03:15' },
        'mingguan': { uptime: 97.2, downtime: '4h 42m', lastDown: '2026-09-07 09:30', lastRecover: '2026-09-07 14:12' },
        'bulanan': { uptime: 96.5, downtime: '1d 1h', lastDown: '2026-08-20 11:15', lastRecover: '2026-08-21 12:20' },
        'tahunan': { uptime: 95.8, downtime: '15d 6h', lastDown: '2026-06-10 08:00', lastRecover: '2026-06-25 14:15' },
        'custom': { uptime: 96.8, downtime: '12h 30m', lastDown: '2026-09-07 09:30', lastRecover: '2026-09-07 22:00' }
      },
      'Keperawatan': {
        'harian': { uptime: 100, downtime: '0s', lastDown: '—', lastRecover: '—' },
        'mingguan': { uptime: 99.5, downtime: '8m 45s', lastDown: '2026-09-06 14:20', lastRecover: '2026-09-06 14:29' },
        'bulanan': { uptime: 98.9, downtime: '7h 52m', lastDown: '2026-08-15 10:05', lastRecover: '2026-08-15 17:57' },
        'tahunan': { uptime: 98.5, downtime: '5d 10h', lastDown: '2026-05-22 16:30', lastRecover: '2026-05-28 02:45' },
        'custom': { uptime: 99.2, downtime: '2h 15m', lastDown: '2026-09-06 14:20', lastRecover: '2026-09-06 16:35' }
      },
      'Gizi': {
        'harian': { uptime: 100, downtime: '0s', lastDown: '—', lastRecover: '—' },
        'mingguan': { uptime: 100, downtime: '0s', lastDown: '—', lastRecover: '—' },
        'bulanan': { uptime: 99.9, downtime: '45s', lastDown: '2026-08-05 03:22', lastRecover: '2026-08-05 03:23' },
        'tahunan': { uptime: 99.7, downtime: '1d 3h', lastDown: '2026-04-18 07:10', lastRecover: '2026-04-19 10:25' },
        'custom': { uptime: 100, downtime: '0s', lastDown: '—', lastRecover: '—' }
      },
      'Kebidanan': {
        'harian': { uptime: 100, downtime: '0s', lastDown: '—', lastRecover: '—' },
        'mingguan': { uptime: 98.1, downtime: '3h 11m', lastDown: '2026-09-05 11:15', lastRecover: '2026-09-05 14:26' },
        'bulanan': { uptime: 97.8, downtime: '15h 48m', lastDown: '2026-08-22 08:30', lastRecover: '2026-08-23 00:18' },
        'tahunan': { uptime: 97.2, downtime: '10d 5h', lastDown: '2026-03-15 13:45', lastRecover: '2026-03-25 18:50' },
        'custom': { uptime: 98.5, downtime: '5h 20m', lastDown: '2026-09-05 11:15', lastRecover: '2026-09-05 16:35' }
      }
    };

    this.uptimeData = this.sites.map(site => {
      const config = uptimeConfigs[site][this.selectedPeriod];
      const color = config.uptime >= 99 ? '#5B7A52' : config.uptime >= 97 ? '#D9A441' : '#C4442E';

      return {
        site,
        uptimePct: config.uptime,
        color,
        downtimeTotal: config.downtime,
        lastDown: config.lastDown,
        lastRecover: config.lastRecover
      };
    });
  }

  generateAllDowntimeEvents() {
    this.allDowntimeEvents = [
      // Direktorat
      { site: 'Direktorat', start: '2026-09-08 03:15:12', duration: '2m 15s', color: '#5B7A52', end: '2026-09-08 03:17:27', reported: false, timestamp: new Date('2026-09-08T03:15:12') },
      { site: 'Direktorat', start: '2026-08-28 14:20:30', duration: '3h 35m', color: '#D9A441', end: '2026-08-28 17:55:18', reported: true, timestamp: new Date('2026-08-28T14:20:30') },
      { site: 'Direktorat', start: '2026-07-14 09:30:45', duration: '2d 18h', color: '#C4442E', end: '2026-07-17 03:15:22', reported: true, timestamp: new Date('2026-07-14T09:30:45') },

      // Gigi
      { site: 'Gigi', start: '2026-09-09 02:15:08', duration: '1h 0m', color: '#D9A441', end: '2026-09-09 03:15:08', reported: true, timestamp: new Date('2026-09-09T02:15:08') },
      { site: 'Gigi', start: '2026-09-07 09:30:15', duration: '4h 42m', color: '#C4442E', end: '2026-09-07 14:12:08', reported: true, timestamp: new Date('2026-09-07T09:30:15') },
      { site: 'Gigi', start: '2026-08-20 11:15:42', duration: '1d 1h', color: '#C4442E', end: '2026-08-21 12:20:18', reported: true, timestamp: new Date('2026-08-20T11:15:42') },
      { site: 'Gigi', start: '2026-06-10 08:00:00', duration: '15d 6h', color: '#C4442E', end: '2026-06-25 14:15:30', reported: true, timestamp: new Date('2026-06-10T08:00:00') },

      // Keperawatan
      { site: 'Keperawatan', start: '2026-09-06 14:20:30', duration: '8m 45s', color: '#5B7A52', end: '2026-09-06 14:29:15', reported: false, timestamp: new Date('2026-09-06T14:20:30') },
      { site: 'Keperawatan', start: '2026-08-15 10:05:20', duration: '7h 52m', color: '#D9A441', end: '2026-08-15 17:57:45', reported: true, timestamp: new Date('2026-08-15T10:05:20') },
      { site: 'Keperawatan', start: '2026-05-22 16:30:12', duration: '5d 10h', color: '#C4442E', end: '2026-05-28 02:45:08', reported: true, timestamp: new Date('2026-05-22T16:30:12') },

      // Gizi
      { site: 'Gizi', start: '2026-08-05 03:22:15', duration: '45s', color: '#5B7A52', end: '2026-08-05 03:23:00', reported: false, timestamp: new Date('2026-08-05T03:22:15') },
      { site: 'Gizi', start: '2026-04-18 07:10:30', duration: '1d 3h', color: '#D9A441', end: '2026-04-19 10:25:18', reported: true, timestamp: new Date('2026-04-18T07:10:30') },

      // Kebidanan
      { site: 'Kebidanan', start: '2026-09-05 11:15:42', duration: '3h 11m', color: '#D9A441', end: '2026-09-05 14:26:58', reported: true, timestamp: new Date('2026-09-05T11:15:42') },
      { site: 'Kebidanan', start: '2026-08-22 08:30:10', duration: '15h 48m', color: '#C4442E', end: '2026-08-23 00:18:45', reported: true, timestamp: new Date('2026-08-22T08:30:10') },
      { site: 'Kebidanan', start: '2026-03-15 13:45:20', duration: '10d 5h', color: '#C4442E', end: '2026-03-25 18:50:30', reported: true, timestamp: new Date('2026-03-15T13:45:20') }
    ];
  }

  filterDowntimeLog() {
    const now = new Date('2026-09-09T07:23:18');
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

  generateChartPaths() {
    if (this.chartData.length === 0) return;

    const width = 100;
    const height = 130;
    const maxValue = Math.max(
      Math.max(...this.chartData.map(d => d.tx)),
      Math.max(...this.chartData.map(d => d.rx)),
      500
    );

    const points = this.chartData.length;
    const stepX = width / (points - 1);

    // Generate Tx path
    let txPathPoints: string[] = [];
    this.chartData.forEach((data, i) => {
      const x = i * stepX;
      const y = height - (data.tx / maxValue) * height;
      txPathPoints.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
    });
    this.txPath = txPathPoints.join(' ');
    this.txAreaPath = `M 0 ${height} ${txPathPoints.join(' ').substring(2)} L ${width} ${height} Z`;

    // Generate Rx path
    let rxPathPoints: string[] = [];
    this.chartData.forEach((data, i) => {
      const x = i * stepX;
      const y = height - (data.rx / maxValue) * height;
      rxPathPoints.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
    });
    this.rxPath = rxPathPoints.join(' ');
    this.rxAreaPath = `M 0 ${height} ${rxPathPoints.join(' ').substring(2)} L ${width} ${height} Z`;
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
