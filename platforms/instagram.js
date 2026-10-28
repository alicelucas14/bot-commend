// ============================================================
// platforms/instagram.js — Instagram via Puppeteer automation
// ============================================================
require('dotenv').config();
const { getBrowser, newPageWithProxy, isPuppeteerAvailable } = require('./browser');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to read latest environment variables dynamically
const getInstagramCredentials = () => ({
  username: process.env.INSTAGRAM_USERNAME || '',
  password: process.env.INSTAGRAM_PASSWORD || '',
});

let sessionCookies = null;

const META = {
  id:     'instagram',
  name:   'Instagram',
  icon:   '📸',
  color:  '#e1306c',
  accent: '#e1306c',
  supportsTrending: false,
  credentialFields: [
    { key: 'INSTAGRAM_USERNAME', label: 'Username', type: 'text',     placeholder: 'your_username' },
    { key: 'INSTAGRAM_PASSWORD', label: 'Password', type: 'password', placeholder: '••••••••' },
  ],
};

function isConfigured() {
  const { username, password } = getInstagramCredentials();
  return !!(username && password && isPuppeteerAvailable());
}

async function ensureLogin(page) {
  if (sessionCookies) {
    await page.setCookie(...sessionCookies);
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    const loggedIn = await page.evaluate(() => !document.querySelector('a[href="/accounts/login/"]'));
    if (loggedIn) return true;
  }

  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(2000);

  const { username, password } = getInstagramCredentials();
  await page.waitForSelector('input[name="username"]', { timeout: 10000 });
  await page.type('input[name="username"]', username, { delay: 60 });
  await page.type('input[name="password"]', password, { delay: 60 });
  await delay(500);

  await page.click('button[type="submit"]');
  await delay(5000);

  // Dismiss "Save Login Info" / "Turn On Notifications" dialogs
  for (let i = 0; i < 3; i++) {
    try {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const notNow = buttons.find(b => /not now/i.test(b.innerText || ''));
        if (notNow) { notNow.click(); return true; }
        return false;
      });
      if (clicked) await delay(1500);
    } catch {}
  }

  sessionCookies = await page.cookies();
  return !page.url().includes('/accounts/login');
}

async function postComment(postUrl, comment) {
  if (!isConfigured()) throw new Error('Instagram credentials not configured (INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD)');

  const browser = await getBrowser();
  const page    = await newPageWithProxy(browser);

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const loggedIn = await ensureLogin(page);
    if (!loggedIn) throw new Error('Instagram login failed — check credentials');

    await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000);

    // Find comment textarea
    const textareaSelectors = [
      'textarea[placeholder*="comment" i]',
      'textarea[placeholder*="Comment" i]',
      'textarea[aria-label*="comment" i]',
      'textarea',
    ];

    let textarea = null;
    for (const sel of textareaSelectors) {
      textarea = await page.$(sel);
      if (textarea) break;
    }

    if (!textarea) {
      // Try clicking comment icon to open comments
      const commentIcon = await page.$('[aria-label*="Comment" i]');
      if (commentIcon) {
        await commentIcon.click();
        await delay(1500);
        for (const sel of textareaSelectors) {
          textarea = await page.$(sel);
          if (textarea) break;
        }
      }
    }

    if (!textarea) throw new Error('Comment textarea not found on Instagram post');

    await textarea.click();
    await delay(500);
    await textarea.type(comment, { delay: 40 });
    await delay(500);

    // Submit via Enter or Post button
    const postBtn = await page.$('button[type="submit"]:not([disabled])');
    if (postBtn) {
      await postBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    await delay(2500);
    return { success: true, platform: 'instagram' };
  } finally {
    await page.close();
  }
}

async function testConnection() {
  if (!isPuppeteerAvailable()) return { ok: false, message: 'Puppeteer not installed' };
  const { username, password } = getInstagramCredentials();
  if (!username || !password) return { ok: false, message: 'INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD not set in .env' };
  return { ok: true, message: `Configured as @${username} — will log in on first post` };
}

module.exports = { ...META, isConfigured, testConnection, postComment };
