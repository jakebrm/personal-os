const TG_BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendTelegramMessage(text: string): Promise<void> {
  const userId = process.env.TELEGRAM_USER_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !userId) return;
  await fetch(`${TG_BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: userId, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}
