import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
// Reduced from the signed-in homepage: the thumbnail comes before the title.
const tile = (id: string, title: string) => `<ytd-rich-item-renderer style="display:block;width:300px;height:210px;position:relative"><div><a class="ytLockupViewModelContentImage" href="/watch?v=${id}" aria-hidden="true" tabindex="-1"><div style="background:#82a784;height:130px;border-radius:12px"></div><span>12:34</span></a><yt-lockup-metadata-view-model><h3 title="${title}"><a class="ytLockupMetadataViewModelTitle" href="/watch?v=${id}">${title}</a></h3><yt-content-metadata-view-model><div class="ytContentMetadataViewModelMetadataRow"><a href="/@example">Example channel</a></div><div class="ytContentMetadataViewModelMetadataRow">20K views • 1 day ago</div></yt-content-metadata-view-model></yt-lockup-metadata-view-model></div></ytd-rich-item-renderer>`;
test('installed extension dims, reveals, rechecks recycled cards, pauses, and tracks usage', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'youtube-focus-'));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${path.resolve('dist')}`, `--load-extension=${path.resolve('dist')}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    // Run the real SDK and worker; replace only the external API response.
    await worker.evaluate(() => {
      const original = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        if (String(input).includes('api.typesafe.ai')) {
          const body = JSON.parse(String(init?.body));
          const answers = Object.fromEntries(body.state.videos.map((v: { title: string }, i: number) => [`video_${i}`, { type: 'noul', noul: v.title.includes('Physics') ? 0.98 : 0.03 }]));
          return new Response(JSON.stringify({ model: 'jev-1.13.0', answers, usage: { input_tokens: 1000, output_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
        }
        return original(input, init);
      };
      return chrome.storage.local.set({ apiKey: 'test-key' });
    });
    await context.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: `<html><body style="font-family:system-ui;background:#fafafa;padding:30px"><h1>YouTube home feed · Test fixture</h1><div style="display:flex;gap:24px">${tile('physics0001', 'Physics explained')}${tile('gaming00001', 'Gaming highlights')}</div></body></html>` }));
    const page = await context.newPage(); await page.goto('https://www.youtube.com/');
    await expect(page.locator('.ytf-dimmed')).toHaveCount(1);
    await expect(page.locator('.ytf-dimmed')).toContainText('Gaming');
    const dimmedContent = page.locator('.ytf-dimmed > div');
    await expect(dimmedContent).toHaveCSS('opacity', '0.22');
    await page.locator('.ytf-dimmed').hover();
    await expect(dimmedContent).toHaveCSS('opacity', '1');
    await expect(dimmedContent).toHaveCSS('filter', 'none');
    await page.mouse.move(0, 0);
    await expect(dimmedContent).toHaveCSS('opacity', '0.22');
    await expect(page.locator('.ytf-status')).toBeHidden();
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('#all-requests')).toHaveText('1'); await expect(popup.locator('#all-cost')).toHaveText('$0.000042');
    await popup.locator('body').screenshot({ path: '.context/popup.png' });
    await page.screenshot({ path: '.context/feed.png' });
    await page.getByRole('button', { name: /Show video/ }).click(); await expect(page.locator('.ytf-dimmed')).toHaveCount(0);
    await page.locator('ytd-rich-item-renderer').last().evaluate(node => { const a = node.querySelector('h3 a')!; a.setAttribute('href', '/watch?v=music000001'); node.querySelector('h3')!.setAttribute('title', 'Music concert'); a.textContent = 'Music concert'; });
    await expect(page.locator('.ytf-dimmed')).toHaveCount(1);
    await expect(popup.locator('#all-requests')).toHaveText('2');
    await popup.locator('#enabled').uncheck(); await expect(page.locator('.ytf-dimmed')).toHaveCount(0);
    await popup.locator('#enabled').check({ timeout: 5000 }); await expect(page.locator('.ytf-dimmed')).toHaveCount(1);
    await popup.locator('#prompt').fill('Only physics lessons'); await popup.getByRole('button', { name: 'Save preferences' }).click();
    await expect(popup.locator('#all-requests')).toHaveText('4');
    await page.locator('body').evaluate((body, html) => body.insertAdjacentHTML('beforeend', html), '<div style="height:1000px"></div>' + tile('sports00001', 'Sports highlights'));
    await page.locator('ytd-rich-item-renderer').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.ytf-dimmed')).toHaveCount(2);
    await expect(popup.locator('#all-requests')).toHaveText('5');
    await page.evaluate(() => { history.pushState({}, '', '/results?search_query=physics'); document.dispatchEvent(new Event('yt-navigate-finish')); });
    await expect(page.locator('.ytf-dimmed')).toHaveCount(0);
    // Usage survives worker/page reuse and is never reset by preference edits.
    await popup.reload(); await expect(popup.locator('#all-requests')).toHaveText('5');
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});

test('late answers do not dim paused feeds; errors remain visible and count as unpriced attempts', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'youtube-focus-errors-'));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${path.resolve('dist')}`, `--load-extension=${path.resolve('dist')}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(() => {
      const original = globalThis.fetch;
      (globalThis as any).testCalls = 0;
      globalThis.fetch = async (input, init) => {
        if (!String(input).includes('api.typesafe.ai')) return original(input, init);
        (globalThis as any).testCalls++;
        if ((globalThis as any).testCalls > 1) return new Response('{}', { status: 429 });
        return new Promise(resolve => { (globalThis as any).release = () => resolve(new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { video_0: { type: 'noul', noul: 0.02 } }, usage: { input_tokens: 1000, output_tokens: 10 } }), { headers: { 'content-type': 'application/json' } })); });
      };
      return chrome.storage.local.set({ apiKey: 'test-key' });
    });
    await context.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: `<html><body>${tile('gaming00001', 'Gaming highlights')}</body></html>` }));
    const page = await context.newPage(); await page.goto('https://www.youtube.com/');
    await expect.poll(() => worker.evaluate(() => (globalThis as any).testCalls)).toBe(1);
    await expect(page.locator('ytd-rich-item-renderer > div')).toHaveCSS('opacity', '0.22');
    await expect(page.locator('.ytf-status')).toHaveText('Sorting snacks for your brain…');
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator('#enabled').uncheck();
    await worker.evaluate(() => (globalThis as any).release());
    await expect(popup.locator('#all-cost')).toHaveText('$0.000042');
    await expect(page.locator('.ytf-dimmed')).toHaveCount(0);
    await popup.locator('#prompt').fill('Only science'); await popup.getByRole('button', { name: 'Save preferences' }).click();
    await popup.locator('#enabled').check({ timeout: 5000 });
    await expect(page.locator('.ytf-status')).toContainText('TypeSafe is busy');
    await expect(page.locator('ytd-rich-item-renderer > div')).toHaveCSS('opacity', '1');
    await expect(page.locator('.ytf-dimmed')).toHaveCount(0);
    await expect(popup.locator('#all-requests')).toHaveText('2');
    await expect(popup.locator('#unpriced')).toContainText('1 request(s)');
    await expect(popup.locator('#all-cost')).toHaveText('$0.000042');
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});
