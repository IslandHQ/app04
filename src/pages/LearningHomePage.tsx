import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Flame, Play, RefreshCw } from "lucide-react";
import { Storage, type UserData } from "../lib/storage";
import { api } from "../lib/platform";
import type { DrillAssignment } from "../lib/drills";
import "../admin.css";
import "../drills.css";
export default function LearningHomePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [assignments, setAssignments] = useState<DrillAssignment[]>([]);
  const [filter, setFilter] = useState({
    course: "",
    subject: "",
    status: "all",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      Storage.getUserData(),
      api<DrillAssignment[]>("/drill-assignments"),
    ]);
    if (results[0].status === "fulfilled") setUser(results[0].value);
    if (results[1].status === "fulfilled") setAssignments(results[1].value);
    const failed = results.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") setError(failed.reason.message);
  }, []);
  useEffect(() => {
    // Load persisted data when this page mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  async function start(a: DrillAssignment) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>(
        `/drill-assignments/${a.id}/start`,
        "POST",
        { mode: "all" },
      );
      navigate(`/learn/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = assignments.filter(
    (a) =>
      (!filter.course || a.courseId === filter.course) &&
      (!filter.subject || a.subject === filter.subject) &&
      (filter.status === "all" ||
        (filter.status === "incomplete"
          ? a.completedCount === 0
          : a.completedCount > 0)),
  );
  const weak = user
    ? Object.entries(user.detailedStats)
        .filter(([, s]) => s.total >= 2 && s.correct / s.total < 0.8)
        .sort(([, a], [, b]) => a.correct / a.total - b.correct / b.total)[0]
    : undefined;
  const completed = assignments.filter((a) => a.completedCount > 0).length;
  return (
    <div className="learning-home">
      <header>
        <p className="admin-eyebrow">DAILY LEARNING</p>
        <h1>{user ? `${user.name}さんの学習` : "今日の学習"}</h1>
        <p className="admin-muted">今日も、ひとつずつ理解を深めよう。</p>
      </header>
      {error && (
        <div role="alert" className="admin-alert error">
          {error}
          <button
            className="admin-button"
            onClick={() => {
              setError("");
              load();
            }}
          >
            再読み込み
          </button>
        </div>
      )}
      <section className="learning-hero">
        <div>
          <BookOpen size={26} />
          <h2>学習ドリル</h2>
          <p>
            {completed} / {assignments.length} セット完了
          </p>
        </div>
        <div className="learning-streak">
          <Flame size={20} />
          {user?.streak || 0}日連続
          <small>
            Lv. {user?.level || 1} · {user?.exp || 0} EXP
          </small>
        </div>
        <progress max={Math.max(1, assignments.length)} value={completed} />
      </section>
      {weak && (
        <Link
          className="learning-weak"
          to={`/drill?subject=${encodeURIComponent(weak[0].split(":")[0])}&topic=${encodeURIComponent(weak[0].split(":").slice(1).join(":"))}`}
        >
          <RefreshCw size={18} />
          <span>
            <b>苦手発見！ {weak[0].split(":")[0]}</b>
            <small>{weak[0].split(":").slice(1).join(":")} を復習しよう</small>
          </span>
        </Link>
      )}
      <div className="learning-filters">
        <label>
          コース
          <select
            value={filter.course}
            onChange={(e) =>
              setFilter({ ...filter, course: e.target.value, subject: "" })
            }
          >
            <option value="">すべて</option>
            {[
              ...new Map(
                assignments.map((a) => [a.courseId, a.courseName]),
              ).entries(),
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          表示
          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="all">すべてのドリル</option>
            <option value="incomplete">未完了</option>
            <option value="completed">完了済み・復習</option>
          </select>
        </label>
      </div>
      <div className="learning-subjects">
        <button
          className={!filter.subject ? "active" : ""}
          onClick={() => setFilter({ ...filter, subject: "" })}
        >
          すべての科目
        </button>
        {[
          ...new Set(
            assignments
              .filter((a) => !filter.course || a.courseId === filter.course)
              .map((a) => a.subject),
          ),
        ].map((s) => (
          <button
            key={s}
            className={filter.subject === s ? "active" : ""}
            onClick={() => setFilter({ ...filter, subject: s })}
          >
            {s}
          </button>
        ))}
      </div>
      {[
        ...new Set(
          visible.map((a) => `${a.courseId}:${a.subject}:${a.unitName}`),
        ),
      ].map((key) => {
        const items = visible.filter(
          (a) => `${a.courseId}:${a.subject}:${a.unitName}` === key,
        );
        return (
          <section className="learning-unit" key={key}>
            <h2>
              {items[0].subject} · {items[0].unitName}
            </h2>
            <p className="admin-muted">{items[0].courseName}</p>
            {items.map((a) => (
              <article className="learning-drill-card" key={a.id}>
                <div>
                  <span
                    className={`admin-badge ${a.completedCount ? "published" : "draft"}`}
                  >
                    {a.currentSessionId
                      ? "学習中"
                      : a.completedCount
                        ? "完了済み"
                        : "これから"}
                  </span>
                  <h3>{a.title}</h3>
                  <p>
                    {a.questionCount}問
                    {a.targetDate ? ` · 目標 ${a.targetDate}` : ""}
                  </p>
                  {a.completedCount > 0 && (
                    <p className="admin-muted">
                      {a.completedCount}回完了 · 最高 {a.bestCorrect}/
                      {a.questionCount}問正解
                    </p>
                  )}
                </div>
                <button
                  className="admin-button primary"
                  disabled={busy}
                  onClick={() => start(a)}
                >
                  <Play size={16} />
                  {a.currentSessionId
                    ? "続きから"
                    : a.completedCount
                      ? "もう一度"
                      : "学習する"}
                </button>
                {a.currentSessionId && (
                  <progress max={a.questionCount} value={a.answeredCount} />
                )}
              </article>
            ))}
          </section>
        );
      })}
      {!visible.length && (
        <div className="admin-empty">
          {!assignments.length
            ? "まだドリルは配布されていません。先生・管理者からの配布を待つか、自由練習に取り組めます。"
            : "この条件に一致するドリルはありません。"}
        </div>
      )}
      <div className="learning-secondary">
        <Link to="/practice">AIで自由練習 →</Link>
        <Link to="/tests">確認テストを受ける →</Link>
      </div>
    </div>
  );
}
