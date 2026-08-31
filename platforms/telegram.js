// ============================================================
// platforms/telegram.js — Telegram Platform Driver & Trending
// ============================================================
require('dotenv').config();
const axios = require('axios');
const { searchGroups } = require('../telegram_seo');

const META = {
  id:     'telegram',
  name:   'Telegram',
  icon:   '✈️',
  color:  '#229ED9',
  accent: '#0088cc',
  supportsTrending: true,
  credentialFields: [
    { key: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token', type: 'text', placeholder: '1234567890:AAF...' },
    { key: 'TELEGRAM_GROUP_ID',  label: 'Default Group / Chat ID', type: 'text', placeholder: '-100xxxx or @channel' },
  ],
};

function isConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

function extractChatTarget(urlOrId) {
  if (!urlOrId) return null;
  const str = String(urlOrId).trim();
  // Numeric ID
  if (/^-?\d+$/.test(str)) return str;
  // Handle t.me/channel or @channel
  const match = str.match(/(?:https?:\/\/)?(?:t\.me\/)?@?([a-zA-Z0-9_]{3,})/);
  if (match) return `@${match[1]}`;
  return str;
}

async function postComment(targetUrl, comment) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram Bot Token not configured in Settings');

  const chatId = extractChatTarget(targetUrl) || process.env.TELEGRAM_GROUP_ID;
  if (!chatId) throw new Error('Target Telegram group / chat ID is required');

  try {
    const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: comment,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    });
    return { success: true, messageId: res.data.result?.message_id, platform: 'telegram' };
  } catch (err) {
    const tgErr = err.response?.data?.description || err.message;
    throw new Error(`Telegram API Error: ${tgErr}`);
  }
}

async function getTrending(regionCode = 'ID', maxResults = 20) {
  const groups = await searchGroups('', regionCode, maxResults);
  return groups.map(g => ({
    id: g.handle,
    title: g.title,
    url: g.url,
    thumbnail: g.avatar || '',
    channel: `@${g.handle}`,
    views: g.extra || `${g.memberCount} members`,
    seoBadge: g.seoBadge,
  }));
}

async function testConnection() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, message: 'TELEGRAM_BOT_TOKEN not set in Settings' };
  try {
    const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 6000 });
    return { ok: true, message: `Connected to Telegram bot: @${res.data.result?.username}` };
  } catch (err) {
    return { ok: false, message: `Bot API error: ${err.response?.data?.description || err.message}` };
  }
}

module.exports = { ...META, isConfigured, testConnection, postComment, getTrending };
