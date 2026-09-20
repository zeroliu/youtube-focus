import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractVideo } from '../src/dom';
import { shouldDim, settingsFrom, validVideos } from '../src/shared';
import { emptyUsage, summarize, WINDOW_MS, startUsage, finishUsage } from '../src/usage';
import { questionsFor } from '../src/classifier';
const video = { id: 'abcdefghijk', title: 'How electricity works', channel: 'Learning', metadata: '12 minutes' };
describe('video extraction and decisions', () => {
  it('reads the heading rather than the earlier thumbnail duration in the live YouTube layout', () => {
    const tile = document.createElement('div');
    tile.innerHTML = `<a class="ytLockupViewModelContentImage" href="/watch?v=X117w2Rark8" aria-hidden="true"><span>16:19</span></a>
      <yt-lockup-metadata-view-model><h3 class="ytLockupMetadataViewModelHeadingReset" title="Jev - The Ultimate Classification Model?">
        <a class="ytLockupMetadataViewModelTitle" href="/watch?v=X117w2Rark8"><span>Jev - The Ultimate Classification Model?</span></a>
      </h3><yt-content-metadata-view-model>
        <div class="ytContentMetadataViewModelMetadataRow"><a href="/@samwitteveenai">Sam Witteveen</a></div>
        <div class="ytContentMetadataViewModelMetadataRow">132K views • 1 day ago</div>
      </yt-content-metadata-view-model></yt-lockup-metadata-view-model>`;
    expect(extractVideo(tile)).toEqual({ id: 'X117w2Rark8', title: 'Jev - The Ultimate Classification Model?', channel: 'Sam Witteveen', metadata: '132K views • 1 day ago' });
  });
  it('does not classify a thumbnail before its title has loaded', () => {
    const tile = document.createElement('div');
    tile.innerHTML = '<a href="/watch?v=abcdefghijk"><span>12:34</span></a>';
    expect(extractVideo(tile)).toBeNull();
  });
  it('prefers semantic headings even when a legacy thumbnail also matches a known title selector', () => {
    const tile = document.createElement('div');
    tile.innerHTML = '<a id="video-title" href="/watch?v=abcdefghijk">12:34</a><h3><a href="/watch?v=abcdefghijk">How electricity works</a></h3>';
    expect(extractVideo(tile)?.title).toBe('How electricity works');
  });
  it('extracts classic and current home cards without collecting unrelated page text', () => {
    for (const html of [
      '<a id="video-title-link" href="/watch?v=abcdefghijk" title="How electricity works"></a><ytd-channel-name>Learning</ytd-channel-name><div id="metadata-line">12 minutes</div>',
      '<a class="yt-lockup-metadata-view-model__title" href="/watch?v=abcdefghijk">How electricity works</a><div class="yt-content-metadata-view-model"><div class="yt-content-metadata-view-model__metadata-row"><a>Learning</a></div>12 minutes</div>'
    ]) { const tile = document.createElement('div'); tile.innerHTML = html; expect(extractVideo(tile)).toMatchObject({ id: video.id, title: video.title, channel: video.channel }); }
  });
  it('ignores shorts, missing titles, and non-video cards', () => {
    const tile = document.createElement('div'); tile.innerHTML = '<a href="/shorts/abcdefghijk">Short</a>'; expect(extractVideo(tile)).toBeNull();
  });
  it('keeps uncertain, malformed, and positive results visible', () => {
    for (const value of [0.31, 0.5, 1, NaN, -1, Infinity]) expect(shouldDim(value)).toBe(false);
    expect(shouldDim(0.3)).toBe(true); expect(shouldDim(0)).toBe(true);
  });
  it('bounds requests and preferences', () => {
    expect(validVideos([video])).toBe(true); expect(validVideos(Array(13).fill(video))).toBe(false);
    expect(validVideos([{ ...video, title: '' }])).toBe(false); expect(settingsFrom({ opacity: 0 })).toMatchObject({ opacity: 0.1 });
    expect(settingsFrom(null).enabled).toBe(true);
    expect(settingsFrom({}).displayMode).toBe('dim');
    expect(settingsFrom({ displayMode: 'hide' }).displayMode).toBe('hide');
    expect(settingsFrom({ displayMode: 'invalid' }).displayMode).toBe('dim');
  });
  it('asks an independent question for each indexed video with exclusions', () => {
    const questions = questionsFor([video, { ...video, id: '12345678901' }]);
    expect(Object.keys(questions)).toEqual(['video_0', 'video_1']);
    expect(JSON.stringify(questions.video_1)).toContain('videos[1]');
    expect(JSON.stringify(questions.video_0)).toContain('explicitly excluded');
  });
});
describe('usage ledger', () => {
  let storage: Record<string, unknown>;
  beforeEach(() => { storage = {}; vi.stubGlobal('chrome', { storage: { local: { get: async () => structuredClone(storage), set: async (value: object) => Object.assign(storage, structuredClone(value)) } } }); });
  it('counts attempts before completion and prices returned input tokens once', async () => {
    const id = await startUsage(); expect(summarize(storage.usage as any).all).toEqual({ requests: 1, cost: 0, unpriced: 1 });
    await finishUsage(id, 35000); await finishUsage(id, 35000);
    expect(summarize(storage.usage as any).all).toEqual({ requests: 1, cost: 0.00147, unpriced: 0 });
  });
  it('retains all-time totals while excluding events older than 30 days', () => {
    const now = Date.now(); const usage = { ...emptyUsage(), requests: 2, cost: 0.3, recent: [{ id: 'old', at: now - WINDOW_MS - 1, cost: 0.1, unpriced: false }, { id: 'new', at: now, cost: 0.2, unpriced: false }] };
    expect(summarize(usage, now).month).toEqual({ requests: 1, cost: 0.2, unpriced: 0 }); expect(summarize(usage, now).all.cost).toBe(0.3);
  });
});
