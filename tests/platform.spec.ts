import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
const baseURL = "http://127.0.0.1:8790";
const password = "Local-test-only-8790";
let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await request.newContext({ baseURL });
  const login = await admin.post("/api/auth/login", {
    data: { email: "platform-admin@example.test", password },
  });
  if (!login.ok())
    expect(
      (
        await admin.post("/api/auth/signup", {
          data: {
            email: "platform-admin@example.test",
            password,
            name: "テスト管理者",
            grade: "",
          },
        })
      ).ok(),
    ).toBeTruthy();
  expect((await (await admin.get("/api/auth/me")).json()).user.role).toBe(
    "admin",
  );
});
test.afterAll(async () => {
  await admin.dispose();
});

test("assignment lifecycle, immutable questions, authorization and server grading", async () => {
  const stamp = crypto.randomUUID();
  const learner = await request.newContext({ baseURL });
  const stranger = await request.newContext({ baseURL });
  const email = `learner-${stamp}@example.test`;
  const created = await admin.post("/api/platform/admin/users", {
    data: {
      name: "資格学習者",
      email,
      password,
      role: "user",
      grade: "簿記3級",
    },
  });
  expect(created.status()).toBe(201);
  const uid = (await created.json()).id;
  expect(
    (await learner.post("/api/auth/login", { data: { email, password } })).ok(),
  ).toBeTruthy();
  expect((await learner.get("/api/platform/admin/users")).status()).toBe(403);
  expect((await stranger.get("/api/platform/assignments")).status()).toBe(401);
  const course = (
    await (
      await admin.post("/api/platform/admin/courses", {
        data: {
          name: "簿記3級",
          description: "仕訳の基礎",
          audience: "社会人",
        },
      })
    ).json()
  ).id;
  const group = (
    await (
      await admin.post("/api/platform/admin/groups", {
        data: { name: `受験者-${stamp}` },
      })
    ).json()
  ).id;
  expect(
    (
      await admin.put(`/api/platform/admin/groups/${group}`, {
        data: { name: "受験者", description: "", memberIds: [uid] },
      })
    ).ok(),
  ).toBeTruthy();
  const body = {
    title: `確認テスト-${stamp}`,
    courseId: course,
    description: "基礎問題",
    mode: "exam",
    passPercent: 60,
    questions: [
      {
        id: "q1",
        text: "資産はどれ？",
        choices: ["現金", "借入金", "資本金", "売上"],
        answer: 0,
        points: 3,
        category: "仕訳",
        explanation: "現金は資産です。",
      },
      {
        id: "q2",
        text: "負債はどれ？",
        choices: ["現金", "借入金", "資本金", "売上"],
        answer: 1,
        points: 2,
        category: "仕訳",
        explanation: "借入金は負債です。",
      },
    ],
  };
  const invalid = await admin.post("/api/platform/admin/tests", {
    data: { ...body, questions: [{ ...body.questions[0], answer: 9 }] },
  });
  expect(invalid.status()).toBe(400);
  const testResponse = await admin.post("/api/platform/admin/tests", {
    data: body,
  });
  expect(testResponse.status()).toBe(201);
  const tid = (await testResponse.json()).id;
  expect(
    (
      await admin.post("/api/platform/admin/assignments", {
        data: { testId: tid, userIds: [uid], groupIds: [], maxAttempts: 1 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await admin.put(`/api/platform/admin/tests/${tid}`, {
        data: { status: "published" },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await admin.put(`/api/platform/admin/tests/${tid}`, {
        data: { ...body, title: "changed" },
      })
    ).status(),
  ).toBe(409);
  const assignment = {
    testId: tid,
    userIds: [uid],
    groupIds: [group],
    maxAttempts: 1,
    dueAt: null,
  };
  expect(
    (
      await (
        await admin.post("/api/platform/admin/assignments", {
          data: assignment,
        })
      ).json()
    ).count,
  ).toBe(1);
  expect(
    (
      await (
        await admin.post("/api/platform/admin/assignments", {
          data: assignment,
        })
      ).json()
    ).count,
  ).toBe(0);
  const list = await (await learner.get("/api/platform/assignments")).json();
  const a = list.find((x: { testId: string }) => x.testId === tid);
  expect(JSON.stringify(a)).not.toContain("現金");
  const aid = (
    await (await learner.post(`/api/platform/assignments/${a.id}/start`)).json()
  ).id;
  expect(aid).toBeTruthy();
  expect(
    (
      await (
        await learner.post(`/api/platform/assignments/${a.id}/start`)
      ).json()
    ).id,
  ).toBe(aid);
  let attempt = await (
    await learner.get(`/api/platform/attempts/${aid}`)
  ).json();
  expect(attempt.questions[0]).not.toHaveProperty("answer");
  expect(attempt.questions[0]).not.toHaveProperty("explanation");
  expect(
    (
      await learner.put(`/api/platform/attempts/${aid}`, {
        data: { answers: { evil: 0 } },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await learner.put(`/api/platform/attempts/${aid}`, {
        data: { answers: { q1: 0 }, submit: false },
      })
    ).ok(),
  ).toBeTruthy();
  attempt = await (await learner.get(`/api/platform/attempts/${aid}`)).json();
  expect(attempt.answers).toEqual({ q1: 0 });
  const submit = await learner.put(`/api/platform/attempts/${aid}`, {
    data: { answers: { q1: 0, q2: 0 }, submit: true, score: 999 },
  });
  expect(submit.ok()).toBeTruthy();
  attempt = await submit.json();
  expect(attempt.score).toBe(3);
  expect(attempt.total).toBe(5);
  expect(attempt.passed).toBe(true);
  expect(attempt.questions[0].answer).toBe(0);
  const repeat = await (
    await learner.put(`/api/platform/attempts/${aid}`, {
      data: { answers: { q1: 1, q2: 1 }, submit: true },
    })
  ).json();
  expect(repeat.score).toBe(3);
  expect(
    (await learner.post(`/api/platform/assignments/${a.id}/start`)).status(),
  ).toBe(409);
  expect(
    (
      await admin.put(`/api/platform/admin/assignments/${a.id}`, {
        data: { dueAt: "2000-01-01", maxAttempts: 2 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await admin.put(`/api/platform/admin/assignments/${a.id}`, {
        data: { dueAt: null, maxAttempts: 2 },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (await learner.post(`/api/platform/assignments/${a.id}/start`)).status(),
  ).toBe(201);
  const other = await stranger.post("/api/auth/signup", {
    data: {
      email: `other-${stamp}@example.test`,
      password,
      name: "別の学習者",
    },
  });
  expect(other.ok()).toBeTruthy();
  expect((await stranger.get(`/api/platform/attempts/${aid}`)).status()).toBe(
    404,
  );
  expect(
    (await stranger.post(`/api/platform/assignments/${a.id}/start`)).status(),
  ).toBe(404);
  const profile = {
    name: "資格学習者",
    role: "user",
    status: "disabled",
    grade: "簿記3級",
    profile: { 受験予定日: "2026-12-01" },
  };
  expect(
    (
      await admin.put(`/api/platform/admin/users/${uid}`, { data: profile })
    ).ok(),
  ).toBeTruthy();
  expect((await learner.get("/api/platform/assignments")).status()).toBe(401);
  expect(
    (
      await learner.post("/api/auth/login", { data: { email, password } })
    ).status(),
  ).toBe(401);
  const me = (await (await admin.get("/api/auth/me")).json()).user;
  expect(
    (
      await admin.put(`/api/platform/admin/users/${me.id}`, {
        data: { ...profile, name: me.name },
      })
    ).status(),
  ).toBe(400);
  await learner.dispose();
  await stranger.dispose();
});

test("settings never disclose the AI credential and blank save retains it", async () => {
  const settings = {
    endpoint: "https://example.test/v1",
    apiKey: "test-placeholder-not-a-real-key",
    model: "test-model",
    duplicatePreventionMode: "seed",
  };
  expect(
    (await admin.put("/api/settings", { data: settings })).ok(),
  ).toBeTruthy();
  let response = await (await admin.get("/api/settings")).json();
  expect(response.apiKey).toBe("");
  expect(response.hasApiKey).toBe(true);
  await admin.put("/api/settings", { data: { ...settings, apiKey: "" } });
  response = await (await admin.get("/api/settings")).json();
  expect(response.hasApiKey).toBe(true);
  await admin.put("/api/settings", {
    data: { ...settings, clearApiKey: true },
  });
  expect((await (await admin.get("/api/settings")).json()).hasApiKey).toBe(
    false,
  );
});

test("administrator can create and publish a test in the UI; mobile layout fits", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: await admin.storageState(),
  });
  const page = await context.newPage();
  await page.goto("/admin/tests");
  await expect(
    page.getByRole("heading", { name: "テスト", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "テスト作成", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "テスト編集" });
  const title = `画面テスト-${Date.now()}`;
  await dialog.getByLabel("テスト名", { exact: true }).fill(title);
  await dialog.getByLabel("問題文", { exact: true }).fill("1 + 1 は？");
  for (let i = 1; i <= 4; i++)
    await dialog.getByLabel(`選択肢 ${i}`, { exact: true }).fill(String(i));
  await dialog.getByLabel("正解", { exact: true }).selectOption("1");
  await dialog.getByRole("button", { name: "下書き保存" }).click();
  await expect(dialog).toBeHidden();
  const card = page
    .locator(".admin-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "公開", exact: true }).click();
  await expect(card.getByText("公開中", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/admin-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "テスト", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/admin-mobile.png",
    fullPage: true,
  });
  await context.close();
});

test("learner can resume saved answers and submit from the browser", async ({
  browser,
}) => {
  const email = `browser-${crypto.randomUUID()}@example.test`;
  const created = await admin.post("/api/platform/admin/users", {
    data: { name: "受験画面テスト", email, password, role: "user", grade: "" },
  });
  const uid = (await created.json()).id;
  const body = {
    title: "資格試験の受験フロー",
    courseId: "",
    description: "",
    mode: "exam",
    passPercent: 60,
    questions: [
      {
        id: "browser-q",
        text: "2 + 2 は？",
        choices: ["2", "3", "4", "5"],
        answer: 2,
        points: 10,
        category: "基礎",
        explanation: "2に2を足すと4です。",
      },
    ],
  };
  const tid = (
    await (await admin.post("/api/platform/admin/tests", { data: body })).json()
  ).id;
  await admin.put(`/api/platform/admin/tests/${tid}`, {
    data: { status: "published" },
  });
  await admin.post("/api/platform/admin/assignments", {
    data: { testId: tid, userIds: [uid], groupIds: [], maxAttempts: 1 },
  });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  expect(
    (
      await context.request.post("/api/auth/login", {
        data: { email, password },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/tests");
  await page.getByRole("button", { name: "受験を開始" }).click();
  await expect(page.getByRole("heading", { name: "2 + 2 は？" })).toBeVisible();
  await expect(page.getByText("正解：", { exact: false })).toHaveCount(0);
  await page.getByRole("radio", { name: "4", exact: true }).check();
  await page.getByRole("button", { name: "途中保存" }).click();
  await expect(page.getByRole("status")).toContainText("回答を保存しました");
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "4", exact: true }),
  ).toBeChecked();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "提出して採点" }).click();
  await expect(
    page.getByRole("heading", { name: "合格", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("正解：4", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/learner-result.png",
    fullPage: true,
  });
  await page.goto("/admin/users");
  await expect(page).toHaveURL(baseURL + "/");
  await context.close();
});
