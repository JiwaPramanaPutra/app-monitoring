const crypto = require('crypto');

const isTempId = (id) => typeof id === 'string' && id.startsWith('temp_');
const newId = (prefix) => `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

/**
 * Normalisasi _id nested (site/gedung/lantai) sebelum update project.
 *
 * Frontend membuat id sementara `temp_<ts>` untuk entitas baru. Di mode Mongo,
 * id itu membuat Mongoose melempar CastError saat cast ke ObjectId; di mode
 * lokal, id sementara ikut tersimpan permanen sehingga rawan bentrok.
 *
 * - mode 'mongo': buang id sementara agar Mongoose membuat ObjectId baru.
 * - mode 'local': ganti id sementara/absen dengan id stabil agar bisa diedit lagi.
 */
function normalizeNestedIds(project, mode) {
    if (!project || !Array.isArray(project.sites)) return project;

    const normalize = (entity, prefix) => {
        if (mode === 'mongo') {
            if (isTempId(entity._id)) delete entity._id;
        } else if (!entity._id || isTempId(entity._id)) {
            entity._id = newId(prefix);
        }
    };

    for (const site of project.sites) {
        normalize(site, 'site');

        for (const gedung of site.gedungList || []) {
            normalize(gedung, 'gedung');

            for (const floor of gedung.floors || []) {
                normalize(floor, 'floor');
            }
        }
    }
    return project;
}

module.exports = { normalizeNestedIds };
