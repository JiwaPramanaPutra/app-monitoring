// Aturan identitas perangkat: satu IP hanya boleh dipakai satu perangkat di site
// yang sama. Cerminan `frontend/src/app/shared/device-identity.ts` — dijaga di
// backend juga supaya aturannya berlaku untuk klien mana pun, bukan hanya UI.

// Nilai yang dipakai UI untuk "tidak ada IP", bukan alamat sungguhan.
const NO_IP = new Set(['', '—', '-', 'n/a', 'na', 'tidak ada']);

/** IP yang benar-benar terisi, bukan placeholder tabel. */
function isUsableDeviceIp(ip) {
    return !NO_IP.has(String(ip ?? '').trim().toLowerCase());
}

/**
 * Perangkat lain di **site yang sama** yang sudah memakai `ip`, atau `null`.
 *
 * Sengaja dibatasi per site: gedung berbeda umumnya memakai rentang privat yang
 * sama, jadi membandingkan lintas site akan menolak konfigurasi yang sah.
 * `excludeId` dipakai saat mengedit, dan dibandingkan ke `_id` maupun `id`
 * karena dokumen Mongo hanya punya `_id`.
 */
function findDeviceIpClash(devices, ip, siteName, excludeId) {
    if (!isUsableDeviceIp(ip)) return null;

    const target = String(ip ?? '').trim().toLowerCase();
    const site = String(siteName ?? '').trim();
    const excluded = (excludeId === undefined || excludeId === null) ? null : String(excludeId);

    for (const d of (Array.isArray(devices) ? devices : [])) {
        if (!d) continue;
        if (String(d.siteLocation ?? '').trim() !== site) continue;
        if (excluded !== null && (String(d._id ?? '') === excluded || String(d.id ?? '') === excluded)) continue;
        if (!isUsableDeviceIp(d.ip)) continue;
        if (String(d.ip ?? '').trim().toLowerCase() === target) return d;
    }
    return null;
}

/** Pesan konflik yang menyebut perangkat bentroknya, supaya bisa ditindaklanjuti. */
function deviceIpClashMessage(clash, ip) {
    const name = clash.name || clash.alias || '(tanpa nama)';
    const site = clash.siteLocation || '(tanpa site)';
    return `IP ${String(ip || '').trim()} sudah dipakai perangkat "${name}" di site ${site}. Satu IP hanya untuk satu perangkat per site.`;
}

module.exports = { isUsableDeviceIp, findDeviceIpClash, deviceIpClashMessage };
