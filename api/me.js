const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const supabaseAnon = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
}

function getAccessToken(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const trimmed = String(auth).trim();
  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (match) return match[1].trim();
  return trimmed || '';
}

function createUserClient(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function requireUser(req, res) {
  if (!supabaseAnon) {
    res.status(503).json({ error: 'Supabase not configured' });
    return null;
  }
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing access token' });
    return null;
  }
  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid session' });
    return null;
  }
  const client = createUserClient(token);
  if (!client) {
    res.status(503).json({ error: 'Supabase client missing' });
    return null;
  }
  return { user: data.user, client };
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { user, client } = auth;

    if (req.method === 'GET') {
      const { data: profile, error: profileErr } = await client
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (profileErr) throw profileErr;

      if (!profile) {
        const { data: created, error: insertErr } = await client
          .from('profiles')
          .insert({ id: user.id, nickname: '', ai_name: '', persona: '' })
          .select('*')
          .single();
        if (insertErr) throw insertErr;
        return res.status(200).json({ profile: created, subscription: null });
      }

      const { data: subscription } = await client
        .from('subscription_status')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      return res.status(200).json({ profile, subscription: subscription || null });
    }

    if (req.method === 'POST') {
      const { nickname, ai_name, persona } = req.body || {};
      const payload = {
        id: user.id,
        nickname: nickname ?? null,
        ai_name: ai_name ?? null,
        persona: persona ?? null,
      };
      const { data, error } = await client
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({ profile: data });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[api/me] error:', err);
    res.status(500).json({ error: 'Failed to handle request' });
  }
};
