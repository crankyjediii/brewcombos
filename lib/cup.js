// The drink cup, shared by the app (index.html animates it) and the generated drink pages (static).
import { DRINK } from './menu.js';

function wavePath(amp, len, depth) {
  let d = 'M-220 0';
  for (let x = -220; x < 440; x += len) d += ` Q${x + len / 4} ${-amp} ${x + len / 2} 0 Q${x + 3 * len / 4} ${amp} ${x + len} 0`;
  return d + ` L440 ${depth} L-220 ${depth} Z`;
}
const WAVE = wavePath(5, 110, 200), FOAM = wavePath(3.5, 110, 22);

/* How a combo looks in the cup: gradient stops, which parts show, drizzle color, size. */
export function cupLook(o, colorOf) {
  const d = DRINK[o.drink];
  const cols = o.flavors.map(colorOf);
  let stops;
  if (!cols.length) stops = [d.color, d.color, d.color, d.color, d.color];
  else if (d.tinted) stops = [cols[0], cols[0], cols[Math.min(1, cols.length - 1)], cols[Math.min(2, cols.length - 1)], cols[cols.length - 1]];
  else stops = [d.color, d.color, cols[0], cols[Math.min(1, cols.length - 1)], cols[cols.length - 1]];
  return {
    stops,
    classes: {
      'is-hot': o.temp === 'hot',
      'is-iced': o.temp === 'iced',
      'is-frozen': o.temp === 'frozen',
      'is-bubbly': !!d.bubbly && o.temp !== 'frozen',
      'has-foam': o.extras.includes('coldfoam') || o.extras.includes('softtop'),
      'has-whip': o.extras.includes('whip'),
      'has-drizzle': ['caramel', 'chocolate', 'whitechoc'].some(x => o.extras.includes(x)),
      'has-straw': o.temp !== 'hot',
    },
    drizzle: o.extras.includes('chocolate') ? '#4A2616' : o.extras.includes('caramel') ? '#B8742A' : '#F4EAD7',
    scale: { small: .8, medium: .9, large: 1 }[o.size],
    straw: cols[0] || '#C8432B',
  };
}

/* The SVG. Pass a look to bake it in (static pages); leave it out and apply one later with the DOM (the app). */
export function cupSVG(id, look) {
  const on = look ? Object.keys(look.classes).filter(k => look.classes[k]).join(' ') : '';
  const bodyStyle = look ? ` style="--drizzle:${look.drizzle};--s:${look.scale}"` : '';
  const stop = i => look ? ` style="stop-color:${look.stops[i]}"` : '';
  const strawFill = look ? ` style="fill:${look.straw}"` : '';
  return `<svg viewBox="0 0 220 300" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="g${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="180">
        <stop offset="0"${stop(0)}/><stop offset=".38"${stop(1)}/><stop offset=".62"${stop(2)}/><stop offset=".82"${stop(3)}/><stop offset="1"${stop(4)}/>
      </linearGradient>
      <clipPath id="c${id}"><path d="M31 64 L189 64 L167 268 Q165 277 157 277 L63 277 Q55 277 53 268 Z"/></clipPath>
      <pattern id="p${id}" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="4" r="1.8" fill="#fff" opacity=".5"/><circle cx="11" cy="11" r="1.3" fill="#fff" opacity=".4"/>
      </pattern>
    </defs>
    <g class="body ${on}"${bodyStyle}>
      <g class="part steam"><path d="M82 44 Q74 32 82 20 Q90 8 82 -4"/><path d="M110 40 Q102 28 110 16 Q118 4 110 -8"/><path d="M138 44 Q130 32 138 20 Q146 8 138 -4"/></g>
      <rect class="part straw" x="128" y="-4" width="13" height="150" rx="6.5" transform="rotate(13 134 70)"${strawFill}/>
      <path class="glass-shape" d="M25 60 L195 60 L172 272 Q170 282 160 282 L60 282 Q50 282 48 272 Z"/>
      <g clip-path="url(#c${id})">
        <g transform="translate(0 100)">
          <g class="level">
            <path class="wave back" d="${WAVE}" fill="url(#g${id})" opacity=".5"/>
            <path class="wave" d="${WAVE}" fill="url(#g${id})"/>
            <rect class="part slush" x="-10" y="0" width="240" height="200" fill="url(#p${id})"/>
          </g>
        </g>
        <g class="part bubbles">
          <circle cx="70" cy="268" r="3" style="animation-delay:-.2s"/><circle cx="96" cy="268" r="2.2" style="animation-delay:-1.1s"/>
          <circle cx="118" cy="268" r="3.4" style="animation-delay:-2s"/><circle cx="140" cy="268" r="2.4" style="animation-delay:-.7s"/>
          <circle cx="158" cy="268" r="2.8" style="animation-delay:-1.6s"/><circle cx="84" cy="268" r="1.8" style="animation-delay:-2.4s"/>
        </g>
        <g class="part ice">
          <rect x="58" y="96" width="36" height="34" rx="7" style="--r:10deg"/>
          <rect x="102" y="104" width="32" height="30" rx="7" style="--r:-12deg"/>
          <rect x="138" y="94" width="34" height="32" rx="7" style="--r:6deg"/>
        </g>
        <g class="part foam" transform="translate(0 92)"><path class="wave" d="${FOAM}" fill="#FFF6EA"/></g>
        <circle class="drop" cx="110" cy="-12" r="8" opacity="0"/>
      </g>
      <path class="shine" d="M42 80 L60 258"/>
      <path class="part dome" d="M24 60 Q110 -14 196 60 Z"/>
      <g class="part whip"><path d="M38 62 Q40 44 62 46 Q66 26 90 30 Q104 12 124 26 Q148 22 154 44 Q180 42 182 62 Z"/></g>
      <path class="part drizzle" d="M50 52 L70 38 L90 52 L110 34 L130 52 L150 38 L170 52"/>
      <g class="part lid"><rect x="16" y="48" width="188" height="15" rx="7.5"/><rect x="58" y="38" width="104" height="12" rx="6"/></g>
    </g>
  </svg>`;
}

/* A self-contained cup (no CSS needed) for rendering into images. Same shapes as cupSVG, frozen mid-animation. */
export function cupImageSVG(look) {
  const c = look.classes, edge = 'rgba(34,22,16,.34)';
  // Same coordinates as cupSVG: the gradient is in the liquid's own space, before its translate(0 100).
  const g = `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="180">${
    look.stops.map((s, i) => `<stop offset="${[0, .38, .62, .82, 1][i]}" stop-color="${s}"/>`).join('')}</linearGradient>`;
  const parts = [];
  if (c['has-straw']) parts.push(`<rect x="128" y="-4" width="13" height="150" rx="6.5" transform="rotate(13 134 70)" fill="${look.straw}"/>`);
  parts.push(`<path d="M25 60 L195 60 L172 272 Q170 282 160 282 L60 282 Q50 282 48 272 Z" fill="rgba(255,255,255,.4)" stroke="${edge}" stroke-width="3.5" stroke-linejoin="round"/>`);
  const inside = [
    `<path d="${WAVE}" transform="translate(-40 100)" fill="url(#g)" opacity=".5"/>`,
    `<path d="${WAVE}" transform="translate(0 100)" fill="url(#g)"/>`,
  ];
  if (c['is-frozen']) inside.push(`<rect x="0" y="100" width="220" height="200" fill="url(#p)"/>`);
  if (c['is-bubbly']) inside.push([[70, 240, 3], [96, 200, 2.2], [118, 250, 3.4], [140, 180, 2.4], [158, 220, 2.8], [84, 150, 1.8]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(255,255,255,.8)"/>`).join(''));
  if (c['is-iced']) inside.push([[58, 96, 36, 34, 10], [102, 104, 32, 30, -12], [138, 94, 34, 32, 6]]
    .map(([x, y, w, h, r]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" transform="rotate(${r} ${x + w / 2} ${y + h / 2})" fill="rgba(255,255,255,.42)" stroke="rgba(255,255,255,.85)" stroke-width="2"/>`).join(''));
  if (c['has-foam']) inside.push(`<path d="${FOAM}" transform="translate(0 92)" fill="#FFF6EA"/>`);
  parts.push(`<g clip-path="url(#c)">${inside.join('')}</g>`);
  parts.push(`<path d="M42 80 L60 258" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="5" stroke-linecap="round"/>`);
  if (c['is-frozen']) parts.push(`<path d="M24 60 Q110 -14 196 60 Z" fill="rgba(255,255,255,.12)" stroke="${edge}" stroke-width="3"/>`);
  if (c['has-whip']) parts.push(`<path d="M38 62 Q40 44 62 46 Q66 26 90 30 Q104 12 124 26 Q148 22 154 44 Q180 42 182 62 Z" fill="#FFFBF4" stroke="rgba(0,0,0,.08)" stroke-width="1.5"/>`);
  if (c['has-drizzle']) parts.push(`<path d="M50 52 L70 38 L90 52 L110 34 L130 52 L150 38 L170 52" fill="none" stroke="${look.drizzle}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`);
  if (c['is-hot']) {
    parts.push(`<g fill="none" stroke="${edge}" stroke-width="3.5" stroke-linecap="round"><path d="M82 34 Q74 22 82 10 Q90 -2 82 -14"/><path d="M110 30 Q102 18 110 6 Q118 -6 110 -18"/><path d="M138 34 Q130 22 138 10 Q146 -2 138 -14"/></g>`);
    if (!c['has-whip']) parts.push(`<g fill="${edge}"><rect x="16" y="48" width="188" height="15" rx="7.5"/><rect x="58" y="38" width="104" height="12" rx="6"/></g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -24 220 312" width="220" height="312"><defs>${g}
    <clipPath id="c"><path d="M31 64 L189 64 L167 268 Q165 277 157 277 L63 277 Q55 277 53 268 Z"/></clipPath>
    <pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1.8" fill="#fff" opacity=".5"/><circle cx="11" cy="11" r="1.3" fill="#fff" opacity=".4"/></pattern>
  </defs>${parts.join('')}</svg>`;
}
