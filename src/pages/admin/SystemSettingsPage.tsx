import AIOptions from "../../components/AIOptions";
import { useEffect, useState } from "react";
import { Storage, type AISettings } from "../../lib/storage";
import { Field } from "../../components/admin/Form";
export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    Storage.getSettings()
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <AIOptions admin />
      <section className="admin-card settings-panel">
        <h2>AIエンジン設定</h2>
        <p className="admin-muted">
          ドリル・テストの問題生成とAIチューターに共通で使用します。
        </p>
        {error && (
          <p role="alert" className="admin-alert error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="admin-alert success">
            {notice}
          </p>
        )}
        {settings ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setNotice("");
              try {
                await Storage.saveSettings(settings);
                setSettings(await Storage.getSettings());
                setNotice("システム設定を保存しました");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <Field label="API エンドポイント">
                <input
                  required
                  type="url"
                  value={settings.endpoint}
                  onChange={(e) =>
                    setSettings({ ...settings, endpoint: e.target.value })
                  }
                />
              </Field>
              <p className="admin-muted">
                OpenAI互換APIのベースURLを入力してください（例：https://api.example.com/v1）。ドメインのみの場合は
                /v1 を補います。
              </p>
              <Field label="API キー">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={settings.apiKey}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      apiKey: e.target.value,
                      clearApiKey: false,
                    })
                  }
                  placeholder={
                    settings.hasApiKey
                      ? "登録済み（空欄で現在のキーを保持）"
                      : "APIキーを入力"
                  }
                />
              </Field>
              <p className="admin-muted">
                状態：{settings.hasApiKey ? "登録済み" : "未登録"}
                。保存済みのキーは表示されません。
              </p>
              {settings.hasApiKey && (
                <label className="drill-check">
                  <input
                    type="checkbox"
                    checked={!!settings.clearApiKey}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        clearApiKey: e.target.checked,
                        apiKey: "",
                      })
                    }
                  />
                  登録済みのAPIキーを削除する
                </label>
              )}
              <Field label="使用モデル名">
                <input
                  required
                  value={settings.model}
                  onChange={(e) =>
                    setSettings({ ...settings, model: e.target.value })
                  }
                />
              </Field>
              <Field label="重複防止モード">
                <select
                  value={settings.duplicatePreventionMode}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      duplicatePreventionMode: e.target
                        .value as AISettings["duplicatePreventionMode"],
                    })
                  }
                >
                  <option value="seed">シード値ベース</option>
                  <option value="history">履歴ベース</option>
                </select>
              </Field>
              <button className="admin-button primary">
                {busy ? "保存中..." : "システム設定を保存"}
              </button>
            </fieldset>
          </form>
        ) : (
          <p>設定を読み込み中...</p>
        )}
      </section>
    </>
  );
}
