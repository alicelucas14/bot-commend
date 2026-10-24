// ============================================================
// platforms/tiktok.js — TikTok via Puppeteer automation
// ============================================================
require('dotenv').config();
const { getBrowser, newPageWithProxy, isPuppeteerAvailable } = require('./browser');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to read latest environment variables dynamically
const getTikTokCredentials = () => ({
  username: process.env.TIKTOK_USERNAME || '',
  password: process.env.TIKTOK_PASSWORD || '',
});

let sessionCookies = null; // cache login session

const META = {
  id:     'tiktok',
  name:   'TikTok',
  icon:   '🎵',
  color:  '#010101',
  accent: '#fe2c55',
  supportsTrending: true,
  credentialFields: [
    { key: 'TIKTOK_USERNAME', label: 'Username / Email', type: 'text',     placeholder: 'your@email.com' },
    { key: 'TIKTOK_PASSWORD', label: 'Password',         type: 'password', placeholder: '••••••••' },
  ],
};

function isConfigured() {
  const { username, password } = getTikTokCredentials();
  return !!(username && password && isPuppeteerAvailable());
}

async function ensureLogin(page) {
  // Restore cached cookies if available
  if (sessionCookies) {
    await page.setCookie(...sessionCookies);
    await page.goto('https://www.tiktok.com', { waitUntil: 'networkidle2', timeout: 30000 });
    const loggedIn = await page.evaluate(() => !!document.querySelector('a[href*="/profile"]'));
    if (loggedIn) return true;
  }

  // Full login flow
  await page.goto('https://www.tiktok.com/login/phone-or-email/email', {
    waitUntil: 'networkidle2', timeout: 30000,
  });
  await delay(2000);

  const { username, password } = getTikTokCredentials();
  // Fill credentials
  const usernameSelectors = ['input[name="username"]', 'input[autocomplete="username"]', 'input[type="text"]'];
  for (const sel of usernameSelectors) {
    const el = await page.$(sel);
    if (el) { await el.type(username, { delay: 60 }); break; }
  }

  await delay(500);
  await page.type('input[type="password"]', password, { delay: 60 });
  await delay(500);

  // Click login button
  const loginBtnSelectors = ['button[data-e2e="login-button"]', 'button[type="submit"]', 'button.login-button'];
  for (const sel of loginBtnSelectors) {
    const el = await page.$(sel);
    if (el) { await el.click(); break; }
  }

  await delay(5000);
  sessionCookies = await page.cookies();
  return !page.url().includes('/login');
}

async function postComment(videoUrl, comment) {
  if (!isConfigured()) throw new Error('TikTok credentials not configured (TIKTOK_USERNAME / TIKTOK_PASSWORD)');

  const browser = await getBrowser();
  const page    = await newPageWithProxy(browser);

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const loggedIn = await ensureLogin(page);
    if (!loggedIn) throw new Error('TikTok login failed — check TIKTOK_USERNAME/PASSWORD');

    // Navigate to video
    await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000);

    // Find comment input
    const inputSelectors = [
      'div[data-e2e="comment-input"]',
      '[placeholder*="comment" i]',
      '[contenteditable="true"]',
      'div.DraftEditor-root',
    ];

    let commentInput = null;
    for (const sel of inputSelectors) {
      try {
        commentInput = await page.waitForSelector(sel, { timeout: 5000 });
        if (commentInput) break;
      } catch {}
    }

    if (!commentInput) throw new Error('Comment input not found on TikTok video page');

    await commentInput.click();
    await delay(600);
    await page.keyboard.type(comment, { delay: 40 });
    await delay(600);

    // Submit
    const submitSelectors = ['div[data-e2e="comment-post"]', 'button[data-e2e="comment-post"]', '[data-e2e="comment-submit"]'];
    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); submitted = true; break; }
    }
    if (!submitted) await page.keyboard.press('Enter');

    await delay(2000);
    return { success: true, platform: 'tiktok' };
  } finally {
    await page.close();
  }
}

async function getTrending(regionCode = 'US', maxResults = 20) {
  if (!isPuppeteerAvailable()) throw new Error('Puppeteer not installed');

  const browser = await getBrowser();
  const page    = await newPageWithProxy(browser);

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Regional targeting: TikTok has no official India trending feed due to the local ban,
    // so we target viral Indian diaspora & desi content tags.
    let targetUrl = 'https://www.tiktok.com/trending';
    if (regionCode && (regionCode.startsWith('IN') || regionCode === 'IN')) {
      targetUrl = 'https://www.tiktok.com/tag/desi';
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await delay(3500);

    // Dismiss any guest or cookie banners if present
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const b of buttons) {
          if (/continue as guest|accept|decline|close/i.test(b.innerText || '')) {
            b.click();
          }
        }
      });
    } catch {}

    // Scroll to trigger video card loading
    for (let s = 0; s < 3; s++) {
      try {
        await page.evaluate(() => window.scrollBy(0, 1500));
        await delay(1500);
      } catch {}
    }

    const videos = await page.evaluate((max) => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/video/"]'));
      const seen    = new Set();
      const results = [];

      for (const a of anchors) {
        if (results.length >= max) break;
        const href = a.href || '';
        if (!href.includes('/video/') || seen.has(href)) continue;
        seen.add(href);

        const img     = a.querySelector('img');
        const titleEl = a.querySelector('[class*="title"]') || a.querySelector('p') || a.querySelector('span');
        const username = href.split('@')[1]?.split('/')[0] || 'unknown';

        results.push({
          id:        href.split('/video/')[1]?.split('?')[0] || '',
          title:     titleEl?.innerText?.trim().substring(0, 120) || 'TikTok Video',
          url:       href,
          thumbnail: img?.src || '',
          channel:   `@${username}`,
          views:     '',
        });
      }
      return results;
    }, maxResults);

    return videos.filter(v => v.id);
  } finally {
    await page.close();
  }
}

async function testConnection() {
  if (!isPuppeteerAvailable()) return { ok: false, message: 'Puppeteer not installed — run npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth' };
  const { username, password } = getTikTokCredentials();
  if (!username || !password) return { ok: false, message: 'TIKTOK_USERNAME / TIKTOK_PASSWORD not set in .env' };
  return { ok: true, message: `Configured as @${username} — will log in on first post` };
}

module.exports = { ...META, isConfigured, testConnection, postComment, getTrending };
