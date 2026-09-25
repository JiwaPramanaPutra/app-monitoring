// Penjelasan kegagalan koneksi RouterOS yang bisa ditindaklanjuti.
//
// Library `node-routeros` sering melempar error tanpa `message`, hanya
// `errno` numerik. Dibiarkan apa adanya pengguna melihat keluaran mentah seperti
// `{"name":"RosException","errno":-4078}` dan tidak tahu harus berbuat apa.

// errno numerik Node.js -> kodenya.
const NUMERIC_ERRNO = {
    '-4078': 'ECONNREFUSED',
    '-4077': 'ECONNRESET',
    '-4039': 'ETIMEDOUT',
    '-3008': 'ENOTFOUND',
    '-3001': 'EAI_AGAIN',
    '-113': 'EHOSTUNREACH',
    '-101': 'ENETUNREACH',
    '-13': 'EACCES'
};

// Kode koneksi -> tindakan yang mungkin perlu dilakukan.
const ERRNO_HINTS = {
    ECONNREFUSED: 'koneksi ditolak — port api-ssl kemungkinan tertutup, atau host/portnya salah',
    ECONNRESET: 'koneksi diputus oleh router di tengah jalan',
    ETIMEDOUT: 'waktu tunggu habis — host tidak menjawab',
    ESOCKETTIMEDOUT: 'waktu tunggu habis — host tidak menjawab',
    ENOTFOUND: 'host tidak ditemukan — cek IP/hostname',
    EAI_AGAIN: 'nama host tidak bisa diselesaikan (DNS)',
    EHOSTUNREACH: 'host tidak terjangkau dari jaringan ini',
    ENETUNREACH: 'jaringan tujuan tidak terjangkau',
    EACCES: 'koneksi ditolak oleh firewall/izin sistem'
};

const NO_RESPONSE = 'tidak ada respons dari RouterOS API (cek kredensial, port, dan TLS)';

/** Terjemahkan satu error koneksi menjadi kalimat yang bisa ditindaklanjuti. */
function routerFailureReason(err) {
    if (!err) return NO_RESPONSE;

    // Pesan yang memang berisi kalimat dari RouterOS (mis. login ditolak) adalah
    // yang paling akurat, jadi dikembalikan apa adanya. Pesan berbentuk objek
    // JSON dibuang karena tidak informatif.
    const message = typeof err.message === 'string' ? err.message.trim() : '';
    if (message && !message.startsWith('{')) return message;

    const code = err.code
        || NUMERIC_ERRNO[String(err.errno)]
        || NUMERIC_ERRNO[String(err.errno != null ? Math.abs(err.errno) : '')];

    if (code && ERRNO_HINTS[code]) return `${code} — ${ERRNO_HINTS[code]}`;
    if (code) return String(code);
    if (message) return message;
    return NO_RESPONSE;
}

/** Baris error lengkap, menyebut host:port yang dicoba. */
function describeRouterError(err, routerConfig) {
    const host = (routerConfig && routerConfig.host) || '?';
    const port = (routerConfig && routerConfig.port) || '?';
    return `Gagal terhubung ke RouterOS API ${host}:${port} - ${routerFailureReason(err)}`;
}

module.exports = { routerFailureReason, describeRouterError };
