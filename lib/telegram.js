const https = require('https');

/**
 * Send a message via Telegram Bot API
 * @param {string} message - The message to send
 * @returns {Promise<boolean>} - True if successful
 */
async function sendTelegramMessage(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('[Telegram] Bot token or chat ID not configured, skipping notification');
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = JSON.stringify({
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  });

  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('[Telegram] Message sent successfully');
          resolve(true);
        } else {
          console.log(`[Telegram] Failed to send message: ${data}`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.log(`[Telegram] Error sending message: ${err.message}`);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Send success notification for Pro mode tasks
 */
async function notifySuccess(taskName, chatUrl) {
  const message = `✅ <b>${taskName}</b> (Pro)\n${chatUrl}`;
  return sendTelegramMessage(message);
}

/**
 * Send failure notification
 */
async function notifyFailure(taskName, error) {
  const message = `❌ <b>${taskName}</b> failed\n${error}`;
  return sendTelegramMessage(message);
}

module.exports = {
  sendTelegramMessage,
  notifySuccess,
  notifyFailure
};
