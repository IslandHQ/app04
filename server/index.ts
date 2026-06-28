import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { hashPassword, verifyPassword } from './auth';

type Bindings = {
  DB: D1Database;
  JWT_SECRET?: string;
  NODE_ENV?: string;
};

type Variables = {
  user: any;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// --- Authentication Middleware ---
const authMiddleware = async (c: any, next: any) => {
  const token = getCookie(c, 'auth_token');
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const secret = c.env.JWT_SECRET || 'super_secret_key_for_dev_only';
  try {
    const payload = await verify(token, secret, 'HS256');
    c.set('user', payload);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

const adminMiddleware = async (c: any, next: any) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
};

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// --- Auth Routes ---
app.post('/api/auth/signup', async (c) => {
  const body = await c.req.json();
  const { email, password, name, grade } = body;
  
  if (!email || !password || !name) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const existingUser = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existingUser) {
    return c.json({ error: 'Email already exists' }, 400);
  }

  const password_hash = await hashPassword(password);
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  
  const userCountResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first() as any;
  const userCount = userCountResult?.count || 0;
  const role = userCount === 0 ? 'admin' : 'user';

  try {
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, name, grade, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, email, password_hash, name, grade || '中1', role, created_at).run();

    const secret = c.env.JWT_SECRET || 'super_secret_key_for_dev_only';
    const token = await sign({ id, email, role, name }, secret);
    setCookie(c, 'auth_token', token, {
      httpOnly: true, secure: c.env.NODE_ENV === 'production', sameSite: 'Strict', path: '/'
    });

    return c.json({ message: 'User created successfully', user: { id, email, name, grade: grade || '中1', role } });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json();
  const { email, password } = body;

  if (!email || !password) return c.json({ error: 'Missing email or password' }, 400);

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first() as any;
  if (!user) return c.json({ error: 'Invalid credentials' }, 401);

  const isMatch = await verifyPassword(password, user.password_hash);
  if (!isMatch) return c.json({ error: 'Invalid credentials' }, 401);

  const secret = c.env.JWT_SECRET || 'super_secret_key_for_dev_only';
  const token = await sign({ id: user.id, email: user.email, role: user.role, name: user.name }, secret);
  setCookie(c, 'auth_token', token, {
    httpOnly: true, secure: c.env.NODE_ENV === 'production', sameSite: 'Strict', path: '/'
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
  const user = await c.env.DB.prepare('SELECT id, email, role, name, grade, level, exp, streak, last_study_date, created_at FROM users WHERE id = ?').bind(payload.id).first() as any;
  if (!user) return c.json({ error: 'User not found' }, 404);

  user.topicStats = {};
  user.detailedStats = {};
  return c.json({ user });
});

// --- API Routes (Protected) ---
app.use('/api/*', authMiddleware);

app.get('/api/settings', async (c) => {
  let dbSettings = await c.env.DB.prepare('SELECT * FROM system_settings LIMIT 1').first() as any;
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
    apiKey: dbSettings.api_key,
    model: dbSettings.model,
    duplicatePreventionMode: dbSettings.duplicate_prevention_mode
  });
});

app.put('/api/settings', adminMiddleware, async (c) => {
  const body = await c.req.json();
  const endpoint = body.endpoint || 'https://api.openai.com/v1';
  const apiKey = body.apiKey || '';
  const model = body.model || 'gpt-4o';
  const duplicatePreventionMode = body.duplicatePreventionMode || 'seed';
  
  await c.env.DB.prepare('DELETE FROM system_settings').run();
  await c.env.DB.prepare(
    'INSERT INTO system_settings (id, endpoint, api_key, model, duplicate_prevention_mode) VALUES (?, ?, ?, ?, ?)'
  ).bind('default', endpoint, apiKey, model, duplicatePreventionMode).run();
  
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
  const { subject, topic, minutes, isCorrect } = body;
  const today = new Date().toISOString().split('T')[0];

  const dbUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first() as any;
  
  let todayRecord = await c.env.DB.prepare('SELECT * FROM daily_records WHERE user_id = ? AND date = ?').bind(user.id, today).first() as any;
  
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
  const result = await c.env.DB.prepare('SELECT * FROM daily_records WHERE user_id = ? ORDER BY date ASC').bind(user.id).all();
  return c.json(result.results);
});

// Admin APIs
app.get('/api/admin/users', adminMiddleware, async (c) => {
  const result = await c.env.DB.prepare('SELECT id, name, email, role, grade, level, exp, streak, last_study_date, created_at FROM users ORDER BY created_at DESC').all();
  return c.json(result.results);
});

app.get('/api/admin/users/:id/records', adminMiddleware, async (c) => {
  const userId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM daily_records WHERE user_id = ? ORDER BY date ASC').bind(userId).all();
  return c.json(result.results);
});

app.get('/api/admin/users/:id/chat_logs', adminMiddleware, async (c) => {
  const userId = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM chat_logs WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
  const logs = result.results as any[];
  const formatted = logs.map(l => ({ ...l, chat_history: JSON.parse(l.chat_history) }));
  return c.json(formatted);
});

// Custom Drills
app.get('/api/custom_drills', async (c) => {
  const user = c.get('user');
  const result = await c.env.DB.prepare('SELECT * FROM custom_drill_sets WHERE user_id = ? OR is_public = 1').bind(user.id).all();
  const drills = result.results as any[];
  const formatted = drills.map(d => ({
    ...d,
    questions: JSON.parse(d.questions),
    is_public: d.is_public === 1
  }));
  return c.json(formatted);
});

app.post('/api/custom_drills', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden: Admins only' }, 403);
  const body = await c.req.json();
  const { id, title, subject, topic, questions, is_public } = body;
  
  const existing = await c.env.DB.prepare('SELECT id, user_id FROM custom_drill_sets WHERE id = ?').bind(id).first() as any;
  if (existing) {
    if (existing.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
    await c.env.DB.prepare(
      'UPDATE custom_drill_sets SET title = ?, subject = ?, topic = ?, questions = ?, is_public = ? WHERE id = ?'
    ).bind(title, subject, topic, JSON.stringify(questions), is_public ? 1 : 0, id).run();
  } else {
    await c.env.DB.prepare(
      'INSERT INTO custom_drill_sets (id, user_id, title, subject, topic, questions, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, user.id, title, subject, topic, JSON.stringify(questions), is_public ? 1 : 0, new Date().toISOString()).run();
  }
  return c.json({ message: 'Saved' });
});

app.delete('/api/custom_drills/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden: Admins only' }, 403);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT id, user_id FROM custom_drill_sets WHERE id = ?').bind(id).first() as any;
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
