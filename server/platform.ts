import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { hashPassword } from "./auth";
import type { Question, TestDefinition } from "../shared/platform";

export type PlatformEnv = {
  Bindings: { DB: D1Database };
  Variables: { user: { id: string; role: string } };
};
type Row = Record<string, string | number | null>;
function fail(message: string, status: 400 | 403 | 404 | 409 = 400): never {
  throw new HTTPException(status, { message });
}
const str = (v: unknown, max = 500) =>
  typeof v === "string" && v.length <= max
    ? v.trim()
    : fail("入力内容を確認してください");
const integer = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && Number(v) >= min && Number(v) <= max
    ? Number(v)
    : fail("数値の範囲を確認してください");
const ids = (v: unknown): string[] =>
  Array.isArray(v) && v.length <= 500 && v.every((x) => typeof x === "string")
    ? [...new Set(v)]
    : fail("対象の指定が不正です");
const required = (v: unknown, max = 500) =>
  str(v, max) || fail("必須項目を入力してください");
function questions(v: unknown): Question[] {
  if (!Array.isArray(v) || !v.length || v.length > 100)
    return fail("問題は1〜100問で登録してください");
  if (v.some((q) => !q || typeof q !== "object")) fail("問題形式が不正です");
  const parsed = v.map((q) => ({
    id: required(q.id),
    text: required(q.text, 5000),
    choices:
      Array.isArray(q.choices) && q.choices.length === 4
        ? q.choices.map((s: unknown) => required(s, 2000))
        : fail("選択肢は4つ必要です"),
    answer: integer(q.answer, 0, 3),
    points: integer(q.points, 1, 100),
    explanation: str(q.explanation, 5000),
    category: str(q.category),
  }));
  if (new Set(parsed.map((q) => q.id)).size !== parsed.length)
    fail("問題IDが重複しています");
  return parsed;
}
const testFrom = (r: Row): TestDefinition => ({
  id: String(r.id),
  title: String(r.title),
  courseId: String(r.course_id || ""),
  description: String(r.description),
  status: r.status as TestDefinition["status"],
  mode: r.mode as TestDefinition["mode"],
  timeLimitMinutes: Number(r.time_limit_minutes || 0),
  passPercent: Number(r.pass_percent),
  questions: JSON.parse(String(r.questions)),
  createdAt: String(r.created_at),
});
const assignmentSQL = `SELECT a.*, u.name AS user_name,t.status AS test_status,
 (SELECT COUNT(*) FROM attempts p WHERE p.assignment_id=a.id) AS attempts,
 (SELECT status FROM attempts p WHERE p.assignment_id=a.id ORDER BY started_at DESC, rowid DESC LIMIT 1) AS latest_status
 FROM assignments a JOIN users u ON u.id=a.user_id JOIN tests t ON t.id=a.test_id`;
const assignmentFrom = (r: Row) => ({
  id: r.id,
  testId: r.test_id,
  testStatus: r.test_status,
  timeLimitMinutes: JSON.parse(String(r.snapshot)).timeLimitMinutes || 0,
  questionCount: JSON.parse(String(r.snapshot)).questions.length,
  mode: JSON.parse(String(r.snapshot)).mode,
  title: JSON.parse(String(r.snapshot)).title,
  userId: r.user_id,
  userName: r.user_name,
  dueAt: r.due_at,
  maxAttempts: r.max_attempts,
  attempts: r.attempts,
  status:
    r.latest_status === "submitted"
      ? "submitted"
      : r.due_at && Date.parse(String(r.due_at)) < Date.now()
        ? "overdue"
        : r.latest_status || "pending",
});
export const platform = new Hono<PlatformEnv>();
platform.onError((err, c) => {
  if (err instanceof HTTPException)
    return c.json({ error: err.message }, err.status);
  if (String(err).includes("LAST_ADMIN"))
    return c.json({ error: "最後の有効な管理者は停止・降格できません" }, 409);
  if (String(err).includes("UNIQUE constraint"))
    return c.json(
      { error: "同じデータが既に登録されています。再読み込みしてください" },
      409,
    );
  console.error(err);
  return c.json({ error: "処理に失敗しました" }, 500);
});
platform.use("/admin/*", async (c, next) => {
  if (c.get("user").role !== "admin")
    return c.json({ error: "管理者権限が必要です" }, 403);
  await next();
});

platform.get("/admin/users", async (c) => {
  const users = await c.env.DB.prepare(
    "SELECT id,email,name,grade,role,status,profile FROM users ORDER BY created_at DESC",
  ).all<Row>();
  const members = await c.env.DB.prepare(
    "SELECT * FROM group_members",
  ).all<Row>();
  return c.json(
    users.results.map((u) => ({
      ...u,
      profile: JSON.parse(String(u.profile)),
      groupIds: members.results
        .filter((m) => m.user_id === u.id)
        .map((m) => m.group_id),
    })),
  );
});
platform.post("/admin/users", async (c) => {
  const b = await c.req.json();
  const email = required(b.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail("メールアドレスが不正です");
  const password = required(b.password, 200);
  if (password.length < 8) fail("パスワードは8文字以上必要です");
  if (!["admin", "user"].includes(b.role)) fail("権限が不正です");
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO users (id,email,password_hash,name,grade,role,created_at) VALUES (?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      email,
      await hashPassword(password),
      required(b.name),
      str(b.grade || ""),
      b.role,
      new Date().toISOString(),
    )
    .run();
  return c.json({ id }, 201);
});
platform.put("/admin/users/:id", async (c) => {
  const b = await c.req.json();
  const id = c.req.param("id");
  if (
    !["admin", "user"].includes(b.role) ||
    !["active", "disabled"].includes(b.status)
  )
    fail("権限または状態が不正です");
  if (id === c.get("user").id && (b.role !== "admin" || b.status !== "active"))
    fail("自分自身の停止・降格はできません");
  if (
    !b.profile ||
    typeof b.profile !== "object" ||
    Array.isArray(b.profile) ||
    Object.keys(b.profile).length > 20 ||
    Object.entries(b.profile).some(
      ([k, v]) =>
        !k.trim() || k.length > 100 || typeof v !== "string" || v.length > 500,
    )
  )
    fail("追加属性は20項目までの文字列で指定してください");
  const r = await c.env.DB.prepare(
    "UPDATE users SET name=?,grade=?,role=?,status=?,profile=? WHERE id=?",
  )
    .bind(
      required(b.name),
      str(b.grade || ""),
      b.role,
      b.status,
      JSON.stringify(b.profile),
      id,
    )
    .run();
  if (!r.meta.changes) fail("ユーザーが見つかりません", 404);
  return c.json({ ok: true });
});
platform.get("/admin/groups", async (c) => {
  const groups = await c.env.DB.prepare(
    "SELECT * FROM groups ORDER BY name",
  ).all<Row>();
  const members = await c.env.DB.prepare(
    "SELECT * FROM group_members",
  ).all<Row>();
  return c.json(
    groups.results.map((g) => ({
      ...g,
      memberIds: members.results
        .filter((m) => m.group_id === g.id)
        .map((m) => m.user_id),
    })),
  );
});
platform.post("/admin/groups", async (c) => {
  const b = await c.req.json();
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO groups (id,name,description) VALUES (?,?,?)",
  )
    .bind(id, required(b.name), str(b.description || "", 2000))
    .run();
  return c.json({ id }, 201);
});
platform.put("/admin/groups/:id", async (c) => {
  const b = await c.req.json();
  const id = c.req.param("id");
  const memberIds = ids(b.memberIds);
  if (
    !(await c.env.DB.prepare("SELECT id FROM groups WHERE id=?")
      .bind(id)
      .first())
  )
    fail("グループが見つかりません", 404);
  const users = await c.env.DB.prepare("SELECT id FROM users").all<Row>();
  if (memberIds.some((id) => !users.results.some((u) => u.id === id)))
    fail("ユーザーが見つかりません");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE groups SET name=?,description=? WHERE id=?").bind(
      required(b.name),
      str(b.description || "", 2000),
      id,
    ),
    c.env.DB.prepare("DELETE FROM group_members WHERE group_id=?").bind(id),
    ...memberIds.map((uid) =>
      c.env.DB.prepare("INSERT INTO group_members VALUES (?,?)").bind(id, uid),
    ),
  ]);
  return c.json({ ok: true });
});
platform.get("/courses", async (c) =>
  c.json(
    (await c.env.DB.prepare("SELECT * FROM courses ORDER BY name").all())
      .results,
  ),
);
platform.post("/admin/courses", async (c) => {
  const b = await c.req.json();
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO courses VALUES (?,?,?,?)")
    .bind(
      id,
      required(b.name),
      str(b.description || "", 2000),
      str(b.audience || ""),
    )
    .run();
  return c.json({ id }, 201);
});
platform.put("/admin/courses/:id", async (c) => {
  const b = await c.req.json();
  const r = await c.env.DB.prepare(
    "UPDATE courses SET name=?,description=?,audience=? WHERE id=?",
  )
    .bind(
      required(b.name),
      str(b.description || "", 2000),
      str(b.audience || ""),
      c.req.param("id"),
    )
    .run();
  if (!r.meta.changes) fail("コースが見つかりません", 404);
  return c.json({ ok: true });
});
platform.get("/admin/tests", async (c) =>
  c.json(
    (
      await c.env.DB.prepare(
        "SELECT * FROM tests ORDER BY created_at DESC",
      ).all<Row>()
    ).results.map(testFrom),
  ),
);
platform.post("/admin/tests", async (c) => {
  const b = await c.req.json();
  const id = crypto.randomUUID();
  const qs = questions(b.questions);
  if (!["exam", "practice"].includes(b.mode)) fail("モードが不正です");
  if (
    b.courseId &&
    !(await c.env.DB.prepare("SELECT id FROM courses WHERE id=?")
      .bind(b.courseId)
      .first())
  )
    fail("コースが見つかりません");
  await c.env.DB.prepare(
    "INSERT INTO tests (id,course_id,title,description,status,mode,pass_percent,questions,created_at,time_limit_minutes) VALUES (?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      b.courseId || null,
      required(b.title),
      str(b.description || "", 2000),
      "draft",
      b.mode,
      integer(b.passPercent, 0, 100),
      JSON.stringify(qs),
      new Date().toISOString(),
      integer(b.timeLimitMinutes ?? 0, 0, 480),
    )
    .run();
  return c.json({ id }, 201);
});
platform.put("/admin/tests/:id", async (c) => {
  const b = await c.req.json();
  const id = c.req.param("id");
  const old = await c.env.DB.prepare("SELECT * FROM tests WHERE id=?")
    .bind(id)
    .first<Row>();
  if (!old) fail("テストが見つかりません", 404);
  if (b.status && Object.keys(b).length === 1) {
    if (!(
      (old.status === "draft" && b.status === "published") ||
      (old.status === "published" && b.status === "closed")
    ))
      fail("状態の変更ができません");
    await c.env.DB.prepare("UPDATE tests SET status=? WHERE id=? AND status=?")
      .bind(b.status, id, old.status)
      .run();
  } else {
    if (old.status !== "draft")
      fail("公開済みテストは複製して編集してください", 409);
    if (!["exam", "practice"].includes(b.mode)) fail("モードが不正です");
    if (
      b.courseId &&
      !(await c.env.DB.prepare("SELECT id FROM courses WHERE id=?")
        .bind(b.courseId)
        .first())
    )
      fail("コースが見つかりません");
    const r = await c.env.DB.prepare(
      "UPDATE tests SET title=?,course_id=?,description=?,mode=?,pass_percent=?,questions=?,time_limit_minutes=? WHERE id=? AND status='draft'",
    )
      .bind(
        required(b.title),
        b.courseId || null,
        str(b.description || "", 2000),
        b.mode,
        integer(b.passPercent, 0, 100),
        JSON.stringify(questions(b.questions)),
        integer(b.timeLimitMinutes ?? 0, 0, 480),
        id,
      )
      .run();
    if (!r.meta.changes)
      fail("テストが変更されました。再読み込みしてください", 409);
  }
  return c.json({ ok: true });
});
platform.get("/admin/assignments", async (c) =>
  c.json(
    (
      await c.env.DB.prepare(
        assignmentSQL + " ORDER BY a.created_at DESC",
      ).all<Row>()
    ).results.map(assignmentFrom),
  ),
);
platform.post("/admin/assignments", async (c) => {
  const b = await c.req.json();
  const userIds = ids(b.userIds);
  const groupIds = ids(b.groupIds);
  const test = await c.env.DB.prepare(
    "SELECT * FROM tests WHERE id=? AND status='published'",
  )
    .bind(b.testId)
    .first<Row>();
  if (!test) fail("公開中のテストを選択してください");
  const members = await c.env.DB.prepare(
    "SELECT * FROM group_members",
  ).all<Row>();
  const targets = [
    ...new Set([
      ...userIds,
      ...members.results
        .filter((m) => groupIds.includes(String(m.group_id)))
        .map((m) => String(m.user_id)),
    ]),
  ];
  if (!targets.length || targets.length > 500)
    fail("対象者は1〜500人で指定してください");
  const users = await c.env.DB.prepare(
    "SELECT id FROM users WHERE status='active'",
  ).all<Row>();
  if (targets.some((id) => !users.results.some((u) => u.id === id)))
    fail("停止中または存在しないユーザーが含まれています");
  const max = integer(b.maxAttempts, 1, 20);
  const due = b.dueAt ? new Date(b.dueAt) : null;
  if (due && (!Number.isFinite(due.getTime()) || due.getTime() <= Date.now()))
    fail("期限は未来の日時を指定してください");
  const result = await c.env.DB.batch(
    targets.map((uid) =>
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO assignments VALUES (?,?,?,?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        test.id,
        uid,
        JSON.stringify(testFrom(test)),
        due?.toISOString() || null,
        max,
        new Date().toISOString(),
      ),
    ),
  );
  return c.json({ count: result.reduce((s, r) => s + r.meta.changes, 0) }, 201);
});
platform.put("/admin/assignments/:id", async (c) => {
  const b = await c.req.json();
  const due = b.dueAt ? new Date(b.dueAt) : null;
  if (due && (!Number.isFinite(due.getTime()) || due.getTime() <= Date.now()))
    fail("期限は未来の日時を指定してください");
  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM attempts WHERE assignment_id=?",
  )
    .bind(c.req.param("id"))
    .first<{ n: number }>();
  const max = integer(b.maxAttempts, Math.max(1, count?.n || 0), 20);
  const r = await c.env.DB.prepare(
    "UPDATE assignments SET due_at=?,max_attempts=? WHERE id=?",
  )
    .bind(due?.toISOString() || null, max, c.req.param("id"))
    .run();
  if (!r.meta.changes) fail("割り当てが見つかりません", 404);
  return c.json({ ok: true });
});
platform.get("/assignments", async (c) =>
  c.json(
    (
      await c.env.DB.prepare(
        assignmentSQL + " WHERE a.user_id=? ORDER BY a.created_at DESC",
      )
        .bind(c.get("user").id)
        .all<Row>()
    ).results.map(assignmentFrom),
  ),
);
platform.post("/assignments/:id/start", async (c) => {
  const a = await c.env.DB.prepare(
    "SELECT a.*,t.status AS test_status FROM assignments a JOIN tests t ON t.id=a.test_id WHERE a.id=? AND a.user_id=?",
  )
    .bind(c.req.param("id"), c.get("user").id)
    .first<Row>();
  if (!a) fail("割り当てが見つかりません", 404);
  if (
    a.test_status !== "published" ||
    (a.due_at && Date.parse(String(a.due_at)) < Date.now())
  )
    fail("テストは終了または期限切れです", 409);
  const existing = await c.env.DB.prepare(
    "SELECT id FROM attempts WHERE assignment_id=? AND status='in_progress'",
  )
    .bind(a.id)
    .first<Row>();
  if (existing) return c.json({ id: existing.id });
  const id = crypto.randomUUID();
  const test = JSON.parse(String(a.snapshot)) as TestDefinition;
  const r = await c.env.DB.prepare(
    `INSERT INTO attempts (id,assignment_id,status,total,started_at)
    SELECT ?,?,'in_progress',?,? WHERE (SELECT COUNT(*) FROM attempts WHERE assignment_id=?) < ?
    AND NOT EXISTS(SELECT 1 FROM attempts WHERE assignment_id=? AND status='in_progress')`,
  )
    .bind(
      id,
      a.id,
      test.questions.reduce((s, q) => s + q.points, 0),
      new Date().toISOString(),
      a.id,
      a.max_attempts,
      a.id,
    )
    .run();
  if (!r.meta.changes) fail("受験回数の上限です。再読み込みしてください", 409);
  return c.json({ id }, 201);
});
const attemptSQL =
  "SELECT p.*,a.user_id,a.snapshot,a.due_at,t.status AS test_status,u.name AS user_name FROM attempts p JOIN assignments a ON a.id=p.assignment_id JOIN tests t ON t.id=a.test_id JOIN users u ON u.id=a.user_id";
// Time limits are enforced on the server. Late requests can only submit saved answers.
async function settleExpired(db: D1Database, r: Row): Promise<Row> {
  const t = JSON.parse(String(r.snapshot)) as TestDefinition;
  if (
    r.status !== "in_progress" ||
    !t.timeLimitMinutes ||
    Date.now() < Date.parse(String(r.started_at)) + t.timeLimitMinutes * 60000
  )
    return r;
  const answers = JSON.parse(String(r.answers));
  const score = t.questions.reduce(
    (sum, q) => sum + (answers[q.id] === q.answer ? q.points : 0),
    0,
  );
  await db
    .prepare(
      "UPDATE attempts SET status='submitted',score=?,passed=?,submitted_at=? WHERE id=? AND status='in_progress' AND answers=?",
    )
    .bind(
      score,
      (score / Number(r.total)) * 100 >= t.passPercent ? 1 : 0,
      new Date().toISOString(),
      r.id,
      r.answers,
    )
    .run();
  const updated = (await db
    .prepare(attemptSQL + " WHERE p.id=?")
    .bind(r.id)
    .first<Row>())!;
  // A save that completed just before expiry may have changed the answers we read.
  return updated.status === 'in_progress' ? settleExpired(db, updated) : updated;
}
const attemptFrom = (r: Row) => {
  const t = JSON.parse(String(r.snapshot)) as TestDefinition;
  return {
    id: r.id,
    assignmentId: r.assignment_id,
    title: t.title,
    userName: r.user_name,
    status: r.status,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
    endsAt: t.timeLimitMinutes
      ? new Date(
          Date.parse(String(r.started_at)) + t.timeLimitMinutes * 60000,
        ).toISOString()
      : null,
    answers: JSON.parse(String(r.answers)),
    score: r.score,
    total: r.total,
    passed: r.passed === null ? null : r.passed === 1,
    questions: t.questions.map((q) =>
      r.status === "submitted" || t.mode === "practice"
        ? q
        : {
            id: q.id,
            text: q.text,
            choices: q.choices,
            points: q.points,
            category: q.category,
          },
    ),
  };
};
platform.get("/attempts", async (c) => {
  const rows = (
    await c.env.DB.prepare(
      attemptSQL + " WHERE a.user_id=? ORDER BY p.started_at DESC",
    )
      .bind(c.get("user").id)
      .all<Row>()
  ).results;
  return c.json(
    (await Promise.all(rows.map((r) => settleExpired(c.env.DB, r)))).map(
      attemptFrom,
    ),
  );
});
platform.get("/admin/results", async (c) => {
  const rows = (
    await c.env.DB.prepare(
      attemptSQL + " ORDER BY p.started_at DESC",
    ).all<Row>()
  ).results;
  return c.json(
    (await Promise.all(rows.map((r) => settleExpired(c.env.DB, r))))
      .filter((r) => r.status === "submitted")
      .map(attemptFrom),
  );
});
platform.get("/attempts/:id", async (c) => {
  const r = await c.env.DB.prepare(attemptSQL + " WHERE p.id=? AND a.user_id=?")
    .bind(c.req.param("id"), c.get("user").id)
    .first<Row>();
  if (!r) fail("受験が見つかりません", 404);
  return c.json(attemptFrom(await settleExpired(c.env.DB, r)));
});
platform.put("/attempts/:id", async (c) => {
  let r = await c.env.DB.prepare(attemptSQL + " WHERE p.id=? AND a.user_id=?")
    .bind(c.req.param("id"), c.get("user").id)
    .first<Row>();
  if (!r) fail("受験が見つかりません", 404);
  const wasOpen = r.status === "in_progress";
  r = await settleExpired(c.env.DB, r);
  if (wasOpen && r.status === "submitted") return c.json(attemptFrom(r));
  const b = await c.req.json();
  if (r.status === "submitted")
    return b.submit === true
      ? c.json(attemptFrom(r))
      : fail("提出済みです", 409);
  if (
    r.test_status !== "published" ||
    (r.due_at && Date.parse(String(r.due_at)) < Date.now())
  )
    fail(
      "テストは終了または期限切れです。管理者に期限延長を依頼してください",
      409,
    );
  const t = JSON.parse(String(r.snapshot)) as TestDefinition;
  if (
    !b.answers ||
    typeof b.answers !== "object" ||
    Array.isArray(b.answers) ||
    Object.entries(b.answers).some(
      ([k, v]) =>
        !t.questions.some((q) => q.id === k) ||
        !Number.isInteger(v) ||
        Number(v) < 0 ||
        Number(v) > 3,
    )
  )
    fail("回答形式が不正です");
  const submit = b.submit === true;
  const score = t.questions.reduce(
    (s, q) => s + (b.answers[q.id] === q.answer ? q.points : 0),
    0,
  );
  const deadline = t.timeLimitMinutes ? new Date(Date.parse(String(r.started_at)) + t.timeLimitMinutes * 60000).toISOString() : null;
  const saved = await c.env.DB.prepare(
    `UPDATE attempts SET answers=?,status=?,score=?,passed=?,submitted_at=? WHERE id=? AND status='in_progress'
      AND (? IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ','now') < ?)
      AND EXISTS (SELECT 1 FROM assignments a JOIN tests t ON t.id=a.test_id WHERE a.id=attempts.assignment_id
        AND t.status='published' AND (a.due_at IS NULL OR a.due_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
  )
    .bind(
      JSON.stringify(b.answers),
      submit ? "submitted" : "in_progress",
      submit ? score : null,
      submit
        ? (score / Number(r.total)) * 100 >= t.passPercent
          ? 1
          : 0
        : null,
      submit ? new Date().toISOString() : null,
      r.id,
      deadline,
      deadline,
    )
    .run();
  const updated = await c.env.DB.prepare(attemptSQL + " WHERE p.id=?")
    .bind(r.id)
    .first<Row>();
  const settled = await settleExpired(c.env.DB, updated!);
  if (!saved.meta.changes && settled.status === 'in_progress') fail('期限またはテストの状態が変更されました。管理者に確認してください',409);
  return c.json(attemptFrom(settled));
});
