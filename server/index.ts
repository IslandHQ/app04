import { Hono, type Context, type Next } from 'hono';
import { sign, verify } from 'hono/jwt';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { hashPassword, verifyPassword } from './auth';
import { platform } from './platform';
import { drills } from './drills';
import { normalizeAIEndpoint, aiFailureMessage } from './ai-settings';
import { HTTPException } from 'hono/http-exception';

type Bindings = {
  DB: D1Database;
  JWT_SECRET?: string;
  NODE_ENV?: string;
};

type Variables = {
  user: { id: string; role: string; status: string };
};
type AppEnv = { Bindings: Bindings; Variables: Variables };
interface DBUser { id:string; email:string; name:string; grade:string; role:string; status:string; password_hash?:string; level:number; exp:number; streak:number; last_study_date:string; topicStats?:Record<string,unknown>; detailedStats?:Record<string,unknown> }
interface DBSettings { endpoint:string; api_key:string; model:string; duplicate_prevention_mode:string }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
function secretFor(c: Context<AppEnv>) {
  if (c.env.JWT_SECRET) return c.env.JWT_SECRET;
  if (['localhost','127.0.0.1','[::1]'].includes(new URL(c.req.url).hostname)) return 'super_secret_key_for_dev_only';
  throw new HTTPException(503, { message: '認証設定が完了していません' });
}
app.onError((err,c) => {
  if(err instanceof HTTPException) return c.json({ error:err.message },err.status);
  console.error(err);return c.json({error:'処理に失敗しました'},500);
});

// --- Authentication Middleware ---
const authMiddleware = async (c: Context<AppEnv>, next: Next) => {
  const token = getCookie(c, 'auth_token');
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const secret = secretFor(c);
  try {
    const payload = await verify(token, secret, 'HS256');
    const currentUser = await c.env.DB.prepare('SELECT id,role,status FROM users WHERE id=?').bind(payload.id).first<Variables['user']>();
    if (!currentUser || currentUser.status !== 'active') return c.json({ error: 'アカウントは利用できません' }, 401);
    c.set('user', currentUser);
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
  await next();
};

const adminMiddleware = async (c: Context<AppEnv>, next: Next) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
};

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// --- Auth Routes ---
app.post('/api/auth/signup', async (c) => {
  const secret = secretFor(c);
  const body = await c.req.json();
  const { email, password, name, grade } = body;
  
  if (!email || !password || !name) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  try {
    const existingUser = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existingUser) {
      return c.json({ error: 'Email already exists' }, 400);
    }

    const password_hash = await hashPassword(password);
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    
    const userCountResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{count:number}>();
    const userCount = userCountResult?.count || 0;
    const role = userCount === 0 ? 'admin' : 'user';

    await c.env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, name, grade, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, email, password_hash, name, grade || '', role, created_at).run();

    const token = await sign({ id, email, role, name, exp: Math.floor(Date.now()/1000)+86400 }, secret);
    setCookie(c, 'auth_token', token, {
      httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/'
    });

    return c.json({ message: 'User created successfully', user: { id, email, name, grade: grade || '', role } });
  } catch (err) {
    console.error('Signup error:', err);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json();
  const { email, password } = body;

  if (!email || !password) return c.json({ error: 'Missing email or password' }, 400);

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<DBUser>();
  if (!user) return c.json({ error: 'Invalid credentials' }, 401);
  if (user.status !== 'active') return c.json({ error: 'アカウントは利用できません' }, 401);

  const isMatch = await verifyPassword(password, user.password_hash || '');
  if (!isMatch) return c.json({ error: 'Invalid credentials' }, 401);

  const secret = secretFor(c);
  const token = await sign({ id: user.id, email: user.email, role: user.role, name: user.name, exp: Math.floor(Date.now()/1000)+86400 }, secret);
  setCookie(c, 'auth_token', token, {
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/'
  });

  delete user.password_hash;
  return c.json({ message: 'Login successful', user });
});

app.post('/api/auth/logout', (c) => {
  deleteCookie(c, 'auth_token', { path: '/' });
  return c.json({ message: 'Logout successful' });
});

app.get('/api/auth/me', authMiddleware, async (c) => {
  const payload = c.get('user');
  const user = await c.env.DB.prepare('SELECT id, email, role, name, grade, level, exp, streak, last_study_date, created_at FROM users WHERE id = ?').bind(payload.id).first<DBUser>();
  if (!user) return c.json({ error: 'User not found' }, 404);

  user.topicStats = {};
  user.detailedStats = {};
  const stats = await c.env.DB.prepare(`SELECT json_extract(s.snapshot,'$.subject') AS subject,json_extract(s.snapshot,'$.unitName') AS topic,
    COUNT(*) AS total,SUM(a.correct) AS correct FROM drill_answers a JOIN drill_sessions s ON s.id=a.session_id
    JOIN drill_assignments da ON da.id=s.assignment_id WHERE da.user_id=? GROUP BY subject,topic`).bind(payload.id).all<{subject:string;topic:string;total:number;correct:number}>();
  for (const stat of stats.results) {
    const old = user.topicStats[stat.subject] as {total:number;correct:number}|undefined;
    user.topicStats[stat.subject] = {total:(old?.total||0)+stat.total,correct:(old?.correct||0)+stat.correct};
    user.detailedStats[`${stat.subject}:${stat.topic}`] = {total:stat.total,correct:stat.correct};
  }
  return c.json({ user });
});

// --- API Routes (Protected) ---
app.use('/api/*', authMiddleware);
app.route('/api/platform', drills);
app.route('/api/platform', platform);

// AI credentials stay on the Worker, never in the browser bundle or settings response.
app.post('/api/ai/completion', async c => {
  const settings = await c.env.DB.prepare('SELECT * FROM system_settings LIMIT 1').first<DBSettings>();
  if (!settings?.api_key) return c.json({ error: '管理者がAI設定を登録してください' }, 400);
  const body = await c.req.json();
  if (!Array.isArray(body.messages) || body.messages.length > 100 || body.messages.some((m: {role:string;content:string}) => !m || !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 50000)) return c.json({ error: 'メッセージが不正です' }, 400);
  try {
    const response = await fetch(`${normalizeAIEndpoint(settings.endpoint)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.api_key}` },
      body: JSON.stringify({ model: settings.model, messages: body.messages }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) return c.json({ error: aiFailureMessage({ status: response.status }) }, 502);
    if (!response.headers.get('content-type')?.includes('application/json')) return c.json({ error: 'AI接続先からJSON以外の応答が返りました。APIのベースURLを確認してください。' }, 502);
    const result = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return c.json({ error: 'AIから有効な回答が返りませんでした。接続先がOpenAI互換APIのベースURLになっているか確認してください。' }, 502);
    return c.json({ choices: [{ message: { content } }] });
  } catch (error) { return c.json({ error: aiFailureMessage(error) }, 502); }
});

app.get('/api/settings', async (c) => {
  const dbSettings = await c.env.DB.prepare('SELECT * FROM system_settings LIMIT 1').first<DBSettings>();
  if (!dbSettings) {
    return c.json({ 
      endpoint: 'https://api.openai.com/v1', 
      apiKey: '', 
      model: 'gpt-4o', 
      duplicatePreventionMode: 'seed' 
    });
  }
  return c.json({
    endpoint: dbSettings.endpoint,
    apiKey: '',
    hasApiKey: Boolean(dbSettings.api_key),
    model: dbSettings.model,
    duplicatePreventionMode: dbSettings.duplicate_prevention_mode
  });
});

app.put('/api/settings', adminMiddleware, async (c) => {
  const body = await c.req.json();
  let endpoint: string;
  try { endpoint = normalizeAIEndpoint(body.endpoint || 'https://api.openai.com/v1'); }
  catch { return c.json({ error: 'APIエンドポイントには有効なHTTP(S)のベースURLを入力してください。' }, 400); }
  const oldSettings = await c.env.DB.prepare('SELECT api_key FROM system_settings LIMIT 1').first<DBSettings>();
  const apiKey = body.clearApiKey ? '' : (body.apiKey || oldSettings?.api_key || '');
  const model = body.model || 'gpt-4o';
  const duplicatePreventionMode = body.duplicatePreventionMode || 'seed';
  
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM system_settings'),
    c.env.DB.prepare('INSERT INTO system_settings (id, endpoint, api_key, model, duplicate_prevention_mode) VALUES (?, ?, ?, ?, ?)').bind('default', endpoint, apiKey, model, duplicatePreventionMode)
  ]);
  
  return c.json({ message: 'Settings updated' });
});

// User Data Update
app.put('/api/user', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { name, grade } = body;
  await c.env.DB.prepare('UPDATE users SET name = ?, grade = ? WHERE id = ?').bind(name, grade, user.id).run();
  return c.json({ message: 'User updated' });
});

// Study Results (Replaces addStudyResult)
app.post('/api/study_result', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { minutes, isCorrect } = body;
  const today = new Date().toISOString().split('T')[0];

  const dbUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<DBUser>();
  if (!dbUser) return c.json({ error:'User not found' },404);
  
  const todayRecord = await c.env.DB.prepare('SELECT * FROM daily_records WHERE user_id = ? AND date = ?').bind(user.id, today).first<{id:string}>();
  
  let streak = dbUser.streak;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (!todayRecord) {
    if (dbUser.last_study_date === yesterday) streak += 1;
    else if (dbUser.last_study_date !== today) streak = 1;
    
    await c.env.DB.prepare(
      'INSERT INTO daily_records (id, user_id, date, study_minutes, total_questions, correct_answers) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), user.id, today, minutes, 1, isCorrect ? 1 : 0).run();
  } else {
    await c.env.DB.prepare(
      'UPDATE daily_records SET study_minutes = study_minutes + ?, total_questions = total_questions + 1, correct_answers = correct_answers + ? WHERE id = ?'
    ).bind(minutes, isCorrect ? 1 : 0, todayRecord.id).run();
  }

  const gainedExp = isCorrect ? 10 : 2;
  let newExp = dbUser.exp + gainedExp;
  let newLevel = dbUser.level;
  let leveledUp = false;

  const expNeeded = newLevel * 50;
  if (newExp >= expNeeded) {
    newLevel += 1;
    newExp -= expNeeded;
    leveledUp = true;
  }

  await c.env.DB.prepare(
    'UPDATE users SET exp = ?, level = ?, streak = ?, last_study_date = ? WHERE id = ?'
  ).bind(newExp, newLevel, streak, today, user.id).run();

  return c.json({ gainedExp, leveledUp });
});

// Daily Records
app.get('/api/daily_records', async (c) => {
  const user = c.get('user');
  const result = await c.env.DB.prepare('SELECT * FROM study_daily_totals WHERE user_id = ? ORDER BY date ASC').bind(user.id).all();
  return c.json(result.results);
});

// Admin APIs
app.get('/api/admin/users', adminMiddleware, async (c) => {
  const result = await c.env.DB.prepare('SELECT id, name, email, role, grade, level, exp, streak, last_study_date, created_at FROM users ORDER BY created_at DESC').all();
  return c.json(result.results);
});

app.get('/api/admin/users/:id/records', adminMiddleware, async (c) => {
  const userId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM study_daily_totals WHERE user_id = ? ORDER BY date ASC').bind(userId).all();
  return c.json(result.results);
});

app.get('/api/admin/users/:id/chat_logs', adminMiddleware, async (c) => {
  const userId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM chat_logs WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
  const logs = result.results as {chat_history:string}[];
  const formatted = logs.map(l => ({ ...l, chat_history: JSON.parse(l.chat_history) }));
  return c.json(formatted);
});

// Custom Drills
app.get('/api/custom_drills', async (c) => {
  const user = c.get('user');
  const result = await c.env.DB.prepare('SELECT * FROM custom_drill_sets WHERE user_id = ? OR is_public = 1').bind(user.id).all();
  const drills = result.results as {created_at:string;questions:string;is_public:number}[];
  const formatted = drills.map(d => {
    let parsedCreatedAt = Date.now();
    if (d.created_at) {
      const t = new Date(d.created_at).getTime();
      if (!isNaN(t)) {
        parsedCreatedAt = t;
      } else if (!isNaN(Number(d.created_at))) {
        parsedCreatedAt = Number(d.created_at);
      }
    }
    return {
      ...d,
      createdAt: parsedCreatedAt,
      questions: JSON.parse(d.questions),
      is_public: d.is_public === 1
    };
  });
  return c.json(formatted);
});

app.post('/api/custom_drills', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden: Admins only' }, 403);
  const body = await c.req.json();
  const { id, title, subject, topic, questions, is_public, createdAt } = body;
  
  const existing = await c.env.DB.prepare('SELECT id, user_id FROM custom_drill_sets WHERE id = ?').bind(id).first<{id:string;user_id:string}>();
  if (existing) {
    if (existing.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
    await c.env.DB.prepare(
      'UPDATE custom_drill_sets SET title = ?, subject = ?, topic = ?, questions = ?, is_public = ? WHERE id = ?'
    ).bind(title, subject, topic, JSON.stringify(questions), is_public ? 1 : 0, id).run();
  } else {
    let createdAtIso = new Date().toISOString();
    if (createdAt) {
      const t = new Date(createdAt).getTime();
      if (!isNaN(t)) {
        createdAtIso = new Date(t).toISOString();
      } else if (!isNaN(Number(createdAt))) {
        createdAtIso = new Date(Number(createdAt)).toISOString();
      }
    }
    await c.env.DB.prepare(
      'INSERT INTO custom_drill_sets (id, user_id, title, subject, topic, questions, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, user.id, title, subject, topic, JSON.stringify(questions), is_public ? 1 : 0, createdAtIso).run();
  }
  return c.json({ message: 'Saved' });
});

app.delete('/api/custom_drills/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden: Admins only' }, 403);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT id, user_id FROM custom_drill_sets WHERE id = ?').bind(id).first<{id:string;user_id:string}>();
  if (existing && existing.user_id === user.id) {
    await c.env.DB.prepare('DELETE FROM custom_drill_sets WHERE id = ?').bind(id).run();
  }
  return c.json({ message: 'Deleted' });
});

app.post('/api/chat_logs', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { subject, topic, chatHistory } = body;
  
  if (!subject || !topic || !chatHistory) return c.json({ error: 'Missing required fields' }, 400);

  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO chat_logs (id, user_id, subject, topic, chat_history, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, user.id, subject, topic, JSON.stringify(chatHistory), new Date().toISOString()).run();
    return c.json({ success: true, id });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Failed to save chat log' }, 500);
  }
});

export default app;
