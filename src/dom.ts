import type { Video } from './shared';
export const TILE_SELECTOR = 'ytd-rich-item-renderer';
export function extractVideo(tile: Element): Video | null {
  const anchor = tile.querySelector<HTMLAnchorElement>('a#video-title-link, a#video-title, a.yt-lockup-metadata-view-model__title, a[href^="/watch?"]');
  if (!anchor) return null;
  const url = new URL(anchor.getAttribute('href') ?? '', 'https://www.youtube.com');
  const id = url.searchParams.get('v');
  const title = (anchor.getAttribute('title') || anchor.textContent || tile.querySelector('h3')?.textContent || '').trim().slice(0, 500);
  if (!id || !/^[\w-]{11}$/.test(id) || !title) return null;
  const channel = (tile.querySelector('ytd-channel-name, .yt-content-metadata-view-model__metadata-row a')?.textContent ?? '').trim().slice(0, 200);
  const metadata = (tile.querySelector('#metadata-line, .yt-content-metadata-view-model')?.textContent ?? '').trim().slice(0, 500);
  return { id, title, channel, metadata };
}
