// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { extractVideo } from '../src/dom';

// Reduced from the recommended cards on /watch?v=J3aCGn6SQ1c.
const card = (id: string, title: string) => `<yt-lockup-view-model><div class="ytLockupViewModelHost"><a class="ytLockupViewModelContentImage" href="/watch?v=${id}">8:32</a><div><h3 title="${title}"><a class="ytLockupMetadataViewModelTitle" href="/watch?v=${id}">${title}</a></h3><yt-content-metadata-view-model><div class="ytContentMetadataViewModelMetadataRow"><span class="ytContentMetadataViewModelMetadataText" role="text">FlowForge Lab</span></div><div class="ytContentMetadataViewModelMetadataRow"><span aria-label="1 view">1</span> <span aria-label="17 hours ago">17h ago</span></div></yt-content-metadata-view-model></div></div></yt-lockup-view-model>`;
const script = buildSync({ entryPoints: ['src/content.ts'], bundle: true, write: false, format: 'iife' }).outputFiles[0].text;
let dom: JSDOM;
afterEach(() => dom?.window.close());

it('extracts plain-text recommendation channels separately from visible metadata', () => {
  dom = new JSDOM('<div></div>');
  const tile = dom.window.document.querySelector('div')!;
  tile.innerHTML = card('2FRgWO6WTMI', 'Python + AI Zero to Hero');
  expect(extractVideo(tile)).toEqual({ id: '2FRgWO6WTMI', title: 'Python + AI Zero to Hero', channel: 'FlowForge Lab', metadata: '1 17h ago' });
});

it('filters watch recommendations, handles appended cards and SPA navigation, and leaves the player alone', async () => {
  dom = new JSDOM(`<html><head><style>${readFileSync('public/content.css', 'utf8')}</style></head><body><main id="player">${card('J3aCGn6SQ1c', 'Playing video')}</main><div id="related">${card('2FRgWO6WTMI', 'Python tutorial')}${card('gaming00001', 'Gaming highlights')}<ytd-compact-video-renderer><div><a id="video-title" href="/watch?v=classic0001" title="Classic gaming"></a><ytd-channel-name>Classic channel</ytd-channel-name><div id="metadata-line">20K views</div></div></ytd-compact-video-renderer></div></body></html>`, { url: 'https://www.youtube.com/watch?v=J3aCGn6SQ1c', runScripts: 'outside-only' });
  const { window } = dom;
  let settingsListener: Function;
  const classify = vi.fn(async (message: any) => ({ results: message.videos.map((video: any) => ({ id: video.id, probability: video.title.includes('Python') ? .98 : .02 })) }));
  Object.assign(window, { chrome: { runtime: {
    sendMessage: (message: any) => message.type === 'settings' ? Promise.resolve({ enabled: true, prompt: 'Python tutorials', displayMode: 'dim' }) : classify(message),
    onMessage: { addListener: (listener: Function) => { settingsListener = listener; } }
  } } });
  window.eval(script);
  const doc = window.document;
  await vi.waitFor(() => expect(doc.querySelectorAll('#related .ytf-dimmed')).toHaveLength(2));
  expect(classify.mock.calls[0][0].videos.map((v: any) => v.id)).toEqual(['2FRgWO6WTMI', 'gaming00001', 'classic0001']);
  expect(doc.querySelector('#player .ytf-dimmed')).toBeNull();
  expect(window.getComputedStyle(doc.querySelector('#player yt-lockup-view-model')!).display).not.toBe('none');
  const preview = vi.fn();
  doc.addEventListener('mouseover', preview);
  doc.querySelector('#related .ytf-dimmed a')!.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  expect(preview).not.toHaveBeenCalled();
  settingsListener!({ type: 'settingsChanged', settings: { enabled: true, prompt: 'Python tutorials', displayMode: 'hide' } });
  expect(window.getComputedStyle(doc.querySelector('#related .ytf-hidden')!).display).toBe('none');
  doc.querySelector('#related')!.insertAdjacentHTML('beforeend', card('sports00001', 'Sports'));
  await vi.waitFor(() => expect(doc.querySelectorAll('#related .ytf-hidden')).toHaveLength(3));
  window.history.pushState({}, '', '/results?search_query=python');
  doc.dispatchEvent(new window.Event('yt-navigate-finish'));
  await vi.waitFor(() => expect(doc.querySelectorAll('.ytf-hidden')).toHaveLength(0));
  window.history.pushState({}, '', '/watch?v=J3aCGn6SQ1c');
  doc.dispatchEvent(new window.Event('yt-navigate-finish'));
  await vi.waitFor(() => expect(doc.querySelectorAll('#related .ytf-hidden')).toHaveLength(3));
});
