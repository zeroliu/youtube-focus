import { settingsFrom, type Settings } from './shared';
import { emptyUsage, summarize, type Usage } from './usage';
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const prompt = el<HTMLTextAreaElement>('prompt');
const enabled = el<HTMLInputElement>('enabled');
const opacity = el<HTMLInputElement>('opacity');
const feedback = el('feedback');
const displayModes = [...document.querySelectorAll<HTMLInputElement>('input[name="display-mode"]')];
function showDisplayMode() {
  for (const radio of displayModes) radio.checked = radio.value === saved.displayMode;
  el('opacity-controls').hidden = saved.displayMode === 'hide';
}
let saved: Settings;
async function refreshUsage() {
  const { usage, apiKey } = await chrome.storage.local.get(['usage', 'apiKey']);
  const totals = summarize(usage as Usage | undefined ?? emptyUsage());
  for (const period of ['month', 'all'] as const) {
    el(`${period}-cost`).textContent = `$${totals[period].cost.toFixed(6)}`;
    el(`${period}-requests`).textContent = totals[period].requests.toLocaleString();
  }
  el('unpriced').textContent = totals.all.unpriced ? `${totals.all.unpriced} request(s) have no returned usage, so their cost is unknown.` : '';
  el('key-state').textContent = apiKey ? 'Key saved' : 'Add a key';
}
async function init() {
  const value = await chrome.storage.local.get('settings');
  saved = settingsFrom(value.settings);
  prompt.value = saved.prompt; enabled.checked = saved.enabled; opacity.value = String(Math.round(saved.opacity * 100));
  el('opacity-value').textContent = `${opacity.value}%`; showDisplayMode(); await refreshUsage();
}
for (const radio of displayModes) radio.onchange = async () => {
  saved = { ...saved, displayMode: radio.value === 'hide' ? 'hide' : 'dim' };
  showDisplayMode();
  try { await chrome.storage.local.set({ settings: saved }); feedback.textContent = saved.displayMode === 'hide' ? 'Unrelated videos will be hidden.' : 'Unrelated videos will be dimmed.'; }
  catch { feedback.textContent = 'Could not save. Try again.'; }
};
opacity.oninput = () => { el('opacity-value').textContent = `${opacity.value}%`; };
enabled.onchange = async () => {
  saved = { ...saved, enabled: enabled.checked };
  try { await chrome.storage.local.set({ settings: saved }); feedback.textContent = enabled.checked ? 'Filtering is on.' : 'Paused. All videos stay visible.'; }
  catch { feedback.textContent = 'Could not save. Try again.'; }
};
el<HTMLFormElement>('preferences').onsubmit = async event => {
  event.preventDefault();
  if (!prompt.value.trim()) { feedback.textContent = 'Describe what you want to watch first.'; return; }
  saved = { ...saved, prompt: prompt.value.trim(), enabled: enabled.checked, opacity: Number(opacity.value) / 100 };
  try { await chrome.storage.local.set({ settings: saved }); feedback.textContent = 'Saved. Your feed will update automatically.'; }
  catch { feedback.textContent = 'Could not save. Try again.'; }
};
el('save-key').onclick = async () => {
  const input = el<HTMLInputElement>('api-key');
  if (!input.value.trim()) { feedback.textContent = 'Enter a TypeSafe API key first.'; return; }
  try { await chrome.storage.local.set({ apiKey: input.value.trim() }); input.value = ''; feedback.textContent = 'API key saved.'; await refreshUsage(); }
  catch { feedback.textContent = 'Could not save the key. Try again.'; }
};
chrome.storage.onChanged.addListener(() => void refreshUsage());
void init().catch(() => { feedback.textContent = 'Could not load settings. Reopen the popup.'; });
