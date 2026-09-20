import { classify } from './classifier';
import { fingerprint, settingsFrom, validVideos, type ClassificationResponse, type Settings, type Verdict } from './shared';

// The key is available to extension pages and the worker, never content scripts.
const storageReady = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  if ((await chrome.storage.local.get('apiKey')).apiKey) return;
  try {
    const response = await fetch(chrome.runtime.getURL('local-config.json'));
    if (!response.ok) return;
    const config = await response.json();
    if (typeof config.apiKey === 'string' && config.apiKey) await chrome.storage.local.set({ apiKey: config.apiKey });
  } catch { /* Shared builds use the popup to enter a personal key. */ }
})();
const cache = new Map<string, { result: Verdict; expires: number }>();
let queue: Promise<unknown> = Promise.resolve();
let blockedUntil = 0;
let lastError = '';
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || changes.apiKey)) { cache.clear(); blockedUntil = 0; lastError = ''; }
});
async function settings(): Promise<Settings> {
  await storageReady;
  return settingsFrom((await chrome.storage.local.get('settings')).settings);
}
async function processBatch(videos: unknown, prompt: unknown): Promise<ClassificationResponse> {
  if (!validVideos(videos)) return { results: [], error: 'Invalid video metadata.' };
  const current = await settings();
  if (!current.enabled || current.prompt !== prompt || !current.prompt.trim()) return { results: [] };
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (typeof apiKey !== 'string' || !apiKey.trim()) return { results: [], error: 'Add your TypeSafe API key in YouTube Focus.' };
  if (Date.now() < blockedUntil) return { results: [], error: lastError };
  const keyFor = (video: typeof videos[number]) => JSON.stringify([current.prompt, fingerprint(video)]);
  const missing = videos.filter(v => (cache.get(keyFor(v))?.expires ?? 0) < Date.now());
  try {
    if (missing.length) {
      const results = await classify(apiKey, current.prompt, missing);
      // A preference/key change while a request runs must not repopulate the old cache.
      const latest = await chrome.storage.local.get(['settings', 'apiKey']);
      if (settingsFrom(latest.settings).prompt !== current.prompt || latest.apiKey !== apiKey) return { results: [] };
      results.forEach((result, i) => cache.set(keyFor(missing[i]), { result, expires: Date.now() + 30 * 60_000 }));
      while (cache.size > 1000) cache.delete(cache.keys().next().value!);
    }
    return { results: videos.flatMap(v => { const hit = cache.get(keyFor(v)); return hit ? [hit.result] : []; }) };
  } catch (error) {
    const latest = await chrome.storage.local.get(['settings', 'apiKey']);
    if (settingsFrom(latest.settings).prompt !== current.prompt || latest.apiKey !== apiKey) return { results: [] };
    const status = (error as { status?: number }).status;
    lastError = status === 401 || status === 403 ? 'TypeSafe rejected the API key. Check it in YouTube Focus.' : status === 429 ? 'TypeSafe is busy. Filtering will retry in a minute.' : 'Could not reach TypeSafe. Videos stay visible; retrying in a minute.';
    blockedUntil = Date.now() + 60_000;
    return { results: [], error: lastError };
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith('https://www.youtube.com/')) return;
  if (message?.type === 'settings') {
    settings().then(reply).catch(() => reply({ enabled: false, prompt: '', opacity: 0.22 }));
    return true;
  }
  if (message?.type === 'classify') {
    queue = queue.then(() => processBatch(message.videos, message.prompt));
    queue.then(reply).catch(() => reply({ results: [], error: 'Filtering is unavailable. Reload YouTube to retry.' }));
    queue = queue.catch(() => undefined);
    return true;
  }
});
// Content scripts cannot read local storage, so send only non-secret settings.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'local' || (!_changes.settings && !_changes.apiKey)) return;
  void settings().then(async value => {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
    await Promise.allSettled(tabs.map(tab => tab.id ? chrome.tabs.sendMessage(tab.id, { type: 'settingsChanged', settings: value }) : Promise.resolve()));
  });
});
