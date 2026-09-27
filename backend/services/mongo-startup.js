// Retry koneksi Mongo saat start, sebagai fungsi yang bisa diuji tanpa
// MongoDB sungguhan maupun timer sungguhan.
//
// F-25: tanpa retry, restart host/daemon Docker bisa membuat backend "offline"
// padahal mongod sehat beberapa detik kemudian — pembacaan dan penulisan lalu
// jatuh ke penyimpanan JSON lama secara diam-diam.

/**
 * Coba `connect()` berulang sampai jendela `timeoutMs` habis.
 *
 * Percobaan pertama selalu dijalankan (`timeoutMs` 0 tetap satu percobaan).
 * `connect` diharapkan melempar/reject saat gagal.
 *
 * @param {object} options
 * @param {() => Promise<any>} options.connect
 * @param {number} options.timeoutMs total jendela tunggu sejak percobaan pertama
 * @param {number} options.retryDelayMs jeda antar percobaan
 * @param {(err: any) => void} [options.onRetry] dipanggil sebelum menunggu ulang
 * @param {(err: any) => void} [options.onGiveUp] dipanggil saat menyerah
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {() => number} [options.now]
 * @returns {Promise<boolean>} true kalau akhirnya tersambung
 */
async function connectWithRetry({
    connect,
    timeoutMs,
    retryDelayMs,
    onRetry,
    onGiveUp,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now
}) {
    const deadline = now() + Math.max(0, Number(timeoutMs) || 0);

    for (;;) {
        try {
            await connect();
            return true;
        } catch (err) {
            if (now() >= deadline) {
                if (onGiveUp) onGiveUp(err);
                return false;
            }
            if (onRetry) onRetry(err);
            await sleep(retryDelayMs);
        }
    }
}

module.exports = { connectWithRetry };
