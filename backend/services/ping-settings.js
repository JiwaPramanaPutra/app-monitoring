// Pengaturan ping ICMP untuk semua jalur backend.
//
// `PING_TIMEOUT_SECONDS` diteruskan paket `ping` npm sebagai argumen `-W` ke
// binary ping sistem. Nilainya WAJIB bilangan bulat: busybox ping di image
// produksi (node:24-alpine) menolak pecahan dengan `invalid number '1.5'`
// sehingga setiap ping gagal dan perangkat tampak Offline — sementara Windows
// (dev lokal) menerima pecahan, jadi bug ini hanya muncul di container Linux.
// `isSafePingTimeout` adalah penjaga regresinya.

const PING_TIMEOUT_SECONDS = 2;

/** Apakah nilai timeout aman dipakai binary ping di semua platform? */
function isSafePingTimeout(value) {
    return Number.isInteger(value) && value >= 1;
}

module.exports = { PING_TIMEOUT_SECONDS, isSafePingTimeout };
