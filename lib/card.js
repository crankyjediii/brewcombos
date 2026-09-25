// The 1200x630 preview image for a shared drink: title, the exact order line, and the cup.
// Rendered with satori (layout) + resvg (PNG). Fonts are bundled in lib/fonts (SIL Open Font License).
import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import * as M from './menu.js';
import { cupLook, cupImageSVG } from './cup.js';

const font = f => readFileSync(new URL(`./fonts/${f}`, import.meta.url));
let fonts;
const loadFonts = () => fonts ||= [
  { name: 'Display', data: font('display-800.ttf'), weight: 800 },
  { name: 'Line', data: font('line-650.ttf'), weight: 600 },
  { name: 'Body', data: font('body-500.ttf'), weight: 500 },
  { name: 'Mono', data: font('mono-500.ttf'), weight: 500 },
];

export const comboTitle = M.comboTitle;

export const cleanName = M.cleanName;

const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.length > 1 ? children : children[0] } });

export async function cardPNG(o, name) {
  const title = comboTitle(o, name);
  const line = M.orderLine(o);
  const cup = `data:image/svg+xml;base64,${Buffer.from(cupImageSVG(cupLook(o, M.flavorColor))).toString('base64')}`;
  const titleSize = title.length > 26 ? 76 : 96;
  const lineSize = line.length > 130 ? 28 : line.length > 90 ? 32 : 36;

  const tree = h('div', { width: 1200, height: 630, background: '#F5EFE6', color: '#221610', padding: '56px 72px', flexDirection: 'column', position: 'relative' },
    h('div', { justifyContent: 'space-between', alignItems: 'baseline', width: '100%' },
      h('div', { fontFamily: 'Display', fontSize: 44, letterSpacing: -0.5 }, 'Brew Combos'),
      h('div', { fontFamily: 'Mono', fontSize: 22, color: '#C8432B' }, 'brewcombos.com')),
    h('div', { fontFamily: 'Display', fontSize: titleSize, lineHeight: 0.9, letterSpacing: -1.5, marginTop: 40, width: 760 }, title),
    h('div', { position: 'absolute', left: 72, bottom: 56, width: 740, background: '#221610', color: '#F8EFE4', borderRadius: 18, padding: '24px 28px', flexDirection: 'column' },
      h('div', { fontFamily: 'Mono', fontSize: 16, letterSpacing: 1.5, color: '#B7A597' }, 'SAY THIS AT THE WINDOW'),
      h('div', { fontFamily: 'Line', fontSize: lineSize, lineHeight: 1.2, marginTop: 10 }, line)),
    { type: 'img', props: { src: cup, width: 300, height: 425, style: { position: 'absolute', right: 70, bottom: 40 } } });

  const svg = await satori(tree, { width: 1200, height: 630, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
