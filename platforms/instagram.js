// ============================================================
// platforms/instagram.js — Instagram via Puppeteer automation
// ============================================================
require('dotenv').config();
const { getBrowser, isPuppeteerAvailable } = require('./browser');

const IG_USERNAME = process.env.INSTAGRAM_USERNAME;
const IG_PASSWORD = process.env.INSTAGRAM_PASSWORD;

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
  return !!(IG_USERNAME && IG_PASSWORD && isPuppeteerAvailable());
}

async function ensureLogin(page) {
  if (sessionCookies) {
    await page.setCookie(...sessionCookies);
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    const loggedIn = await page.evaluate(() => !document.querySelector('a[href="/accounts/login/"]'));
    if (loggedIn) return true;
  }

  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.waitForSelector('input[name="username"]', { timeout: 10000 });
  await page.type('input[name="username"]', IG_USERNAME, { delay: 60 });
  await page.type('input[name="password"]', IG_PASSWORD, { delay: 60 });
  await page.waitForTimeout(500);

  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  // Dismiss "Save Login Info" / "Turn On Notifications" dialogs
  for (let i = 0; i < 3; i++) {
    try {
      const notNow = await page.$x("//button[contains(text(),'Not Now') or contains(text(),'Not now')]");
      if (notNow.length) { await notNow[0].click(); await page.waitForTimeout(1500); }
    } catch {}
  }

  sessionCookies = await page.cookies();
  return !page.url().includes('/accounts/login');
}

async function postComment(postUrl, comment) {
  if (!isConfigured()) throw new Error('Instagram credentials not configured (INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD)');

  const browser = await getBrowser();
  const page    = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const loggedIn = await ensureLogin(page);
    if (!loggedIn) throw new Error('Instagram login failed — check credentials');

    await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000);

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
        await page.waitForTimeout(1500);
        for (const sel of textareaSelectors) {
          textarea = await page.$(sel);
          if (textarea) break;
        }
      }
    }

    if (!textarea) throw new Error('Comment textarea not found on Instagram post');

    await textarea.click();
    await page.waitForTimeout(500);
    await textarea.type(comment, { delay: 40 });
    await page.waitForTimeout(500);

    // Submit via Enter or Post button
    const postBtn = await page.$('button[type="submit"]:not([disabled])');
    if (postBtn) {
      await postBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(2500);
    return { success: true, platform: 'instagram' };
  } finally {
    await page.close();
  }
}

async function testConnection() {
  if (!isPuppeteerAvailable()) return { ok: false, message: 'Puppeteer not installed' };
  if (!IG_USERNAME || !IG_PASSWORD) return { ok: false, message: 'INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD not set in .env' };
  return { ok: true, message: `Configured as @${IG_USERNAME} — will log in on first post` };
}

module.exports = { ...META, isConfigured, testConnection, postComment };
