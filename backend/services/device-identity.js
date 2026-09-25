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

/**
 * Kunci `_id` yang belum terpakai untuk record perangkat baru.
 *
 * Kunci dari klien tidak bisa dipercaya apa adanya: `id` di frontend dihitung
 * dari perangkat site yang sedang dilihat, padahal form boleh menyimpan ke site
 * lain, jadi angkanya bisa sudah terpakai. Kunci yang bentrok membuat
 * penghapusan berikutnya membuang lebih dari satu perangkat.
 */
function uniqueDeviceKey(devices, requested) {
    const list = Array.isArray(devices) ? devices : [];
    const taken = (candidate) => list.some(d => !!d
        && (String(d._id) === String(candidate) || String(d.id) === String(candidate)));

    const wanted = (requested === undefined || requested === null || String(requested).trim() === '')
        ? 'dev_' + Date.now()
        : requested;
    if (!taken(wanted)) return wanted;

    let candidate;
    do {
        candidate = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    } while (taken(candidate));
    return candidate;
}

/**
 * Indeks record perangkat dengan kunci ini, atau -1.
 *
 * `_id` adalah kunci sebenarnya; `id` hanya kunci lama. Mencocokkan keduanya
 * sekaligus berbahaya ketika `id` dipakai bersama oleh dua record: menghapus
 * salah satu akan ikut membuang yang lain. Karena itu `_id` dicoba lebih dulu,
 * dan `id` hanya dipakai bila tidak ada record yang `_id`-nya cocok.
 */
function findDeviceIndexByKey(devices, id) {
    const list = Array.isArray(devices) ? devices : [];
    const key = String(id);

    const byId = list.findIndex(d => !!d && String(d._id) === key);
    if (byId !== -1) return byId;
    return list.findIndex(d => !!d && String(d.id) === key);
}

/** Buang TEPAT SATU record perangkat dengan kunci ini. */
function removeDeviceByKey(devices, id) {
    const list = Array.isArray(devices) ? devices : [];
    const index = findDeviceIndexByKey(list, id);
    if (index === -1) return { devices: list, removed: false };

    const next = list.slice();
    next.splice(index, 1);
    return { devices: next, removed: true };
}

module.exports = {
    isUsableDeviceIp,
    findDeviceIpClash,
    deviceIpClashMessage,
    uniqueDeviceKey,
    findDeviceIndexByKey,
    removeDeviceByKey
};
