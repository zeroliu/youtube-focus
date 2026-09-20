import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
await mkdir('.context', { recursive: true });
await build({ entryPoints: ['src/classifier.ts'], outfile: '.context/live-classifier.mjs', bundle: true, platform: 'node', format: 'esm' });
const env = parseEnv(await readFile('.env', 'utf8'));
const apiKey = env.TYPESAFE_API_KEY || env.JEV_API_KEY || env.JEF_API_KEY;
if (!apiKey) throw new Error('No TypeSafe key found');
const store = {};
globalThis.chrome = { storage: { local: { get: async () => structuredClone(store), set: async value => Object.assign(store, structuredClone(value)) } } };
const { classify } = await import('../.context/live-classifier.mjs');
const videos = [
  { id: 'physics0001', title: 'Newton’s laws of motion explained with examples', channel: 'Khan Academy', metadata: 'Physics lesson · 12 minutes' },
  { id: 'gaming00001', title: 'Fortnite best moments and epic wins', channel: 'Gaming highlights', metadata: 'Gameplay · 20 minutes' },
  { id: 'music000001', title: 'Official music video: new pop single', channel: 'Pop artist', metadata: 'Music · 4 minutes' },
  { id: 'history0001', title: 'How ancient Roman aqueducts worked', channel: 'Engineering history', metadata: 'Educational documentary · 16 minutes' },
  { id: 'sports00001', title: 'NBA playoffs: best dunks and game highlights', channel: 'Basketball highlights', metadata: 'Sports · 10 minutes' },
  { id: 'gossip00001', title: 'Celebrity breakup drama: who said what?', channel: 'Celebrity news', metadata: 'Gossip · 8 minutes' }
];
try {
  const results = await classify(apiKey, 'Only educational videos. No video games, sports, music, celebrity gossip, or entertainment-only videos.', videos);
  console.log(JSON.stringify({ results: results.map((result, index) => ({ title: videos[index].title, probability: result.probability, dimmed: result.probability <= 0.3 })), usage: { requests: store.usage.requests, estimatedUSD: store.usage.cost } }, null, 2));
} catch (error) {
  console.error('Live TypeSafe smoke test failed:', error.constructor.name, 'status:', error.status ?? 'unavailable');
  process.exitCode = 1;
}
