import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { PlatformEnv } from "./platform";
import type { LearningDrill, LearningQuestion } from "../shared/drills";
type Row = Record<string, string | number | null>;
function fail(message: string, status: 400 | 403 | 404 | 409 = 400): never {
  throw new HTTPException(status, { message });
}
const text = (v: unknown, max = 500) =>
  typeof v === "string" && v.length <= max
    ? v.trim()
    : fail("入力内容を確認してください");
const required = (v: unknown, max = 500) =>
  text(v, max) || fail("必須項目が空欄です");
const ids = (v: unknown): string[] =>
  Array.isArray(v) && v.length <= 500 && v.every((x) => typeof x === "string")
    ? [...new Set(v)]
    : fail("選択内容が不正です");
const number = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && Number(v) >= min && Number(v) <= max
    ? Number(v)
    : fail("数値の範囲が不正です");
function validateQuestions(value: unknown): LearningQuestion[] {
  if (!Array.isArray(value) || value.length > 100) fail("問題は100問までです");
  const result = value.map((q) => {
    if (!q || typeof q !== "object") fail("問題形式が不正です");
    const id = required(q.id);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) fail("問題IDが不正です");
    if (!Array.isArray(q.choices) || q.choices.length !== 4)
      fail("選択肢は4つ必要です");
    return {
      id,
      text: required(q.text, 5000),
      choices: q.choices.map((s: unknown) => required(s, 2000)),
      answer: number(q.answer, 0, 3),
      points: 1,
      explanation: text(q.explanation || "", 5000),
      category: text(q.category || ""),
      hint1: text(q.hint1 || "", 3000),
      hint2: text(q.hint2 || "", 3000),
    };
  });
  if (new Set(result.map((q) => q.id)).size !== result.length)
    fail("問題IDが重複しています");
  return result;
}
const librarySQL = `SELECT d.*,u.course_id,u.subject,u.name AS unit_name,c.name AS course_name
 FROM learning_drills d JOIN drill_units u ON u.id=d.unit_id JOIN courses c ON c.id=u.course_id`;
function drillFrom(r: Row): LearningDrill {
  return {
    id: String(r.id),
    unitId: String(r.unit_id),
    title: String(r.title),
    courseId: String(r.course_id),
    courseName: String(r.course_name),
    subject: String(r.subject),
    unitName: String(r.unit_name),
    status: r.status as LearningDrill["status"],
    targetCount: Number(r.target_count),
    questions: JSON.parse(String(r.questions)),
    questionCount: JSON.parse(String(r.questions)).length,
    createdAt: String(r.created_at),
  };
}
export const drills = new Hono<PlatformEnv>();
drills.onError((e, c) => {
  if (e instanceof HTTPException) return c.json({ error: e.message }, e.status);
  if (String(e).includes("UNIQUE constraint"))
    return c.json(
      { error: "同時に更新されました。再読み込みしてください" },
      409,
    );
  console.error(e);
  return c.json({ error: "処理に失敗しました" }, 500);
});
drills.use("/admin/*", async (c, next) => {
  if (c.get("user").role !== "admin")
    return c.json({ error: "管理者権限が必要です" }, 403);
  await next();
});
drills.get("/admin/drill-units", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT u.*,c.name AS course_name FROM drill_units u JOIN courses c ON c.id=u.course_id ORDER BY c.name,u.subject,u.sort_order,u.name",
  ).all<Row>();
  return c.json(
    rows.results.map((r) => ({
      id: r.id,
      courseId: r.course_id,
      courseName: r.course_name,
      subject: r.subject,
      name: r.name,
      sortOrder: r.sort_order,
    })),
  );
});
drills.put("/admin/drill-units/:id", async (c) => {
  const b = await c.req.json();
  const result = await c.env.DB.prepare(
    "UPDATE drill_units SET subject=?,name=? WHERE id=?",
  )
    .bind(required(b.subject), required(b.name), c.req.param("id"))
    .run();
  if (!result.meta.changes) fail("単元が見つかりません", 404);
  return c.json({ ok: true });
});

drills.post("/admin/drill-units/bulk", async (c) => {
  const b = await c.req.json();
  if (
    !(await c.env.DB.prepare("SELECT id FROM courses WHERE id=?")
      .bind(b.courseId)
      .first())
  )
    fail("コースを選択してください");
  if (!Array.isArray(b.units) || !b.units.length || b.units.length > 200)
    fail("単元は1〜200件で指定してください");
  const rows = b.units.map(
    (u: { subject: unknown; name: unknown }, i: number) => ({
      id: crypto.randomUUID(),
      subject: required(u.subject),
      name: required(u.name),
      order: i,
    }),
  );
  const r = await c.env.DB.batch(
    rows.map(
      (u: { id: string; subject: string; name: string; order: number }) =>
        c.env.DB.prepare(
          "INSERT OR IGNORE INTO drill_units VALUES (?,?,?,?,?)",
        ).bind(u.id, b.courseId, u.subject, u.name, u.order),
    ),
  );
  return c.json({ count: r.reduce((s, x) => s + x.meta.changes, 0) }, 201);
});
drills.get("/admin/drills", async (c) => {
  const rows = await c.env.DB.prepare(
    librarySQL + " ORDER BY d.created_at DESC,d.id",
  ).all<Row>();
  return c.json(
    rows.results.map((r) => {
      const d = drillFrom(r);
      return { ...d, questions: [] };
    }),
  );
});
drills.get("/admin/drills/:id", async (c) => {
  const r = await c.env.DB.prepare(librarySQL + " WHERE d.id=?")
    .bind(c.req.param("id"))
    .first<Row>();
  if (!r) fail("ドリルが見つかりません", 404);
  return c.json(drillFrom(r));
});
drills.post("/admin/drills/bulk", async (c) => {
  const b = await c.req.json();
  const unitIds = ids(b.unitIds);
  const sets = number(b.setsPerUnit, 1, 10);
  const count = number(b.questionCount, 1, 20);
  if (!unitIds.length || unitIds.length * sets > 100)
    fail("1回の作成は1〜100ドリルです");
  const units = (
    await c.env.DB.prepare("SELECT id,name FROM drill_units").all<Row>()
  ).results;
  if (unitIds.some((id) => !units.some((u) => u.id === id)))
    fail("単元が見つかりません");
  const created = unitIds.flatMap((id) =>
    Array.from({ length: sets }, (_, i) => ({
      id: crypto.randomUUID(),
      unitId: id,
      title: `${units.find((u) => u.id === id)!.name} · ${text(b.titlePrefix || "練習", 100)}${i + 1}`,
    })),
  );
  await c.env.DB.batch(
    created.map((d) =>
      c.env.DB.prepare(
        "INSERT INTO learning_drills(id,unit_id,title,target_count,created_at) VALUES (?,?,?,?,?)",
      ).bind(d.id, d.unitId, d.title, count, new Date().toISOString()),
    ),
  );
  return c.json(created, 201);
});
drills.put("/admin/drills/:id", async (c) => {
  const b = await c.req.json();
  const qs = validateQuestions(b.questions);
  const id = c.req.param("id");
  if (
    !(await c.env.DB.prepare("SELECT id FROM drill_units WHERE id=?")
      .bind(b.unitId)
      .first())
  )
    fail("単元を選択してください");
  const r = await c.env.DB.prepare(
    "UPDATE learning_drills SET title=?,unit_id=?,questions=?,target_count=? WHERE id=? AND status='draft'",
  )
    .bind(
      required(b.title),
      b.unitId,
      JSON.stringify(qs),
      number(b.targetCount || 5, 1, 100),
      id,
    )
    .run();
  if (!r.meta.changes)
    fail("下書きだけ編集できます。公開済みの場合は複製してください", 409);
  return c.json({ ok: true });
});
drills.post("/admin/drills/actions", async (c) => {
  const b = await c.req.json();
  const selected = ids(b.ids);
  if (!selected.length || selected.length > 100)
    fail("1〜100件を選択してください");
  const all = (await c.env.DB.prepare(librarySQL).all<Row>()).results;
  const rows = selected.map(
    (id) => all.find((r) => r.id === id) || fail("ドリルが見つかりません", 404),
  );
  if (b.action === "duplicate") {
    await c.env.DB.batch(
      rows.map((r) =>
        c.env.DB.prepare(
          "INSERT INTO learning_drills(id,unit_id,title,questions,target_count,created_at) VALUES (?,?,?,?,?,?)",
        ).bind(
          crypto.randomUUID(),
          r.unit_id,
          String(r.title) + "（コピー）",
          r.questions,
          r.target_count,
          new Date().toISOString(),
        ),
      ),
    );
  } else if (b.action === "publish") {
    for (const r of rows) {
      if (
        r.status !== "draft" ||
        !validateQuestions(JSON.parse(String(r.questions))).length
      )
        fail(
          "問題のある下書きだけ公開できます。空のドリルや公開済みが含まれています",
        );
    }
    const published = await c.env.DB.batch(
      rows.map((r) =>
        c.env.DB.prepare(
          "UPDATE learning_drills SET status='published' WHERE id=? AND status='draft' AND questions=?",
        ).bind(r.id, r.questions),
      ),
    );
    if (published.some((r) => !r.meta.changes))
      fail("更新が競合しました。公開状態を再読み込みして確認してください", 409);
  } else if (b.action === "archive") {
    await c.env.DB.batch(
      rows.map((r) =>
        c.env.DB.prepare(
          "UPDATE learning_drills SET status='archived' WHERE id=?",
        ).bind(r.id),
      ),
    );
  } else fail("操作が不正です");
  return c.json({ count: rows.length });
});

const assignmentSQL = `SELECT a.*,u.name AS user_name,
 (SELECT COUNT(*) FROM drill_sessions s WHERE s.assignment_id=a.id AND s.completed=1 AND s.mode='all') AS completed_count,
 (SELECT s.id FROM drill_sessions s WHERE s.assignment_id=a.id AND s.completed=0) AS current_session_id,
 (SELECT COUNT(*) FROM drill_answers da JOIN drill_sessions s ON s.id=da.session_id WHERE s.assignment_id=a.id AND s.completed=0) AS answered_count,
 COALESCE((SELECT MAX(n) FROM (SELECT SUM(da.correct) AS n FROM drill_answers da JOIN drill_sessions s ON s.id=da.session_id WHERE s.assignment_id=a.id AND s.mode='all' GROUP BY s.id)),0) AS best_correct
 FROM drill_assignments a JOIN users u ON u.id=a.user_id`;
function assignmentFrom(r: Row) {
  const d = JSON.parse(String(r.snapshot)) as LearningDrill;
  return {
    id: r.id,
    drillId: r.drill_id,
    userId: r.user_id,
    userName: r.user_name,
    title: d.title,
    courseId: d.courseId,
    courseName: d.courseName,
    subject: d.subject,
    unitName: d.unitName,
    targetDate: r.target_date,
    questionCount: d.questions.length,
    completedCount: Number(r.completed_count),
    answeredCount: Number(r.answered_count),
    bestCorrect: Number(r.best_correct),
    currentSessionId: r.current_session_id,
    active: r.active === 1,
  };
}
drills.get("/admin/drill-assignments", async (c) =>
  c.json(
    (
      await c.env.DB.prepare(
        assignmentSQL + " ORDER BY a.created_at DESC",
      ).all<Row>()
    ).results.map(assignmentFrom),
  ),
);
drills.post("/admin/drill-assignments", async (c) => {
  const b = await c.req.json();
  const drillIds = ids(b.drillIds);
  const userIds = ids(b.userIds);
  const groupIds = ids(b.groupIds);
  if (!drillIds.length || drillIds.length > 100)
    fail("公開中のドリルを1〜100件選択してください");
  const all = (
    await c.env.DB.prepare(
      librarySQL + " WHERE d.status='published'",
    ).all<Row>()
  ).results;
  const chosen = drillIds.map(
    (id) =>
      all.find((r) => r.id === id) || fail("公開中のドリルだけ配布できます"),
  );
  const members = (
    await c.env.DB.prepare("SELECT * FROM group_members").all<Row>()
  ).results;
  const targetIds = [
    ...new Set([
      ...userIds,
      ...members
        .filter((m) => groupIds.includes(String(m.group_id)))
        .map((m) => String(m.user_id)),
    ]),
  ];
  const active = (
    await c.env.DB.prepare(
      "SELECT id FROM users WHERE status='active'",
    ).all<Row>()
  ).results;
  const targets = targetIds.filter((id) => active.some((u) => u.id === id));
  if (!targets.length || targets.length * chosen.length > 1000)
    fail("対象者を選択してください。1回の配布は合計1,000件までです");
  const targetDate = b.targetDate ? required(b.targetDate) : null;
  if (
    targetDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) ||
      !Number.isFinite(Date.parse(targetDate)))
  )
    fail("目標日が不正です");
  const results = await c.env.DB.batch(
    targets.flatMap((uid) =>
      chosen.map((d) =>
        c.env.DB.prepare(
          `INSERT INTO drill_assignments(id,drill_id,user_id,snapshot,target_date,created_at) VALUES(?,?,?,?,?,?)
 ON CONFLICT(drill_id,user_id) DO UPDATE SET active=1,target_date=excluded.target_date WHERE drill_assignments.active=0`,
        ).bind(
          crypto.randomUUID(),
          d.id,
          uid,
          JSON.stringify(drillFrom(d)),
          targetDate,
          new Date().toISOString(),
        ),
      ),
    ),
  );
  return c.json(
    {
      count: results.reduce((s, r) => s + r.meta.changes, 0),
      skippedUsers: targetIds.length - targets.length,
    },
    201,
  );
});
drills.post("/admin/drill-assignments/actions", async (c) => {
  const b = await c.req.json();
  const selected = ids(b.ids);
  if (!selected.length) fail("対象を選択してください");
  if (b.action !== "withdraw" && b.action !== "date") fail("操作が不正です");
  const d = b.targetDate ? required(b.targetDate) : null;
  if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d))))
    fail("目標日が不正です");
  await c.env.DB.batch(
    selected.map((id) =>
      b.action === "withdraw"
        ? c.env.DB.prepare(
            "UPDATE drill_assignments SET active=0 WHERE id=?",
          ).bind(id)
        : c.env.DB.prepare(
            "UPDATE drill_assignments SET target_date=? WHERE id=?",
          ).bind(d, id),
    ),
  );
  return c.json({ ok: true });
});
drills.get("/drill-assignments", async (c) =>
  c.json(
    (
      await c.env.DB.prepare(
        assignmentSQL +
          " WHERE a.user_id=? AND a.active=1 ORDER BY a.target_date IS NULL,a.target_date,a.created_at",
      )
        .bind(c.get("user").id)
        .all<Row>()
    ).results.map(assignmentFrom),
  ),
);
drills.post("/drill-assignments/:id/start", async (c) => {
  const a = await c.env.DB.prepare(
    "SELECT * FROM drill_assignments WHERE id=? AND user_id=? AND active=1",
  )
    .bind(c.req.param("id"), c.get("user").id)
    .first<Row>();
  if (!a) fail("割り当てが見つかりません", 404);
  const open = await c.env.DB.prepare(
    "SELECT id FROM drill_sessions WHERE assignment_id=? AND completed=0",
  )
    .bind(a.id)
    .first<Row>();
  if (open) return c.json({ id: open.id });
  const b = await c.req.json().catch(() => ({ mode: "all" }));
  const mode = b.mode === "mistakes" ? "mistakes" : "all";
  const snapshot = JSON.parse(String(a.snapshot)) as LearningDrill;
  if (mode === "mistakes") {
    const last = await c.env.DB.prepare(
      "SELECT id FROM drill_sessions WHERE assignment_id=? AND completed=1 ORDER BY started_at DESC,rowid DESC LIMIT 1",
    )
      .bind(a.id)
      .first<Row>();
    if (!last) fail("先にドリルを最後まで解いてください");
    const wrong = (
      await c.env.DB.prepare(
        "SELECT question_id FROM drill_answers WHERE session_id=? AND correct=0",
      )
        .bind(last.id)
        .all<Row>()
    ).results;
    snapshot.questions = snapshot.questions.filter((q) =>
      wrong.some((w) => w.question_id === q.id),
    );
    if (!snapshot.questions.length) fail("間違えた問題はありません");
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO drill_sessions(id,assignment_id,snapshot,mode,started_at) VALUES(?,?,?,?,?)",
  )
    .bind(id, a.id, JSON.stringify(snapshot), mode, new Date().toISOString())
    .run();
  return c.json({ id }, 201);
});
const sessionSQL =
  "SELECT s.* FROM drill_sessions s JOIN drill_assignments a ON a.id=s.assignment_id WHERE s.id=? AND a.user_id=? AND a.active=1";
async function sessionView(db: D1Database, r: Row) {
  const d = JSON.parse(String(r.snapshot)) as LearningDrill;
  const rows = (
    await db
      .prepare("SELECT * FROM drill_answers WHERE session_id=?")
      .bind(r.id)
      .all<Row>()
  ).results;
  return {
    id: r.id,
    assignmentId: r.assignment_id,
    title: d.title,
    courseName: d.courseName,
    subject: d.subject,
    unitName: d.unitName,
    mode: r.mode,
    completed: r.completed === 1,
    answers: Object.fromEntries(
      rows.map((a) => [
        a.question_id,
        { choice: Number(a.choice), correct: a.correct === 1 },
      ]),
    ),
    questions: d.questions.map((q) =>
      rows.some((a) => a.question_id === q.id)
        ? q
        : {
            id: q.id,
            text: q.text,
            choices: q.choices,
            points: 1,
            category: q.category,
            hint1: q.hint1,
            hint2: q.hint2,
          },
    ),
  };
}
drills.get("/drill-sessions/:id", async (c) => {
  const r = await c.env.DB.prepare(sessionSQL)
    .bind(c.req.param("id"), c.get("user").id)
    .first<Row>();
  if (!r) fail("学習記録が見つかりません", 404);
  return c.json(await sessionView(c.env.DB, r));
});
drills.post("/drill-sessions/:id/answer", async (c) => {
  const uid = c.get("user").id;
  const id = c.req.param("id");
  const r = await c.env.DB.prepare(sessionSQL).bind(id, uid).first<Row>();
  if (!r) fail("学習記録が見つかりません", 404);
  const b = await c.req.json();
  const d = JSON.parse(String(r.snapshot)) as LearningDrill;
  const q = d.questions.find((q) => q.id === b.questionId);
  if (!q) fail("問題が見つかりません");
  const choice = number(b.choice, 0, 3);
  const correct = choice === q.answer ? 1 : 0;
  const gain = correct ? 10 : 2;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const last = await c.env.DB.prepare(
    "SELECT MAX(answered_at) AS at FROM drill_answers WHERE session_id=?",
  )
    .bind(id)
    .first<Row>();
  const seconds = Math.max(
    1,
    Math.min(
      1800,
      Math.round(
        (Date.now() - Date.parse(String(last?.at || r.started_at))) / 1000,
      ),
    ),
  );
  // One atomic batch: retries and concurrent clicks must not award duplicate XP.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE users SET exp=CASE WHEN exp+? >= level*50 THEN exp+?-level*50 ELSE exp+? END,
    level=level+CASE WHEN exp+? >= level*50 THEN 1 ELSE 0 END,
    streak=CASE WHEN last_study_date=? THEN streak WHEN last_study_date=? THEN streak+1 ELSE 1 END,last_study_date=?
    WHERE id=? AND NOT EXISTS(SELECT 1 FROM drill_answers WHERE session_id=? AND question_id=?)`,
    ).bind(gain, gain, gain, gain, today, yesterday, today, uid, id, q.id),
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO drill_answers VALUES (?,?,?,?,?,?)",
    ).bind(id, q.id, choice, correct, seconds, now),
    c.env.DB.prepare(
      "UPDATE drill_sessions SET completed=1 WHERE id=? AND (SELECT COUNT(*) FROM drill_answers WHERE session_id=?) >= ?",
    ).bind(id, id, d.questions.length),
  ]);
  const updated = await c.env.DB.prepare(sessionSQL).bind(id, uid).first<Row>();
  return c.json(await sessionView(c.env.DB, updated!));
});
