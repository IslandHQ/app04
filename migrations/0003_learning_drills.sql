CREATE TABLE drill_units (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id),
  subject TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(course_id,subject,name)
);
CREATE TABLE learning_drills (
  id TEXT PRIMARY KEY, unit_id TEXT NOT NULL REFERENCES drill_units(id), title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  target_count INTEGER NOT NULL DEFAULT 5, questions TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
);
CREATE INDEX learning_drills_unit ON learning_drills(unit_id,status);
CREATE TABLE drill_assignments (
  id TEXT PRIMARY KEY, drill_id TEXT NOT NULL REFERENCES learning_drills(id),
  user_id TEXT NOT NULL REFERENCES users(id), snapshot TEXT NOT NULL,
  target_date TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
  UNIQUE(drill_id,user_id)
);
CREATE INDEX drill_assignments_user ON drill_assignments(user_id,active);
CREATE TABLE drill_sessions (
  id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES drill_assignments(id),
  snapshot TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'all' CHECK(mode IN ('all','mistakes')),
  completed INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_open_drill_session ON drill_sessions(assignment_id) WHERE completed=0;
CREATE TABLE drill_answers (
  session_id TEXT NOT NULL REFERENCES drill_sessions(id), question_id TEXT NOT NULL,
  choice INTEGER NOT NULL, correct INTEGER NOT NULL, study_seconds INTEGER NOT NULL,
  answered_at TEXT NOT NULL, PRIMARY KEY(session_id,question_id)
);
CREATE INDEX drill_sessions_assignment ON drill_sessions(assignment_id);
CREATE VIEW study_daily_totals AS
SELECT user_id || ':' || date AS id,user_id,date,ROUND(SUM(study_minutes),1) AS study_minutes,
SUM(total_questions) AS total_questions,SUM(correct_answers) AS correct_answers FROM (
  SELECT user_id,date,study_minutes,total_questions,correct_answers FROM daily_records
  UNION ALL
  SELECT da.user_id,substr(a.answered_at,1,10),a.study_seconds/60.0,1,a.correct
  FROM drill_answers a JOIN drill_sessions s ON s.id=a.session_id JOIN drill_assignments da ON da.id=s.assignment_id
) GROUP BY user_id,date;

-- Keep legacy material intact; copy it into reviewable drafts in the new library.
INSERT INTO courses(id,name,description,audience)
SELECT 'legacy-drills','既存のドリル','旧問題集から引き継いだ教材',''
WHERE EXISTS(SELECT 1 FROM custom_drill_sets);
INSERT INTO drill_units(id,course_id,subject,name,sort_order)
SELECT lower(hex(randomblob(16))),'legacy-drills',subject,topic,0 FROM custom_drill_sets GROUP BY subject,topic;
INSERT INTO learning_drills(id,unit_id,title,status,target_count,questions,created_at)
SELECT 'legacy-'||d.id,u.id,d.title,'draft',MAX(1,json_array_length(d.questions)),
COALESCE((SELECT json_group_array(json_object(
  'id','q-'||q.key,'text',COALESCE(json_extract(q.value,'$.questionText'),''),
  'choices',json(COALESCE(json_extract(q.value,'$.choices'),'[]')),
  'answer',COALESCE((SELECT CAST(c.key AS INTEGER) FROM json_each(json_extract(q.value,'$.choices')) c WHERE c.value=json_extract(q.value,'$.correctAnswer') LIMIT 1),-1),
  'points',1,'category',d.topic,'explanation',COALESCE(json_extract(q.value,'$.explanation'),''),
  'hint1',COALESCE(json_extract(q.value,'$.hint1'),''),'hint2',COALESCE(json_extract(q.value,'$.hint2'),'')
)) FROM json_each(d.questions) q),'[]'),d.created_at
FROM custom_drill_sets d JOIN drill_units u ON u.course_id='legacy-drills' AND u.subject=d.subject AND u.name=d.topic
WHERE json_valid(d.questions);
