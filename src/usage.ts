export const INPUT_USD_PER_MILLION = 0.042;
export const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export interface UsageEvent { id: string; at: number; cost: number; unpriced: boolean }
export interface Usage { requests: number; cost: number; unpriced: number; recent: UsageEvent[] }
export const emptyUsage = (): Usage => ({ requests: 0, cost: 0, unpriced: 0, recent: [] });
export function summarize(usage: Usage, now = Date.now()) {
  const recent = usage.recent.filter(event => event.at >= now - WINDOW_MS);
  return { all: { requests: usage.requests, cost: usage.cost, unpriced: usage.unpriced }, month: { requests: recent.length, cost: recent.reduce((sum, event) => sum + event.cost, 0), unpriced: recent.filter(event => event.unpriced).length } };
}
export async function startUsage(): Promise<string> {
  const usage: Usage = (await chrome.storage.local.get('usage')).usage as Usage | undefined ?? emptyUsage();
  const id = crypto.randomUUID();
  usage.requests++;
  usage.unpriced++;
  usage.recent = usage.recent.filter(event => event.at >= Date.now() - WINDOW_MS);
  usage.recent.push({ id, at: Date.now(), cost: 0, unpriced: true });
  await chrome.storage.local.set({ usage });
  return id;
}
export async function finishUsage(id: string, tokens: number): Promise<void> {
  if (!Number.isFinite(tokens) || tokens < 0) return;
  const usage: Usage = (await chrome.storage.local.get('usage')).usage as Usage | undefined ?? emptyUsage();
  const event = usage.recent.find(event => event.id === id);
  if (!event || !event.unpriced) return;
  event.cost = tokens * INPUT_USD_PER_MILLION / 1_000_000;
  event.unpriced = false;
  usage.cost += event.cost;
  usage.unpriced--;
  await chrome.storage.local.set({ usage });
}
