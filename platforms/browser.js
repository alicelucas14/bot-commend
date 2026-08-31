// ============================================================
// platforms/browser.js — Shared Puppeteer browser manager
// ============================================================
let puppeteer;

try {
  puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
  console.log('✅ Puppeteer loaded with stealth plugin');
} catch {
  try {
    puppeteer = require('puppeteer');
    console.log('✅ Puppeteer loaded (no stealth plugin)');
  } catch {
    puppeteer = null;
    console.warn('⚠️ Puppeteer not installed — TikTok/Instagram disabled');
  }
}

let browser = null;
let lastUsed = 0;
const IDLE_TIMEOUT = 10 * 60 * 1000; // close after 10 min idle

async function getBrowser() {
  if (!puppeteer) throw new Error('Puppeteer not installed. Run: npm install puppeteer');

  if (browser) {
    try {
      if (browser.isConnected() && (Date.now() - lastUsed) < IDLE_TIMEOUT) {
        lastUsed = Date.now();
        return browser;
      }
    } catch {}
    try { await browser.close(); } catch {}
    browser = null;
  }

  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--window-size=1280,800',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: { width: 1280, height: 800 },
  });

  lastUsed = Date.now();
  return browser;
}

async function closeBrowser() {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
}

function isPuppeteerAvailable() {
  return puppeteer !== null;
}

module.exports = { getBrowser, closeBrowser, isPuppeteerAvailable };
