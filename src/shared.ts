export const DEFAULT_PROMPT = 'I want educational videos that teach me something. No video games, sports, music, celebrity gossip, or entertainment-only videos.';
export const DEFAULT_SETTINGS = { prompt: DEFAULT_PROMPT, enabled: true, opacity: 0.22, displayMode: 'dim' as 'dim' | 'hide' };
export type Settings = typeof DEFAULT_SETTINGS;
export interface Video { id: string; title: string; channel: string; metadata: string }
export interface Verdict { id: string; probability: number }
export type ClassificationResponse = { results: Verdict[]; error?: string };
export function settingsFrom(input: unknown = {}): Settings {
  const value = (input && typeof input === 'object' ? input : {}) as Partial<Settings>;
  return {
    prompt: typeof value.prompt === 'string' ? value.prompt.slice(0, 2000) : DEFAULT_PROMPT,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    displayMode: value.displayMode === 'hide' ? 'hide' : 'dim',
    opacity: typeof value.opacity === 'number' && Number.isFinite(value.opacity) ? Math.max(0.1, Math.min(0.5, value.opacity)) : 0.22,
  };
}
export function fingerprint(video: Video): string { return JSON.stringify([video.id, video.title, video.channel, video.metadata]); }
export function shouldDim(probability: number): boolean { return Number.isFinite(probability) && probability >= 0 && probability <= 0.3; }
export function validVideos(value: unknown): value is Video[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 12 && value.every(v =>
    v && typeof v.id === 'string' && /^[\w-]{11}$/.test(v.id) &&
    typeof v.title === 'string' && v.title.length > 0 && v.title.length <= 500 &&
    typeof v.channel === 'string' && v.channel.length <= 200 &&
    typeof v.metadata === 'string' && v.metadata.length <= 500);
}
