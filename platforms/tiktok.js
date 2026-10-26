// ============================================================
// platforms/tiktok.js — TikTok via Puppeteer automation
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getBrowser, newPageWithProxy, isPuppeteerAvailable } = require('./browser');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to read latest environment variables dynamically
const getTikTokCredentials = () => ({
  username: process.env.TIKTOK_USERNAME || '',
  password: process.env.TIKTOK_PASSWORD || '',
});

let sessionCookies = null; // cache login session

function getCookieFile() {
  return path.join(__dirname, '..', 'tokens', 'tiktok_cookies.json');
}

function loadSavedCookies() {
  const file = getCookieFile();
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.map(c => {
      const item = {
        name: c.name,
        value: String(c.value),
        domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
        path: c.path || '/',
        httpOnly: Boolean(c.httpOnly),
        secure: Boolean(c.secure),
      };
      if (c.sameSite === 'no_restriction') item.sameSite = 'None';
      else if (c.sameSite === 'lax') item.sameSite = 'Lax';
      else if (c.sameSite === 'strict') item.sameSite = 'Strict';
      return item;
    });
  } catch (err) {
    console.warn('⚠️ Error loading saved TikTok cookies:', err.message);
    return null;
  }
}

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
  const hasCookies = !!loadSavedCookies();
  return !!((hasCookies || (username && password)) && isPuppeteerAvailable());
}

async function ensureLogin(page) {
  // 1. Check for saved session cookies from tokens/tiktok_cookies.json (Bypasses all captchas!)
  const cookiesToUse = sessionCookies || loadSavedCookies();
  if (cookiesToUse && cookiesToUse.length > 0) {
    try {
      await page.setCookie(...cookiesToUse);
      sessionCookies = cookiesToUse;
      console.log('🍪 Loaded TikTok session cookies successfully!');
      return true;
    } catch (cookieErr) {
      console.warn('⚠️ Failed to apply cookies:', cookieErr.message);
    }
  }

  // 2. Full login flow fallback
  await page.goto('https://www.tiktok.com/login/phone-or-email/email', {
    waitUntil: 'domcontentloaded', timeout: 35000,
  });
  await delay(3000);

  // Switch to "Log in with email or username" if needed
  try {
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button, div, span'));
      for (const el of els) {
        if (/log in with email|email or username/i.test(el.innerText || '')) {
          el.click();
          break;
        }
      }
    });
    await delay(1500);
  } catch {}

  // Switch to "Log in with password" if showing code login
  try {
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button, div, span'));
      for (const el of els) {
        if (/log in with password|with password/i.test(el.innerText || '')) {
          el.click();
          break;
        }
      }
    });
    await delay(1500);
  } catch {}

  const { username, password } = getTikTokCredentials();

  // Fill username/email
  const usernameSelectors = [
    'input[name="username"]',
    'input[autocomplete="username"]',
    'input[type="text"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="username" i]',
  ];
  for (const sel of usernameSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await delay(200);
        await el.type(username, { delay: 60 });
        break;
      }
    } catch {}
  }

  await delay(800);

  // Toggle "Log in with password" again if needed
  try {
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button, div, span'));
      for (const el of els) {
        if (/log in with password|with password/i.test(el.innerText || '')) {
          el.click();
          break;
        }
      }
    });
    await delay(1500);
  } catch {}

  // Find password field
  const passwordSelectors = [
    'input[type="password"]',
    'input[autocomplete*="password"]',
    'input[placeholder*="password" i]',
  ];

  let passField = null;
  for (const sel of passwordSelectors) {
    passField = await page.waitForSelector(sel, { timeout: 4000 }).catch(() => null);
    if (passField) {
      await passField.click();
      await delay(200);
      await passField.type(password, { delay: 60 });
      break;
    }
  }

  if (!passField) {
    throw new Error('TikTok login: password input not found. TikTok may require manual captcha verification or email code.');
  }

  await delay(800);

  // Click login button
  const loginBtnSelectors = ['button[data-e2e="login-button"]', 'button[type="submit"]', 'button.login-button', 'form button'];
  for (const sel of loginBtnSelectors) {
    const el = await page.$(sel);
    if (el) { await el.click(); break; }
  }

  await delay(6000);
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
    await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {});
    await delay(6000);

    // Dismiss any cookie/guest banner if present (including shadowRoot banners)
    try {
      await page.evaluate(() => {
        const host = document.querySelector('tiktok-cookie-banner');
        if (host && host.shadowRoot) {
          const btns = Array.from(host.shadowRoot.querySelectorAll('button'));
          const allowBtn = btns.find(b => /allow all|accept/i.test(b.innerText || ''));
          if (allowBtn) allowBtn.click();
          else if (btns.length > 0) btns[btns.length - 1].click();
        }
        const btns = Array.from(document.querySelectorAll('button'));
        const allowBtn = btns.find(b => /allow all|accept|continue as guest/i.test(b.innerText || b.textContent || ''));
        if (allowBtn) allowBtn.click();
      });
      await delay(2000);
    } catch {}

    // Open comments panel on video player
    try {
      await page.evaluate(() => {
        const icon = document.querySelector('[data-e2e="comment-icon"]');
        if (icon) { icon.click(); return true; }
        const btns = Array.from(document.querySelectorAll('button'));
        const tab = btns.find(b => (b.innerText || b.textContent || '').trim() === 'Comments');
        if (tab) { tab.click(); return true; }
        return false;
      });
      await delay(3500);
    } catch {}

    // Find comment input
    const inputSelectors = [
      '[contenteditable="true"].public-DraftEditor-content',
      '[contenteditable="true"]',
      'div[data-e2e="comment-input"]',
      'div[data-e2e="comment-text"]',
      '[placeholder*="comment" i]',
      'div.DraftEditor-root',
    ];

    let commentInput = null;
    for (const sel of inputSelectors) {
      try {
        commentInput = await page.waitForSelector(sel, { timeout: 4000 });
        if (commentInput) break;
      } catch {}
    }

    if (!commentInput) throw new Error('Comment input not found on TikTok video page');

    await commentInput.click();
    await delay(600);

    // Insert text using execCommand so Draft.js properly registers Unicode/Hindi characters
    await page.evaluate((text) => {
      const el = document.querySelector('[contenteditable="true"].public-DraftEditor-content, [contenteditable="true"]');
      if (el) {
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
      }
    }, comment);
    await delay(1000);

    // Fallback: type space and backspace via keyboard to trigger Draft.js state update
    try {
      await page.keyboard.type(' ');
      await delay(200);
      await page.keyboard.press('Backspace');
      await delay(800);
    } catch {}

    // Submit
    const submitBtn = await page.waitForSelector('button[data-e2e="comment-post"]:not([disabled]), [data-e2e="comment-post"]:not([disabled])', { timeout: 3000 }).catch(() => null);
    if (submitBtn) {
      await submitBtn.click();
    } else {
      const anyBtn = await page.$('button[data-e2e="comment-post"], [data-e2e="comment-post"]');
      if (anyBtn) await anyBtn.click();
      await page.keyboard.press('Enter');
    }

    await delay(3000);
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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    
    // Inject cookies if available to prevent TikTok guest blocks
    const cookiesToUse = sessionCookies || loadSavedCookies();
    if (cookiesToUse && cookiesToUse.length > 0) {
      try { await page.setCookie(...cookiesToUse); } catch {}
    }

    // Regional targeting: TikTok removed /trending — use /explore or tag pages.
    // India has a local ban so we target diaspora/desi content tags.
    let targetUrl;
    if (regionCode && (regionCode.startsWith('IN'))) {
      targetUrl = 'https://www.tiktok.com/tag/desi';
    } else {
      // /explore is the current trending discovery page (replaces /trending)
      targetUrl = 'https://www.tiktok.com/explore';
    }

    let loaded = false;
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      loaded = true;
    } catch (navErr) {
      console.warn(`⚠️ TikTok /explore failed (${navErr.message}), retrying with /foryou...`);
    }

    // Fallback to /foryou if /explore fails or redirects
    if (!loaded || page.url().includes('/login')) {
      await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
    }

    await delay(3500);

    // Dismiss any guest or cookie banners if present (including shadowRoot)
    try {
      await page.evaluate(() => {
        const host = document.querySelector('tiktok-cookie-banner');
        if (host && host.shadowRoot) {
          const btns = Array.from(host.shadowRoot.querySelectorAll('button'));
          const allowBtn = btns.find(b => /allow all|accept/i.test(b.innerText || ''));
          if (allowBtn) allowBtn.click();
          else if (btns.length > 0) btns[btns.length - 1].click();
        }
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const b of buttons) {
          if (/continue as guest|accept|decline|close|skip/i.test(b.innerText || '')) {
            b.click();
          }
        }
      });
      await delay(1000);
    } catch {}

    // Scroll to trigger video card loading
    for (let s = 0; s < 4; s++) {
      try {
        await page.evaluate(() => window.scrollBy(0, 1500));
        await delay(1200);
      } catch {}
    }

    const videos = await page.evaluate((max) => {
      // TikTok uses multiple link patterns depending on the page
      const anchors = Array.from(document.querySelectorAll(
        'a[href*="/video/"], a[href*="/@"]'
      )).filter(a => a.href && a.href.includes('/video/'));

      const seen    = new Set();
      const results = [];

      for (const a of anchors) {
        if (results.length >= max) break;
        const href = a.href || '';
        if (!href.includes('/video/') || seen.has(href)) continue;
        seen.add(href);

        const img     = a.querySelector('img');
        // Try multiple title selectors for TikTok's varying layouts
        const titleEl = a.querySelector('[class*="title"], [class*="desc"], p, span[class*="text"]');
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
  const hasCookies = !!loadSavedCookies();
  if (hasCookies) {
    return { ok: true, message: 'Connected via session cookies (tokens/tiktok_cookies.json)' };
  }
  const { username, password } = getTikTokCredentials();
  if (!username || !password) return { ok: false, message: 'No session cookies and TIKTOK_USERNAME / TIKTOK_PASSWORD not set' };
  return { ok: true, message: `Configured as @${username} — will log in on first post` };
}

module.exports = { ...META, isConfigured, testConnection, postComment, getTrending };
