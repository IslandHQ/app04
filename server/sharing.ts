import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { PlatformEnv } from "./platform";
const app = new Hono<PlatformEnv>();
function fail(message: string, status: 400 | 403 = 400): never {
  throw new HTTPException(status, { message });
}
const required = (v: unknown, max = 500) =>
  typeof v === "string" && v.trim() && v.length <= max
    ? v.trim()
    : fail("必須項目・文字数を確認してください");
app.onError((e, c) =>
  c.json(
    {
      error:
        e instanceof HTTPException ? e.message : "教材を保存できませんでした",
    },
    e instanceof HTTPException ? e.status : 500,
  ),
);
app.get("/sharing-groups", async (c) => {
  const user = c.get("user");
  const r = await c.env.DB.prepare(
    "SELECT id,name FROM groups WHERE ?='admin' OR id IN (SELECT group_id FROM group_members WHERE user_id=?) ORDER BY name",
  )
    .bind(user.role, user.id)
    .all();
  return c.json(r.results);
});
app.get("/custom_drills", async (c) => {
  const user = c.get("user");
  const r = await c.env.DB.prepare(
    `SELECT d.* FROM custom_drill_sets d WHERE d.user_id=? OR d.is_public=1 OR EXISTS(SELECT 1 FROM custom_drill_groups g JOIN group_members m ON m.group_id=g.group_id WHERE g.drill_id=d.id AND m.user_id=?) ORDER BY d.created_at DESC`,
  )
    .bind(user.id, user.id)
    .all<{
      id: string;
      user_id: string;
      questions: string;
      is_public: number;
      created_at: string;
    }>();
  const groups = (
    await c.env.DB.prepare(
      "SELECT g.* FROM custom_drill_groups g JOIN custom_drill_sets d ON d.id=g.drill_id WHERE d.user_id=?",
    )
      .bind(user.id)
      .all<{ drill_id: string; group_id: string }>()
  ).results;
  return c.json(
    r.results.map((d) => ({
      ...d,
      createdAt: Date.parse(d.created_at),
      questions: JSON.parse(d.questions),
      is_public: d.is_public === 1,
      groupIds: groups
        .filter((g) => g.drill_id === d.id)
        .map((g) => g.group_id),
    })),
  );
});
app.post("/custom_drills", async (c) => {
  const user = c.get("user"),
    b = await c.req.json(),
    id = required(b.id, 100),
    title = required(b.title),
    subject = required(b.subject),
    topic = required(b.topic);
  if (
    !Array.isArray(b.questions) ||
    !b.questions.length ||
    b.questions.length > 100
  )
    fail("問題は1〜100問です");
  const questions = b.questions.map((q: Record<string, unknown>) => {
    if (!q || !Array.isArray(q.choices) || q.choices.length !== 4)
      fail("4択の問題を入力してください");
    const choices = q.choices.map((s: unknown) => required(s, 2000)),
      correctAnswer = required(q.correctAnswer, 2000);
    if (!choices.includes(correctAnswer))
      fail("正解は選択肢と一致させてください");
    return {
      subject,
      topic,
      questionText: required(q.questionText, 5000),
      choices,
      correctAnswer,
      explanation:
        typeof q.explanation === "string" ? q.explanation.slice(0, 5000) : "",
      hint1: typeof q.hint1 === "string" ? q.hint1.slice(0, 3000) : "",
      hint2: typeof q.hint2 === "string" ? q.hint2.slice(0, 3000) : "",
    };
  });
  const selected = b.is_public ? [] : b.groupIds || [];
  if (
    !Array.isArray(selected) ||
    selected.length > 50 ||
    selected.some((id) => typeof id !== "string")
  )
    fail("共有グループを確認してください");
  const allowed = (
    await c.env.DB.prepare(
      "SELECT id FROM groups WHERE ?='admin' OR id IN (SELECT group_id FROM group_members WHERE user_id=?)",
    )
      .bind(user.role, user.id)
      .all<{ id: string }>()
  ).results;
  if (selected.some((id) => !allowed.some((g) => g.id === id)))
    fail("所属しているグループにのみ共有できます", 403);
  const existing = await c.env.DB.prepare(
    "SELECT user_id FROM custom_drill_sets WHERE id=?",
  )
    .bind(id)
    .first<{ user_id: string }>();
  if (existing && existing.user_id !== user.id)
    fail("他の人の教材は変更できません", 403);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO custom_drill_sets(id,user_id,title,subject,topic,questions,is_public,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,subject=excluded.subject,topic=excluded.topic,questions=excluded.questions,is_public=excluded.is_public WHERE custom_drill_sets.user_id=excluded.user_id`,
    ).bind(
      id,
      user.id,
      title,
      subject,
      topic,
      JSON.stringify(questions),
      b.is_public ? 1 : 0,
      new Date().toISOString(),
    ),
    c.env.DB.prepare(
      "DELETE FROM custom_drill_groups WHERE drill_id=? AND EXISTS(SELECT 1 FROM custom_drill_sets WHERE id=? AND user_id=?)",
    ).bind(id, id, user.id),
    ...([...new Set(selected)] as string[]).map((group) =>
      c.env.DB.prepare(
        "INSERT INTO custom_drill_groups SELECT ?,? WHERE EXISTS(SELECT 1 FROM custom_drill_sets WHERE id=? AND user_id=?)",
      ).bind(id, group, id, user.id),
    ),
  ]);
  return c.json({ ok: true });
});
app.delete("/custom_drills/:id", async (c) => {
  const result = await c.env.DB.prepare(
    "DELETE FROM custom_drill_sets WHERE id=? AND user_id=?",
  )
    .bind(c.req.param("id"), c.get("user").id)
    .run();
  if (!result.meta.changes) fail("自分の教材だけ削除できます", 403);
  return c.json({ ok: true });
});
export const sharing = app;
