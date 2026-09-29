import { formatTzTime, tzDateString } from './period-window';

/** Bentuk minimal device dari `/api/devices/status` yang dibutuhkan dashboard. */
export interface DeviceLike {
  name?: string;
  type?: string;
  ip?: string;
  siteLocation?: string;
  status?: string;
}

export interface SiteHealth {
  name: string;
  total: number;
  online: number;
  percentage: number;
  status: string;
  color: string;
}

export interface ProblemDevice {
  name: string;
  type: string;
  location: string;
  problem: string;
  ip: string;
  statusColor: string;
}

export interface RecentReport {
  date: string;
  time: string;
  content: string;
  site: string;
  technician: string;
  type: string;
  color: string;
}

export interface ActivityItem {
  time: string;
  content: string;
}

const ONLINE = 'Online';
const OFFLINE = 'Offline';

/** Warna badge per jenis laporan (konsisten dengan warna jenis di ekspor). */
export const REPORT_TYPE_COLORS: { [key: string]: string } = {
  'Jaringan': '#3E3A6B',
  'Printer / komputer': '#D9A441',
  'Monitoring kegiatan khusus': '#5B7A52'
};

export function countDevicesByStatus(devices: DeviceLike[] | null | undefined) {
  const list = Array.isArray(devices) ? devices : [];
  let online = 0;
  let offline = 0;
  let notMonitored = 0;

  for (const device of list) {
    const status = String(device?.status || '');
    if (status === ONLINE) online++;
    else if (status === OFFLINE) offline++;
    else notMonitored++;
  }

  return { total: list.length, online, offline, notMonitored };
}

/**
 * Persentase perangkat online dari perangkat yang statusnya TERKLAIM
 * (Online + Offline). `Tidak Terpantau` tidak dihitung supaya angka tidak
 * mengklaim dasar pengukuran yang tidak ada; tanpa perangkat terklaim -> null.
 */
export function deviceAvailabilityPct(devices: DeviceLike[] | null | undefined): number | null {
  const { online, offline } = countDevicesByStatus(devices);
  const claimed = online + offline;
  if (claimed === 0) return null;
  return Math.round((online / claimed) * 100);
}

export function buildSiteHealth(siteNames: string[] | null | undefined, devices: DeviceLike[] | null | undefined): SiteHealth[] {
  const list = Array.isArray(siteNames) ? siteNames : [];
  const all = Array.isArray(devices) ? devices : [];

  return list.map(name => {
    const own = all.filter(d => d?.siteLocation === name);
    const total = own.length;
    const online = own.filter(d => d?.status === ONLINE).length;
    const percentage = total > 0 ? Math.round((online / total) * 100) : 0;
    const base = { name, total, online, percentage };

    if (total === 0) return { ...base, status: 'Belum ada perangkat', color: '#9AA0A6' };
    if (online === total) return { ...base, status: 'Sehat', color: '#5B7A52' };
    if (online === 0) return { ...base, status: 'Gangguan', color: '#C4442E' };
    return { ...base, status: 'Perlu perhatian', color: '#D9A441' };
  });
}

export function buildProblemDevices(devices: DeviceLike[] | null | undefined, limit = 3): ProblemDevice[] {
  return (Array.isArray(devices) ? devices : [])
    .filter(d => d?.status && d.status !== ONLINE)
    .slice(0, limit)
    .map(d => ({
      name: d.name || d.ip || 'Perangkat',
      type: d.type || '—',
      location: d.siteLocation || '—',
      problem: d.status === OFFLINE ? 'Tidak dapat dijangkau' : 'Belum pernah terpantau',
      ip: d.ip || '—',
      statusColor: d.status === OFFLINE ? '#C4442E' : '#B45309'
    }));
}

/** Jumlah laporan yang `date`-nya jatuh di bulan berjalan menurut zona `tz`. */
export function countReportsInMonth(laporans: any[] | null | undefined, tz: string, now: Date = new Date()): number {
  const prefix = tzDateString(now, tz).slice(0, 7); // YYYY-MM
  return (Array.isArray(laporans) ? laporans : []).filter(l => String(l?.date || '').startsWith(prefix)).length;
}

export function buildRecentReports(laporans: any[] | null | undefined, tz: string, limit = 3): RecentReport[] {
  return (Array.isArray(laporans) ? laporans : [])
    .slice()
    .sort((a, b) =>
      new Date(b?.createdAt || b?.date || 0).getTime() - new Date(a?.createdAt || a?.date || 0).getTime())
    .slice(0, limit)
    .map(l => ({
      date: String(l.date || '—'),
      time: l.createdAt ? formatTzTime(l.createdAt, tz).slice(0, 5) : '',
      content: String(l.masalah || l.type || '—'),
      site: String(l.site || '—'),
      technician: String(l.technician || '—'),
      type: String(l.type || '—'),
      color: REPORT_TYPE_COLORS[l.type] || '#6B7280'
    }));
}

/** Aktivitas terbaru dari riwayat downtime/pulih (Audit Log penuh menyusul). */
export function buildActivities(events: any[] | null | undefined, tz: string, limit = 5): ActivityItem[] {
  return (Array.isArray(events) ? events : [])
    .filter(e => e && (e.startTimeIso || e.start))
    .slice()
    .sort((a, b) =>
      new Date(b.startTimeIso || b.start).getTime() - new Date(a.startTimeIso || a.start).getTime())
    .slice(0, limit)
    .map(e => {
      const kind = e.kind === 'interface-down' ? 'downtime (link putus)' : 'tidak terpantau';
      const site = e.site || '—';
      const iso = e.endTimeIso || e.startTimeIso || e.start;
      return {
        time: (formatTzTime(iso, tz) || '').slice(0, 5),
        content: e.endTimeIso ? `${site} pulih dari ${kind}` : `${site} ${kind}`
      };
    });
}
