import { Hono } from 'hono';
import { serve } from 'bun';
import { db, initDB } from './db';
import { sign, verify } from 'hono/jwt';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

// Initialize the database schema
initDB();

const app = new Hono();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_for_dev_only';

// --- Authentication Middleware ---
const authMiddleware = async (c: any, next: any) => {
  const token = getCookie(c, 'auth_token');
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const payload = await verify(token, JWT_SECRET, 'HS256');
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

  const existingUser = db.query('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) {
    return c.json({ error: 'Email already exists' }, 400);
  }

  const password_hash = await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  
  const userCount = (db.query('SELECT COUNT(*) as count FROM users').get() as any).count;
  const role = userCount === 0 ? 'admin' : 'user';

  try {
    db.run(
      'INSERT INTO users (id, email, password_hash, name, grade, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, email, password_hash, name, grade || '中1', role, created_at]
    );

    const token = await sign({ id, email, role, name }, JWT_SECRET);
    setCookie(c, 'auth_token', token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict', path: '/'
    });

    return c.json({ message: 'User created successfully', user: { id, email, name, grade: grade || '中1', role: 'user' } });
  } catch (err) {
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json();
  const { email, password } = body;

  if (!email || !password) return c.json({ error: 'Missing email or password' }, 400);

  const user = db.query('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user) return c.json({ error: 'Invalid credentials' }, 401);

  const isMatch = await Bun.password.verify(password, user.password_hash);
  if (!isMatch) return c.json({ error: 'Invalid credentials' }, 401);

  const token = await sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET);
  setCookie(c, 'auth_token', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict', path: '/'
  });

  delete user.password_hash;
  return c.json({ message: 'Login successful', user });
});

app.post('/api/auth/logout', (c) => {
  deleteCookie(c, 'auth_token', { path: '/' });
  return c.json({ message: 'Logout successful' });
});

app.get('/api/auth/me', authMiddleware, (c) => {
  const payload = c.get('user');
  const user = db.query('SELECT id, email, role, name, grade, level, exp, streak, last_study_date, created_at FROM users WHERE id = ?').get(payload.id) as any;
  if (!user) return c.json({ error: 'User not found' }, 404);

  // Load topicStats and detailedStats (In real app we should have tables for these, but we'll mock or load from other tables)
  // For now we'll just parse them if we added columns, but let's query daily_records or chat_logs.
  user.topicStats = {};
  user.detailedStats = {};
  return c.json({ user });
});

// --- API Routes (Protected) ---
app.use('/api/*', authMiddleware);

app.get('/api/settings', (c) => {
  let dbSettings = db.query('SELECT * FROM system_settings LIMIT 1').get() as any;
  if (!dbSettings) {
    return c.json({ 
      endpoint: process.env.API || 'https://api.openai.com/v1', 
      apiKey: process.env.API_KEY || '', 
      model: process.env.MODEL_NAME || 'gpt-4o', 
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
  
  db.run('DELETE FROM system_settings');
  db.run(
    'INSERT INTO system_settings (id, endpoint, api_key, model, duplicate_prevention_mode) VALUES (?, ?, ?, ?, ?)',
    ['default', endpoint, apiKey, model, duplicatePreventionMode]
  );
  return c.json({ message: 'Settings updated' });
});

// User Data Update
app.put('/api/user', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { name, grade } = body;
  db.run('UPDATE users SET name = ?, grade = ? WHERE id = ?', [name, grade, user.id]);
  return c.json({ message: 'User updated' });
});

// Study Results (Replaces addStudyResult)
app.post('/api/study_result', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { subject, topic, minutes, isCorrect } = body;
  const today = new Date().toISOString().split('T')[0];

  const dbUser = db.query('SELECT * FROM users WHERE id = ?').get(user.id) as any;
  
  let todayRecord = db.query('SELECT * FROM daily_records WHERE user_id = ? AND date = ?').get(user.id, today) as any;
  
  let streak = dbUser.streak;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (!todayRecord) {
    if (dbUser.last_study_date === yesterday) streak += 1;
    else if (dbUser.last_study_date !== today) streak = 1;
    
    db.run(
      'INSERT INTO daily_records (id, user_id, date, study_minutes, total_questions, correct_answers) VALUES (?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), user.id, today, minutes, 1, isCorrect ? 1 : 0]
    );
  } else {
    db.run(
      'UPDATE daily_records SET study_minutes = study_minutes + ?, total_questions = total_questions + 1, correct_answers = correct_answers + ? WHERE id = ?',
      [minutes, isCorrect ? 1 : 0, todayRecord.id]
    );
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

  db.run(
    'UPDATE users SET exp = ?, level = ?, streak = ?, last_study_date = ? WHERE id = ?',
    [newExp, newLevel, streak, today, user.id]
  );

  return c.json({ gainedExp, leveledUp });
});

// Daily Records
app.get('/api/daily_records', (c) => {
  const user = c.get('user');
  const records = db.query('SELECT * FROM daily_records WHERE user_id = ? ORDER BY date ASC').all();
  return c.json(records);
});

// Admin APIs
app.get('/api/admin/users', adminMiddleware, (c) => {
  const users = db.query('SELECT id, name, email, role, grade, level, exp, streak, last_study_date, created_at FROM users ORDER BY created_at DESC').all();
  return c.json(users);
});

app.get('/api/admin/users/:id/records', adminMiddleware, (c) => {
  const userId = c.req.param('id');
  const records = db.query('SELECT * FROM daily_records WHERE user_id = ? ORDER BY date ASC').all(userId);
  return c.json(records);
});

app.get('/api/admin/users/:id/chat_logs', adminMiddleware, (c) => {
  const userId = c.req.param('id');
  const logs = db.query('SELECT * FROM chat_logs WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
  const formatted = logs.map(l => ({ ...l, chat_history: JSON.parse(l.chat_history) }));
  return c.json(formatted);
});

// Custom Drills
app.get('/api/custom_drills', (c) => {
  const user = c.get('user');
  // Return user's drills + public drills
  const drills = db.query('SELECT * FROM custom_drill_sets WHERE user_id = ? OR is_public = 1').all() as any[];
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
  
  const existing = db.query('SELECT id, user_id FROM custom_drill_sets WHERE id = ?').get(id) as any;
  if (existing) {
    if (existing.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
    db.run(
      'UPDATE custom_drill_sets SET title = ?, subject = ?, topic = ?, questions = ?, is_public = ? WHERE id = ?',
      [title, subject, topic, JSON.stringify(questions), is_public ? 1 : 0, id]
    );
  } else {
    db.run(
      'INSERT INTO custom_drill_sets (id, user_id, title, subject, topic, questions, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, user.id, title, subject, topic, JSON.stringify(questions), is_public ? 1 : 0, new Date().toISOString()]
    );
  }
  return c.json({ message: 'Saved' });
});

app.delete('/api/custom_drills/:id', (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden: Admins only' }, 403);
  const id = c.req.param('id');
  const existing = db.query('SELECT id, user_id FROM custom_drill_sets WHERE id = ?').get(id) as any;
  if (existing && existing.user_id === user.id) {
    db.run('DELETE FROM custom_drill_sets WHERE id = ?', [id]);
  }
  return c.json({ message: 'Deleted' });
});

// Setup Bun.serve wrapper
const port = process.env.PORT || 3001;
app.post('/api/chat_logs', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { subject, topic, chatHistory } = body;
  
  if (!subject || !topic || !chatHistory) return c.json({ error: 'Missing required fields' }, 400);

  const id = crypto.randomUUID();
  try {
    db.run(
      'INSERT INTO chat_logs (id, user_id, subject, topic, chat_history, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, user.id, subject, topic, JSON.stringify(chatHistory), new Date().toISOString()]
    );
    return c.json({ success: true, id });
  } catch (err) {
    return c.json({ error: 'Failed to save chat log' }, 500);
  }
});

export default {
  port: 3001,
  fetch: app.fetch,
};
