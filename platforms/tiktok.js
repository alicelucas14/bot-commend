// ============================================================
// platforms/tiktok.js — TikTok via Puppeteer automation
// ============================================================
require('dotenv').config();
const { getBrowser, isPuppeteerAvailable } = require('./browser');

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const TIKTOK_PASSWORD = process.env.TIKTOK_PASSWORD;

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
  return !!(TIKTOK_USERNAME && TIKTOK_PASSWORD && isPuppeteerAvailable());
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
  await page.waitForTimeout(2000);

  // Fill credentials
  const usernameSelectors = ['input[name="username"]', 'input[autocomplete="username"]', 'input[type="text"]'];
  for (const sel of usernameSelectors) {
    const el = await page.$(sel);
    if (el) { await el.type(TIKTOK_USERNAME, { delay: 60 }); break; }
  }

  await page.waitForTimeout(500);
  await page.type('input[type="password"]', TIKTOK_PASSWORD, { delay: 60 });
  await page.waitForTimeout(500);

  // Click login button
  const loginBtnSelectors = ['button[data-e2e="login-button"]', 'button[type="submit"]', 'button.login-button'];
  for (const sel of loginBtnSelectors) {
    const el = await page.$(sel);
    if (el) { await el.click(); break; }
  }

  await page.waitForTimeout(5000);
  sessionCookies = await page.cookies();
  return !page.url().includes('/login');
}

async function postComment(videoUrl, comment) {
  if (!isConfigured()) throw new Error('TikTok credentials not configured (TIKTOK_USERNAME / TIKTOK_PASSWORD)');

  const browser = await getBrowser();
  const page    = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const loggedIn = await ensureLogin(page);
    if (!loggedIn) throw new Error('TikTok login failed — check TIKTOK_USERNAME/PASSWORD');

    // Navigate to video
    await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000);

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
    await page.waitForTimeout(600);
    await page.keyboard.type(comment, { delay: 40 });
    await page.waitForTimeout(600);

    // Submit
    const submitSelectors = ['div[data-e2e="comment-post"]', 'button[data-e2e="comment-post"]', '[data-e2e="comment-submit"]'];
    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); submitted = true; break; }
    }
    if (!submitted) await page.keyboard.press('Enter');

    await page.waitForTimeout(2000);
    return { success: true, platform: 'tiktok' };
  } finally {
    await page.close();
  }
}

async function getTrending(regionCode = 'US', maxResults = 20) {
  if (!isPuppeteerAvailable()) throw new Error('Puppeteer not installed');

  const browser = await getBrowser();
  const page    = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto('https://www.tiktok.com/trending', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(4000);

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
  if (!TIKTOK_USERNAME || !TIKTOK_PASSWORD) return { ok: false, message: 'TIKTOK_USERNAME / TIKTOK_PASSWORD not set in .env' };
  return { ok: true, message: `Configured as @${TIKTOK_USERNAME} — will log in on first post` };
}

module.exports = { ...META, isConfigured, testConnection, postComment, getTrending };
