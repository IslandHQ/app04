import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { normalizeAIEndpoint, aiFailureMessage } from "./ai-settings";
type Env = {
  Bindings: { DB: D1Database; AI_KEY_SECRET?: string; JWT_SECRET?: string };
  Variables: { user: { id: string; role: string } };
};
type Policy = {
  mode: "shared" | "personal" | "hybrid" | "disabled";
  daily_limit: number;
  total_daily_limit: number;
  concurrency_limit: number;
  max_output_tokens: number;
};
type Personal = {
  source: "shared" | "personal";
  endpoint: string;
  model: string;
  encrypted_key: string;
};
function fail(message: string, status: 400 | 403 | 429 = 400): never {
  throw new HTTPException(status, { message });
}
export function providerEndpoint(value: string) {
  const url = new URL(normalizeAIEndpoint(value));
  if (
    url.protocol !== "https:" ||
    !url.hostname.includes(".") ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".internal") ||
    /^[\d.]+$/.test(url.hostname) ||
    url.hostname.includes(":")
  )
    fail("外部AIサービスのHTTPSベースURLを指定してください");
  return url.toString().replace(/\/$/, "");
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function keyCipher(
  value: string,
  secret: string,
  decrypt = false,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  if (decrypt) {
    const [iv, data] = value.split(".");
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decode(iv) },
        key,
        decode(data),
      ),
    );
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return (
    encode(iv) +
    "." +
    encode(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          new TextEncoder().encode(value),
        ),
      ),
    )
  );
}
function secret(env: Env["Bindings"], url: string) {
  if (env.AI_KEY_SECRET) return env.AI_KEY_SECRET;
  if (["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    return "local-personal-ai-encryption-only";
  return fail("個人APIの保存には運営者によるAI_KEY_SECRETの設定が必要です");
}
export const aiProvider = new Hono<Env>();
aiProvider.onError((e, c) =>
  c.json(
    {
      error:
        e instanceof HTTPException ? e.message : "AI設定の処理に失敗しました",
    },
    e instanceof HTTPException ? e.status : 500,
  ),
);
async function settings(db: D1Database, uid: string) {
  const policy = (await db
    .prepare("SELECT * FROM ai_policy WHERE id=1")
    .first<Policy>())!;
  const personal = await db
    .prepare("SELECT * FROM personal_ai WHERE user_id=?")
    .bind(uid)
    .first<Personal>();
  const shared = await db
    .prepare("SELECT * FROM system_settings LIMIT 1")
    .first<{
      endpoint: string;
      model: string;
      api_key: string;
      duplicate_prevention_mode: string;
    }>();
  const source =
    policy.mode === "personal"
      ? "personal"
      : policy.mode === "shared"
        ? "shared"
        : personal?.source || "shared";
  return { policy, personal, shared, source };
}
aiProvider.get("/ai/preferences", async (c) => {
  const s = await settings(c.env.DB, c.get("user").id);
  const usage = await c.env.DB.prepare(
    "SELECT COUNT(*) AS used,COALESCE(SUM(tokens),0) AS tokens FROM ai_requests WHERE user_id=? AND source='shared' AND day=?",
  )
    .bind(c.get("user").id, new Date().toISOString().slice(0, 10))
    .first();
  return c.json({
    source: s.source,
    endpoint: s.personal?.endpoint || "https://api.openai.com/v1",
    model: s.personal?.model || "",
    hasApiKey: !!s.personal?.encrypted_key,
    mode: s.policy.mode,
    dailyLimit: s.policy.daily_limit,
    usage,
  });
});
aiProvider.put("/ai/preferences", async (c) => {
  const b = await c.req.json();
  if (!["shared", "personal"].includes(b.source))
    fail("利用するAPIを選択してください");
  const endpoint = providerEndpoint(b.endpoint);
  if (
    typeof b.model !== "string" ||
    b.model.length > 200 ||
    typeof b.apiKey !== "string" ||
    b.apiKey.length > 4000
  )
    fail("入力内容を確認してください");
  const old = await c.env.DB.prepare(
    "SELECT encrypted_key FROM personal_ai WHERE user_id=?",
  )
    .bind(c.get("user").id)
    .first<{ encrypted_key: string }>();
  const encrypted = b.clearApiKey
    ? ""
    : b.apiKey.trim()
      ? await keyCipher(b.apiKey.trim(), secret(c.env, c.req.url))
      : old?.encrypted_key || "";
  await c.env.DB.prepare(
    "INSERT INTO personal_ai VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET source=excluded.source,endpoint=excluded.endpoint,model=excluded.model,encrypted_key=excluded.encrypted_key",
  )
    .bind(c.get("user").id, b.source, endpoint, b.model.trim(), encrypted)
    .run();
  return c.json({ ok: true });
});
aiProvider.get("/ai/policy", async (c) => {
  if (c.get("user").role !== "admin") fail("管理者権限が必要です", 403);
  return c.json(
    await c.env.DB.prepare("SELECT * FROM ai_policy WHERE id=1").first(),
  );
});
aiProvider.put("/ai/policy", async (c) => {
  if (c.get("user").role !== "admin") fail("管理者権限が必要です", 403);
  const b = await c.req.json();
  if (
    b.total_daily_limit !== undefined &&
    (!Number.isInteger(b.total_daily_limit) ||
      b.total_daily_limit < 0 ||
      b.total_daily_limit > 100000)
  )
    fail("全体の利用上限を確認してください");

  if (
    !["shared", "personal", "hybrid", "disabled"].includes(b.mode) ||
    !Number.isInteger(b.daily_limit) ||
    b.daily_limit < 0 ||
    b.daily_limit > 10000 ||
    !Number.isInteger(b.concurrency_limit) ||
    b.concurrency_limit < 1 ||
    b.concurrency_limit > 10 ||
    !Number.isInteger(b.max_output_tokens) ||
    b.max_output_tokens < 256 ||
    b.max_output_tokens > 32000
  )
    fail("利用枠の入力内容を確認してください");
  await c.env.DB.prepare(
    "UPDATE ai_policy SET mode=?,daily_limit=?,concurrency_limit=?,max_output_tokens=?,total_daily_limit=COALESCE(?,total_daily_limit) WHERE id=1",
  )
    .bind(
      b.mode,
      b.daily_limit,
      b.concurrency_limit,
      b.max_output_tokens,
      b.total_daily_limit ?? null,
    )
    .run();
  return c.json({ ok: true });
});
aiProvider.get("/ai/effective", async (c) => {
  const s = await settings(c.env.DB, c.get("user").id);
  const selected = s.source === "personal" ? s.personal : s.shared;
  return c.json({
    apiKey: "",
    source: s.source,
    hasApiKey:
      s.policy.mode !== "disabled" &&
      !!(s.source === "personal"
        ? s.personal?.encrypted_key
        : s.shared?.api_key),
    endpoint: selected?.endpoint || "",
    model: selected?.model || "",
    duplicatePreventionMode: s.shared?.duplicate_prevention_mode || "seed",
  });
});
aiProvider.post("/ai/completion", async (c) => {
  const uid = c.get("user").id;
  const s = await settings(c.env.DB, uid);
  if (s.policy.mode === "disabled")
    fail("この環境ではAIを利用しません。既存の教材は学習できます", 403);
  const b = await c.req.json();
  if (
    !Array.isArray(b.messages) ||
    !b.messages.length ||
    b.messages.length > 100 ||
    b.messages.some(
      (m: { role: string; content: string }) =>
        !m ||
        !["system", "user", "assistant"].includes(m.role) ||
        typeof m.content !== "string",
    ) ||
    JSON.stringify(b.messages).length > 100000
  )
    fail("メッセージが長すぎるか形式が不正です");
  const selected = s.source === "personal" ? s.personal : s.shared;
  if (!selected?.model) fail("使用モデルを設定してください");
  const apiKey =
    s.source === "personal"
      ? s.personal?.encrypted_key
        ? await keyCipher(
            s.personal.encrypted_key,
            secret(c.env, c.req.url),
            true,
          )
        : ""
      : s.shared?.api_key;
  if (!apiKey)
    fail(
      "選択したAPIのキーが未設定です。個人設定またはシステム設定を確認してください",
    );
  const id = crypto.randomUUID(),
    now = new Date().toISOString(),
    day = now.slice(0, 10),
    cutoff = new Date(Date.now() - 120000).toISOString();
  const reserved = await c.env.DB.prepare(
    `INSERT INTO ai_requests(id,user_id,source,day,started_at) SELECT ?,?,?,?,? WHERE (?='personal' OR ((SELECT COUNT(*) FROM ai_requests WHERE user_id=? AND source='shared' AND day=?) < ? AND (SELECT COUNT(*) FROM ai_requests WHERE source='shared' AND day=?) < ?)) AND (SELECT COUNT(*) FROM ai_requests WHERE user_id=? AND status='pending' AND started_at>?) < ?`,
  )
    .bind(
      id,
      uid,
      s.source,
      day,
      now,
      s.source,
      uid,
      day,
      s.policy.daily_limit,
      day,
      s.policy.total_daily_limit,
      uid,
      cutoff,
      s.policy.concurrency_limit,
    )
    .run();
  if (!reserved.meta.changes)
    fail(
      "AIの利用回数または同時実行上限です。個人設定で利用状況を確認してください。APIは自動で切り替わりません",
      429,
    );
  let success = false;
  try {
    const r = await fetch(
      providerEndpoint(selected.endpoint) + "/chat/completions",
      {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: selected.model,
          messages: b.messages,
          max_tokens: s.policy.max_output_tokens,
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!r.ok)
      return c.json({ error: aiFailureMessage({ status: r.status }) }, 502);
    if (!r.headers.get("content-type")?.includes("application/json"))
      return c.json(
        {
          error:
            "AIからJSON以外の応答が返りました。ベースURLを確認してください",
        },
        502,
      );
    const result = (await r.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim())
      return c.json(
        {
          error:
            "AIから有効な回答がありませんでした。モデルと出力上限を確認してください",
        },
        502,
      );
    await c.env.DB.prepare(
      "UPDATE ai_requests SET status='succeeded',tokens=? WHERE id=?",
    )
      .bind(
        Math.max(0, Math.min(1000000, Number(result.usage?.total_tokens) || 0)),
        id,
      )
      .run();
    success = true;
    return c.json({ choices: [{ message: { content } }] });
  } catch (e) {
    return c.json({ error: aiFailureMessage(e) }, 502);
  } finally {
    if (!success)
      await c.env.DB.prepare(
        "UPDATE ai_requests SET status='failed' WHERE id=?",
      )
        .bind(id)
        .run();
  }
});
