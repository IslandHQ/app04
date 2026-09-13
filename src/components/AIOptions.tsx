import { useEffect, useState } from "react";
import { Field } from "./admin/Form";
async function request<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/ai/" + path, {
    method: body ? "PUT" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "AI設定の処理に失敗しました");
  return data;
}
type Policy = {
  mode: string;
  daily_limit: number;
  total_daily_limit: number;
  concurrency_limit: number;
  max_output_tokens: number;
};
type Preference = {
  source: string;
  endpoint: string;
  model: string;
  hasApiKey: boolean;
  apiKey: string;
  clearApiKey: boolean;
  mode: string;
  dailyLimit: number;
  usage: { used: number; tokens: number };
};
export default function AIOptions({ admin = false }: { admin?: boolean }) {
  const [policy, setPolicy] = useState<Policy | null>(null),
    [pref, setPref] = useState<Preference | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (admin)
      request<Policy>("policy")
        .then(setPolicy)
        .catch((e) => setError(e.message));
    else
      request<Preference>("preferences")
        .then((p) => setPref({ ...p, apiKey: "", clearApiKey: false }))
        .catch((e) => setError(e.message));
  }, [admin]);
  return (
    <section
      className="admin-card settings-panel"
      style={{ marginTop: 24, padding: 24 }}
    >
      <h2>{admin ? "AIの提供方法・利用上限" : "自分が利用するAI"}</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          try {
            await request(
              admin ? "policy" : "preferences",
              admin ? policy : pref,
            );
            if (!admin) {
              const p = await request<Preference>("preferences");
              setPref({ ...p, apiKey: "", clearApiKey: false });
            }
            setNotice("AIの利用設定を保存しました");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          {admin && policy ? (
            <>
              <Field label="AIの提供方法">
                <select
                  value={policy.mode}
                  onChange={(e) =>
                    setPolicy({ ...policy, mode: e.target.value })
                  }
                >
                  <option value="shared">運営者の共通API</option>
                  <option value="personal">個人APIのみ</option>
                  <option value="hybrid">共通・個人を選べる</option>
                  <option value="disabled">AIなし</option>
                </select>
              </Field>
              <Field label="1人1日の共通APIリクエスト上限">
                <input
                  type="number"
                  min={0}
                  max={10000}
                  required
                  value={policy.daily_limit}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      daily_limit: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="運営全体の1日の共通API上限">
                <input
                  type="number"
                  required
                  min={0}
                  max={100000}
                  value={policy.total_daily_limit}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      total_daily_limit: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="1人あたり同時実行上限">
                <input
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={policy.concurrency_limit}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      concurrency_limit: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="1回の最大出力トークン数">
                <input
                  type="number"
                  min={256}
                  max={32000}
                  required
                  value={policy.max_output_tokens}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      max_output_tokens: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <p>
                共通枠はUTC
                0時（日本時間9時）に更新します。失敗したリクエストも回数に含みます。利用料はモデルと入力・出力の量によって異なります。
              </p>
            </>
          ) : pref ? (
            <>
              <p>
                提供方法：
                {
                  (
                    {
                      shared: "共通API",
                      personal: "個人API",
                      hybrid: "選択可能",
                      disabled: "AIなし",
                    } as Record<string, string>
                  )[pref.mode]
                }
              </p>
              <p>
                本日の共通枠：{pref.usage.used} / {pref.dailyLimit}{" "}
                回（UTC日付）。使用トークン：{pref.usage.tokens}
              </p>
              <Field label="今回から使うAPI">
                <select
                  disabled={pref.mode !== "hybrid"}
                  value={pref.source}
                  onChange={(e) => setPref({ ...pref, source: e.target.value })}
                >
                  <option value="shared">運営者の共通API</option>
                  <option value="personal">自分のAPI</option>
                </select>
              </Field>
              <Field label="個人APIのベースURL">
                <input
                  type="url"
                  required
                  value={pref.endpoint}
                  onChange={(e) =>
                    setPref({ ...pref, endpoint: e.target.value })
                  }
                />
              </Field>
              <Field label="個人APIのモデル">
                <input
                  maxLength={200}
                  required={pref.source === "personal"}
                  value={pref.model}
                  onChange={(e) => setPref({ ...pref, model: e.target.value })}
                />
              </Field>
              <Field label="個人APIキー">
                <input
                  type="password"
                  autoComplete="new-password"
                  maxLength={4000}
                  value={pref.apiKey}
                  placeholder={
                    pref.hasApiKey ? "登録済み・空欄で保持" : "未登録"
                  }
                  onChange={(e) =>
                    setPref({
                      ...pref,
                      apiKey: e.target.value,
                      clearApiKey: false,
                    })
                  }
                />
              </Field>
              <label>
                <input
                  type="checkbox"
                  checked={pref.clearApiKey}
                  onChange={(e) =>
                    setPref({
                      ...pref,
                      clearApiKey: e.target.checked,
                      apiKey: "",
                    })
                  }
                />{" "}
                保存した個人キーを削除
              </label>
              <p>
                個人キーは暗号化してサーバーに保存します。上限や接続エラーでも、別のAPIへ自動で切り替えることはありません。
              </p>
            </>
          ) : (
            <p>読み込み中...</p>
          )}
          {(policy || pref) && (
            <button className="admin-button primary">AIの利用設定を保存</button>
          )}
        </fieldset>
      </form>
    </section>
  );
}
