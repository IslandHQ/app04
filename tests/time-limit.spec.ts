import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { platform, type PlatformEnv } from "../server/platform";

test("expired tests submit only saved answers and never accept late answers", async () => {
  const db = new DatabaseSync(":memory:");
  for (const file of [
    "0000_existing_schema.sql",
    "0001_admin_platform.sql",
    "0002_test_time_limit.sql",
  ])
    db.exec(readFileSync(`migrations/${file}`, "utf8"));
  db.exec(
    "INSERT INTO users(id,email,password_hash,name,grade,created_at) VALUES('learner','timer@example.test','hash','受験者','','2026-01-01')",
  );
  const snapshot = {
    id: "test",
    title: "時間制限",
    timeLimitMinutes: 1,
    mode: "exam",
    passPercent: 60,
    questions: [
      {
        id: "q",
        text: "問題",
        choices: ["a", "b", "c", "d"],
        answer: 0,
        points: 10,
        explanation: "解説",
        category: "",
      },
    ],
  };
  db.prepare(
    "INSERT INTO tests(id,title,status,mode,pass_percent,questions,created_at) VALUES('test','時間制限','published','exam',60,?,'2026-01-01')",
  ).run(JSON.stringify(snapshot.questions));
  db.prepare(
    "INSERT INTO assignments(id,test_id,user_id,snapshot,created_at) VALUES('assignment','test','learner',?,'2026-01-01')",
  ).run(JSON.stringify(snapshot));
  // Simulate a session started two minutes ago without making the test wait in real time.
  db.prepare(
    "INSERT INTO attempts(id,assignment_id,status,total,answers,started_at) VALUES('attempt','assignment','in_progress',10,?,?)",
  ).run(JSON.stringify({ q: 1 }), new Date(Date.now() - 120000).toISOString());
  const binding = {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      let args: (string | number | null)[] = [];
      const prepared = {
        bind(...values: (string | number | null)[]) {
          args = values;
          return prepared;
        },
        async first() {
          return statement.get(...args) || null;
        },
        async all() {
          return { results: statement.all(...args) };
        },
        async run() {
          const r = statement.run(...args);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
      };
      return prepared;
    },
  } as unknown as D1Database;
  const app = new Hono<PlatformEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "learner", role: "user" });
    await next();
  });
  app.route("/api/platform", platform);
  const response = await app.request(
    "/api/platform/attempts/attempt",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: { q: 0 }, submit: true }),
    },
    { DB: binding },
  );
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.status).toBe("submitted");
  expect(result.score).toBe(0);
  expect(result.answers).toEqual({ q: 1 });
  const get = await app.request(
    "/api/platform/attempts/attempt",
    {},
    { DB: binding },
  );
  expect((await get.json()).score).toBe(0);
  db.close();
});
