// Rebuild the browser icons and default social preview from the site's vector mark.
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { cupImageSVG, cupLook } from '../lib/cup.js';
import { fixCombo, flavorColor } from '../lib/menu.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const write = (path, data) => writeFileSync(new URL(path, root), data);
const mark = read('assets/favicon.svg').toString();
const fullBleed = mark.replace(/<rect[^>]+\/>/, '<rect width="64" height="64" fill="#243e35"/>');
const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
for (const [name, size] of [['favicon-32', 32], ['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512]]) {
  write(`assets/${name}.png`, png(name === 'apple-touch-icon' ? fullBleed : mark, size));
}
// A full-bleed background keeps rounded mobile masks from revealing transparency.
write('assets/icon-maskable-512.png', png(fullBleed.replace('<path ', '<g transform="translate(8 8) scale(.75)"><path ').replace('</svg>', '</g></svg>'), 512));

const sizes = [16, 32, 48];
const images = sizes.map(size => png(mark, size));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (let i = 0; i < sizes.length; i++) {
  const start = 6 + i * 16;
  directory[start] = directory[start + 1] = sizes[i];
  directory.writeUInt16LE(1, start + 4);
  directory.writeUInt16LE(32, start + 6);
  directory.writeUInt32LE(images[i].length, start + 8);
  directory.writeUInt32LE(offset, start + 12);
  offset += images[i].length;
}
const ico = Buffer.concat([directory, ...images]);
write('assets/favicon.ico', ico);
write('favicon.ico', ico); // Browsers may request this without reading the page head.

write('assets/site.webmanifest', JSON.stringify({
  id: '/', name: 'Brew Combos', short_name: 'Brew Combos',
  description: 'Find your next 7 Brew drink and exactly how to order it.',
  start_url: '/', scope: '/', display: 'browser',
  background_color: '#f8f8f2', theme_color: '#243e35',
  icons: [
    { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');

const image = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children } });
const cup = cupImageSVG(cupLook(fixCombo({ drink: 'energy', temp: 'frozen', flavors: ['Strawberry', 'Peach'], extras: ['softtop'] }), flavorColor));
const tree = h('div', { width: 1200, height: 630, background: '#f8f8f2', color: '#243e35', padding: 58, position: 'relative', flexDirection: 'column' },
  h('div', { alignItems: 'center', gap: 14 },
    { type: 'img', props: { src: image(mark), width: 48, height: 48 } },
    h('div', { fontFamily: 'Display', fontSize: 33, letterSpacing: -1 }, 'brewcombos')),
  h('div', { marginTop: 56, fontFamily: 'Display', fontSize: 106, lineHeight: .96, letterSpacing: -5, width: 690 }, 'Your next usual.'),
  h('div', { marginTop: 29, fontSize: 26, lineHeight: 1.5, width: 600, color: '#53645a' }, 'Find your kind of 7 Brew drink. Know exactly what to order.'),
  h('div', { position: 'absolute', bottom: 57, left: 58, fontSize: 20 }, 'brewcombos.com'),
  h('div', { position: 'absolute', right: 48, top: 48, width: 342, height: 534, background: '#e6ddf1', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    { type: 'img', props: { src: image(cup), width: 270, height: 383, style: { transform: 'rotate(9deg)' } } }),
);
const social = await satori(tree, { width: 1200, height: 630, fonts: [
  { name: 'Body', data: read('assets/fonts/body.ttf'), weight: 500 },
  { name: 'Display', data: read('assets/fonts/display.ttf'), weight: 800 },
] });
write('assets/og.png', png(social, 1200));
console.log('Built favicon, browser and home-screen icons, manifest, and social preview.');
