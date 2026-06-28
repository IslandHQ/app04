DROP TABLE IF EXISTS custom_drill_sets;
DROP TABLE IF EXISTS chat_logs;
DROP TABLE IF EXISTS daily_records;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin', 'user')) NOT NULL DEFAULT 'user',
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_study_date TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model TEXT NOT NULL,
  duplicate_prevention_mode TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  study_minutes INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  chat_history TEXT NOT NULL, -- JSON string
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_drill_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  questions TEXT NOT NULL, -- JSON string
  is_public INTEGER NOT NULL DEFAULT 0, -- 0: false, 1: true
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
