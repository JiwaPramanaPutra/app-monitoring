/**
 * Kaitan antara record perangkat dan `routerConfig` site yang dipakai widget
 * trafik. Keduanya dua data terpisah di penyimpanan, jadi aturan "perangkat
 * inilah router trafiknya" harus didefinisikan sekali dan diuji.
 *
 * Salah mencocokkan berakibat nyata: widget terus menunjuk router yang salah
 * saat IP perangkat diubah, atau tetap memantau setelah perangkatnya dihapus.
 */

export interface TrafficRouterCandidate {
  type?: string;
  ip?: string;
}

export interface SiteRouterConfigLike {
  host?: string;
}

export interface SiteRouterOwner {
  routerConfig?: SiteRouterConfigLike | null;
}

/**
 * Site ini punya monitoring trafik router yang aktif?
 *
 * Aturannya sama dengan `resolveRouterConfig` di backend: `routerConfig` dengan
 * host kosong berarti TIDAK dikonfigurasi. Tanpa ini, grafik widget sempat
 * tergambar dari riwayat lama untuk site yang memang tidak dipantau, lalu
 * dibersihkan oleh balasan `siteConfigured: false` — terbaca sebagai kedipan.
 */
export function hasTrafficRouterConfig(site: SiteRouterOwner | null | undefined): boolean {
  return !!String(site?.routerConfig?.host || '').trim();
}

export interface TrafficRouterDevice extends TrafficRouterCandidate {
  siteLocation?: string;
  id?: string | number;
  /** Dokumen Mongo hanya punya `_id`; mode JSON lokal menyimpan keduanya. */
  _id?: string | number;
}

/**
 * Apakah penyuntingan/menghapus perangkat ini meninggalkan site-nya tanpa Router?
 *
 * Berlaku saat perangkat berhenti menjadi Router di site lamanya — karena
 * tipenya diganti (Router -> Access Point), karena ia pindah ke site lain, atau
 * karena ia dihapus. Ketiganya berdampak sama: site itu tidak punya router lagi,
 * jadi monitoring trafiknya harus ikut berhenti.
 *
 * `next` memakai nilai SETELAH perubahan; untuk penghapusan kirim tipe yang
 * sudah tidak ada. `devices` berisi daftar yang sudah tidak memuat perangkat
 * tersebut (atau akan disaring berdasarkan `id`).
 */
export function leavesSiteWithoutRouter(
  original: { type?: string; siteLocation?: string; id?: string | number; _id?: string | number } | null | undefined,
  next: { type?: string; siteLocation?: string } | null | undefined,
  devices: TrafficRouterDevice[] | null | undefined
): boolean {
  if (!original || original.type !== 'Router') return false;

  const originalSite = original.siteLocation || '';
  const after = next || {};
  const sameSite = (after.siteLocation || '') === originalSite;
  // Masih Router di site yang sama -> tidak ada yang hilang.
  if (after.type === 'Router' && sameSite) return false;

  const remaining = (Array.isArray(devices) ? devices : []).filter(d => {
    if (!d || d.type !== 'Router' || (d.siteLocation || '') !== originalSite) return false;
    // Bandingkan ke `id` MAUPUN `_id`: dokumen Mongo tidak punya `id`, sehingga
    // memeriksa `id` saja meninggalkan record basi perangkat itu sendiri di
    // dalam daftar dan fungsi ini tidak akan pernah mengembalikan `true`.
    const excluded = original.id !== undefined ? String(original.id) : null;
    const excludedAlt = original._id !== undefined ? String(original._id) : null;
    if (excluded !== null && (String(d.id ?? '') === excluded || String(d._id ?? '') === excluded)) return false;
    if (excludedAlt !== null && (String(d.id ?? '') === excludedAlt || String(d._id ?? '') === excludedAlt)) return false;
    return true;
  });

  return remaining.length === 0;
}

/** Site ini masih punya perangkat Router terdaftar? */
export function hasRouterDeviceFor(
  siteName: string,
  devices: TrafficRouterDevice[] | null | undefined
): boolean {
  return (Array.isArray(devices) ? devices : []).some(
    d => !!d && d.type === 'Router' && (d.siteLocation || '') === siteName
  );
}

/**
 * Catatan konsistensi `routerConfig` site terhadap daftar perangkat.
 * Mengembalikan `null` bila semuanya selaras.
 *
 * Tiga keadaan berbeda dan jangan dicampur:
 * - host kosong -> memang tidak dipantau, tidak perlu catatan;
 * - site tidak punya perangkat Router sama sekali -> monitoring tidak terlacak
 *   di inventaris;
 * - ada perangkat Router tapi IP-nya beda dari host -> record perangkat basi,
 *   dan ini yang dulu membuat widget terus menunjuk router yang salah.
 */
export function trafficRouterNoteFor(
  siteName: string,
  routerConfig: SiteRouterConfigLike | null | undefined,
  devices: TrafficRouterDevice[] | null | undefined
): string | null {
  const host = String(routerConfig?.host || '').trim();
  if (!host) return null;

  const routers = (Array.isArray(devices) ? devices : [])
    .filter(d => !!d && d.type === 'Router' && (d.siteLocation || '') === siteName);

  if (routers.length === 0) return 'belum punya perangkat Router terdaftar';

  if (!routers.some(d => isTrafficRouter(d, routerConfig))) {
    const ips = routers
      .map(d => String(d.ip || '').trim())
      .filter(Boolean)
      .join(', ');
    return `IP perangkat Router (${ips || '-'}) tidak cocok dengan host router trafik ${host}`;
  }

  return null;
}

/**
 * `true` hanya bila perangkat bertipe Router DAN IP-nya persis host
 * `routerConfig` site. Perbandingan memakai nilai yang sudah di-trim dan tidak
 * membedakan huruf besar/kecil, karena host bisa hostname maupun IP.
 */
export function isTrafficRouter(
  device: TrafficRouterCandidate | null | undefined,
  routerConfig: SiteRouterConfigLike | null | undefined
): boolean {
  if (!device || !routerConfig) return false;
  if (device.type !== 'Router') return false;

  const host = String(routerConfig.host || '').trim().toLowerCase();
  const ip = String(device.ip || '').trim().toLowerCase();
  return host !== '' && ip !== '' && host === ip;
}

export interface SiteRouterCredentialsLike {
  host?: string;
  user?: string;
  password?: string;
  /** Penanda non-rahasia dari backend: site ini punya password router tersimpan. */
  hasPassword?: boolean;
}

/** Isi blok "Jadikan router trafik site ini" pada form perangkat. */
export interface BridgeDraft {
  enabled: boolean;
  host?: string;
  interface?: string;
  user?: string;
  password?: string;
}

/**
 * Periksa blok bridge sebelum disimpan. Mengembalikan pesan masalah, atau `null`
 * bila siap.
 *
 * Interface kosong sengaja TIDAK diizinkan. Kode sebelumnya menulis `'ether1'`
 * sebagai cadangan, dan interface cadangan yang salah adalah persis penyebab
 * widget memantau port yang tidak ada sementara tabel perangkat tampak benar.
 *
 * Username/password boleh kosong hanya bila site sudah menyimpannya. Karena
 * `GET /api/projects` meredaksi password, yang tersedia dari site hanyalah
 * penanda `hasPassword` — tanpa itu form akan menuntut password diketik ulang
 * di setiap penyimpanan.
 */
export function bridgeDraftError(
  draft: BridgeDraft | null | undefined,
  stored: SiteRouterCredentialsLike | null | undefined
): string | null {
  if (!draft || !draft.enabled) return null;

  if (!String(draft.host || '').trim()) {
    return 'Isi IP Address perangkat dulu sebelum menjadikannya router trafik site.';
  }
  if (!String(draft.interface || '').trim()) {
    return 'Pilih interface trafik site dulu — klik "Muat interface dari router", lalu pilih dari daftar.';
  }

  const storedUser = String(stored?.user || '').trim();
  const hasStoredPassword = !!stored?.hasPassword || !!String(stored?.password || '');

  if (!String(draft.user || '').trim() && !storedUser) {
    return 'Isi username RouterOS.';
  }
  if (!String(draft.password || '') && !hasStoredPassword) {
    return 'Isi password RouterOS.';
  }

  return null;
}
