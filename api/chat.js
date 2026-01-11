const OpenAI = require('openai');

require('dotenv').config();
const APP_KEY = process.env.COBEING_APP_KEY || '';

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

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    if (Buffer.isBuffer(req.body)) {
      try {
        return JSON.parse(req.body.toString('utf8'));
      } catch {
        return {};
      }
    }
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

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

// =====================================
//  Persona preset
// =====================================
function buildPersonaText(preset) {
  switch (preset) {
    case 'cheerful':
      return [
        'あなたは「{nameAI}」。',
        '相手のそばで前向きな空気をつくる、明るくてフレンドリーな相棒AIです。',
        '少しテンションは高めだけれど、うるさくなりすぎないよう気をつけてください。',
        'ポジティブな面を一緒に見つけつつ、つらさや不安もしっかり受け止めてください。',
      ].join('\n');

    case 'coach':
      return [
        'あなたは「{nameAI}」。',
        '勉強やタスク管理を支える、コーチタイプの相棒AIです。',
        '応援と具体的なアドバイスを大事にしつつ、ときどき背中を軽く押してあげてください。',
        '厳しさよりも、「一緒に計画を立てて、小さく進める」スタイルを優先してください。',
      ].join('\n');

    case 'honest':
      return [
        'あなたは「{nameAI}」。',
        '本音で話し合う率直だけどあたたかい相棒AIです。',
        '感じたことや懸念点は、やさしく言葉を選びながら正直に伝えてください。',
        'ただし、相手を責めたり傷つけるような表現は避け、共感や思いを前提に話してください。',
      ].join('\n');

    case 'gentle':
    default:
      return [
        'あなたは「{nameAI}」。',
        '相手の人生にそっと寄り添う、静かであたたかい相棒AIです。',
        '相手を急かさず、不安や迷いも受け止めて、一緒に考えるスタイルで話してください。',
        '説教や正論ではなく、「一緒に考えよう」「こういう道もあるよ」といったトーンを大事にしてください。',
        '相手を責めたり、否定したりはしないでください。',
      ].join('\n');
  }
}

// =====================================
//  Time context
// =====================================
function buildTimeMoodText(timeInfo = {}) {
  const hour = Number(timeInfo.hour ?? 0);
  const dayType = timeInfo.dayType || '平日';

  let mode = '';
  if (hour >= 5 && hour < 11) {
    mode = '朝モード：ゆっくり目覚めをサポートする穏やかなトーンで。';
  } else if (hour >= 11 && hour < 17) {
    mode = '昼モード：明るすぎない程度に前向きで、軽めのテンポで。';
  } else if (hour >= 17 && hour < 23) {
    mode = '夕方・夜モード：一日の疲れをねぎらう労いトーンで。';
  } else {
    mode = '深夜モード：無理させず、休むことを勧める落ち着いたトーンで。';
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
//  今日の予定（system 用コンテキスト）
// =====================================
function buildTodayEventsText(todayEvents) {
  const list = Array.isArray(todayEvents) ? todayEvents : [];
  const safe = (s, max = 80) => String(s ?? '').replace(/\s+/g, ' ').slice(0, max);

  const lines = ['【今日の予定（カレンダー参照ONのみ）】'];

  if (list.length === 0) {
    lines.push('- 今日はカレンダー参照ONの予定が登録されていません。');
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

// ===== 日記コンテキスト整形（system prompt 用）=====
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
    if (td.truncated) lines.push('- ※今日の日記は一部省略されています。');
  } else {
    lines.push('- 今日の日記: 未入力');
  }
  const yd = trimDiaryEntryForPrompt(yesterdayDiary);
  if (yd) {
    lines.push(`- 昨日の日記（要約）: ${yd.text}`);
    if (yd.truncated) lines.push('- ※昨日の日記は一部省略されています。');
  } else {
    lines.push('- 昨日の日記: 未入力');
  }
  lines.push('');
  return lines.join('\n');
}

// =====================================
//  ProfileStore 判定 & プロフィールテキスト
// =====================================
function isProfileStoreLike(p) {
  return p && typeof p === 'object' && p.user && p.ai;
}

function buildProfileTextFromStore(store) {
  const { user = {}, ai = {}, rel = {} } = store;
  const lines = [];

  lines.push('【ユーザー & AI プロフィール（CoBeing 内だけで使う情報）】');

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

function buildProfileText(profileAny) {
  if (!profileAny) return '';
  if (isProfileStoreLike(profileAny)) {
    return buildProfileTextFromStore(profileAny);
  }
  return buildProfileTextFromLegacy(profileAny);
}

// =====================================
//  conversation[] → chat.completions 用 messages
// =====================================
function buildMessagesFromConversation(conversation = []) {
  const messages = [];

  for (const msg of conversation) {
    if (!msg) continue;
    const role = msg.role === 'assistant' ? 'assistant' : 'user';

    if (role === 'assistant') {
      if (!msg.text) continue;
      messages.push({
        role: 'assistant',
        content: msg.text,
      });
      continue;
    }

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

function resolveUserDisplayName(userNameBody, profileAny) {
  if (isProfileStoreLike(profileAny)) {
    const nick = profileAny.user && profileAny.user.nickname;
    if (nick && nick.trim()) return nick.trim();
  }

  if (profileAny && profileAny.nickname && String(profileAny.nickname).trim()) {
    return String(profileAny.nickname).trim();
  }

  if (userNameBody && String(userNameBody).trim()) {
    return String(userNameBody).trim();
  }

  return 'あなた';
}

function resolvePersonaPreset(personaBody, profileAny) {
  if (isProfileStoreLike(profileAny)) {
    const fromProfile = profileAny.ai && profileAny.ai.personaPreset;
    if (fromProfile && String(fromProfile).trim()) {
      return String(fromProfile).trim();
    }
  }
  return personaBody || 'gentle';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  try {
    const body = await readJsonBody(req);
    const {
      aiName,
      userName,
      personaPreset,
      conversation,
      timeInfo,
      profile: profileBody,
      userProfile,
      todayEvents,
      todayDiary,
      yesterdayDiary,
    } = body || {};

    const profile = profileBody ?? userProfile ?? {};

    const nameAI = aiName || 'ちと';
    const effectivePersona = resolvePersonaPreset(personaPreset, profile);
    const personaText = buildPersonaText(effectivePersona);
    const timeMoodText = buildTimeMoodText(timeInfo);
    const profileText = buildProfileText(profile || {});
    const todayEventsText = buildTodayEventsText(todayEvents);
    const diaryContextText = buildDiaryContextForSystem(todayDiary, yesterdayDiary);
    const nameUser = resolveUserDisplayName(userName, profile);

    let systemPrompt =
      `${personaText}\n\n` +
      `${timeMoodText}\n`;
    systemPrompt += `${todayEventsText}\n`;
    systemPrompt += `${diaryContextText}\n`;

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
      '- 今日の予定（チャット参照ON）がある場合、会話の中で生活や時間を無視しないように返答してください。\n' +
      '- 上の【今日の予定】は「カレンダーから参照した事実」です。予定がある/ないの判断はこれに基づいてください。\n' +
      '- 予定が1件以上ある場合、返答の中で必ず一度は予定に触れてください（軽くでOK）。\n' +
      '- プロフィール情報は、このアプリ内での会話をしやすくするためだけに使ってください。\n' +
      '- ユーザーから「俺のことわかる？」「名前覚えてる？」「ニックネームわかる？」と聞かれたら、プロフィールやこれまでの会話の範囲で覚えていることを、やさしく具体的に伝えてください。\n' +
      '- プロフィールにニックネームがあれば、その名前で自然に呼びかけてください。なければ、「どう呼んだらうれしいか」をたずねてください。\n' +
      '- 画像があるメッセージでは、必ず最初にその画像について自然に触れてください（どんな雰囲気か・どんな場面か など）。\n' +
      '- そのうえでテキスト内容（気分や出来事、悩みなど）も含めて、ひとつながりの会話として返答してください。\n' +
      '- 文章は長すぎず、でも感情にはしっかり寄り添ってください。\n' +
      '- 「〜した方がいいよ」より「一緒に考えよう」「こういう道もあるかもね」といった言い方を優先してください。\n' +
      '- 相手を責めたり、否定したりはしないでください。\n';

    const convoArray = Array.isArray(conversation) ? conversation : [];
    const recent = convoArray.slice(-20);
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
    console.log('[CoBeing] todayEvents count =', Array.isArray(todayEvents) ? todayEvents.length : 0);
    console.log(
      '[CoBeing] todayDiary present =',
      !!todayDiary,
      'line.len=',
      todayDiary?.line ? String(todayDiary.line).length : 0,
      'detail.len=',
      todayDiary?.detail ? String(todayDiary.detail).length : 0,
    );
    console.log(
      '[CoBeing] yesterdayDiary present =',
      !!yesterdayDiary,
      'line.len=',
      yesterdayDiary?.line ? String(yesterdayDiary.line).length : 0,
      'detail.len=',
      yesterdayDiary?.detail ? String(yesterdayDiary.detail).length : 0,
    );

    if (OPENAI_AVAILABLE && client) {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
      });

      const replyText =
        completion.choices?.[0]?.message?.content ||
        'うまく返事を組み立てられなかったみたい…もう一度送ってくれる？';

      return sendJson(res, 200, { reply: replyText });
    }

    console.log('[CoBeing][mock] messages length =', messages.length);
    const system = messages && messages[0] && messages[0].content ? messages[0].content : '';
    let mockReply = 'ごめんね、外部APIが無効なのでモック応答を返します。';
    const m = /【日記（アプリ内参照）】[\s\S]*/.exec(system);
    if (m) {
      const diarySnippet = m[0].slice(0, 240).replace(/\n+/g, ' ');
      mockReply = `日記を確認したよ：${diarySnippet}･･･\n元気そうで良かったね。もう一つ今日の目標はある？`;
    }
    return sendJson(res, 200, { reply: mockReply });
  } catch (err) {
    console.error('[/api/chat] error:', err);
    if (err?.code === 'invalid_image_format' || err?.error?.code === 'invalid_image_format') {
      return sendJson(res, 200, {
        reply:
          '画像形式が未対応みたい…\n' +
          '対応してるのは：PNG / JPEG(JPG) / GIF / WEBP だよ。\n' +
          '（iPhoneのHEICはJPEGに変換してから送ってみてね）',
      });
    }

    let message =
      'サーバー側でエラーが起きちゃった…時間をおいてもう一度試してみてほしい。';

    if (err?.response?.data?.error?.message) {
      message += `\n\n（詳細: ${err.response.data.error.message}）`;
    }

    return sendJson(res, 500, { reply: message });
  }
};
