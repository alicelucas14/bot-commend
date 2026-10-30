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
  supportsTrending: true,
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


const axios = require('axios');

const TRENDS24_COUNTRY_MAP = {
  US: 'united-states',
  GB: 'united-kingdom',
  IN: 'india',
  ID: 'indonesia',
  BR: 'brazil',
  MX: 'mexico',
  CA: 'canada',
  AU: 'australia',
  DE: 'germany',
  FR: 'france',
  IT: 'italy',
  ES: 'spain',
  JP: 'japan',
  KR: 'korea',
  PH: 'philippines',
  MY: 'malaysia',
  SG: 'singapore',
  TH: 'thailand',
  VN: 'vietnam',
  PK: 'pakistan',
  BD: 'bangladesh',
  SA: 'saudi-arabia',
  AE: 'united-arab-emirates',
  EG: 'egypt',
  NG: 'nigeria',
  ZA: 'south-africa',
  RU: 'russia',
  TR: 'turkey',
  NL: 'netherlands',
  AR: 'argentina',
  CO: 'colombia',
  CL: 'chile',
  PE: 'peru',
};

async function getTrending(regionCode = 'US', maxResults = 20) {
  const code = (regionCode || 'US').toUpperCase();
  const slug = TRENDS24_COUNTRY_MAP[code] || 'united-states';

  try {
    const res = await axios.get(`https://trends24.in/${slug}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });

    const matches = [...res.data.matchAll(/<a[^>]*href="([^"]*twitter\.com\/search[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
    const seen = new Set();
    const results = [];

    for (const m of matches) {
      const text = m[2].replace(/<[^>]+>/g, '').trim();
      if (!text || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());

      const url = m[1].replace('twitter.com', 'x.com');
      results.push({
        id: encodeURIComponent(text),
        title: text,
        url: url,
        thumbnail: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png',
        channel: `X Trends • ${code}`,
        views: '🔥 Viral Trending Topic',
      });

      if (results.length >= maxResults) break;
    }

    return results;
  } catch (err) {
    console.warn(`Twitter trends error: ${err.message}`);
    return [];
  }
}

module.exports = { ...META, isConfigured, testConnection, postComment, getTrending };
