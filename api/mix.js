// POST /api/mix  { vibe, kind, sf, custom }  ->  { combos: [...] }
// The OpenRouter key and model live in environment variables, never in the page.
import { systemPrompt, userPrompt, parseCombos, cleanCustom, KINDS } from '../lib/menu.js';

// Best-effort per-visitor limit. It resets when Vercel spins up a new instance,
// so treat it as a speed bump, not real protection.
const hits = new Map();
function limited(ip) {
  const limit = Number(process.env.RATE_LIMIT_PER_MIN || 6);
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60_000);
  if (recent.length >= limit) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  const key = process.env.OPENROUTER_API_KEY;
  const models = [process.env.OPENROUTER_MODEL, ...(process.env.OPENROUTER_FALLBACK_MODELS || '').split(',')]
    .map(s => (s || '').trim())
    .filter(Boolean);
  if (!key || !models.length) {
    return res.status(500).json({ error: 'The server is missing its OpenRouter settings.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) {
    return res.status(429).json({ error: 'Too many drinks at once. Give it a minute.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const vibe = String(body.vibe || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  if (!vibe) return res.status(400).json({ error: 'Type a vibe first.' });
  const kind = KINDS.some(k => k[0] === body.kind) ? body.kind : 'any';
  const sf = !!body.sf;
  const custom = cleanCustom(body.custom);

  let lastStatus = 502;
  const deadline = Date.now() + 52_000;          // stay under maxDuration (60s) in vercel.json
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const left = deadline - Date.now();
      if (left < 4_000) break;
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'X-Title': 'Brew Combos',
            ...(process.env.SITE_URL ? { 'HTTP-Referer': process.env.SITE_URL } : {}),
          },
          body: JSON.stringify({
            model,
            temperature: 0.8,
            max_tokens: 1500,
            response_format: { type: 'json_object' },   // ignored by models that don't support it
            // Reasoning models spend 20-30s thinking before they answer, which blows the timeout.
            // With it off, the same model replies in about 5s. Ignored by models without reasoning.
            reasoning: { enabled: false },
            // One user message instead of system + user: some free models
            // (Gemma on Google's provider, for example) reject system prompts with a 400.
            messages: [
              { role: 'user', content: `${systemPrompt(custom)}\n\n---\n\n${userPrompt(vibe, kind, sf)}` },
            ],
          }),
          signal: AbortSignal.timeout(Math.min(20_000, left)),
        });
        const raw = await r.text();
        let j = null;
        try { j = JSON.parse(raw); } catch { /* logged below */ }

        // OpenRouter can return HTTP 200 with an error in the body if the provider fails mid-request.
        if (!r.ok || !j || j.error) {
          const code = (j && j.error && j.error.code) || r.status;
          const msg = j && j.error ? (j.error.message || JSON.stringify(j.error)) : `unreadable body: ${raw.slice(0, 200)}`;
          console.error(`[mix] ${model} (try ${attempt}): ${code} ${msg}`);
          if (code === 429) {
            lastStatus = 429;
            if (attempt === 1) { await sleep(1_500); continue; }   // one quick retry, then next model
          }
          break;
        }

        const message = j.choices?.[0]?.message || {};
        const text = message.content || message.reasoning || '';
        try {
          const combos = parseCombos(text, { sf, custom, kind });
          return res.status(200).json({ combos });
        } catch (e) {
          console.error(`[mix] ${model}: ${e.message}. Reply started: ${String(text).slice(0, 300)}`);
          break;
        }
      } catch (e) {
        console.error(`[mix] ${model} (try ${attempt}): ${e.message}`);
        break;
      }
    }
  }

  return res.status(lastStatus).json({
    error: lastStatus === 429
      ? 'The drink machine is slammed right now. Try again in a minute.'
      : "Couldn't mix drinks this time. Try again.",
  });
}
