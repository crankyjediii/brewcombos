import { DRINK, EXTRA, MILKS, SIZES, SWEETS, cleanCustom, comboToQuery, fixCombo } from './menu.js';

export class CommunityError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function communityConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_ANON_KEY || '');
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) return null;
    // Never accidentally return a secret/service-role key from the public config endpoint.
    if (key.startsWith('sb_secret_')) return null;
    if (key.split('.').length === 3) {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (payload.role !== 'anon') return null;
    }
    return { url, key };
  } catch { return null; }
}

export function textField(value, label, max, min = 1) {
  if (typeof value !== 'string') throw new CommunityError(400, `${label} is required.`);
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length < min || text.length > max || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new CommunityError(400, `${label} must be ${min}–${max} characters.`);
  }
  return text;
}

export function validateCombo(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CommunityError(400, 'Choose a drink first.');
  const d = Object.hasOwn(DRINK, input.drink) ? DRINK[input.drink] : null;
  if (!d || !d.temps.includes(input.temp) || !SIZES.includes(input.size)) throw new CommunityError(400, 'Choose a valid drink, temperature, and size.');
  const flavors = input.flavors;
  if (!Array.isArray(flavors) || flavors.length > 6 || flavors.some(f => typeof f !== 'string' || !f || f.length > 30 || cleanCustom([f])[0] !== f)) {
    throw new CommunityError(400, 'Use up to six flavor names, with 30 characters each.');
  }
  const extras = input.extras ?? [];
  if (!Array.isArray(extras) || extras.length > 9 || extras.some(x => !Object.hasOwn(EXTRA, x) || !EXTRA[x].ok(d, input.temp))) {
    throw new CommunityError(400, 'One of those extras does not fit this drink.');
  }
  const milk = input.milk || '';
  if (MILKS[d.milk] ? !MILKS[d.milk].some(m => m[0] === milk) : milk !== '') throw new CommunityError(400, 'Choose a milk offered for this drink.');
  if (input.sf !== undefined && typeof input.sf !== 'boolean') throw new CommunityError(400, 'Sugar-free must be on or off.');
  if (input.sweet !== undefined && !SWEETS.some(s => s[0] === input.sweet)) throw new CommunityError(400, 'Choose a valid sweetness.');
  return fixCombo({ drink: d.id, temp: input.temp, size: input.size, milk, flavors: [...new Set(flavors)], extras: [...new Set(extras)], sf: input.sf === true, sweet: input.sweet || 'regular' });
}

export function savedRecord(body, userId) {
  const combo = validateCombo(body.combo);
  const status = body.status ?? 'saved';
  const rating = body.rating ?? null;
  if (!['saved', 'tried'].includes(status)) throw new CommunityError(400, 'Choose saved or tried.');
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new CommunityError(400, 'Ratings run from 1 to 5.');
  // Ingredient order must not create duplicates across devices.
  const id = comboToQuery({ ...combo, flavors: [...combo.flavors].sort(), extras: [...combo.extras].sort() });
  return { user_id: userId, id, name: textField(body.name, 'Drink name', 60), combo, status, rating: status === 'tried' ? rating : null };
}

export function submissionRecord(body, userId) {
  const combo = validateCombo(body.combo);
  if (!combo.flavors.length) throw new CommunityError(400, 'Add at least one flavor to your community drink.');
  return {
    user_id: userId, name: textField(body.name, 'Drink name', 60, 2),
    description: textField(body.description, 'Description', 280, 10),
    author_name: textField(body.author_name, 'Display name', 40, 2), combo,
    status: 'pending',
  };
}

export async function supabaseRequest(config, path, { token, method = 'GET', body, prefer } = {}, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`${config.url}${path}`, {
      method, headers: {
        apikey: config.key, ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(prefer ? { Prefer: prefer } : {}),
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new CommunityError(503, 'Community is taking a moment. Try again shortly.'); }
  let data = null;
  try { data = await response.json(); } catch { /* DELETE and logout have no body. */ }
  if (!response.ok) {
    if (response.status === 401) throw new CommunityError(401, 'Your session expired. Sign in again.');
    if (response.status === 403) throw new CommunityError(403, 'Your account cannot make that change.');
    if (response.status === 429 || data?.message === 'submission_rate_limit') throw new CommunityError(429, 'You can submit five drinks an hour. Try again later.');
    if (data?.message === 'saved_drink_limit') throw new CommunityError(409, 'Your account holds up to 500 saved drinks. Remove one before adding another.');
    if (response.status === 409) throw new CommunityError(409, 'That change conflicts with an existing drink. Refresh and try again.');
    // Provider errors can contain SQL/schema details. Keep them out of public responses.
    throw new CommunityError(503, 'Community could not complete that request. Try again shortly.');
  }
  return data;
}

export async function authenticatedUser(config, authorization, fetcher = fetch) {
  const token = typeof authorization === 'string' && /^Bearer [A-Za-z0-9._~-]+$/.test(authorization) ? authorization.slice(7) : '';
  if (!token || token.length > 8192) throw new CommunityError(401, 'Sign in to continue.');
  const user = await supabaseRequest(config, '/auth/v1/user', { token }, fetcher);
  if (!user?.id || !user.email || user.is_anonymous || !user.email_confirmed_at) throw new CommunityError(401, 'Verify your email to continue.');
  return { token, user: { id: user.id, email: user.email } };
}
