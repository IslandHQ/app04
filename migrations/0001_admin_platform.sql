-- Additive migration: existing users, drills and study records are preserved.
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled'));
ALTER TABLE users ADD COLUMN profile TEXT NOT NULL DEFAULT '{}';
CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '');
CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(group_id,user_id)
);
CREATE TABLE courses (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '');
CREATE TABLE tests (
  id TEXT PRIMARY KEY, course_id TEXT REFERENCES courses(id), title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('draft','published','closed')),
  mode TEXT NOT NULL CHECK(mode IN ('exam','practice')), pass_percent INTEGER NOT NULL,
  questions TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE assignments (
  id TEXT PRIMARY KEY, test_id TEXT NOT NULL REFERENCES tests(id), user_id TEXT NOT NULL REFERENCES users(id),
  snapshot TEXT NOT NULL, due_at TEXT, max_attempts INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
  UNIQUE(test_id,user_id)
);
CREATE TABLE attempts (
  id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES assignments(id),
  status TEXT NOT NULL CHECK(status IN ('in_progress','submitted')),
  answers TEXT NOT NULL DEFAULT '{}', score INTEGER, total INTEGER NOT NULL,
  passed INTEGER, started_at TEXT NOT NULL, submitted_at TEXT
);
CREATE UNIQUE INDEX one_open_attempt ON attempts(assignment_id) WHERE status='in_progress';
CREATE INDEX assignments_user ON assignments(user_id);
CREATE INDEX attempts_assignment ON attempts(assignment_id);
-- Enforced inside SQLite so simultaneous administrator edits cannot remove the last admin.
CREATE TRIGGER keep_last_admin BEFORE UPDATE OF role,status ON users
WHEN OLD.role='admin' AND OLD.status='active' AND (NEW.role!='admin' OR NEW.status!='active')
AND (SELECT COUNT(*) FROM users WHERE role='admin' AND status='active') <= 1
BEGIN SELECT RAISE(ABORT, 'LAST_ADMIN'); END;
