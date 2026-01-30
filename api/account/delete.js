const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAnon = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
}

function getAccessToken(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const trimmed = String(auth).trim();
  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (match) return match[1].trim();
  return trimmed || '';
}

async function requireUser(req, res) {
  if (!supabaseAnon) {
    res.status(503).json({ error: 'Supabase not configured' });
    return null;
  }
  const token = getAccessToken(req);
  if (token) {
    console.log('[api/account/delete][auth] token len=', token.length, 'head=', token.slice(0, 10));
  }
  console.log('[api/account/delete][auth] supabase url set=', Boolean(SUPABASE_URL));
  if (!token) {
    res.status(401).json({ error: 'Missing access token' });
    return null;
  }
  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data?.user) {
    console.log('[api/account/delete][auth] getUser error=', error?.message || 'unknown');
    res.status(401).json({ error: 'Invalid session' });
    return null;
  }
  return { user: data.user };
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;
    if (!supabaseAdmin) {
      res.status(503).json({ error: 'Admin key not configured' });
      return;
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(auth.user.id);
    if (error) throw error;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/account/delete] error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
};
