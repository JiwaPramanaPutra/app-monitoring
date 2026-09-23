const axios = require('axios');

/**
 * Mengirim pesan ke grup/chat Telegram melalui Telegram Bot API.
 * 
 * @param {string} message - Pesan yang akan dikirim (mendukung format HTML).
 * @returns {Promise<boolean>} True jika berhasil, False jika gagal.
 */
async function sendTelegramAlert(message) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId || botToken === 'YOUR_BOT_TOKEN_HERE') {
        console.warn('⚠️ Telegram Token/Chat ID belum diset di .env. Notifikasi dilewati.');
        return false;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML' // Mengizinkan penggunaan tag <b>, <i>, dll
        });
        return true;
    } catch (error) {
        console.error('❌ Gagal mengirim notifikasi Telegram:', error.response ? error.response.data : error.message);
        return false;
    }
}

module.exports = {
    sendTelegramAlert
};
