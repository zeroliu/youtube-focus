import type { Video } from './shared';
// Keep watch-page filtering inside recommendations, away from the player.
export const TILE_SELECTOR = ':is(html[data-ytf-page="home"] ytd-rich-item-renderer, html[data-ytf-page="watch"] #related yt-lockup-view-model, html[data-ytf-page="watch"] #related ytd-compact-video-renderer)';
const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
export function extractVideo(tile: Element): Video | null {
  // A selector list is matched in DOM order, not selector priority. Thumbnails
  // precede headings and their text is usually just a duration badge.
  const anchor = tile.querySelector<HTMLAnchorElement>('h3 a[href]')
    ?? tile.querySelector<HTMLAnchorElement>('a#video-title-link, a#video-title, a.ytLockupMetadataViewModelTitle, a.yt-lockup-metadata-view-model__title');
  if (!anchor) return null;
  let url: URL;
  try { url = new URL(anchor.getAttribute('href') ?? '', 'https://www.youtube.com'); }
  catch { return null; }
  const id = url.searchParams.get('v');
  const title = clean(anchor.closest('h3')?.getAttribute('title') || anchor.getAttribute('title') || anchor.textContent).slice(0, 500);
  if (url.origin !== 'https://www.youtube.com' || url.pathname !== '/watch' || !id || !/^[\w-]{11}$/.test(id) || !title || /^\d+(?::\d{2}){1,2}$/.test(title)) return null;
  const metadataRoot = tile.querySelector('yt-content-metadata-view-model, .yt-content-metadata-view-model');
  const rows = metadataRoot ? [...metadataRoot.querySelectorAll('.ytContentMetadataViewModelMetadataRow, .yt-content-metadata-view-model__metadata-row')] : [];
  const channelNode = tile.querySelector('ytd-channel-name')
    ?? metadataRoot?.querySelector('a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"], .yt-content-metadata-view-model__metadata-row a')
    // Compact recommendations render the channel as plain text in the first row.
    ?? rows[0]?.querySelector('.ytContentMetadataViewModelMetadataText, span[role="text"]');
  const channel = clean(channelNode?.textContent).slice(0, 200);
  const metadata = clean(tile.querySelector('#metadata-line')?.textContent
    ?? (rows.length ? rows.filter(row => !channelNode || !row.contains(channelNode)).map(row => clean(row.textContent)).join(' • ') : metadataRoot?.textContent)).slice(0, 500);
  return { id, title, channel, metadata };
}
