import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile } from 'node:fs/promises';
const svg = await readFile('public/icons/optoscope.svg', 'utf8');
for (const size of [16, 32, 48, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  await writeFile(`public/icons/icon-${size}.png`, png);
}
console.log('Rendered optoscope icons at 16, 32, 48, and 128 pixels.');
