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
const q = (id: string, answer = 0) => ({
  id,
  text: "確認問題",
  choices: ["1", "2", "3", "4"],
  answer,
  explanation: "解説の内容",
  hint1: "考え方のヒント",
  hint2: "具体的なヒント",
  category: "基礎",
  points: 1,
});
async function learner(name: string) {
  const email = `drill-${crypto.randomUUID()}@example.test`;
  const r = await admin.post("/api/platform/admin/users", {
    data: { name, email, password, role: "user", grade: "" },
  });
  expect(r.status()).toBe(201);
  const id = (await r.json()).id;
  return { id, email, name };
}

test("bulk drill creation, course/group allocation, repeated learning and idempotent records", async () => {
  const course = (
    await (
      await admin.post("/api/platform/admin/courses", {
        data: {
          name: "日常学習-" + crypto.randomUUID(),
          audience: "中学生",
          description: "",
        },
      })
    ).json()
  ).id;
  const units = {
    courseId: course,
    units: [
      { subject: "数学", name: "正負の数" },
      { subject: "英語", name: "be動詞" },
    ],
  };
  expect(
    (
      await (
        await admin.post("/api/platform/admin/drill-units/bulk", {
          data: units,
        })
      ).json()
    ).count,
  ).toBe(2);
  expect(
    (
      await (
        await admin.post("/api/platform/admin/drill-units/bulk", {
          data: units,
        })
      ).json()
    ).count,
  ).toBe(0);
  const unitIds = (
    await (await admin.get("/api/platform/admin/drill-units")).json()
  )
    .filter((u: { courseId: string }) => u.courseId === course)
    .map((u: { id: string }) => u.id);
  const createdResponse = await admin.post("/api/platform/admin/drills/bulk", {
    data: { unitIds, setsPerUnit: 2, questionCount: 2, titlePrefix: "基礎" },
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();
  expect(created).toHaveLength(4);
  expect(
    (
      await admin.post("/api/platform/admin/drills/actions", {
        data: {
          ids: created.map((d: { id: string }) => d.id),
          action: "publish",
        },
      })
    ).status(),
  ).toBe(400);
  for (const d of created.slice(0, 2))
    expect(
      (
        await admin.put(`/api/platform/admin/drills/${d.id}`, {
          data: { ...d, targetCount: 2, questions: [q("q1"), q("q2", 1)] },
        })
      ).ok(),
    ).toBeTruthy();
  const drillIds = created.slice(0, 2).map((d: { id: string }) => d.id);
  expect(
    (
      await admin.post("/api/platform/admin/drills/actions", {
        data: { ids: drillIds, action: "publish" },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await admin.put(`/api/platform/admin/drills/${drillIds[0]}`, {
        data: { ...created[0], targetCount: 2, questions: [q("q1")] },
      })
    ).status(),
  ).toBe(409);
  const one = await learner("学習者1");
  const two = await learner("学習者2");
  const outsider = await learner("未配布");
  const group = (
    await (
      await admin.post("/api/platform/admin/groups", {
        data: { name: "学級-" + crypto.randomUUID() },
      })
    ).json()
  ).id;
  await admin.put(`/api/platform/admin/groups/${group}`, {
    data: { name: "学級", description: "", memberIds: [one.id, two.id] },
  });
  const allocation = {
    drillIds,
    userIds: [one.id],
    groupIds: [group],
    targetDate: "2020-01-01",
  };
  const assigned = await admin.post("/api/platform/admin/drill-assignments", {
    data: allocation,
  });
  expect(assigned.status()).toBe(201);
  expect((await assigned.json()).count).toBe(4);
  expect(
    (
      await (
        await admin.post("/api/platform/admin/drill-assignments", {
          data: allocation,
        })
      ).json()
    ).count,
  ).toBe(0);
  const student = await request.newContext({ baseURL });
  await student.post("/api/auth/login", {
    data: { email: one.email, password },
  });
  const other = await request.newContext({ baseURL });
  await other.post("/api/auth/login", {
    data: { email: outsider.email, password },
  });
  expect((await student.get("/api/platform/admin/drills")).status()).toBe(403);
  const assignedList = await (
    await student.get("/api/platform/drill-assignments")
  ).json();
  expect(assignedList).toHaveLength(2);
  expect(JSON.stringify(assignedList)).not.toContain("確認問題");
  const assignmentId = assignedList[0].id;
  const started = await student.post(
    `/api/platform/drill-assignments/${assignmentId}/start`,
    { data: { mode: "all" } },
  );
  expect(started.status()).toBe(201);
  const sessionId = (await started.json()).id;
  expect(
    (
      await other.post(
        `/api/platform/drill-assignments/${assignmentId}/start`,
        { data: {} },
      )
    ).status(),
  ).toBe(404);
  expect(
    (await other.get(`/api/platform/drill-sessions/${sessionId}`)).status(),
  ).toBe(404);
  const initial = await (
    await student.get(`/api/platform/drill-sessions/${sessionId}`)
  ).json();
  expect(initial.questions[0]).not.toHaveProperty("answer");
  expect(initial.questions[0].hint1).toBe("考え方のヒント");
  const replies = await Promise.all(
    [0, 0].map(() =>
      student.post(`/api/platform/drill-sessions/${sessionId}/answer`, {
        data: { questionId: "q1", choice: 0 },
      }),
    ),
  );
  for (const r of replies) expect(r.ok()).toBeTruthy();
  let me = (await (await student.get("/api/auth/me")).json()).user;
  expect(me.exp).toBe(10);
  let result = await (
    await student.post(`/api/platform/drill-sessions/${sessionId}/answer`, {
      data: { questionId: "q2", choice: 0 },
    })
  ).json();
  expect(result.completed).toBe(true);
  expect(result.answers.q2.correct).toBe(false);
  expect(result.questions[1].answer).toBe(1);
  me = (await (await student.get("/api/auth/me")).json()).user;
  expect(me.exp).toBe(12);
  expect(Object.values(me.detailedStats)[0]).toEqual({ total: 2, correct: 1 });
  const records = await (await student.get("/api/daily_records")).json();
  expect(
    records.reduce(
      (n: number, r: { total_questions: number }) => n + r.total_questions,
      0,
    ),
  ).toBe(2);
  const retry = (
    await (
      await student.post(
        `/api/platform/drill-assignments/${assignmentId}/start`,
        { data: { mode: "mistakes" } },
      )
    ).json()
  ).id;
  result = await (
    await student.get(`/api/platform/drill-sessions/${retry}`)
  ).json();
  expect(result.questions).toHaveLength(1);
  expect(result.questions[0].id).toBe("q2");
  await student.post(`/api/platform/drill-sessions/${retry}/answer`, {
    data: { questionId: "q2", choice: 1 },
  });
  expect(
    (
      await admin.post("/api/platform/admin/drill-assignments/actions", {
        data: { ids: [assignmentId], action: "withdraw" },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (await student.get(`/api/platform/drill-sessions/${sessionId}`)).status(),
  ).toBe(404);
  expect(
    (
      await (
        await admin.post("/api/platform/admin/drill-assignments", {
          data: allocation,
        })
      ).json()
    ).count,
  ).toBe(1);
  expect(
    (await student.get(`/api/platform/drill-sessions/${sessionId}`)).status(),
  ).toBe(200);
  await admin.post("/api/platform/admin/drills/actions", {
    data: { ids: drillIds, action: "archive" },
  });
  expect(
    (
      await student.post(
        `/api/platform/drill-assignments/${assignmentId}/start`,
        { data: { mode: "all" } },
      )
    ).status(),
  ).toBe(201);
  await student.dispose();
  await other.dispose();
});

test("bulk authoring, AI failure retry, group allocation, learning home and system settings UI", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL,
    storageState: await admin.storageState(),
  });
  const page = await context.newPage();
  const courseName = "中学ドリル-" + Date.now();
  const person = await learner("日々の学習");
  const groupName = "配布対象-" + Date.now();
  const gid = (
    await (
      await admin.post("/api/platform/admin/groups", {
        data: { name: groupName },
      })
    ).json()
  ).id;
  await admin.put(`/api/platform/admin/groups/${gid}`, {
    data: { name: groupName, description: "", memberIds: [person.id] },
  });
  await page.route("**/api/settings", (r) =>
    r.fulfill({
      json: {
        endpoint: "https://example.test",
        apiKey: "",
        hasApiKey: true,
        model: "mock",
        duplicatePreventionMode: "seed",
      },
    }),
  );
  let calls = 0;
  await page.route("**/api/ai/completion", (r) => {
    calls++;
    return calls === 2
      ? r.fulfill({ status: 502, json: { error: "一時的な生成エラー" } })
      : r.fulfill({
          json: {
            choices: [
              {
                message: {
                  content: JSON.stringify([
                    {
                      subject: "数学",
                      topic: "基礎",
                      questionText: "確認問題",
                      choices: ["1", "2", "3", "4"],
                      correctAnswer: "1",
                      explanation: "解説の内容",
                      hint1: "考え方のヒント",
                      hint2: "具体的なヒント",
                    },
                  ]),
                },
              },
            ],
          },
        });
  });
  await page.goto("/admin/drills");
  await page.getByRole("button", { name: "コース追加", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "コースを追加" });
  await dialog.getByLabel("コース名", { exact: true }).fill(courseName);
  await dialog.getByRole("button", { name: "コースを保存" }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByLabel("コース", { exact: true })
    .selectOption({ label: courseName });
  await page.getByRole("button", { name: "単元を一括登録" }).click();
  dialog = page.getByRole("dialog", { name: "単元を一括登録" });
  await dialog
    .getByLabel("科目と単元（1行1単元）")
    .fill("国語,漢字\n数学,計算\n英語,単語\n理科,生物\n社会,地理");
  await dialog.getByRole("button", { name: "単元を登録", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByLabel("単元", { exact: true })
    .selectOption({ label: "国語 / 漢字" });
  await page.getByRole("button", { name: "選択した単元を編集" }).click();
  dialog = page.getByRole("dialog", { name: "単元を編集" });
  await dialog.getByLabel("単元名", { exact: true }).fill("漢字・語句");
  await dialog.getByRole("button", { name: "変更を保存" }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("button", { name: "ドリルをまとめて作成", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "ドリルをまとめて作成" });
  await dialog.getByRole("button", { name: "対象単元をすべて選択" }).click();
  await dialog.getByLabel("ドリルごとの予定問題数").fill("1");
  await dialog.getByRole("button", { name: "下書きをまとめて作成" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "絞り込み結果をすべて選択" }).click();
  await page.getByRole("button", { name: "空の下書きをAI生成" }).click();
  await expect(page.getByRole("status")).toContainText(
    "作成成功 4件 / 失敗 1件",
  );
  await page.getByRole("button", { name: "失敗した分を再試行" }).click();
  await expect(page.getByRole("status")).toContainText(
    "作成成功 1件 / 失敗 0件",
  );
  await page.getByRole("button", { name: "一括公開", exact: true }).click();
  await expect(
    page.locator("tbody").getByText("公開中", { exact: true }),
  ).toHaveCount(5);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/drill-library-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/drill-library-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "絞り込み結果をすべて選択" }).click();
  await page.getByRole("button", { name: "選択したドリルを配布" }).click();
  await expect(page).toHaveURL(/drill-assignments/);
  await page.getByRole("checkbox", { name: new RegExp(groupName) }).check();
  await expect(page.locator(".drill-summary")).toContainText("5ドリル × 1人");
  await page
    .getByRole("button", { name: "確認した内容でドリルを配布" })
    .click();
  await expect(page.getByRole("status")).toContainText("5件を配布しました");
  await page.goto("/admin/settings");
  await expect(
    page.getByRole("heading", { name: "システム設定", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("API キー", { exact: true })).toBeVisible();
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "アカウント設定", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("API キー", { exact: true })).toHaveCount(0);
  const student = await browser.newContext({ baseURL });
  await student.request.post("/api/auth/login", {
    data: { email: person.email, password },
  });
  const home = await student.newPage();
  await home.goto("/");
  await expect(
    home.getByRole("heading", { name: "学習ドリル", exact: true }),
  ).toBeVisible();
  await expect(
    home.getByRole("button", { name: "学習する", exact: true }),
  ).toHaveCount(5);
  await home
    .getByRole("button", { name: "学習する", exact: true })
    .first()
    .click();
  await home.getByRole("button", { name: "ヒントを見る", exact: true }).click();
  await expect(home.getByText("考え方のヒント", { exact: true })).toBeVisible();
  await home.getByRole("button", { name: "2. 2", exact: true }).click();
  await expect(home.getByRole("status")).toContainText("解説の内容");
  await home.getByRole("button", { name: "結果を見る" }).click();
  await home.getByRole("button", { name: "間違えた問題だけ復習" }).click();
  await home.getByRole("button", { name: "1. 1", exact: true }).click();
  await home.getByRole("button", { name: "結果を見る" }).click();
  await home.getByRole("link", { name: "学習ホームへ", exact: true }).click();
  await expect(home.getByText("完了済み", { exact: true })).toHaveCount(1);
  await home.screenshot({
    path: "test-results/drill-learning-home.png",
    fullPage: true,
  });
  await student.close();
  await context.close();
});
