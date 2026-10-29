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
let lastCookieError = null; // tracks runtime session invalidation

function getCookieFile() {
  return path.join(__dirname, '..', 'tokens', 'tiktok_cookies.json');
}

function getCookieStatus() {
  const file = getCookieFile();
  if (!fs.existsSync(file)) {
    return { hasCookies: false, valid: false, expired: false, cookieCount: 0, message: 'No cookies file found' };
  }
  try {
    const stat = fs.statSync(file);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(raw) || raw.length === 0) {
      return { hasCookies: false, valid: false, expired: true, cookieCount: 0, message: 'Cookies file is empty' };
    }

    const sessionCookie = raw.find(c => c.name === 'sessionid' || c.name === 'sessionid_ss' || c.name === 'sid_guard');
    let expiresAt = null;
    let isExpired = false;

    if (sessionCookie && sessionCookie.expirationDate) {
      const expMs = sessionCookie.expirationDate * 1000;
      expiresAt = new Date(expMs).toISOString();
      if (Date.now() > expMs) {
        isExpired = true;
      }
    }

    // Check age in hours (file mtime)
    const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
    // TikTok web sessions typically invalidate after 36-48h
    if (ageHours > 48) {
      isExpired = true;
    }

    // If runtime verification caught a login/signup popup, mark as expired
    if (lastCookieError) {
      isExpired = true;
    }

    return {
      hasCookies: true,
      valid: !isExpired,
      expired: isExpired,
      cookieCount: raw.length,
      hasSessionId: !!sessionCookie,
      expiresAt: expiresAt,
      updatedAt: stat.mtime.toISOString(),
      ageHours: Math.round(ageHours * 10) / 10,
      reason: lastCookieError || (isExpired ? 'Session age exceeded 48 hours' : 'Active'),
    };
  } catch (err) {
    return { hasCookies: true, valid: false, expired: true, cookieCount: 0, message: err.message };
  }
}

function saveCookies(cookiesData) {
  let parsed;
  if (typeof cookiesData === 'string') {
    parsed = JSON.parse(cookiesData.trim());
  } else {
    parsed = cookiesData;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Invalid cookies format — must be a JSON array of cookie objects from Cookie-Editor');
  }

  const dir = path.dirname(getCookieFile());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(getCookieFile(), JSON.stringify(parsed, null, 2), 'utf8');
  sessionCookies = null; // clear in-memory cache
  lastCookieError = null; // reset any previous expired flag
  return getCookieStatus();
}

function loadSavedCookies() {
  const file = getCookieFile();
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.map(c => {
      const domainClean = c.domain ? c.domain.replace(/^\./, '') : 'tiktok.com';
      const item = {
        name: c.name,
        value: String(c.value),
        domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
        path: c.path || '/',
        httpOnly: Boolean(c.httpOnly),
        secure: Boolean(c.secure),
        url: `https://${domainClean}${c.path || '/'}`,
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
      // Must visit HTTPS origin first so secure: true cookies are accepted by Chrome
      await page.goto('https://www.tiktok.com', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
      await page.setCookie(...cookiesToUse);
      sessionCookies = cookiesToUse;
      console.log('🍪 Loaded TikTok session cookies successfully onto https://www.tiktok.com!');
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
    await page.setViewport({ width: 1440, height: 900 }).catch(() => {});
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

    // Switch to Comments tab on video player (if "You may like" or anything else is active)
    try {
      // First, dismiss any modal that might be open (like "Log in to TikTok" with "Skip" button)
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div, span, a'));
        const skip = btns.find(b => (b.innerText || b.textContent || '').trim().toLowerCase() === 'skip');
        if (skip) skip.click();
      });
      await delay(1000);

      const clickCoords = await page.evaluate(() => {
        // Find the Comments tab in the right sidebar (x > 850, y between 100 and 350)
        const all = Array.from(document.querySelectorAll('*'));
        for (const el of all) {
          const t = (el.innerText || el.textContent || '').trim();
          if (/^comments?$/i.test(t)) {
            const r = el.getBoundingClientRect();
            if (r.left > 850 && r.top > 100 && r.top < 350 && r.width > 15 && r.height > 8) {
              return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: t };
            }
          }
        }
        return null;
      });

      if (clickCoords) {
        console.log(`🎯 Clicking real Comments tab (next to "You may like") at (${Math.round(clickCoords.x)}, ${Math.round(clickCoords.y)})`);
        await page.mouse.click(clickCoords.x, clickCoords.y);
        await delay(3500);
      } else {
        // Fallback: Click the comment bubble icon on the video player action bar
        const iconCoords = await page.evaluate(() => {
          // Look for comment count element or comment icon on the video bar
          const els = Array.from(document.querySelectorAll('*'));
          const countEl = els.find(el => {
            const t = (el.innerText || el.textContent || '').trim();
            return (t === '636' || (t.includes('636') && t.length < 10)) && el.getBoundingClientRect().top > 300;
          });
          if (countEl) {
            const r = countEl.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top - 15 };
          }
          const icon = document.querySelector('[data-e2e*="comment-icon"], [aria-label*="comment" i]');
          if (icon) {
            const r = icon.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.top > 200) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
          return null;
        });
        if (iconCoords) {
          console.log(`🎯 Clicking video comment bubble at (${Math.round(iconCoords.x)}, ${Math.round(iconCoords.y)})`);
          await page.mouse.click(iconCoords.x, iconCoords.y);
          await delay(3500);
        }
      }
    } catch (e) {
      console.warn('⚠️ Error switching to comments:', e.message);
    }

    // Check if video is unavailable or comments are turned off
    const videoStatus = await page.evaluate(() => {
      const text = document.body ? document.body.innerText || '' : '';
      if (/comments are turned off|comments have been disabled/i.test(text)) return 'Comments are turned off for this video';
      if (/video currently unavailable|video is private/i.test(text)) return 'Video is unavailable or private';
      return null;
    });
    if (videoStatus) {
      throw new Error(`TikTok: ${videoStatus}`);
    }

    // Check if TikTok requires login or signup instead of showing an active input
    const loginPrompt = await page.evaluate(() => {
      const text = document.body ? document.body.innerText || '' : '';
      if (/when's your birthday\?/i.test(text)) return 'TikTok signup prompt ("When\'s your birthday?") detected — session expired';
      if (/log in to comment/i.test(text)) return 'TikTok "Log in to comment" detected — session expired';
      if (/log in to tiktok/i.test(text)) return 'TikTok "Log in to TikTok" modal detected — session expired';
      return null;
    });
    if (loginPrompt) {
      lastCookieError = loginPrompt;
      throw new Error(`${loginPrompt}. Please update cookies in dashboard Settings.`);
    }

    // Find comment input
    const inputSelectors = [
      '[contenteditable="true"].public-DraftEditor-content',
      '[contenteditable="true"]',
      'div[data-e2e="comment-input"]',
      'div[data-e2e="comment-text"]',
      'div.DraftEditor-root [contenteditable="true"]',
      'div.DraftEditor-root',
      '[placeholder*="comment" i]',
      'div[class*="CommentInput"]',
      'div[class*="DraftEditor"]',
      'textarea',
    ];

    let commentInput = null;
    for (const sel of inputSelectors) {
      try {
        const els = await page.$$(sel);
        for (const el of els) {
          const box = await el.boundingBox();
          if (box && box.width > 40 && box.height > 15) {
            commentInput = el;
            break;
          }
        }
        if (commentInput) break;
      } catch {}
    }

    // If still not found, search for "Add comment..." placeholder text
    if (!commentInput) {
      const phCoords = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('*'));
        for (const el of els) {
          const t = (el.innerText || el.textContent || el.getAttribute('placeholder') || '').trim().toLowerCase();
          if (t.includes('add comment') || t === 'comment...') {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.left > 400) {
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
          }
        }
        return null;
      });
      if (phCoords) {
        console.log(`🎯 Clicking "Add comment" placeholder at (${Math.round(phCoords.x)}, ${Math.round(phCoords.y)})`);
        await page.mouse.click(phCoords.x, phCoords.y);
        await delay(1500);
        commentInput = await page.$('[contenteditable="true"], div.DraftEditor-root');
      }
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
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, comment);
    await delay(1000);

    // Trigger keyboard state update for Draft.js
    try {
      await page.keyboard.type(' ');
      await delay(200);
      await page.keyboard.press('Backspace');
      await delay(800);
    } catch {}

    // Check if Post button is enabled
    let submitBtn = await page.waitForSelector('button[data-e2e="comment-post"]:not([disabled]), [data-e2e="comment-post"]:not([disabled])', { timeout: 4000 }).catch(() => null);

    // If still disabled, force an input event on the editor
    if (!submitBtn) {
      await page.evaluate(() => {
        const el = document.querySelector('[contenteditable="true"].public-DraftEditor-content, [contenteditable="true"]');
        if (el) {
          el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText' }));
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        }
      });
      await delay(1000);
      submitBtn = await page.$('button[data-e2e="comment-post"]:not([disabled]), [data-e2e="comment-post"]:not([disabled])');
    }

    if (submitBtn) {
      await submitBtn.click();
    } else {
      // Last resort click on any comment-post element
      const anyBtn = await page.$('button[data-e2e="comment-post"], [data-e2e="comment-post"]');
      if (anyBtn) {
        await anyBtn.click();
      } else {
        throw new Error('TikTok Post button not found or remained disabled');
      }
    }

    // Wait for comment to submit and render
    await delay(5000);

    // Always take a proof screenshot of the post attempt
    try {
      const proofPath = path.join(__dirname, '..', 'public', 'tiktok_last_post.png');
      await page.screenshot({ path: proofPath });
      console.log(`📸 Saved post screenshot to public/tiktok_last_post.png`);
    } catch {}

    const postStatus = await page.evaluate((originalComment) => {
      // 1. Check for TikTok captcha / puzzle challenge
      const hasCaptcha = Array.from(document.querySelectorAll('*')).some(el => {
        const text = (el.innerText || el.textContent || '').toLowerCase();
        return text.includes('drag the slider') || text.includes('fit the puzzle') || text.includes('security check') || text.includes('verify to continue');
      });
      if (hasCaptcha) {
        return { error: 'Security puzzle captcha triggered ("Drag the slider to fit the puzzle"). Datacenter IP blocked.' };
      }

      // 2. Check for TikTok toast / error notifications
      const toasts = Array.from(document.querySelectorAll('[role="alert"], div[class*="toast"], div[class*="Toast"], [class*="modal"]'));
      for (const t of toasts) {
        const text = (t.innerText || t.textContent || '').trim();
        if (text && /too fast|failed|error|blocked|prohibited|guidelines|log in|login/i.test(text)) {
          return { error: text };
        }
      }

      // 3. Check if editor was cleared
      const editor = document.querySelector('[contenteditable="true"].public-DraftEditor-content, [contenteditable="true"]');
      const remainingText = editor ? (editor.innerText || '').trim() : '';

      // 4. Check if the newly posted comment appears in the comments list
      const comments = Array.from(document.querySelectorAll('[data-e2e="comment-level-1"], [class*="CommentItem"], [class*="comment-text"]'));
      const foundInList = comments.some(c => (c.innerText || '').includes(originalComment.slice(0, 15)));

      return { remainingText, foundInList };
    }, comment);

    if (postStatus.error) {
      throw new Error(`TikTok rejected comment: ${postStatus.error}`);
    }

    // If editor still holds the comment text after clicking submit, it didn't send
    if (postStatus.remainingText && postStatus.remainingText.length > 3) {
      throw new Error(`TikTok comment submission failed: text remained in editor (${postStatus.remainingText.substring(0, 30)}...)`);
    }

    return { success: true, platform: 'tiktok' };
  } catch (err) {
    try {
      const errPath = path.join(__dirname, '..', 'public', 'tiktok_last_error.png');
      await page.screenshot({ path: errPath });
      console.warn(`📸 Saved debug screenshot to public/tiktok_last_error.png (URL: ${page.url()})`);
    } catch {}
    throw err;
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
  if (!isPuppeteerAvailable()) return { ok: false, message: 'Puppeteer not installed' };
  const status = getCookieStatus();
  if (status.hasCookies) {
    if (status.expired) {
      return { ok: false, message: `Session cookies expired (${status.reason || `updated ${status.ageHours}h ago`}). Please paste fresh cookies in Settings.` };
    }
    return { ok: true, message: `Connected via session cookies (${status.cookieCount} cookies, updated ${status.ageHours}h ago)` };
  }
  const { username, password } = getTikTokCredentials();
  if (!username || !password) return { ok: false, message: 'No session cookies and TIKTOK_USERNAME / TIKTOK_PASSWORD not set' };
  return { ok: true, message: `Configured as @${username} — will log in on first post` };
}

module.exports = {
  ...META,
  isConfigured,
  testConnection,
  postComment,
  getTrending,
  getCookieStatus,
  saveCookies,
};
