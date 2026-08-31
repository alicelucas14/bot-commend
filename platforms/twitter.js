// ============================================================
// platforms/twitter.js — Twitter / X via official API v2
// ============================================================
require('dotenv').config();

const META = {
  id:     'twitter',
  name:   'Twitter / X',
  icon:   '🐦',
  color:  '#000000',
  accent: '#1d9bf0',
  supportsTrending: false,
  credentialFields: [
    { key: 'TWITTER_API_KEY',       label: 'API Key',           type: 'text',     placeholder: 'xxxxxxxxxxxxxxxxxxxxxx' },
    { key: 'TWITTER_API_SECRET',    label: 'API Secret',        type: 'password', placeholder: '••••••••••••••••' },
    { key: 'TWITTER_ACCESS_TOKEN',  label: 'Access Token',      type: 'text',     placeholder: '0000000-xxxxxxxxxxxxx' },
    { key: 'TWITTER_ACCESS_SECRET', label: 'Access Token Secret', type: 'password', placeholder: '••••••••••••••••' },
  ],
};

function isConfigured() {
  return !!(
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_SECRET
  );
}

function getClient() {
  const { TwitterApi } = require('twitter-api-v2');
  return new TwitterApi({
    appKey:       process.env.TWITTER_API_KEY,
    appSecret:    process.env.TWITTER_API_SECRET,
    accessToken:  process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });
}

function extractTweetId(url) {
  // Handles: https://twitter.com/user/status/123456789
  //          https://x.com/user/status/123456789
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

async function postComment(tweetUrl, comment) {
  if (!isConfigured()) throw new Error('Twitter credentials not configured. See .env for required keys.');

  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) throw new Error('Invalid Twitter/X URL — must contain /status/TWEETID');

  const client = getClient();
  // Note: Replying requires Write access (Basic $100/mo plan or above)
  const { data } = await client.v2.reply(comment, tweetId);
  return { success: true, tweetId: data.id, platform: 'twitter' };
}

async function testConnection() {
  if (!isConfigured()) {
    return {
      ok:      false,
      message: 'TWITTER_API_KEY / TWITTER_API_SECRET / TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_SECRET not set in .env',
    };
  }
  try {
    const client = getClient();
    const { data } = await client.v2.me();
    return { ok: true, message: `Connected as @${data.username}` };
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('403') || msg.includes('Forbidden')) {
      return { ok: false, message: 'API keys valid but Write access denied — upgrade to X Basic ($100/mo)' };
    }
    return { ok: false, message: `API error: ${msg}` };
  }
}

module.exports = { ...META, isConfigured, testConnection, postComment };
