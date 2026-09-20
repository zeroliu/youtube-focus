import { createFeedStatus } from './status';
import { extractVideo, TILE_SELECTOR } from './dom';
import { DEFAULT_SETTINGS, fingerprint, settingsFrom, shouldDim, type Settings, type Video, type ClassificationResponse } from './shared';
let settings: Settings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;
let failed = false;
let generation = 0;
let running = false;
let timer: ReturnType<typeof setTimeout>;
let retryAt = 0;
const results = new Map<string, number>();
const status = createFeedStatus();
let awaitingFeed = true;
let feedWaitUntil = Date.now() + 15_000;
const onFeed = () => location.pathname === '/' || location.pathname === '/watch';
function updateAppearance() {
  document.documentElement.dataset.ytfPage = location.pathname === '/' ? 'home' : location.pathname === '/watch' ? 'watch' : 'other';
  document.documentElement.classList.toggle('ytf-booting', onFeed() && !settingsLoaded && !failed);
  document.documentElement.dataset.ytfMode = settings.displayMode;
  document.documentElement.classList.toggle('ytf-active', onFeed() && settings.enabled && !!settings.prompt.trim() && !failed);
  document.documentElement.style.setProperty('--ytf-opacity', String(settings.opacity));
}
updateAppearance();
if (onFeed()) status.start();

// Intercept preview triggers before YouTube's document/thumbnail handlers.
// Keep mouseout/leave events intact so existing previews can clean up, and
// leave clicks and keyboard interaction alone so every video stays watchable.
for (const type of ['mouseover', 'mouseenter', 'mousemove', 'pointerover', 'pointerenter', 'pointermove']) {
  window.addEventListener(type, event => {
    if (!onFeed() || !settings.enabled || !settings.prompt.trim()) return;
    const tile = event.target instanceof Element ? event.target.closest(TILE_SELECTOR) : null;
    if (tile && (tile.classList.contains('ytf-dimmed') ||
      (document.documentElement.classList.contains('ytf-active') && !tile.hasAttribute('data-ytf-ready')))) {
      event.stopImmediatePropagation();
    }
  }, { capture: true });
}

function tiles() { return [...document.querySelectorAll<HTMLElement>(TILE_SELECTOR)]; }
function clear(tile: HTMLElement) {
  tile.classList.remove('ytf-dimmed', 'ytf-hidden');
  delete tile.dataset.ytfReady;
}
function paint(tile: HTMLElement, video: Video) {
  const key = fingerprint(video);
  if (tile.dataset.ytfVideo !== key) { clear(tile); tile.dataset.ytfVideo = key; }
  const probability = results.get(key);
  const ready = probability !== undefined;
  const dim = shouldDim(probability ?? NaN);
  if (!dim) { clear(tile); if (ready) tile.dataset.ytfReady = 'true'; return; }
  tile.dataset.ytfReady = 'true';
  tile.classList.add('ytf-dimmed');
  tile.classList.toggle('ytf-hidden', settings.displayMode === 'hide');
  tile.style.setProperty('--ytf-opacity', String(settings.opacity));

}
function schedule(delay = 200) { clearTimeout(timer); timer = setTimeout(() => void scan(), delay); }
async function scan() {
  if (!settingsLoaded) return;
  updateAppearance();
  if (!onFeed() || !settings.enabled || !settings.prompt.trim()) { document.querySelectorAll<HTMLElement>('[data-ytf-video]').forEach(clear); status.hide(); return; }
  const candidates = new Map<string, Video>();
  for (const tile of tiles()) {
    const video = extractVideo(tile);
    if (!video) { clear(tile); continue; }
    awaitingFeed = false;
    paint(tile, video);
    const box = tile.getBoundingClientRect();
    if (box.bottom >= -100 && box.top <= innerHeight + 700 && !results.has(fingerprint(video))) candidates.set(fingerprint(video), video);
  }
  if (Date.now() < retryAt) { schedule(retryAt - Date.now()); return; }
  if (running) return;
  if (!candidates.size) {
    if (awaitingFeed) {
      if (Date.now() < feedWaitUntil) { status.start(); schedule(500); }
      else status.hide();
    } else status.complete();
    return;
  }
  failed = false; updateAppearance();
  const batch = [...candidates.values()].slice(0, 12);
  const currentGeneration = generation;
  running = true;
  status.start();
  try {
    const response: ClassificationResponse = await chrome.runtime.sendMessage({ type: 'classify', videos: batch, prompt: settings.prompt });
    if (generation !== currentGeneration || !onFeed()) return;
    if (response.error) { failed = true; updateAppearance(); status.error(`YouTube Focus · ${response.error}`); retryAt = Date.now() + 60_000; return; }
    const byId = new Map(response.results.map(result => [result.id, result.probability]));
    for (const video of batch) { const probability = byId.get(video.id); if (probability !== undefined) results.set(fingerprint(video), probability); }
    while (results.size > 2000) results.delete(results.keys().next().value!);
    if (!response.results.length) retryAt = Date.now() + 5000;
    // Keep the toast between batches; the next scan clears it when caught up.
  } catch { failed = true; updateAppearance(); status.error('YouTube Focus · Connection lost. Reload this page to retry.'); retryAt = Date.now() + 60_000; }
  finally { running = false; schedule(Math.max(100, retryAt - Date.now())); }
}
function applySettings(value: Settings) {
  const next = settingsFrom(value);
  if (next.prompt !== settings.prompt || next.enabled !== settings.enabled) { generation++; results.clear(); }
  settingsLoaded = true; failed = false;
  settings = next; retryAt = 0;
  document.querySelectorAll<HTMLElement>('[data-ytf-video]').forEach(clear); updateAppearance(); void scan();
}
chrome.runtime.onMessage.addListener(message => { if (message?.type === 'settingsChanged') applySettings(message.settings); });
new MutationObserver(mutations => {
  if (mutations.some(m => !(m.target instanceof Element && (m.target.closest('.ytf-status'))) &&
    (m.type !== 'childList' || [...m.addedNodes, ...m.removedNodes].some(node => !(node instanceof Element && node.matches('.ytf-status')))))) schedule();
}).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'title'] });
addEventListener('scroll', () => schedule(), { passive: true });
addEventListener('resize', () => schedule());
addEventListener('load', () => schedule());
document.addEventListener('DOMContentLoaded', () => void scan(), { once: true });
document.addEventListener('yt-navigate-start', () => { if (onFeed() && settings.enabled) status.start(); });
document.addEventListener('yt-navigate-finish', () => { generation++; awaitingFeed = true; feedWaitUntil = Date.now() + 15_000; document.querySelectorAll<HTMLElement>('[data-ytf-video]').forEach(clear); updateAppearance(); if (onFeed() && settings.enabled) status.start(); else status.hide(); schedule(); });
void chrome.runtime.sendMessage({ type: 'settings' }).then(applySettings).catch(() => { failed = true; updateAppearance(); status.error('YouTube Focus · Reload this page to connect.'); });
