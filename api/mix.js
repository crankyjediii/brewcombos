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
  for (const model of models) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-Title': 'Three Pumps',
          ...(process.env.SITE_URL ? { 'HTTP-Referer': process.env.SITE_URL } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0.9,
          max_tokens: 1500,
          // One user message instead of system + user: some free models
          // (Gemma on Google's provider, for example) reject system prompts with a 400.
          messages: [
            { role: 'user', content: `${systemPrompt(custom)}\n\n---\n\n${userPrompt(vibe, kind, sf)}` },
          ],
        }),
        signal: AbortSignal.timeout(25_000),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.error) {
        lastStatus = r.status === 429 ? 429 : 502;
        console.error(`[mix] ${model}: ${r.status} ${j?.error?.message || ''}`);
        continue;
      }
      const text = j.choices?.[0]?.message?.content || '';
      const combos = parseCombos(text, { sf, custom });
      return res.status(200).json({ combos });
    } catch (e) {
      console.error(`[mix] ${model}: ${e.message}`);
    }
  }

  return res.status(lastStatus).json({
    error: lastStatus === 429
      ? 'The drink machine is slammed right now. Try again in a minute.'
      : "Couldn't mix drinks this time. Try again.",
  });
}