import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { estimateSkill, hasCycle, type Evidence } from "../shared/adaptive";
import { keyCipher, providerEndpoint } from "../server/ai-provider";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const baseURL = "http://127.0.0.1:8790",
  password = "Local-test-only-8790";
let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await request.newContext({ baseURL });
  const r = await admin.post("/api/auth/login", {
    data: { email: "platform-admin@example.test", password },
  });
  if (!r.ok())
    expect(
      (
        await admin.post("/api/auth/signup", {
          data: {
            email: "platform-admin@example.test",
            password,
            name: "テスト管理者",
          },
        })
      ).ok(),
    ).toBeTruthy();
});
test.afterAll(async () => admin.dispose());
test("settings UI saves explicit AI source and tutor recovers from quota errors", async ({
  browser,
}) => {
  const one = await student();
  const old = await (await admin.get("/api/ai/policy")).json();
  const adminContext = await browser.newContext({
      baseURL,
      storageState: await admin.storageState(),
    }),
    learnerContext = await browser.newContext({
      baseURL,
      storageState: await one.ctx.storageState(),
    });
  try {
    const manager = await adminContext.newPage();
    await manager.goto("/admin/settings");
    await manager
      .getByLabel("AIの提供方法", { exact: true })
      .selectOption("hybrid");
    await manager
      .getByRole("button", { name: "AIの利用設定を保存", exact: true })
      .click();
    await expect(manager.getByRole("status")).toHaveText(
      "AIの利用設定を保存しました",
    );
    const page = await learnerContext.newPage();
    await page.goto("/settings");
    await page
      .getByLabel("今回から使うAPI", { exact: true })
      .selectOption("personal");
    await page
      .getByLabel("個人APIのベースURL", { exact: true })
      .fill("https://example.test/v1");
    await page
      .getByLabel("個人APIのモデル", { exact: true })
      .fill("test-model");
    await page
      .getByLabel("個人APIキー", { exact: true })
      .fill("test-only-secret");
    await page
      .getByRole("button", { name: "AIの利用設定を保存", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "AIの利用設定を保存しました",
    );
    await page.reload();
    await expect(
      page.getByLabel("今回から使うAPI", { exact: true }),
    ).toHaveValue("personal");
    await expect(page.getByLabel("個人APIキー", { exact: true })).toHaveValue(
      "",
    );
    const r = await one.ctx.post(
      "/api/platform/skills/foundation-count/practice",
      { data: {} },
    );
    const id = (await r.json()).id;
    await page.route("**/api/ai/completion", (route) =>
      route.fulfill({
        status: 429,
        json: { error: "確認用：AIの利用上限です" },
      }),
    );
    await page.goto("/learn/" + id);
    await page.getByTitle("AIに質問する").click();
    const input = page.getByPlaceholder("質問を入力...");
    await input.fill("考え方を教えて");
    await input.press("Enter");
    await expect(
      page.getByText("確認用：AIの利用上限です", { exact: true }),
    ).toBeVisible();
    await expect(input).toBeEnabled();
    const session = await (
      await one.ctx.get("/api/platform/drill-sessions/" + id)
    ).json();
    expect(session.hintLevels["q-0"]).toBe(2);
  } finally {
    await admin.put("/api/ai/policy", { data: old });
    await one.ctx.dispose();
    await adminContext.close();
    await learnerContext.close();
  }
});
async function student() {
  const email = "adaptive-" + crypto.randomUUID() + "@example.test";
  const r = await admin.post("/api/platform/admin/users", {
    data: { name: "理解度テスト", email, password, grade: "", role: "user" },
  });
  expect(r.ok()).toBeTruthy();
  const userId = (await r.json()).id;
  const ctx = await request.newContext({ baseURL });
  await ctx.post("/api/auth/login", { data: { email, password } });
  return { ctx, userId };
}
test("mastery separates assistance, repeated items and insufficient evidence", () => {
  const observations: Evidence[] = Array.from({ length: 5 }, (_, i) => ({
    skillId: "s",
    questionKey: "q" + i,
    correct: true,
    hintLevel: 0,
    answeredAt: "2026-09-13T01:00:00Z",
  }));
  expect(estimateSkill([]).estimate).toBeNull();
  expect(estimateSkill(observations.slice(0, 2)).status).toBe("insufficient");
  expect(estimateSkill(observations).status).toBe("secure");
  expect(
    estimateSkill(observations.map((e) => ({ ...e, hintLevel: 2 }))).status,
  ).toBe("developing");
  expect(
    estimateSkill(Array(100).fill(observations[0])).distinctQuestions,
  ).toBe(1);
  expect(
    hasCycle(
      new Map([
        ["a", ["b"]],
        ["b", ["a"]],
      ]),
    ),
  ).toBe(true);
});
test("personal credentials are encrypted and graph cycles are rejected in SQLite", async () => {
  const cipher = await keyCipher("test-only-key", "local-test-encryption");
  expect(cipher).not.toContain("test-only-key");
  expect(await keyCipher(cipher, "local-test-encryption", true)).toBe(
    "test-only-key",
  );
  await expect(keyCipher(cipher, "wrong-key", true)).rejects.toThrow();
  expect(() => providerEndpoint("http://127.0.0.1")).toThrow();
  const db = new DatabaseSync(":memory:");
  for (const path of [
    "0000_existing_schema.sql",
    "0001_admin_platform.sql",
    "0002_test_time_limit.sql",
    "0003_learning_drills.sql",
    "0004_adaptive_ai.sql",
    "0005_sharing_guards.sql",
  ])
    db.exec(readFileSync("migrations/" + path, "utf8"));
  expect(() =>
    db.exec(
      "INSERT INTO skill_prerequisites VALUES('foundation-count','foundation-equation')",
    ),
  ).toThrow(/SKILL_CYCLE/);
  expect(
    db.prepare("SELECT COUNT(*) AS n FROM learning_drills").get(),
  ).toMatchObject({ n: 5 });
  db.close();
});
test("AI mode selection, no fallback, quota and personal settings isolation", async () => {
  const one = await student(),
    two = await student();
  const old = await (await admin.get("/api/ai/policy")).json();
  try {
    expect((await one.ctx.put("/api/ai/policy", { data: old })).status()).toBe(
      403,
    );
    await admin.put("/api/ai/policy", {
      data: { ...old, mode: "hybrid", daily_limit: 0 },
    });
    expect(
      (
        await one.ctx.put("/api/ai/preferences", {
          data: {
            source: "personal",
            endpoint: "https://example.test",
            model: "test",
            apiKey: "test-only-secret",
          },
        })
      ).ok(),
    ).toBeTruthy();
    let p = await (await one.ctx.get("/api/ai/preferences")).json();
    expect(p.hasApiKey).toBe(true);
    expect(JSON.stringify(p)).not.toContain("test-only-secret");
    expect(
      (await (await two.ctx.get("/api/ai/preferences")).json()).hasApiKey,
    ).toBe(false);
    await one.ctx.put("/api/ai/preferences", {
      data: {
        source: "personal",
        endpoint: "https://example.test/v1",
        model: "test",
        apiKey: "",
      },
    });
    expect((await (await one.ctx.get("/api/ai/effective")).json()).source).toBe(
      "personal",
    );
    await one.ctx.put("/api/ai/preferences", {
      data: {
        source: "personal",
        endpoint: "https://example.test",
        model: "test",
        apiKey: "",
        clearApiKey: true,
      },
    });
    expect(
      (
        await one.ctx.post("/api/ai/completion", {
          data: { messages: [{ role: "user", content: "test" }] },
        })
      ).status(),
    ).toBe(400);
    p = await (await one.ctx.get("/api/ai/preferences")).json();
    expect(p.hasApiKey).toBe(false);
    await admin.put("/api/ai/policy", { data: { ...old, mode: "disabled" } });
    expect(
      (
        await one.ctx.post("/api/ai/completion", {
          data: { messages: [{ role: "user", content: "test" }] },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await (await one.ctx.get("/api/ai/effective")).json()).hasApiKey,
    ).toBe(false);
  } finally {
    await admin.put("/api/ai/policy", { data: old });
    await one.ctx.dispose();
    await two.ctx.dispose();
  }
});
test("basis practice records hints, estimates understanding and returns to the original session", async ({
  browser,
}) => {
  const { ctx, userId } = await student();
  const other = await student();
  try {
    const begun = await ctx.post(
      "/api/platform/skills/foundation-equation/practice",
      { data: {} },
    );
    expect(begun.ok()).toBeTruthy();
    const original = (await begun.json()).id;
    const lower = await ctx.post(
      "/api/platform/skills/foundation-count/practice",
      { data: { returnSessionId: original } },
    );
    expect(lower.ok()).toBeTruthy();
    const id = (await lower.json()).id;
    expect(
      (await other.ctx.get("/api/platform/learning-support/" + id)).status(),
    ).toBe(404);
    const s = await (
      await ctx.get("/api/platform/drill-sessions/" + id)
    ).json();
    expect(s.questions[0].skillIds).toEqual(["foundation-count"]);
    await ctx.post("/api/platform/learning-support/" + id + "/hint", {
      data: { questionId: "q-0", level: 2 },
    });
    await ctx.post("/api/platform/drill-sessions/" + id + "/answer", {
      data: { questionId: "q-0", choice: 0 },
    });
    const estimates = await (
      await ctx.get("/api/platform/understanding")
    ).json();
    const math = estimates.find(
      (s: { id: string }) => s.id === "foundation-count",
    );
    expect(math).toMatchObject({
      distinctQuestions: 1,
      assisted: 1,
      status: "insufficient",
    });
    expect(
      (await ctx.get("/api/platform/admin/understanding/" + userId)).status(),
    ).toBe(403);
    expect(
      (await admin.get("/api/platform/admin/understanding/" + userId)).status(),
    ).toBe(200);
    const context = await browser.newContext({
      baseURL,
      storageState: await ctx.storageState(),
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto("/learn/" + id);
    await expect(
      page.getByRole("link", { name: "元の問題に戻る", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "もっとやさしく・例で説明" }).click();
    await expect(
      page.getByRole("heading", { name: "いまの理解と、次の一歩" }),
    ).toBeVisible();
    await expect(
      page.getByText("りんごが2個あり、3個もらうと、2+3=5個です。", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/understanding-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "元の問題に戻る", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp("/learn/" + id));
    await context.close();
  } finally {
    await ctx.dispose();
    await other.ctx.dispose();
  }
});
test("personal materials can be shared with groups without permitting edits by recipients", async () => {
  const one = await student(),
    two = await student(),
    outside = await student();
  try {
    const group = await (
      await admin.post("/api/platform/admin/groups", {
        data: { name: "教材共有-" + crypto.randomUUID() },
      })
    ).json();
    await admin.put("/api/platform/admin/groups/" + group.id, {
      data: {
        name: "教材共有",
        description: "",
        memberIds: [one.userId, two.userId],
      },
    });
    const id = crypto.randomUUID(),
      set = {
        id,
        title: "共有問題",
        subject: "数学",
        topic: "たし算",
        questions: [
          {
            questionText: "1+1",
            choices: ["1", "2", "3", "4"],
            correctAnswer: "2",
          },
        ],
        is_public: false,
        groupIds: [group.id],
      };
    expect(
      (await one.ctx.post("/api/custom_drills", { data: set })).ok(),
    ).toBeTruthy();
    expect(
      (await (await two.ctx.get("/api/custom_drills")).json()).some(
        (d: { id: string }) => d.id === id,
      ),
    ).toBe(true);
    expect(
      (await (await outside.ctx.get("/api/custom_drills")).json()).some(
        (d: { id: string }) => d.id === id,
      ),
    ).toBe(false);
    expect(
      (await two.ctx.post("/api/custom_drills", { data: set })).status(),
    ).toBe(403);
    expect(
      (
        await outside.ctx.post("/api/custom_drills", {
          data: { ...set, id: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(403);
    await one.ctx.post("/api/custom_drills", {
      data: { ...set, groupIds: [] },
    });
    expect(
      (await (await two.ctx.get("/api/custom_drills")).json()).some(
        (d: { id: string }) => d.id === id,
      ),
    ).toBe(false);
    await one.ctx.post("/api/custom_drills", {
      data: { ...set, is_public: true, groupIds: [] },
    });
    expect(
      (await (await outside.ctx.get("/api/custom_drills")).json()).some(
        (d: { id: string }) => d.id === id,
      ),
    ).toBe(true);
  } finally {
    await one.ctx.dispose();
    await two.ctx.dispose();
    await outside.ctx.dispose();
  }
});
