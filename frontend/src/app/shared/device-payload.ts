/**
 * Body tulis perangkat ke server.
 *
 * `status` perangkat adalah hasil pengukuran (`/api/devices/status`), bukan
 * input pengguna: model backend hanya menerima enum Online/Offline/Degraded,
 * sedangkan nilai tampilan seperti "Tidak Terpantau" dihitung saat baca.
 * Mengirimnya membuat simpan gagal di mode MongoDB ("not a valid enum value
 * for path `status`"), jadi selalu buang dari payload — server juga
 * mengabaikannya sebagai lapis kedua.
 */
export function deviceWritePayload<T extends { status?: unknown }>(device: T): Omit<T, 'status'> {
  const { status, ...rest } = device;
  return rest;
}
