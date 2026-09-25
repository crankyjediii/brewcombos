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

const STORY_LABELS = { day: 'DRINK OF THE DAY', mine: 'MY 7 BREW ORDER' };

/* 1080x1920 for Instagram / Snapchat / TikTok stories. Links in stories aren't tappable, so the address is big. */
async function storyPNG(o, name, label) {
  const title = comboTitle(o, name);
  const line = M.orderLine(o);
  const cup = `data:image/svg+xml;base64,${Buffer.from(cupImageSVG(cupLook(o, M.flavorColor))).toString('base64')}`;
  const tree = h('div', { width: 1080, height: 1920, background: '#F5EFE6', color: '#221610', padding: '250px 90px 320px', flexDirection: 'column', alignItems: 'center' },   // keeps clear of the story app's own buttons
    h('div', { fontFamily: 'Display', fontSize: 64, letterSpacing: -1 }, 'Brew Combos'),
    h('div', { fontFamily: 'Mono', fontSize: 30, letterSpacing: 3, color: '#6B5E55', marginTop: 44 }, STORY_LABELS[label] || STORY_LABELS.mine),
    h('div', { fontFamily: 'Display', fontSize: title.length > 22 ? 104 : 136, lineHeight: 0.9, letterSpacing: -2, marginTop: 24, textAlign: 'center', justifyContent: 'center', width: 900 }, title),
    { type: 'img', props: { src: cup, width: 360, height: 510, style: { marginTop: 40 } } },
    h('div', { width: 900, marginTop: 40, background: '#221610', color: '#F8EFE4', borderRadius: 28, padding: '38px 44px', flexDirection: 'column' },
      h('div', { fontFamily: 'Mono', fontSize: 26, letterSpacing: 2.5, color: '#B7A597' }, 'SAY THIS AT THE WINDOW'),
      h('div', { fontFamily: 'Line', fontSize: line.length > 110 ? 44 : 52, lineHeight: 1.18, marginTop: 16 }, line)),
    h('div', { flexGrow: 1, minHeight: 56 }),
    h('div', { fontFamily: 'Body', fontSize: 34, color: '#6B5E55' }, 'Find your drink at'),
    h('div', { fontFamily: 'Mono', fontSize: 56, color: '#C8432B', marginTop: 8 }, 'brewcombos.com'));
  const svg = await satori(tree, { width: 1080, height: 1920, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } }).render().asPng();
}

/* 1000x1500 (2:3), the shape Pinterest shows best. Says "7 Brew" up top because that's what people search. */
async function pinPNG(o, name, { label, date, why } = {}) {
  const title = comboTitle(o, name);
  const line = M.orderLine(o);
  const cup = `data:image/svg+xml;base64,${Buffer.from(cupImageSVG(cupLook(o, M.flavorColor))).toString('base64')}`;
  const tree = h('div', { width: 1000, height: 1500, background: '#F5EFE6', color: '#221610', padding: '84px 80px 80px', flexDirection: 'column', alignItems: 'center' },
    h('div', { fontFamily: 'Mono', fontSize: 28, letterSpacing: 3, color: '#C8432B' }, label === 'day' && date ? `DRINK OF THE DAY · ${date.toUpperCase()}` : '7 BREW DRINK COMBO'),
    h('div', { fontFamily: 'Display', fontSize: title.length > 20 ? 104 : 128, lineHeight: 0.9, letterSpacing: -2, marginTop: 22, textAlign: 'center', justifyContent: 'center', width: 840 }, title),
    ...(why ? [h('div', { fontFamily: 'Body', fontSize: 34, color: '#6B5E55', marginTop: 18, textAlign: 'center', justifyContent: 'center', width: 800 }, why)] : []),
    { type: 'img', props: { src: cup, width: why ? 330 : 380, height: why ? 468 : 539, style: { marginTop: why ? 30 : 44 } } },
    h('div', { width: 840, marginTop: why ? 32 : 44, background: '#221610', color: '#F8EFE4', borderRadius: 26, padding: '34px 40px', flexDirection: 'column' },
      h('div', { fontFamily: 'Mono', fontSize: 24, letterSpacing: 2.5, color: '#B7A597' }, 'SAY THIS AT THE WINDOW'),
      h('div', { fontFamily: 'Line', fontSize: line.length > 110 ? 38 : 44, lineHeight: 1.18, marginTop: 14 }, line)),
    h('div', { flexGrow: 1, minHeight: 36 }),
    h('div', { width: 840, justifyContent: 'space-between', alignItems: 'baseline' },
      h('div', { fontFamily: 'Display', fontSize: 48, letterSpacing: -0.5 }, 'Brew Combos'),
      h('div', { fontFamily: 'Mono', fontSize: 30, color: '#C8432B' }, 'brewcombos.com')));
  const svg = await satori(tree, { width: 1000, height: 1500, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1000 } }).render().asPng();
}

export async function cardPNG(o, name, { format, label, date, why } = {}) {
  if (format === 'story') return storyPNG(o, name, label);
  if (format === 'pin') return pinPNG(o, name, { label, date, why });
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
