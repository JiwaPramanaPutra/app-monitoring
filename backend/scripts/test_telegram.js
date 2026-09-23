/**
 * test_telegram.js
 * Kirim satu pesan uji ke Telegram untuk memverifikasi konfigurasi notifikasi.
 *
 * Cara pakai:
 *   cd backend
 *   npm run telegram:test
 */
require('dotenv').config();
const { sendTelegramAlert } = require('../services/telegram');

(async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId || token === 'YOUR_BOT_TOKEN_HERE') {
        console.error('❌ TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID harus diset di backend/.env');
        process.exit(1);
    }

    const sent = await sendTelegramAlert('🔔 <b>[TES]</b> Notifikasi Nadi berfungsi. Abaikan pesan ini.');
    if (!sent) {
        console.error('❌ Gagal mengirim pesan uji. Cek token, chat id, dan koneksi internet.');
        process.exit(1);
    }

    console.log('✅ Pesan uji terkirim ke Telegram.');
    process.exit(0);
})();
