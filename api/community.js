import { CommunityError, communityConfig, supabaseRequest, authenticatedUser, savedRecord, submissionRecord } from '../lib/community-server.js';

const PUBLIC_FIELDS = 'id,name,description,author_name,combo,status,created_at,reviewed_at';
const SAVED_FIELDS = 'id,name,combo,status,rating,created_at,updated_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hits = new Map();

// This process-local limit is a speed bump. The database also enforces submission
// and collection limits, including requests sent straight to Supabase.
function rateLimit(key, max) {
  const now = Date.now();
  const bucket = hits.get(key);
  if (bucket && bucket.until > now) {
    if (++bucket.count > max) throw new CommunityError(429, 'Give it a minute before trying again.');
  } else {
    if (hits.size >= 5000) {
      for (const [k, b] of hits) if (b.until <= now) hits.delete(k);
      if (hits.size >= 5000) hits.delete(hits.keys().next().value);
    }
    hits.set(key, { count: 1, until: now + 60_000 });
  }
}

function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new CommunityError(415, 'Send JSON for this request.');
  if (Number(req.headers['content-length'] || 0) > 8192) throw new CommunityError(413, 'That drink is too large to save.');
  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > 8192) throw new CommunityError(413, 'That drink is too large to save.');
    try { body = JSON.parse(body); } catch { throw new CommunityError(400, 'That request was not valid JSON.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CommunityError(400, 'Send a drink object.');
  if (Buffer.byteLength(JSON.stringify(body)) > 8192) throw new CommunityError(413, 'That drink is too large to save.');
  return body;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(req.url, 'https://brewcombos.com');
    const action = url.searchParams.get('action') || 'community';
    const method = req.method || 'GET';
    if (!['GET', 'POST', 'DELETE'].includes(method)) {
      res.setHeader('Allow', 'GET, POST, DELETE');
      throw new CommunityError(405, 'Use GET, POST, or DELETE.');
    }
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    rateLimit(`${ip}:${method === 'GET' ? 'read' : action === 'saved' ? 'saved' : 'write'}`, method === 'GET' ? 120 : action === 'saved' ? 600 : 30);
    const config = communityConfig();
    if (!config) return res.status(503).json({ configured: false, error: 'Accounts and community are not connected yet. Your device saves still work.' });
    if (method === 'GET' && action === 'config') return res.status(200).json({ configured: true, supabaseUrl: config.url, supabaseAnonKey: config.key });
    if (method === 'GET' && action === 'community' && !url.searchParams.has('scope')) {
      const drinks = await supabaseRequest(config, `/rest/v1/community_drinks?select=${PUBLIC_FIELDS}&status=eq.approved&order=reviewed_at.desc,id.desc&limit=100`);
      return res.status(200).json({ drinks: drinks || [] });
    }
    const valid = (method === 'GET' && ['session', 'community', 'saved'].includes(action))
      || (method === 'POST' && ['saved', 'submit', 'moderate'].includes(action)) || (method === 'DELETE' && action === 'saved');
    if (!valid) throw new CommunityError(404, 'That community action does not exist.');
    const body = method === 'POST' ? readBody(req) : null;
    const { user, token } = await authenticatedUser(config, req.headers.authorization);
    const request = (path, options = {}) => supabaseRequest(config, path, { ...options, token });
    const isAdmin = async () => {
      const rows = await request(`/rest/v1/community_admins?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
      return Array.isArray(rows) && rows.length > 0;
    };
    if (method === 'GET' && action === 'session') return res.status(200).json({ user, isAdmin: await isAdmin() });
    if (method === 'GET' && action === 'saved') {
      const drinks = await request(`/rest/v1/saved_drinks?select=${SAVED_FIELDS}&user_id=eq.${encodeURIComponent(user.id)}&order=updated_at.desc&limit=500`);
      return res.status(200).json({ drinks: drinks || [] });
    }
    if (method === 'POST' && action === 'saved') {
      const record = savedRecord(body, user.id);
      const drinks = await request(`/rest/v1/saved_drinks?on_conflict=user_id,id&select=${SAVED_FIELDS}`, { method: 'POST', body: record, prefer: 'resolution=merge-duplicates,return=representation' });
      return res.status(200).json({ drink: drinks?.[0] });
    }
    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id || id.length > 2048) throw new CommunityError(400, 'Choose a saved drink to remove.');
      await request(`/rest/v1/saved_drinks?user_id=eq.${encodeURIComponent(user.id)}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.status(200).json({ deleted: true });
    }
    if (method === 'POST' && action === 'submit') {
      rateLimit(`submit:${user.id}`, 5);
      const drinks = await request(`/rest/v1/community_drinks?select=${PUBLIC_FIELDS}`, { method: 'POST', body: submissionRecord(body, user.id), prefer: 'return=representation' });
      return res.status(201).json({ drink: drinks?.[0] });
    }
    if (method === 'GET' && action === 'community') {
      const scope = url.searchParams.get('scope');
      let filter;
      if (scope === 'mine') filter = `user_id=eq.${encodeURIComponent(user.id)}`;
      else if (scope === 'moderation') {
        if (!await isAdmin()) throw new CommunityError(403, 'Only an administrator can review submissions.');
        filter = 'status=eq.pending';
      } else throw new CommunityError(400, 'Choose your submissions or the review queue.');
      const drinks = await request(`/rest/v1/community_drinks?select=${PUBLIC_FIELDS}&${filter}&order=created_at.desc&limit=100`);
      return res.status(200).json({ drinks: drinks || [] });
    }
    if (action === 'moderate') {
      if (!UUID.test(body.id || '') || !['approved', 'rejected'].includes(body.status)) throw new CommunityError(400, 'Choose a submission and approve or reject it.');
      if (!await isAdmin()) throw new CommunityError(403, 'Only an administrator can review submissions.');
      const drinks = await request(`/rest/v1/community_drinks?id=eq.${body.id}&status=eq.pending&select=${PUBLIC_FIELDS}`, { method: 'PATCH', body: { status: body.status }, prefer: 'return=representation' });
      if (!drinks?.length) throw new CommunityError(409, 'That submission was already reviewed. Refresh the queue.');
      return res.status(200).json({ drink: drinks[0] });
    }
  } catch (error) {
    if (error.status === 429) res.setHeader('Retry-After', '60');
    return res.status(error instanceof CommunityError ? error.status : 500).json({ error: error instanceof CommunityError ? error.message : 'Community could not complete that request.' });
  }
}
