const fs = require('fs');
const path = require('path');
const { getBrowser, newPageWithProxy } = require('./platforms/browser');

(async () => {
  const browser = await getBrowser();
  const page = await newPageWithProxy(browser);
  try {
    const cookiePath = path.resolve(__dirname, 'tokens/tiktok_cookies.json');
    const raw = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
    const formatted = raw.map(c => {
      const item = {
        name: c.name,
        value: String(c.value),
        domain: c.domain.startsWith('.') ? c.domain : '.' + c.domain,
        path: c.path || '/',
        httpOnly: Boolean(c.httpOnly),
        secure: Boolean(c.secure),
      };
      if (c.sameSite === 'no_restriction') item.sameSite = 'None';
      else if (c.sameSite === 'lax') item.sameSite = 'Lax';
      else if (c.sameSite === 'strict') item.sameSite = 'Strict';
      return item;
    });
    await page.setCookie(...formatted);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    const url = 'https://www.tiktok.com/@noelgoescrazy/video/7371854022338202913?lang=en';
    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {});
    console.log('Waiting 6 seconds for React hydration...');
    await new Promise(r => setTimeout(r, 6000));
    console.log('Hydration complete, inspecting DOM...');

    // 1. Dismiss shadowRoot cookie banner
    console.log('Dismissing shadowRoot cookie banner...');
    await page.evaluate(() => {
      const host = document.querySelector('tiktok-cookie-banner');
      if (host && host.shadowRoot) {
        const btns = Array.from(host.shadowRoot.querySelectorAll('button'));
        const allowBtn = btns.find(b => /allow all/i.test(b.innerText || ''));
        if (allowBtn) {
          allowBtn.click();
          console.log('Clicked Allow all in shadowRoot!');
        } else if (btns.length > 0) {
          btns[btns.length - 1].click();
        }
      }
    });
    await new Promise(r => setTimeout(r, 2000));

    // 2. Click the Comments tab (or comment icon) to show the comments section
    console.log('Switching to Comments view...');
    await page.evaluate(() => {
      // Priority A: Click element with text "Comments"
      const allEls = Array.from(document.querySelectorAll('*'));
      for (const el of allEls) {
        if ((el.innerText || '').trim() === 'Comments' && el.children.length === 0) {
          const rect = el.getBoundingClientRect();
          if (rect.x > 600 && rect.y < 300) {
            el.click();
            console.log('Clicked Comments tab!');
            return;
          }
        }
      }
      // Priority B: Click comment icon on video player
      const icon = document.querySelector('[data-e2e="comment-icon"]');
      if (icon) icon.click();
    });

    await new Promise(r => setTimeout(r, 4000));

    // 3. Inspect the newly loaded comments section
    const commentsSection = await page.evaluate(() => {
      const allFound = Array.from(document.querySelectorAll('*')).filter(el => {
        const e2e = el.getAttribute('data-e2e') || '';
        const ce = el.getAttribute('contenteditable') || '';
        const ph = el.getAttribute('placeholder') || '';
        return e2e.includes('comment') || ce === 'true' || ph.toLowerCase().includes('comment');
      }).map(el => ({
        tag: el.tagName,
        contenteditable: el.getAttribute('contenteditable'),
        dataE2e: el.getAttribute('data-e2e'),
        placeholder: el.getAttribute('placeholder'),
        className: el.className ? String(el.className).substring(0, 50) : '',
        text: (el.innerText || '').substring(0, 40),
      }));
      return allFound;
    });
    console.log('Comments Section Inspection:', JSON.stringify(commentsSection, null, 2));

    await page.screenshot({ path: 'tiktok_page.png' });
    console.log('Saved screenshot after clicking Comments tab');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
