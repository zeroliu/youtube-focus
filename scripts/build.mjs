import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
await cp('public', 'dist', { recursive: true });
await build({ entryPoints: ['src/background.ts', 'src/content.ts', 'src/popup.ts'], outdir: 'dist', bundle: true, target: 'chrome120', format: 'iife', minify: false });
console.log('Load dist/ as an unpacked Chrome extension.');

if (process.argv.includes('--local')) {
  const { parseEnv } = await import('node:util');
  const env = parseEnv(await readFile('.env', 'utf8'));
  const apiKey = env.TYPESAFE_API_KEY || env.JEV_API_KEY || env.JEF_API_KEY;
  if (!apiKey) throw new Error('Set TYPESAFE_API_KEY or JEV_API_KEY in .env.');
  await writeFile('dist/local-config.json', JSON.stringify({ apiKey }), { mode: 0o600 });
  console.log('Personal build provisioned from .env. Do not share dist/.');
}
