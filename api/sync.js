const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const supabaseAnon = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const SYNC_TABLES = {
  tasks: { withDeleted: true, userField: 'user_id' },
  task_templates: { withDeleted: true, userField: 'user_id' },
  diary_entries: { withDeleted: true, userField: 'user_id' },
  calendar_events: { withDeleted: true, userField: 'user_id' },
  chat_messages: { withDeleted: true, userField: 'user_id' },
  profiles: { withDeleted: false, userField: 'id' },
  subscription_status: { withDeleted: false, userField: 'user_id' },
  usage_counters: { withDeleted: false, userField: 'user_id' },
};

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

function normalizeSince(value) {
  const raw = String(value || '').trim();
  if (!raw) return '1970-01-01T00:00:00Z';
  return raw;
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
      const since = normalizeSince(req.query?.since);
      const serverTime = new Date().toISOString();
      const result = {};
      for (const [table, config] of Object.entries(SYNC_TABLES)) {
        let query = client.from(table).select('*');
        if (config.withDeleted) {
          query = query.or(`updated_at.gt.${since},deleted_at.gt.${since}`);
        } else {
          query = query.gt('updated_at', since);
        }
        const { data, error } = await query;
        if (error) throw error;
        result[table] = data || [];
      }
      res.status(200).json({
        server_time: serverTime,
        since,
        next_since: serverTime,
        ...result,
      });
      return;
    }

    if (req.method === 'POST') {
      const items = (req.body && req.body.items) || {};
      const serverTime = new Date().toISOString();
      const allowedTables = ['tasks', 'task_templates', 'diary_entries', 'calendar_events', 'chat_messages', 'profiles'];

      for (const table of allowedTables) {
        const list = Array.isArray(items[table]) ? items[table] : [];
        if (!list.length) continue;
        const config = SYNC_TABLES[table];
        const normalized = list.map((item) => {
          const clone = { ...item };
          if (config.userField === 'id') {
            clone.id = user.id;
          } else if (config.userField) {
            clone[config.userField] = user.id;
          }
          return clone;
        });
        const { error } = await client.from(table).upsert(normalized, { onConflict: 'id' });
        if (error) throw error;
      }

      res.status(200).json({ ok: true, server_time: serverTime });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[api/sync] error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
};
