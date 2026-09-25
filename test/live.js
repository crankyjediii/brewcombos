// Live check against OpenRouter with the real key: npm run test:live
// Sends a few vibes through the actual handler and prints each order line and how long it took.
import handler from '../api/mix.js';
import { orderLine } from '../lib/menu.js';

process.env.RATE_LIMIT_PER_MIN = '100';
const vibes = [
  ['rainy day, studying for a math test', 'any', false],
  ['need energy, hate coffee', 'energy', false],
  ['Halloween but no pumpkin', 'coffee', true],
  ['sunset at the lake', 'nocaf', false],
];

let failed = 0;
await Promise.all(vibes.map(([vibe, kind, sf], i) => new Promise(done => {
  const start = Date.now();
  const res = {
    setHeader() {},
    status(c) { this.code = c; return this; },
    json(b) {
      const ms = Date.now() - start;
      if (this.code !== 200) failed++;
      const lines = this.code === 200 ? b.combos.map(o => `   ${o.name}: ${orderLine(o)}`) : [`   ${b.error}`];
      console.log(`${this.code === 200 ? 'ok  ' : 'FAIL'} ${ms}ms  "${vibe}" (${kind}${sf ? ', sugar-free' : ''})\n${lines.join('\n')}`);
      done();
    },
  };
  handler({ method: 'POST', headers: { 'x-forwarded-for': `live-${i}` }, body: { vibe, kind, sf } }, res);
})));
process.exitCode = failed ? 1 : 0;
