// The hash is public. The matching random token exists only in Render's environment.
// To rotate access, generate a new token, replace this hash, deploy, then update Render.
const TOKEN_SHA256 = 'ed6d14962a82b0cc04862d48d7945db331ebb6187cb606c197f807a8f6d38a17';
const allowedKeys = new Set(['maps', 'scores', 'profiles']);
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
async function readLimitedJson(req) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new Error('Body limit exceeded'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
Deno.serve(async req => {
  try {
    const token = req.headers.get('x-game-storage-key') || '';
    if (token.length !== 64) return json({ error: 'Unauthorized' }, 401);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== TOKEN_SHA256) return json({ error: 'Unauthorized' }, 401);
    if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);
    const key = new URL(req.url).searchParams.get('key');
    if (!allowedKeys.has(key)) return json({ error: 'Invalid state key' }, 400);
    const projectUrl = Deno.env.get('SUPABASE_URL');
    const secrets = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    const serverKey = secrets.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!projectUrl || !serverKey) return json({ error: 'Database configuration unavailable' }, 503);
    let value;
    if (req.method === 'POST') {
      let body;
      try { body = await readLimitedJson(req); } catch { return json({ error: 'Invalid or oversized JSON body' }, 400); }
      if (body.key !== key) return json({ error: 'State key mismatch' }, 400);
      value = body.value;
      if (key === 'profiles' ? !value || typeof value !== 'object' || Array.isArray(value) : !Array.isArray(value)) {
        return json({ error: 'Invalid state shape' }, 400);
      }
    }
    const query = req.method === 'POST' ? 'on_conflict=key'
      : new URLSearchParams({ key: 'eq.' + key, select: 'key,value' }).toString();
    const response = await fetch(projectUrl + '/rest/v1/app_state?' + query, {
      method: req.method,
      headers: { apikey: serverKey, ...(serverKey.startsWith('eyJ') ? { Authorization: 'Bearer ' + serverKey } : {}),
        'Content-Type': 'application/json',
        ...(req.method === 'POST' ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : {}) },
      ...(req.method === 'POST' ? { body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) } : {}),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      console.error('Database state operation failed', response.status);
      return json({ error: 'Database request failed' }, 502);
    }
    if (req.method === 'POST') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    return new Response(await response.text(), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return json({ error: 'Storage temporarily unavailable' }, 503);
  }
});
