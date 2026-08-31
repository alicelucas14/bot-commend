// ============================================================
// telegram_seo.js — Telegram Group SEO Discovery & Vetting
// ============================================================
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TARGETS_FILE = path.join(__dirname, 'telegram_targets.json');

// Default starter database of verified active public Telegram supergroups & channels
const DEFAULT_TARGETS = [
  // 🇮🇩 Indonesia (Top Supergroups, Crypto, Trading, Business, News)
  { handle: 'indodax', country: 'ID', category: 'Crypto', niche: 'indonesia crypto bitcoin exchange' },
  { handle: 'indodaxroom', country: 'ID', category: 'Crypto', niche: 'indonesia crypto trading discussion slot' },
  { handle: 'sinyalcrypto', country: 'ID', category: 'Crypto', niche: 'indonesia sinyal crypto trading' },
  { handle: 'TokoCryptoExchange', country: 'ID', category: 'Crypto', niche: 'indonesia tokocrypto btc' },
  { handle: 'forexindonesia', country: 'ID', category: 'Trading', niche: 'indonesia forex trading slot investasi' },
  { handle: 'komunitasinvestasi', country: 'ID', category: 'Business', niche: 'indonesia bisnis investasi saham' },
  { handle: 'Cryptocurrency_Indonesia', country: 'ID', category: 'Crypto', niche: 'indonesia crypto community discussion' },
  { handle: 'katadatacoid', country: 'ID', category: 'Business', niche: 'indonesia bisnis ekonomi berita' },
  { handle: 'kompascom', country: 'ID', category: 'News', niche: 'indonesia berita trending portal' },
  { handle: 'quotesindonesia', country: 'ID', category: 'General', niche: 'indonesia quotes komunitas viral' },
  { handle: 'filmindonesia', country: 'ID', category: 'Entertainment', niche: 'indonesia movie film nonton streaming' },
  { handle: 'pubgmobile', country: 'ID', category: 'Gaming', niche: 'indonesia gaming esports pubg slot' },

  // 🌐 Global / US / Massive Traffic Supergroups (10k to 300k+ members)
  { handle: 'cointelegraph', country: 'GLOBAL', category: 'Crypto', niche: 'crypto bitcoin news global' },
  { handle: 'binance_signals', country: 'GLOBAL', category: 'Crypto', niche: 'crypto binance trading signals' },
  { handle: 'wallstreetbets', country: 'US', category: 'Finance', niche: 'wallstreetbets stocks trading crypto finance' },
  { handle: 'crypto_pumps', country: 'GLOBAL', category: 'Crypto', niche: 'crypto pumps moonshots trading' },
  { handle: 'whale_alert', country: 'GLOBAL', category: 'Crypto', niche: 'whale alert blockchain bitcoin' },
  { handle: 'forex_signals', country: 'GLOBAL', category: 'Trading', niche: 'forex trading signals profit' },
  { handle: 'cryptomoonshots', country: 'GLOBAL', category: 'Crypto', niche: 'crypto moonshots altcoins discussion' },
  { handle: 'airdropalert', country: 'GLOBAL', category: 'Crypto', niche: 'airdrop crypto rewards free' },
  { handle: 'cryptotrading', country: 'GLOBAL', category: 'Crypto', niche: 'crypto trading group community' },
];

/**
 * Load targets from telegram_targets.json with fallback
 */
function loadTargets() {
  try {
    if (fs.existsSync(TARGETS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.error('Failed to read telegram_targets.json, using defaults:', err.message);
  }
  // Initialize file with defaults
  saveTargetsToFile(DEFAULT_TARGETS);
  return DEFAULT_TARGETS;
}

function saveTargetsToFile(list) {
  try {
    fs.writeFileSync(TARGETS_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to write telegram_targets.json:', err.message);
    return false;
  }
}

/**
 * Save or update a single target group
 */
function saveTarget({ handle, country = 'GLOBAL', category = 'General', niche = '' }) {
  if (!handle) throw new Error('Handle is required');
  const cleanHandle = handle.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '').replace(/^s\//, '').split('/')[0].split('?')[0].trim();
  const list = loadTargets();
  const existingIdx = list.findIndex(t => t.handle.toLowerCase() === cleanHandle.toLowerCase());

  const targetObj = {
    handle: cleanHandle,
    country: (country || 'GLOBAL').toUpperCase().trim(),
    category: category.trim() || 'General',
    niche: (niche || cleanHandle).toLowerCase().trim(),
  };

  if (existingIdx >= 0) {
    list[existingIdx] = targetObj;
  } else {
    list.unshift(targetObj);
  }

  saveTargetsToFile(list);
  return targetObj;
}

/**
 * Delete a target group by handle
 */
function deleteTarget(handle) {
  const cleanHandle = handle.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '').replace(/^s\//, '').split('/')[0].split('?')[0].trim();
  let list = loadTargets();
  const beforeLen = list.length;
  list = list.filter(t => t.handle.toLowerCase() !== cleanHandle.toLowerCase());
  saveTargetsToFile(list);
  return list.length < beforeLen;
}

/**
 * Inspect a single Telegram public handle via t.me web preview
 */
async function inspectGroup(handle) {
  const cleanHandle = handle.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '').replace(/^s\//, '').split('/')[0].split('?')[0].trim();
  if (!cleanHandle || cleanHandle.length < 3) return null;

  try {
    const res = await axios.get(`https://t.me/${cleanHandle}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 7000,
    });
    const html = res.data;

    // Title
    const titleMatch = html.match(/<div class="tgme_page_title"[^>]*><span[^>]*>([^<]+)<\/span>/i) ||
                       html.match(/<meta property="og:title" content="([^"]+)"/i);
    const title = titleMatch ? titleMatch[1].trim() : cleanHandle;

    // Extra line (e.g. "43 323 members, 703 online" or "96 579 subscribers")
    const extraMatch = html.match(/<div class="tgme_page_extra">([^<]+)<\/div>/i);
    const extraRaw = extraMatch ? extraMatch[1].trim() : '';

    // Description
    const descMatch = html.match(/<div class="tgme_page_description"[^>]*>([\s\S]*?)<\/div>/i) ||
                      html.match(/<meta property="og:description" content="([^"]*)"/i);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Image / Avatar
    const imgMatch = html.match(/<img class="tgme_page_photo_image" src="([^"]+)"/i) ||
                     html.match(/<meta property="og:image" content="([^"]+)"/i);
    const avatar = imgMatch ? imgMatch[1] : '';

    // Parse member and online counts
    let memberCount = 0;
    let onlineCount = 0;
    const isGroup = /member/i.test(extraRaw) || html.includes('tgme_action_button_new');
    const isChannel = /subscriber/i.test(extraRaw);

    const memMatch = extraRaw.match(/([\d\s]+)\s*(?:members?|subscribers?)/i);
    if (memMatch) {
      memberCount = parseInt(memMatch[1].replace(/\s+/g, ''), 10) || 0;
    }
    const onlineMatch = extraRaw.match(/([\d\s]+)\s*online/i);
    if (onlineMatch) {
      onlineCount = parseInt(onlineMatch[1].replace(/\s+/g, ''), 10) || 0;
    }

    // Check if channel/group allows discussion comments
    let hasComments = isGroup;
    if (!hasComments) {
      try {
        const sRes = await axios.get(`https://t.me/s/${cleanHandle}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 4000,
        });
        hasComments = sRes.data.includes('tgme_widget_message_reply') ||
                      sRes.data.includes('comment') ||
                      sRes.data.includes('discussion');
      } catch {}
    }

    // Rate SEO Viability Score based on real volume
    let seoScore = 'Medium';
    let seoBadge = '⚡ Medium';
    let seoColor = '#f59e0b';

    if (memberCount >= 10000 || (memberCount >= 3000 && onlineCount > 100)) {
      seoScore = 'High';
      seoBadge = '🔥 High Traffic';
      seoColor = '#22c55e';
    } else if (memberCount < 1000 && onlineCount < 20) {
      seoScore = 'Low';
      seoBadge = '💤 Low Traffic';
      seoColor = '#94a3b8';
    }

    // Backlink viability
    const linkAllowed = hasComments || isGroup;

    return {
      handle: cleanHandle,
      title,
      description: description.substring(0, 160),
      avatar,
      extra: extraRaw || (memberCount ? `${memberCount.toLocaleString()} members` : 'Public Group'),
      memberCount,
      onlineCount,
      isGroup,
      isChannel,
      hasComments,
      linkAllowed,
      seoScore,
      seoBadge,
      seoColor,
      url: `https://t.me/${cleanHandle}`,
      previewUrl: `https://t.me/s/${cleanHandle}`,
    };
  } catch (err) {
    return {
      handle: cleanHandle,
      title: cleanHandle,
      description: 'Could not fetch public preview',
      avatar: '',
      extra: 'Public Target',
      memberCount: 0,
      onlineCount: 0,
      isGroup: true,
      isChannel: false,
      hasComments: true,
      linkAllowed: true,
      seoScore: 'Medium',
      seoBadge: '⚡ Target',
      seoColor: '#38bdf8',
      url: `https://t.me/${cleanHandle}`,
      previewUrl: `https://t.me/s/${cleanHandle}`,
      error: err.message,
    };
  }
}

/**
 * Search public Telegram groups by keyword, country, and minimum member filter
 */
async function searchGroups(keyword = '', country = 'ALL', limit = 30, minMembers = 1000) {
  const kw = keyword.toLowerCase().trim();
  const matchedHandles = new Set();
  const targets = loadTargets();

  // 1. Check curated verified supergroup database
  targets.forEach(g => {
    const matchKw = !kw ||
      g.handle.toLowerCase().includes(kw) ||
      g.category.toLowerCase().includes(kw) ||
      (g.niche && g.niche.includes(kw));
    const matchCountry = country === 'ALL' || g.country === country || (country === 'GLOBAL' && g.country === 'GLOBAL');
    if (matchKw && matchCountry) {
      matchedHandles.add(g.handle);
    }
  });

  // 2. Query Lyzem directory search if keyword provided
  if (kw) {
    try {
      const res = await axios.get(`https://lyzem.com/search?q=${encodeURIComponent(kw)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 6000,
      });
      const matches = res.data.match(/t\.me\/([a-zA-Z0-9_]{4,})/g) || [];
      matches.forEach(m => {
        const h = m.replace('t.me/', '').replace('s/', '').trim();
        if (!['joinchat', 'addstickers', 'share', 'contact', 'login', 'iv', 'lyzemcom', 'lyzembot'].includes(h)) {
          matchedHandles.add(h);
        }
      });
    } catch {}
  }

  // Fallback: If query returned too few, add high-traffic groups from curated list
  if (matchedHandles.size < 5) {
    targets
      .filter(g => country === 'ALL' || g.country === country || g.country === 'GLOBAL')
      .forEach(g => matchedHandles.add(g.handle));
  }

  const handles = Array.from(matchedHandles).slice(0, 40);

  // Inspect all targets concurrently
  const results = await Promise.all(handles.map(h => inspectGroup(h)));
  let validResults = results.filter(Boolean);

  // Filter out zero/dead groups and apply minMembers if specified
  if (minMembers > 0) {
    const filtered = validResults.filter(g => g.memberCount >= minMembers);
    if (filtered.length >= 3) {
      validResults = filtered;
    }
  }

  // Sort strictly by member count descending (largest first)
  validResults.sort((a, b) => b.memberCount - a.memberCount);

  return validResults.slice(0, limit);
}

/**
 * Inspect a list of custom handles or links pasted by user
 */
async function inspectLinks(input) {
  let handles = [];
  if (Array.isArray(input)) {
    handles = input;
  } else if (typeof input === 'string') {
    const lines = input.split(/[\n,;\s]+/);
    handles = lines
      .map(l => l.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '').replace(/^s\//, '').split('/')[0].split('?')[0].trim())
      .filter(h => h.length >= 3 && !['joinchat', 'share', 'contact'].includes(h));
  }

  const unique = [...new Set(handles)].slice(0, 30);
  const results = await Promise.all(unique.map(h => inspectGroup(h)));
  const valid = results.filter(Boolean);
  valid.sort((a, b) => b.memberCount - a.memberCount);
  return valid;
}

module.exports = {
  inspectGroup,
  searchGroups,
  inspectLinks,
  loadTargets,
  saveTarget,
  deleteTarget,
};
