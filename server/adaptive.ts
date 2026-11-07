import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { PlatformEnv } from "./platform";
import {
  estimateSkill,
  hasCycle,
  type Skill,
  type Evidence,
} from "../shared/adaptive";
import type { LearningDrill, LearningQuestion } from "../shared/drills";
function fail(message: string, status: 400 | 403 | 404 | 409 = 400): never {
  throw new HTTPException(status, { message });
}
const str = (v: unknown, max = 500) =>
  typeof v === "string" && v.trim() && v.length <= max
    ? v.trim()
    : fail("必須項目を確認してください");
export const adaptive = new Hono<PlatformEnv>();
adaptive.onError((e, c) =>
  c.json(
    {
      error:
        e instanceof HTTPException ? e.message : "理解度の処理に失敗しました",
    },
    e instanceof HTTPException ? e.status : 500,
  ),
);
adaptive.use("/admin/*", async (c, next) => {
  if (c.get("user").role !== "admin") fail("管理者権限が必要です", 403);
  await next();
});
async function skills(db: D1Database): Promise<Skill[]> {
  const rows = await db
    .prepare("SELECT * FROM learning_skills ORDER BY subject,name")
    .all<{
      id: string;
      subject: string;
      name: string;
      description: string;
      example: string;
      foundation: number;
    }>();
  const edges = await db
    .prepare("SELECT * FROM skill_prerequisites")
    .all<{ skill_id: string; prerequisite_id: string }>();
  const units = await db
    .prepare("SELECT id,skill_id FROM drill_units WHERE skill_id IS NOT NULL")
    .all<{ id: string; skill_id: string }>();
  return rows.results.map((r) => ({
    ...r,
    foundation: !!r.foundation,
    prerequisiteIds: edges.results
      .filter((e) => e.skill_id === r.id)
      .map((e) => e.prerequisite_id),
    unitIds: units.results.filter((u) => u.skill_id === r.id).map((u) => u.id),
  }));
}
adaptive.get("/admin/skills", async (c) => c.json(await skills(c.env.DB)));
adaptive.put("/admin/skills/:id", async (c) => {
  const b = await c.req.json(),
    id = str(c.req.param("id"));
  const all = await skills(c.env.DB);
  if (
    !Array.isArray(b.prerequisiteIds) ||
    b.prerequisiteIds.length > 20 ||
    b.prerequisiteIds.some((p: string) => !all.some((s) => s.id === p)) ||
    !Array.isArray(b.unitIds) ||
    b.unitIds.length > 200
  )
    fail("前提技能・単元を確認してください");
  const edges = new Map(all.map((s) => [s.id, s.prerequisiteIds]));
  edges.set(id, [...new Set(b.prerequisiteIds)] as string[]);
  if (hasCycle(edges))
    fail(
      "前提関係が循環しています。基礎へ一方向にたどれるよう設定してください",
    );
  const units = (
    await c.env.DB.prepare("SELECT id FROM drill_units").all<{ id: string }>()
  ).results;
  if (b.unitIds.some((u: string) => !units.some((x) => x.id === u)))
    fail("単元が見つかりません");
  if (
    typeof b.description !== "string" ||
    b.description.length > 5000 ||
    typeof b.example !== "string" ||
    b.example.length > 5000
  )
    fail("説明は5000文字までです");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO learning_skills(id,subject,name,description,example) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET subject=excluded.subject,name=excluded.name,description=excluded.description,example=excluded.example",
    ).bind(id, str(b.subject), str(b.name), b.description, b.example),
    c.env.DB.prepare("DELETE FROM skill_prerequisites WHERE skill_id=?").bind(
      id,
    ),
    ...([...new Set(b.prerequisiteIds)] as string[]).map((p) =>
      c.env.DB.prepare("INSERT INTO skill_prerequisites VALUES(?,?)").bind(
        id,
        p,
      ),
    ),
    c.env.DB.prepare(
      "UPDATE drill_units SET skill_id=NULL WHERE skill_id=?",
    ).bind(id),
    ...([...new Set(b.unitIds)] as string[]).map((u) =>
      c.env.DB.prepare("UPDATE drill_units SET skill_id=? WHERE id=?").bind(
        id,
        u,
      ),
    ),
  ]);
  return c.json({ ok: true });
});
async function authorizedSkills(db: D1Database, uid: string, all: Skill[]) {
  const assigned = (
    await db
      .prepare(
        "SELECT snapshot FROM drill_assignments WHERE user_id=? AND active=1",
      )
      .bind(uid)
      .all<{ snapshot: string }>()
  ).results;
  const allowed = new Set<string>();
  function include(id: string) {
    if (allowed.has(id)) return;
    allowed.add(id);
    all.find((s) => s.id === id)?.prerequisiteIds.forEach(include);
  }
  all.filter((s) => s.foundation).forEach((s) => include(s.id));
  for (const a of assigned) {
    const d = JSON.parse(a.snapshot) as LearningDrill;
    d.questions.forEach((q) => q.skillIds?.forEach(include));
  }
  return allowed;
}
async function analysis(db: D1Database, uid: string) {
  const all = await skills(db),
    allowed = await authorizedSkills(db, uid, all);
  const rows = (
    await db
      .prepare(
        `SELECT sk.value AS skill_id,json_extract(q.value,'$.text') AS question_text,a.correct,a.answered_at,COALESCE(h.hint_level,0) AS hints FROM drill_answers a JOIN drill_sessions s ON s.id=a.session_id JOIN drill_assignments d ON d.id=s.assignment_id JOIN json_each(s.snapshot,'$.questions') q ON json_extract(q.value,'$.id')=a.question_id JOIN json_each(q.value,'$.skillIds') sk LEFT JOIN drill_support h ON h.session_id=a.session_id AND h.question_id=a.question_id WHERE d.user_id=? ORDER BY a.answered_at`,
      )
      .bind(uid)
      .all<{
        skill_id: string;
        question_text: string;
        correct: number;
        answered_at: string;
        hints: number;
      }>()
  ).results;
  const parsed: Evidence[] = rows.map((r) => ({
    skillId: r.skill_id,
    questionKey: r.question_text.trim().replace(/\s+/g, " "),
    correct: !!r.correct,
    hintLevel: r.hints,
    answeredAt: r.answered_at,
  }));
  const available = (
    await db
      .prepare(
        "SELECT DISTINCT u.skill_id FROM learning_drills d JOIN drill_units u ON u.id=d.unit_id WHERE d.status='published' AND json_array_length(d.questions)>0 AND u.skill_id IS NOT NULL AND EXISTS(SELECT 1 FROM json_each(d.questions) q JOIN json_each(q.value,'$.skillIds') sk WHERE sk.value=u.skill_id)",
      )
      .all<{ skill_id: string }>()
  ).results;
  return all
    .filter((s) => allowed.has(s.id) || parsed.some((e) => e.skillId === s.id))
    .map((s) => ({
      ...s,
      ...estimateSkill(parsed.filter((e) => e.skillId === s.id)),
      practiceAvailable:
        available.some((a) => a.skill_id === s.id) && allowed.has(s.id),
    }));
}
adaptive.get("/understanding", async (c) =>
  c.json(await analysis(c.env.DB, c.get("user").id)),
);
adaptive.get("/admin/understanding/:id", async (c) =>
  c.json(await analysis(c.env.DB, c.req.param("id"))),
);
adaptive.get("/learning-support/:id", async (c) => {
  const r = await c.env.DB.prepare(
    "SELECT s.snapshot FROM drill_sessions s JOIN drill_assignments a ON a.id=s.assignment_id WHERE s.id=? AND a.user_id=? AND a.active=1",
  )
    .bind(c.req.param("id"), c.get("user").id)
    .first<{ snapshot: string }>();
  if (!r) fail("学習が見つかりません", 404);
  const d = JSON.parse(r.snapshot) as LearningDrill;
  const returnTo = await c.env.DB.prepare(
    "SELECT return_session_id FROM learning_returns WHERE user_id=? AND session_id=?",
  )
    .bind(c.get("user").id, c.req.param("id"))
    .first<{ return_session_id: string }>();
  return c.json({
    skillIds: [...new Set(d.questions.flatMap((q) => q.skillIds || []))],
    returnSessionId: returnTo?.return_session_id || null,
  });
});
adaptive.post("/learning-support/:id/hint", async (c) => {
  const r = await c.env.DB.prepare(
    "SELECT s.snapshot FROM drill_sessions s JOIN drill_assignments a ON a.id=s.assignment_id WHERE s.id=? AND a.user_id=? AND a.active=1",
  )
    .bind(c.req.param("id"), c.get("user").id)
    .first<{ snapshot: string }>();
  if (!r) fail("学習が見つかりません", 404);
  const b = await c.req.json(),
    d = JSON.parse(r.snapshot) as LearningDrill;
  if (
    !d.questions.some((q) => q.id === b.questionId) ||
    ![1, 2].includes(b.level)
  )
    fail("ヒントの指定が不正です");
  await c.env.DB.prepare(
    `INSERT INTO drill_support(session_id,question_id,hint_level) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM drill_answers WHERE session_id=? AND question_id=?) ON CONFLICT(session_id,question_id) DO UPDATE SET hint_level=MAX(hint_level,excluded.hint_level)`,
  )
    .bind(
      c.req.param("id"),
      b.questionId,
      b.level,
      c.req.param("id"),
      b.questionId,
    )
    .run();
  return c.json({ ok: true });
});
adaptive.post("/skills/:id/practice", async (c) => {
  const uid = c.get("user").id,
    id = c.req.param("id"),
    all = await skills(c.env.DB);
  if (!(await authorizedSkills(c.env.DB, uid, all)).has(id))
    fail("配布された学習の基礎から選んでください", 403);
  const b = await c.req.json();
  if (b.returnSessionId) {
    const parent = await c.env.DB.prepare(
      "SELECT s.id FROM drill_sessions s JOIN drill_assignments a ON a.id=s.assignment_id WHERE s.id=? AND a.user_id=? AND a.active=1",
    )
      .bind(b.returnSessionId, uid)
      .first();
    if (!parent) fail("元の学習が見つかりません", 404);
  }
  const row = await c.env.DB.prepare(
    `SELECT d.*,u.course_id,u.subject,u.name AS unit_name,c.name AS course_name FROM learning_drills d JOIN drill_units u ON u.id=d.unit_id JOIN courses c ON c.id=u.course_id WHERE u.skill_id=? AND d.status='published' AND json_array_length(d.questions)>0 AND EXISTS(SELECT 1 FROM json_each(d.questions) q JOIN json_each(q.value,'$.skillIds') sk WHERE sk.value=u.skill_id) ORDER BY d.created_at DESC LIMIT 1`,
  )
    .bind(id)
    .first<{
      id: string;
      unit_id: string;
      title: string;
      questions: string;
      target_count: number;
      course_id: string;
      subject: string;
      unit_name: string;
      course_name: string;
      created_at: string;
    }>();
  if (!row) fail("この基礎の問題は準備中です。説明と例を確認してください", 404);
  const snapshot: LearningDrill = {
    id: row.id,
    unitId: row.unit_id,
    title: row.title,
    questions: JSON.parse(row.questions) as LearningQuestion[],
    targetCount: row.target_count,
    questionCount: JSON.parse(row.questions).length,
    courseId: row.course_id,
    subject: row.subject,
    unitName: row.unit_name,
    courseName: row.course_name,
    createdAt: row.created_at,
    status: "published",
  };
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO drill_assignments(id,drill_id,user_id,snapshot,created_at) VALUES(?,?,?,?,?) ON CONFLICT(drill_id,user_id) DO UPDATE SET active=1",
  )
    .bind(crypto.randomUUID(), row.id, uid, JSON.stringify(snapshot), now)
    .run();
  const a = (await c.env.DB.prepare(
    "SELECT id,snapshot FROM drill_assignments WHERE drill_id=? AND user_id=?",
  )
    .bind(row.id, uid)
    .first<{ id: string; snapshot: string }>())!;
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO drill_sessions(id,assignment_id,snapshot,mode,started_at) VALUES(?,?,?,'all',?)",
  )
    .bind(crypto.randomUUID(), a.id, a.snapshot, now)
    .run();
  const open = (await c.env.DB.prepare(
    "SELECT id FROM drill_sessions WHERE assignment_id=? AND completed=0",
  )
    .bind(a.id)
    .first<{ id: string }>())!;
  if (b.returnSessionId && b.returnSessionId !== open.id)
    await c.env.DB.prepare(
      "INSERT INTO learning_returns VALUES(?,?,?) ON CONFLICT(user_id,session_id) DO UPDATE SET return_session_id=excluded.return_session_id",
    )
      .bind(uid, open.id, b.returnSessionId)
      .run();
  return c.json({ id: open.id });
});
