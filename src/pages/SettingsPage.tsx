import AIOptions from '../components/AIOptions';
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Storage, type UserData } from "../lib/storage";
import { useAuth } from "../contexts/AuthContext";
export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Storage.getUserData()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1>アカウント設定</h1>
        <p>名前と学習対象を変更できます。</p>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <form
          className="glass-panel"
          style={{ padding: 24 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await Storage.saveUserData(data);
              setNotice("アカウント設定を保存しました");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="account-name">ニックネーム</label>
          <input
            id="account-name"
            className="input-field"
            required
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
          />
          <label htmlFor="account-grade">学年・学習対象（任意）</label>
          <input
            id="account-grade"
            className="input-field"
            placeholder="例：中2、簿記3級"
            value={data.grade}
            onChange={(e) => setData({ ...data, grade: e.target.value })}
          />
          <button
            className="btn btn-primary"
            style={{ marginTop: 20 }}
            disabled={busy}
          >
            アカウント設定を保存
          </button>
        </form>
      )}
      <AIOptions />
      {user?.role === "admin" && (
        <p style={{ marginTop: 24 }}>
          <Link to="/admin/settings">管理画面のシステム設定へ →</Link>
        </p>
      )}
      <button
        className="btn btn-danger"
        style={{ marginTop: 24 }}
        onClick={logout}
      >
        ログアウト
      </button>
    </div>
  );
}
