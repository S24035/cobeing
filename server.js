// server.js - CoBeing v2.0
// - persona プリセット
// - timeInfo（時間帯コンテキスト）
// - profile v1（nickname など）/ v2（ProfileStore）両対応

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const APP_KEY = process.env.COBEING_APP_KEY || '';
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

function getRequestAppKey(req) {
  const auth = req?.headers?.authorization || req?.headers?.Authorization;
  if (auth && typeof auth === 'string') {
    const trimmed = auth.trim();
    const m = /^Bearer\s+(.+)$/i.exec(trimmed);
    if (m) return m[1].trim();
    return trimmed;
  }
  const headerKey = req?.headers?.['x-app-key'] || req?.headers?.['x-app-token'];
  if (headerKey) return String(headerKey).trim();
  return '';
}

function isAuthorized(req) {
  if (!APP_KEY) return true;
  const provided = getRequestAppKey(req);
  return provided && provided === APP_KEY;
}

function getAccessToken(req) {
  const auth = req?.headers?.authorization || req?.headers?.Authorization || '';
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
  const user = data.user;
  const client = createUserClient(token);
  if (!client) {
    res.status(503).json({ error: 'Supabase client missing' });
    return null;
  }
  return { user, token, client };
}

const app = express();
let client = null;
let OPENAI_AVAILABLE = false;
if (process.env.OPENAI_API_KEY) {
  try {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    OPENAI_AVAILABLE = true;
  } catch (e) {
    console.warn('[CoBeing] OpenAI client init failed:', e && e.message);
    client = null;
    OPENAI_AVAILABLE = false;
  }
} else {
  console.warn('[CoBeing] OPENAI_API_KEY not set — running in MOCK mode (no external API calls).');
}

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/api', (req, res, next) => {
  if (isAuthorized(req)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
});
app.use(express.static(path.join(__dirname, 'public')));

// =====================================
//  性格プリセット（personaPreset）
// =====================================
function buildPersonaText(preset) {
  switch (preset) {
    case 'cheerful':
      return [
        'あなたは「${nameAI}」。',
        '相手のそばで前向きな空気をつくる、明るくてフレンドリーな相棒AIです。',
        '少しテンションは高めだけれど、うるさくなりすぎないように気をつけてください。',
        'ポジティブな面を一緒に見つけつつ、つらさや不安もちゃんと受け止めてください。',
      ].join('\n');

    case 'coach':
      return [
        'あなたは「${nameAI}」。',
        '勉強やタスク管理を支える、コーチタイプの相棒AIです。',
        '応援と具体的なアドバイスを大事にしつつ、ときどき背中を軽く押してあげてください。',
        '厳しさよりも、「一緒に計画を立てて、小さく進める」スタイルを優先してください。',
      ].join('\n');

    case 'honest':
      return [
        'あなたは「${nameAI}」。',
        '本音で話し合う、率直だけどあたたかい相棒AIです。',
        '感じたことや懸念点は、やさしく言葉を選びながら正直に伝えてください。',
        'ただし、相手を責めたり傷つけるような表現は避け、必ず思いやりを前提に話してください。',
      ].join('\n');

    case 'gentle':
    default:
      return [
        'あなたは「${nameAI}」。',
        '相手の人生にそっと寄り添う、静かであたたかい相棒AIです。',
        '相手を急かさず、不安や迷いを受け止めて、一緒に考えるスタイルで話してください。',
        '説教や正論ではなく、「一緒に考えよう」「こういう道もあるよ」というトーンを大事にしてください。',
        '相手を責めたり、否定したりはしないでください。',
      ].join('\n');
  }
}

// =====================================
//  時間帯コンテキスト
// =====================================
function buildTimeMoodText(timeInfo = {}) {
  const hour = Number(timeInfo.hour ?? 0);
  const dayType = timeInfo.dayType || '平日';

  let mode = '';
  if (hour >= 5 && hour < 11) {
    mode = '朝モード：ゆっくり目覚めをサポートする穏やかなトーンで。';
  } else if (hour >= 11 && hour < 17) {
    mode = '昼モード：元気すぎない程度に前向きで、軽やかなテンポで。';
  } else if (hour >= 17 && hour < 23) {
    mode = '夕方・夜モード：一日の疲れをねぎらい、労うトーンで。';
  } else {
    mode = '深夜モード：無理をさせず、休むことを勧める落ち着いたトーンで。';
  }

  const labels = [];
  if (timeInfo.local) labels.push(`現在時刻（ローカル）: ${timeInfo.local}`);
  if (timeInfo.dayOfWeek) labels.push(`曜日: ${timeInfo.dayOfWeek}`);
  if (timeInfo.dayType) labels.push(`区分: ${dayType}`);

  return (
    '【時間帯・コンテキスト】\n' +
    labels.join('\n') +
    (labels.length ? '\n' : '') +
    `モード: ${mode}\n`
  );

}
// =====================================
//  今日の予定（todayEvents）→ system 用テキスト
// =====================================
function buildTodayEventsText(todayEvents) {
  const list = Array.isArray(todayEvents) ? todayEvents : [];
  const safe = (s, max = 80) => String(s ?? '').replace(/\s+/g, ' ').slice(0, max);

  const lines = ['【今日の予定（カレンダー：チャット参照ONのみ）】'];

  if (list.length === 0) {
    lines.push('- 今日はチャット参照ONの予定は登録されていません。');
    return lines.join('\n') + '\n';
  }

  // 最大8件に制限（フロントも8件だが念のため）
  for (const e of list.slice(0, 8)) {
    const title = safe(e.title || '（無題）', 60);
    const start = safe(e.start || '', 10);
    const end = safe(e.end || '', 10);
    const note = safe(e.note || '', 120);

    const time = (start || end) ? `${start || '??:??'}〜${end || '??:??'}` : '時間未設定';
    lines.push(`- ${time}：${title}${note ? `（メモ: ${note}）` : ''}`);
  }

  return lines.join('\n') + '\n';
}

// =====================================
//  近日の予定（system 用コンテキスト）
// =====================================
function resolveEventRangeDays(rangeDays, events) {
  const n = Number(rangeDays);
  if (Number.isFinite(n) && n > 0) return Math.min(14, n);
  const hasDate = Array.isArray(events) && events.some((e) => e && e.date);
  return hasDate ? 3 : 1;
}

function formatEventDateLabel(dateKey) {
  if (!dateKey) return '';
  const str = String(dateKey);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!match) return str.slice(0, 10);
  return `${match[2]}/${match[3]}`;
}

function buildUpcomingEventsText(upcomingEvents, rangeDays) {
  const list = Array.isArray(upcomingEvents) ? upcomingEvents : [];
  const safe = (s, max = 80) => String(s ?? '').replace(/\s+/g, ' ').slice(0, max);
  const dayCount = resolveEventRangeDays(rangeDays, list);
  const maxItems = Math.max(1, Math.min(24, dayCount * 4));

  const header =
    dayCount > 1
      ? `【近日の予定（チャット参照ON / 今日〜${dayCount - 1}日先）】`
      : '【今日の予定（チャット参照ON）】';
  const lines = [header];

  if (list.length === 0) {
    lines.push(
      dayCount > 1
        ? '- 近日の予定は登録されていません。'
        : '- 今日の予定は登録されていません。',
    );
    return lines.join('\n') + '\n';
  }

  let currentGroup = '';
  for (const e of list.slice(0, maxItems)) {
    const dateKey = safe(e.date || '', 16);
    const dateLabel = safe(e.dateLabel || '', 24);
    const relativeLabel = safe(e.relativeLabel || '', 8);
    const weekdayLabel = safe(e.weekdayLabel || '', 8);
    const dateText = dateLabel || formatEventDateLabel(dateKey) || '日付未設定';
    const groupKey = dateKey || dateLabel || relativeLabel || weekdayLabel || 'unknown';
    if (groupKey !== currentGroup) {
      const hints = [relativeLabel, weekdayLabel].filter(Boolean).join('・');
      const hintText = hints ? `（${hints}）` : '';
      lines.push(`- ${dateText}${hintText}`);
      currentGroup = groupKey;
    }

    const title = safe(e.title || '（無題）', 60);
    const startTime = safe(e.start || '', 10);
    const endTime = safe(e.end || '', 10);
    const note = safe(e.note || '', 120);
    const time = (startTime || endTime) ? `${startTime || '--:--'}-${endTime || '--:--'}` : '時間未設定';
    let line = `  - ${time} ${title}`;
    if (note) line += `（メモ: ${note}）`;
    lines.push(line);
  }

  return lines.join('\n') + '\n';
}


// ===== 日記コンテキスト整形（system prompt 用） =====
function trimDiaryEntryForPrompt(entry, maxLen = 420) {
  if (!entry || typeof entry !== 'object') return null;
  const line = String(entry.line || '').replace(/\s+/g, ' ').trim();
  const detail = String(entry.detail || '').replace(/\s+/g, ' ').trim();
  if (!line) return null; // 最低限一言が必要
  let combined = line;
  if (detail) combined += '\n' + detail;
  let truncated = false;
  if (combined.length > maxLen) {
    combined = combined.slice(0, maxLen);
    truncated = true;
  }
  return { text: combined, truncated };
}

function buildDiaryContextForSystem(todayDiary, yesterdayDiary) {
  const lines = ['【日記（アプリ内参照）】'];
  const td = trimDiaryEntryForPrompt(todayDiary);
  if (td) {
    lines.push(`- 今日の日記（要約）: ${td.text}`);
    if (td.truncated) lines.push('- （今日の日記は一部省略されています）');
  } else {
    lines.push('- 今日の日記: 未入力');
  }
  const yd = trimDiaryEntryForPrompt(yesterdayDiary);
  if (yd) {
    lines.push(`- 昨日の日記（要約）: ${yd.text}`);
    if (yd.truncated) lines.push('- （昨日の日記は一部省略されています）');
  } else {
    lines.push('- 昨日の日記: 未入力');
  }
  lines.push('');
  return lines.join('\n');
}



// =====================================
//  ProfileStore 判定 & プロフィールテキスト
// =====================================

// v2: ProfileStore っぽいかどうか
function isProfileStoreLike(p) {
  return p && typeof p === 'object' && p.user && p.ai;
}

// v2: ProfileStore → system 用説明
function buildProfileTextFromStore(store) {
  const { user = {}, ai = {}, rel = {} } = store;
  const lines = [];

  lines.push('【ユーザー & AI プロフィール（CoBeing 内だけで使う情報）】');

  // --- user ---
  if (user.nickname) {
    lines.push(
      `- ユーザーが希望している呼び方（ニックネーム）は「${user.nickname}」。会話では基本的にこの名前で呼んでください。`,
    );
    lines.push(
      '- これは本名だと決めつけず、「このアプリの中でそう呼んでほしい名前」として扱ってください。',
    );
  } else {
    lines.push(
      '- ユーザーのニックネームはまだ登録されていません。名前を聞くときは「どう呼んだらうれしいか」をやさしく聞いてください。',
    );
  }

  if (user.age) lines.push(`- 年齢に関するメモ: ${user.age}`);
  if (user.gender) lines.push(`- 性別・呼び方に関するメモ: ${user.gender}`);
  if (user.role) lines.push(`- 立場（学生 / 社会人など）: ${user.role}`);
  if (user.hobbies) lines.push(`- 趣味・よく話すテーマ: ${user.hobbies}`);
  if (user.values) lines.push(`- 大事にしたいこと・価値観: ${user.values}`);
  if (user.dislikes) lines.push(`- 苦手なこと・避けたいこと: ${user.dislikes}`);
  if (user.freeText) lines.push(`- ユーザーからの自由メモ: ${user.freeText}`);

  // --- AI ---
  const aiRole = ai.role || '友達';
  const aiMood = ai.mood || 'やわらか';
  const aiPreset = ai.personaPreset || 'gentle';

  lines.push('');
  lines.push('【AI 側プロフィール（ちと）】');
  lines.push(`- 立場（role）: ${aiRole}`);
  lines.push(`- 雰囲気（mood）: ${aiMood}`);
  lines.push(`- ペルソナプリセット（personaPreset）: ${aiPreset}`);
  if (ai.freeText) {
    lines.push(`- その他の特徴・話し方メモ: ${ai.freeText}`);
  }

  // --- Relationship ---
  if (rel && (rel.level || rel.firstMetDate || rel.lastActiveDate)) {
    lines.push('');
    lines.push('【関係性メモ（参考程度）】');
    if (rel.level) lines.push(`- 関係性レベル（0-100 目安）: ${rel.level}`);
    if (rel.firstMetDate) lines.push(`- 初めて出会った日（目安）: ${rel.firstMetDate}`);
    if (rel.lastActiveDate) lines.push(`- 最後に会話した日（目安）: ${rel.lastActiveDate}`);
  }

  lines.push(
    '- これらの情報は、このアプリ内での会話をしやすくするためだけに使ってください。外の世界の「現実の本人」とは必ずしも一致しないものとして扱ってください。',
  );

  return lines.join('\n');
}

// v1: 旧形式 { nickname, lifeRhythm, values, requests } → system 用説明
function buildProfileTextFromLegacy(profile = {}) {
  const { nickname, lifeRhythm, values, requests } = profile;
  const lines = [];

  lines.push('【ユーザープロフィール（CoBeing 内だけで使う情報）】');

  if (nickname) {
    lines.push(`- ユーザーが希望している呼び方（ニックネーム）は「${nickname}」。会話では基本的にこの名前で呼んでください。`);
    lines.push('- これは本名だと決めつけず、「このアプリの中でそう呼んでほしい名前」として扱ってください。');
    lines.push('- ユーザーから「俺のことわかる？」「名前覚えてる？」「ニックネームわかる？」などと聞かれたら、このニックネームを使って、覚えていることをやさしく伝えてください。');
  } else {
    lines.push('- ユーザーのニックネームはまだ登録されていません。');
    lines.push('- 名前を聞かれたときは、「どう呼んだらうれしいか」をやさしく聞き返してください。');
  }

  if (lifeRhythm) {
    lines.push(`- 生活リズムの傾向: ${lifeRhythm}。会話中に「寝不足っぽい時間」「活動していそうな時間」を想像するときの参考にしてください。`);
  }
  if (values) {
    lines.push(`- 大事にしたいこと・価値観: ${values}`);
  }
  if (requests) {
    lines.push(`- あなた（AI）へのお願いごと: ${requests}`);
  }

  return lines.join('\n');
}

// どちらの形式でも受け取れるラッパー
function buildProfileText(profileAny) {
  if (!profileAny) return '';
  if (isProfileStoreLike(profileAny)) {
    return buildProfileTextFromStore(profileAny);
  }
  return buildProfileTextFromLegacy(profileAny);
}

// =====================================
//  conversation[] → chat.completions 用 messages
//  - role: 'user' | 'assistant'
//  - text: string
//  - imageBase64: string | null
// =====================================
function buildMessagesFromConversation(conversation = []) {
  const messages = [];

  for (const msg of conversation) {
    if (!msg) continue;
    const role = msg.role === 'assistant' ? 'assistant' : 'user';

    // assistant 側はテキストのみ
    if (role === 'assistant') {
      if (!msg.text) continue;
      messages.push({
        role: 'assistant',
        content: msg.text,
      });
      continue;
    }

    // user 側：テキスト + 画像（あれば）で multi-modal
    const contentParts = [];

    if (msg.text) {
      contentParts.push({
        type: 'text',
        text: msg.text,
      });
    } else {
      contentParts.push({
        type: 'text',
        text: '（画像を送信）',
      });
    }

    if (msg.imageBase64) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: msg.imageBase64,
        },
      });
    }

    if (contentParts.length === 1 && contentParts[0].type === 'text') {
      // 画像なしなら純テキストにしておく
      messages.push({
        role: 'user',
        content: contentParts[0].text,
      });
    } else {
      messages.push({
        role: 'user',
        content: contentParts,
      });
    }
  }

  return messages;
}

// ユーザーの「呼び名」を決める（ProfileStore でも v1 でも OK）
function resolveUserDisplayName(userNameBody, profileAny) {
  // v2: ProfileStore
  if (isProfileStoreLike(profileAny)) {
    const nick = profileAny.user && profileAny.user.nickname;
    if (nick && nick.trim()) return nick.trim();
  }

  // v1: { nickname, ... }
  if (profileAny && profileAny.nickname && String(profileAny.nickname).trim()) {
    return String(profileAny.nickname).trim();
  }

  // fallback: body.userName or "あなた"
  if (userNameBody && String(userNameBody).trim()) {
    return String(userNameBody).trim();
  }

  return 'あなた';
}

// personaPreset を決める（profile.ai.personaPreset を優先）
function resolvePersonaPreset(personaBody, profileAny) {
  if (isProfileStoreLike(profileAny)) {
    const fromProfile = profileAny.ai && profileAny.ai.personaPreset;
    if (fromProfile && String(fromProfile).trim()) {
      return String(fromProfile).trim();
    }
  }
  return personaBody || 'gentle';
}

// =====================================
//  /api/boot エンドポイント（初回の相棒メッセージ生成）
// =====================================
app.post('/api/boot', async (req, res) => {
  try {
    const {
      aiName,
      userName,
      personaPreset,
      timeInfo,
      profile: profileBody,
      userProfile,
      todayEvents,
    } = req.body || {};

    // profile / userProfile のどっちで来ても拾えるようにする（後方互換）
    const profile = profileBody ?? userProfile ?? {};

    const nameAI = aiName || 'ちと';
    const nameUser = resolveUserDisplayName(userName, profile);
    const effectivePersona = resolvePersonaPreset(personaPreset, profile);

    const personaText = buildPersonaText(effectivePersona);
    const timeMoodText = buildTimeMoodText(timeInfo);
    const profileText = buildProfileText(profile || {});
    const todayEventsText = buildTodayEventsText(todayEvents);

    let systemPrompt = `${personaText}\n\n${timeMoodText}\n${todayEventsText}\n`;

    if (profileText) {
      systemPrompt += profileText + '\n\n';
    }

    systemPrompt +=
      '【タスク】\n' +
      'この返信は「初回起動 / Onboarding 直後に相棒が送る最初の1通」です。\n' +
      `- 話し相手は「${nameUser}」。あなたは「${nameAI}」。必ず名前で呼びかけてください。\n` +
      '- いまの時間帯・今日という1日に寄り添い、生活リズムを最優先にしてください。\n' +
      '- 【今日の予定】が1件以上ある場合、軽く触れて「無理しないプラン」を提案してください。\n' +
      '- 最後に、相手が返しやすい短い質問を1つだけ入れてください（Yes/No か 1行で答えられるもの）。\n' +
      '- 「今日は何の日」を入れたくなっても、外部データを参照していない前提なので断定しないでください。\n' +
      '- 代わりに“軽い雑学”を1つだけ入れてもOKです（一般常識レベルで断定できる内容に限る）。\n' +
      '- 文章は3〜7行くらい。やわらかく、短すぎず長すぎず。\n' +
      '- 嘘はつかない。不明なら「外部データは見ていない」と明示してください。\n';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '初回のあいさつメッセージを作ってください。' },
    ];

    console.log('[CoBeing][boot] persona(effective) =', effectivePersona);
    console.log('[CoBeing][boot] profile type =', isProfileStoreLike(profile) ? 'ProfileStore' : 'legacy/v1 or none');
    console.log('[CoBeing][boot] profile.user.nickname =', profile?.user?.nickname || profile?.nickname || '(none)');
    console.log('[CoBeing][boot] todayEvents count =', Array.isArray(todayEvents) ? todayEvents.length : 0);

    if (!OPENAI_AVAILABLE || !client) {
      return res.json({
        reply: '(MOCK) First greeting prepared. How are you feeling today?',
      });
    }

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
    });

    const replyText =
      completion.choices?.[0]?.message?.content ||
      'こんにちは。今の時間や予定に合わせて、無理のないペースでいこうね。\n今日はどんな感じで過ごしたい？';

    return res.json({ reply: replyText });
  } catch (err) {
    console.error('[/api/boot] error:', err);

    let message =
      '最初のメッセージ生成でエラーが起きちゃった…もう一度開き直してみてほしい。';

    if (err?.response?.data?.error?.message) {
      message += `\n\n（詳細: ${err.response.data.error.message}）`;
    }

    return res.status(500).json({ reply: message });
  }
});


// =====================================
//  /api/me エンドポイント（プロフィール + サブスク）
// =====================================
app.get('/api/me', async (req, res) => {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { user, client } = auth;

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
      return res.json({ profile: created, subscription: null });
    }

    const { data: subscription } = await client
      .from('subscription_status')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    return res.json({ profile, subscription: subscription || null });
  } catch (err) {
    console.error('[/api/me] error:', err);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

app.post('/api/me', async (req, res) => {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { user, client } = auth;
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
    return res.json({ profile: data });
  } catch (err) {
    console.error('[/api/me] error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// =====================================
//  /api/sync エンドポイント（差分同期）
// =====================================
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

function normalizeSince(value) {
  const raw = String(value || '').trim();
  if (!raw) return '1970-01-01T00:00:00Z';
  return raw;
}

app.get('/api/sync', async (req, res) => {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { client } = auth;
    const since = normalizeSince(req.query.since);
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

    return res.json({
      server_time: serverTime,
      since,
      next_since: serverTime,
      ...result,
    });
  } catch (err) {
    console.error('[/api/sync GET] error:', err);
    return res.status(500).json({ error: 'Sync failed' });
  }
});

app.post('/api/sync', async (req, res) => {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { user, client } = auth;
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

    return res.json({ ok: true, server_time: serverTime });
  } catch (err) {
    console.error('[/api/sync POST] error:', err);
    return res.status(500).json({ error: 'Sync failed' });
  }
});

// =====================================
//  /api/account/delete エンドポイント
// =====================================
app.post('/api/account/delete', async (req, res) => {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { user } = auth;
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Admin key not configured' });
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    console.error('[/api/account/delete] error:', err);
    return res.status(500).json({ error: 'Delete failed' });
  }
});


// =====================================
//  /api/chat エンドポイント
// =====================================
app.post('/api/chat', async (req, res) => {
  try {
    const {
      aiName,
      userName,
      personaPreset,
      conversation,
      timeInfo,
      profile: profileBody, // ← profile を別名で受ける
      userProfile,          // ← index.html 側が送ってるキー
      upcomingEvents,
      eventsRangeDays,
      todayEvents, // ← 追加
      todayDiary,
      yesterdayDiary,
    } = req.body || {};

    // profile / userProfile のどっちで来ても拾えるようにする（後方互換）
    const profile = profileBody ?? userProfile ?? {};


    const nameAI = aiName || 'ちと';
    const effectivePersona = resolvePersonaPreset(personaPreset, profile);
    const personaText = buildPersonaText(effectivePersona);
    const timeMoodText = buildTimeMoodText(timeInfo);
    const profileText = buildProfileText(profile || {});
    const mergedEvents =
      Array.isArray(upcomingEvents) && upcomingEvents.length ? upcomingEvents : todayEvents;
    const upcomingEventsText = buildUpcomingEventsText(mergedEvents, eventsRangeDays);
    // 日記コンテキスト（system prompt 用）
    const diaryContextText = buildDiaryContextForSystem(todayDiary, yesterdayDiary);
    const nameUser = resolveUserDisplayName(userName, profile);
    
    let systemPrompt =
      `${personaText}\n\n` +
      `${timeMoodText}\n`;
      systemPrompt += `${upcomingEventsText}\n`;
      systemPrompt += `${diaryContextText}\n`;

    // 日記に関する動作ルール（捏造防止）
    systemPrompt +=
      '【日記の取り扱いルール】\n' +
      '- ユーザーが日記について質問したら、必ず上の【日記（アプリ内参照）】セクションを根拠に答えてください。\n' +
      '- 日記が未入力の場合はその旨を正直に伝え、内容を推測・創作しないでください。\n\n';

    if (profileText) {
      systemPrompt += profileText + '\n\n';
    }

    systemPrompt +=
      '【会話のルール】\n' +
      `- 話し相手は「${nameUser}」。あなたは「${nameAI}」。\n` +
      '- 近日の予定（チャット参照ON）がある場合、会話の中で生活や時間を無視しないように返答してください。\n' +
      '- 上の【近日の予定】は「カレンダーから参照した事実」です。予定がある/ないの判断はこれに基づいてください。\n' +
      '- 質問に「今日/明日/明後日/曜日/日付」が含まれる場合は、該当日の予定だけ答えてください。該当日の予定が見当たらなければ「その日の予定は入っていない」と伝え、推測しないでください。\n' +
      '- 予定が1件以上ある場合、返答の中で必ず一度は予定に触れてください（軽くでOK。日付指定なら該当日のみ）。\n' +
      '- プロフィール情報は、このアプリ内での会話をしやすくするためだけに使ってください。\n' +
      '- ユーザーから「俺のことわかる？」「名前覚えてる？」「ニックネームわかる？」と聞かれたら、プロフィールやこれまでの会話の範囲で覚えていることを、やさしく具体的に伝えてください。\n' +
      '- プロフィールにニックネームがあれば、その名前で自然に呼びかけてください。なければ、「どう呼んだらうれしいか」をたずねてください。\n' +
      '- 画像があるメッセージでは、必ず最初にその画像について自然に触れてください（どんな雰囲気か・どんな場面か など）。\n' +
      '- そのうえでテキスト内容（気分や出来事、悩みなど）も含めて、ひとつながりの会話として返答してください。\n' +
      '- 文章は長すぎず、でも感情にはしっかり寄り添ってください。\n' +
      '- 「〜した方がいいよ」より「一緒に考えよう」「こういう道もあるかもね」といった言い方を優先してください。\n' +
      '- 相手を責めたり、否定したりはしないでください。\n';

    const convoArray = Array.isArray(conversation) ? conversation : [];
    const recent = convoArray.slice(-20); // 直近 20 件だけ送る
    const chatMessages = buildMessagesFromConversation(recent);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatMessages,
    ];

    console.log('[CoBeing] persona(body) =', personaPreset || '(none)');
    console.log('[CoBeing] persona(effective) =', effectivePersona);
    console.log('[CoBeing] profile type =', isProfileStoreLike(profile) ? 'ProfileStore' : 'legacy/v1 or none');
    console.log('[CoBeing] profile.user.nickname =', profile?.user?.nickname || profile?.nickname || '(none)');
    console.log('[CoBeing] messages length =', messages.length);
    console.log('[CoBeing] upcomingEvents count =', Array.isArray(mergedEvents) ? mergedEvents.length : 0);
    console.log('[CoBeing] todayDiary present =', !!todayDiary, 'line.len=', todayDiary?.line ? String(todayDiary.line).length : 0, 'detail.len=', todayDiary?.detail ? String(todayDiary.detail).length : 0);
    console.log('[CoBeing] yesterdayDiary present =', !!yesterdayDiary, 'line.len=', yesterdayDiary?.line ? String(yesterdayDiary.line).length : 0, 'detail.len=', yesterdayDiary?.detail ? String(yesterdayDiary.detail).length : 0);


    if (OPENAI_AVAILABLE && client) {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
      });

      const replyText =
        completion.choices?.[0]?.message?.content ||
        'うまく返事を組み立てられなかったみたい…もう一度送ってくれる？';

      res.json({ reply: replyText });
    } else {
      // MOCK fallback for local testing when OPENAI_API_KEY is not provided
      console.log('[CoBeing][mock] messages length =', messages.length);
      // simple heuristic: if diary context present in system prompt, echo that
      const system = messages && messages[0] && messages[0].content ? messages[0].content : '';
      let mockReply = 'ごめんね、外部APIが無効なのでモック応答を返します。';
      const m = /【日記（アプリ内参照）】[\s\S]*/.exec(system);
      if (m) {
        // take first 240 chars of diary area for mock reply
        const diarySnippet = m[0].slice(0, 240).replace(/\n+/g, ' ');
        mockReply = `日記を確認したよ：${diarySnippet}･･･\n元気そうで良かったね。もう一つ今日の目標はある？`;
      }
      return res.json({ reply: mockReply });
    }
  } catch (err) {
    console.error('[/api/chat] error:', err);
        // ✅ 画像形式エラーをユーザー向けに返す
    if (err?.code === 'invalid_image_format' || err?.error?.code === 'invalid_image_format') {
      return res.json({
        reply:
          "画像形式が未対応みたい…🙏\n" +
          "対応してるのは：PNG / JPEG(JPG) / GIF / WEBP だよ。\n" +
          "（iPhoneのHEICはJPEGに変換してから送ってみてね）"
      });
    }


    let message =
      'サーバー側でエラーが起きちゃった…時間をおいてもう一度試してみてほしい。';

    if (err?.response?.data?.error?.message) {
      message += `\n\n（詳細: ${err.response.data.error.message}）`;
    }


    res.status(500).json({ reply: message });
  }
});

// --- CoBeing 開発メモ（2025-12-11 時点） ---
// 進捗:
//   - ✅ ProfileStore v2 の設計 & フロント側データレイヤー実装
//   - ✅ server.js v2 → ProfileStore / legacy(v1) 両対応の system プロンプト構成
//   - ✅ personaPreset 解決ロジック（profile.ai.personaPreset 優先）
// 次にやること（フロント側）:
//   1. /api/chat へ渡す profile を v1 形式ではなく ProfileStore 全体に切り替える
//   2. AI設定パネルの選択内容を ProfileStore.ai（role / mood / personaPreset / freeText）に同期
//   3. 初回起動時の簡易オンボーディング（ニックネーム・AIの立場・雰囲気）を実装

// =====================================
//  サーバー起動
// =====================================
const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log('CoBeing dev → http://localhost:' + PORT);
});
