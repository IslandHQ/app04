import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Assignment, type Attempt } from "../lib/platform";
import "../admin.css";

const when = (d: string | null) =>
  d ? new Date(d).toLocaleString("ja-JP") : "期限なし";
export default function TestsPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [history, setHistory] = useState<Attempt[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const load = useCallback(async () => {
    if (attemptId) {
      const r = await api<Attempt>(`/attempts/${attemptId}`);
      setAttempt(r);
      setAnswers(r.answers);
    } else {
      const [a, h] = await Promise.all([
        api<Assignment[]>("/assignments"),
        api<Attempt[]>("/attempts"),
      ]);
      setAssignments(a);
      setHistory(h);
      setAttempt(null);
    }
    setDirty(false);
  }, [attemptId]);
  // Reload the remote attempt when the route changes, including direct result links.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    setNotice("");
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    if (!attempt?.endsAt || attempt.status !== "in_progress") return;
    let fetching = false;
    let cancelled = false;
    const tick = async () => {
      const seconds = Math.max(
        0,
        Math.ceil((Date.parse(attempt.endsAt!) - Date.now()) / 1000),
      );
      setRemaining(seconds);
      if (seconds === 0 && !fetching) {
        fetching = true;
        try {
          const r = await api<Attempt>(`/attempts/${attempt.id}`);
          if (!cancelled && r.status === "submitted") {
            setAttempt(r);
            setAnswers(r.answers);
            setDirty(false);
            setNotice("制限時間に達したため、保存済みの回答を提出しました");
          }
        } catch (e) {
          if (!cancelled) setError((e as Error).message);
        } finally {
          fetching = false;
        }
      }
    };
    const timer = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [attempt?.id, attempt?.endsAt, attempt?.status]);
  async function start(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>(`/assignments/${id}/start`, "POST");
      navigate(`/tests/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(submit: boolean, nextAnswers = answers) {
    if (!attempt) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<Attempt>(`/attempts/${attempt.id}`, "PUT", {
        answers: nextAnswers,
        submit,
      });
      setAttempt(r);
      setAnswers(r.answers);
      setDirty(false);
      setNotice(
        r.status === "submitted" ? "提出しました" : "回答を保存しました",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="learner-tests">
      <header>
        <p className="admin-eyebrow">MY LEARNING</p>
        <h1>{attempt ? attempt.title : "割り当てられたテスト"}</h1>
        <p className="admin-muted">
          {attempt
            ? "回答を保存して、中断した場所から再開できます。"
            : "取り組むテストと、これまでの結果を確認できます。"}
        </p>
      </header>
      {error && (
        <div role="alert" className="admin-alert error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="admin-alert success">
          {notice}
        </div>
      )}
      {loading ? (
        <p>読み込み中...</p>
      ) : attempt ? (
        <>
          <button
            className="admin-button"
            disabled={busy}
            onClick={() => {
              if (
                !dirty ||
                confirm("未保存の回答があります。一覧に戻りますか？")
              )
                navigate("/tests");
            }}
          >
            テスト一覧へ
          </button>
          {attempt.status === "submitted" ? (
            <div className="admin-card">
              <h2>{attempt.passed ? "合格" : "不合格"}</h2>
              <p className="test-score">
                {attempt.score}
                <small> / {attempt.total} 点</small>
              </p>
              <p>{when(attempt.submittedAt)} 提出</p>
            </div>
          ) : (
            <div className="admin-card">
              <b>
                {Object.keys(answers).length} / {attempt.questions.length}{" "}
                問回答
              </b>
              {attempt.endsAt && (
                <p role="timer">
                  制限時間まで：
                  {remaining === null
                    ? when(attempt.endsAt)
                    : `${Math.floor(remaining / 60)}分${remaining % 60}秒`}
                </p>
              )}
              <p className="admin-muted">
                {dirty
                  ? "未保存の変更があります。移動する前に回答を保存してください。"
                  : "回答は選択時に自動保存されます。通信に失敗した場合は「途中保存」で再試行できます。"}
              </p>
            </div>
          )}
          {attempt.questions.map((q, i) => (
            <section className="admin-card" key={q.id}>
              <div className="admin-toolbar">
                <b>問題 {i + 1}</b>
                <span>
                  {q.points}点 · {q.category}
                </span>
              </div>
              <h2 className="test-question-text">{q.text}</h2>
              <fieldset disabled={attempt.status === "submitted" || busy}>
                <legend className="sr-only">問題{i + 1}の回答</legend>
                {q.choices.map((choice, j) => (
                  <label
                    className={`test-choice ${answers[q.id] === j ? "selected" : ""}`}
                    key={j}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === j}
                      onChange={() => {
                        const next = { ...answers, [q.id]: j };
                        setAnswers(next);
                        setDirty(true);
                        save(false, next);
                      }}
                    />
                    {choice}
                  </label>
                ))}
              </fieldset>
              {q.answer !== undefined && (
                <details open={attempt.status === "submitted"}>
                  <summary>
                    {attempt.status === "submitted"
                      ? answers[q.id] === q.answer
                        ? "正解"
                        : "不正解"
                      : "解説を見る（練習モード）"}
                  </summary>
                  <p>正解：{q.choices[q.answer]}</p>
                  <p>{q.explanation}</p>
                </details>
              )}
            </section>
          ))}
          {attempt.status !== "submitted" && (
            <div className="admin-actions">
              <button
                className="admin-button"
                disabled={busy}
                onClick={() => save(false)}
              >
                途中保存
              </button>
              <button
                className="admin-button primary"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      `${attempt.questions.length - Object.keys(answers).length}問が未回答です。提出後は回答を変更できません。提出しますか？`,
                    )
                  )
                    save(true);
                }}
              >
                提出して採点
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="test-list">
            {assignments.map((a) => (
              <section className="admin-card" key={a.id}>
                <span className={`admin-badge ${a.status}`}>
                  {a.testStatus === "closed" && a.status !== "submitted"
                    ? "テスト終了"
                    : {
                        pending: "未着手",
                        in_progress: "受験中",
                        submitted: "提出済み",
                        overdue: "期限超過",
                      }[a.status]}
                </span>
                <h2>{a.title}</h2>
                <p>
                  {a.questionCount}問 · {a.mode === "exam" ? "試験" : "練習"} ·{" "}
                  {a.timeLimitMinutes
                    ? `制限時間 ${a.timeLimitMinutes}分`
                    : "時間制限なし"}
                </p>
                <p>期限：{when(a.dueAt)}</p>
                <p className="admin-muted">
                  受験回数 {a.attempts} / {a.maxAttempts}
                </p>
                <button
                  className="admin-button primary"
                  disabled={
                    busy ||
                    a.testStatus === "closed" ||
                    a.status === "overdue" ||
                    (a.status !== "in_progress" && a.attempts >= a.maxAttempts)
                  }
                  onClick={() => start(a.id)}
                >
                  {a.status === "in_progress"
                    ? "続きを解く"
                    : a.attempts
                      ? "再受験する"
                      : "受験を開始"}
                </button>
              </section>
            ))}
          </div>
          {!assignments.length && (
            <div className="admin-empty">
              まだテストは割り当てられていません。
            </div>
          )}
          <h2>受験履歴</h2>
          {history
            .filter((h) => h.status === "submitted")
            .map((h) => (
              <Link
                className="admin-card test-result-link"
                key={h.id}
                to={`/tests/${h.id}`}
              >
                <div>
                  <b>{h.title}</b>
                  <small>{when(h.submittedAt)}</small>
                </div>
                <span>
                  {h.score} / {h.total}点 →
                </span>
              </Link>
            ))}
        </>
      )}
    </div>
  );
}
