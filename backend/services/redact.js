// Helper murni untuk redaksi kredensial dan preservasi password router.
// Dipisah dari server.js agar bisa diuji langsung tanpa menyalakan server.

function stripDeviceSecrets(device) {
    if (!device) return device;
    const copy = { ...device };
    delete copy.sshPassword;
    delete copy.sshUsername;
    return copy;
}

function stripProjectSecrets(project) {
    if (!project) return project;
    const copy = JSON.parse(JSON.stringify(project));
    for (const site of copy.sites || []) {
        if (site.routerConfig) delete site.routerConfig.password;
    }
    return copy;
}

/**
 * PUT project dari frontend tidak memuat password router (diredaksi saat GET).
 * Password kosong/absen berarti "pertahankan yang tersimpan", termasuk saat site
 * di-rename atau payload site tidak menyertakan routerConfig sama sekali.
 * Site baru (tidak ada padanan tersimpan) tidak mewarisi apa pun.
 */
function preserveRouterPasswords(incomingProject, existingProject) {
    if (!incomingProject || !Array.isArray(incomingProject.sites)) return incomingProject;
    const existingSites = (existingProject && existingProject.sites) || [];

    for (const site of incomingProject.sites) {
        const incomingId = site._id ? String(site._id) : '';

        // Cocokkan per _id bila ada (termasuk id sementara yang tersimpan di mode lokal);
        // fallback ke nama hanya untuk payload lama tanpa _id.
        const previous = incomingId
            ? existingSites.find(s => String(s._id) === incomingId)
            : existingSites.find(s => s.name === site.name);
        if (!previous) continue;

        // Payload tanpa routerConfig: pertahankan konfigurasi tersimpan.
        if (!site.routerConfig) {
            if (previous.routerConfig) site.routerConfig = previous.routerConfig;
            continue;
        }

        if (!site.routerConfig.password && previous.routerConfig && previous.routerConfig.password) {
            site.routerConfig.password = previous.routerConfig.password;
        }
    }
    return incomingProject;
}

module.exports = {
    stripDeviceSecrets,
    stripProjectSecrets,
    preserveRouterPasswords
};
