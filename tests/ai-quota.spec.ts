import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import type { PlatformEnv } from "../server/platform";
import { aiProvider, keyCipher } from "../server/ai-provider";
test("AI requests reserve quota atomically, enforce concurrency and never switch providers", async () => {
  const db = new DatabaseSync(":memory:");
  for (const file of [
    "0000_existing_schema.sql",
    "0001_admin_platform.sql",
    "0002_test_time_limit.sql",
    "0003_learning_drills.sql",
    "0004_adaptive_ai.sql",
    "0005_sharing_guards.sql",
  ])
    db.exec(readFileSync("migrations/" + file, "utf8"));
  db.exec(
    "INSERT INTO users(id,email,password_hash,name,grade,created_at) VALUES('u','u@example.test','hash','user','','2026-01-01'); INSERT INTO system_settings(id,endpoint,model,api_key,duplicate_prevention_mode) VALUES('default','https://shared.example.test/v1','shared-model','shared-key','seed'); UPDATE ai_policy SET mode='hybrid',daily_limit=10,concurrency_limit=1,total_daily_limit=10;",
  );
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
          return {
            success: true,
            meta: { changes: Number(statement.run(...args).changes) },
          };
        },
      };
      return prepared;
    },
  } as unknown as D1Database;
  const app = new Hono<PlatformEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "u", role: "user" });
    await next();
  });
  app.route("/api", aiProvider);
  const call = () =>
    app.request(
      "http://localhost/api/ai/completion",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "test" }] }),
      },
      { DB: binding },
    );
  const original = globalThis.fetch;
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (entered = r));
  const urls: string[] = [];
  globalThis.fetch = async (url, init) => {
    expect(init?.redirect).toBe("manual");
    urls.push(String(url));
    entered();
    await held;
    return Response.json({
      choices: [{ message: { content: "OK" } }],
      usage: { total_tokens: 8 },
    });
  };
  try {
    const first = call();
    await started;
    expect((await call()).status).toBe(429);
    release();
    expect((await first).status).toBe(200);
    db.exec("UPDATE ai_policy SET daily_limit=1");
    expect((await call()).status).toBe(429);
    expect(urls).toHaveLength(1);
    db.exec("UPDATE ai_policy SET daily_limit=10,total_daily_limit=1");
    expect((await call()).status).toBe(429);
    const encrypted = await keyCipher(
      "personal-key",
      "local-personal-ai-encryption-only",
    );
    db.prepare(
      "INSERT INTO personal_ai VALUES('u','personal','https://personal.example.test/v1','personal-model',?)",
    ).run(encrypted);
    expect((await call()).status).toBe(200);
    expect(urls.at(-1)).toContain("personal.example.test");
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      throw new Error("network");
    };
    expect((await call()).status).toBe(502);
    expect(urls).toHaveLength(3);
    expect(urls[2]).toContain("personal.example.test");
    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM ai_requests WHERE source='shared'")
        .get(),
    ).toMatchObject({ n: 1 });
  } finally {
    release();
    globalThis.fetch = original;
    db.close();
  }
});
