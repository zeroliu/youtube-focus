# YouTube Focus

A Chrome extension that dims YouTube homepage videos outside your interests. Describe what you want to watch in plain language. TypeSafe Jev evaluates the visible video metadata; matching videos keep their normal appearance. Everything remains clickable.

## Install for personal use

Requires Node.js 20.12 or newer and Chrome 120 or newer.

```sh
npm ci
npm run build:local
```

The personal build reads `TYPESAFE_API_KEY` or `JEV_API_KEY` from the workspace `.env`. This workspace already has a gitignored copy of the main checkout's `.env`.

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this project's `dist` folder.
3. Pin **YouTube Focus**, open its popup, and save your interests.
4. Open or reload the YouTube homepage. Videos are checked as you scroll.

The switch pauses filtering immediately. Hovering or keyboard-focusing a dimmed tile restores its full brightness and color temporarily. **Show anyway** restores that video until preferences change or the page reloads. The visibility slider controls how faded other videos appear.

`npm run build` makes a shareable build without a key. Enter your own key in its popup. A personal `build:local` places your key in `dist/local-config.json`. Both `.env` and `dist/` are ignored by Git. Do not distribute a personal build. To change its key after installation, save a replacement in the popup; the existing saved key takes precedence over the bootstrap file.

## Usage in the popup

The popup shows request counts and estimated spending in USD, for all time and the rolling last 30 days. These are this extension's totals in this Chrome profile, starting at installation, not account-wide TypeSafe billing. They persist across reloads, worker restarts, and preference changes. Uninstalling or clearing extension storage erases them. Developer smoke tests are separate and do not appear in the installed extension's totals.

Each batch of up to 12 videos is one API request. Cached results do not add requests or cost. Attempts are recorded before calling the API, including failed attempts. Requests without returned token usage have unknown cost and are reported separately. The SDK's automatic retries are disabled so each counted attempt corresponds to one API call.

Estimated cost uses returned `usage.input_tokens` at **$0.042 per million input tokens** for the pinned `jev-1.13.0` model. Output tokens are free under the [published model pricing](https://docs.typesafe.ai/models). Pricing was checked September 19, 2026. This estimate is not an invoice and does not include other apps using your key.

## Behavior and data

- Only regular video tiles on the desktop homepage are evaluated. Search results, subscriptions, watch pages, and Shorts shelves are left alone.
- A Noul question asks whether each video's main topic and purpose match your prompt, including exclusions. The model sees the prompt plus each video's ID, title, channel, and visible metadata. No cookies, account details, watch history, transcripts, or thumbnail images are sent.
- Videos start dimmed while Jev checks them, with a small "Sorting snacks for your brain…" toast. Matches brighten as each batch finishes. Pausing or an API error restores unchecked videos.
- Match probabilities at or below 0.30 are dimmed. Uncertain results stay visible. This initial threshold is deliberately conservative and has not been calibrated on a large labeled feed.
- API errors leave unchecked videos visible, show a small status message, and back off for one minute. Editing settings or replacing the key allows a fresh attempt.
- New cards, recycled cards, and YouTube's client-side navigation are observed. Results from outdated preferences or pages are ignored.
- The background worker serializes requests and caches up to 1,000 results for 30 minutes. The cache is in memory and may be lost when Chrome suspends the worker. Page-local results also avoid repeat calls.
- Your personal API key is stored in extension-local storage restricted to trusted extension contexts. Content scripts receive only preferences and judgments. No remote executable code is loaded.
- Usage storage contains timestamps, request identifiers, and costs, not video metadata. Recent events are retained for 30 days; all-time aggregates remain.

The integration follows the [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript) and [Noul guidance](https://docs.typesafe.ai/primitives/noul).

## Development and verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

The browser test installs the real unpacked extension into a disposable Chromium profile. It exercises the popup, worker, SDK, storage, content script, dim/reveal controls, recycled tiles, preference changes, SPA navigation, and API totals. Its YouTube page and API responses are fixtures; it does not claim to validate your signed-in recommendations.

```sh
node scripts/live-smoke.mjs
```

This optional test reads `.env` and makes one real, billable TypeSafe request for six example videos. It prints classifications and estimated cost, never the key. It does not alter your installed extension's usage ledger.

After running browser tests, run `npm run build:local` again to restore your personal build. Reload the extension from `chrome://extensions` after rebuilding, then reload YouTube.
