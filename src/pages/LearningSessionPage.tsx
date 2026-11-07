import LearningSupport from "../components/LearningSupport";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/platform";
import type { LearningSession } from "../lib/drills";
import AIChatModal from "../components/AIChatModal";
import "../admin.css";
import "../drills.css";
export default function LearningSessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<LearningSession | null>(null);
  const [index, setIndex] = useState(0);
  const [hint, setHint] = useState(0);
  const [summary, setSummary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<LearningSession>(`/drill-sessions/${sessionId}`)
      .then((s) => {
        if (!active) return;
        setSession(s);
        setIndex(
          Math.max(
            0,
            s.questions.findIndex((q) => !s.answers[q.id]),
          ),
        );
        setSummary(s.completed);
        setHint(
          s.hintLevels?.[s.questions.find((q) => !s.answers[q.id])?.id || ""] ||
            0,
        );
        setError("");
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);
  async function answer(choice: number) {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      setSession(
        await api<LearningSession>(
          `/drill-sessions/${session.id}/answer`,
          "POST",
          { questionId: session.questions[index].id, choice },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restart(mode: "all" | "mistakes") {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>(
        `/drill-assignments/${session.assignmentId}/start`,
        "POST",
        { mode },
      );
      navigate(`/learn/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const correct = session
    ? Object.values(session.answers).filter((a) => a.correct).length
    : 0;
  const q = session?.questions[index];
  const result = q && session?.answers[q.id];
  return (
    <div className="learning-session">
      <Link to="/">← 学習ホーム</Link>
      {error && (
        <p role="alert" className="admin-alert error">
          {error}
        </p>
      )}
      {!session ? (
        <p>ドリルを読み込み中...</p>
      ) : (
        <>
          <header>
            <p className="admin-eyebrow">
              {session.courseName} / {session.subject}
            </p>
            <h1>{session.title}</h1>
            <p>
              {session.unitName}
              {session.mode === "mistakes" ? " · 間違えた問題の復習" : ""}
            </p>
          </header>
          <LearningSupport sessionId={session.id} skillIds={q?.skillIds} />
          {summary ? (
            <section className="learning-result">
              <h2>おつかれさまでした！</h2>
              <strong>
                {correct}
                <small> / {session.questions.length}問 正解</small>
              </strong>
              <p>学習記録を保存しました。</p>
              <div className="admin-actions">
                {correct < session.questions.length && (
                  <button
                    className="admin-button primary"
                    disabled={busy}
                    onClick={() => restart("mistakes")}
                  >
                    間違えた問題だけ復習
                  </button>
                )}
                <button
                  className="admin-button"
                  disabled={busy}
                  onClick={() => restart("all")}
                >
                  もう一度すべて解く
                </button>
                <Link className="admin-button" to="/">
                  学習ホームへ
                </Link>
              </div>
              <details>
                <summary>解説を振り返る</summary>
                {session.questions.map((q) => (
                  <div className="admin-question" key={`${session.id}:${q.id}`}>
                    <h3>{q.text}</h3>
                    <p>正解：{q.choices[q.answer!]}</p>
                    <p>{q.explanation}</p>
                  </div>
                ))}
              </details>
            </section>
          ) : (
            q && (
              <>
                <div className="learning-progress">
                  <span>
                    問題 {index + 1} / {session.questions.length}
                  </span>
                  <span>回答は自動で保存されます</span>
                  <progress
                    value={Object.keys(session.answers).length}
                    max={session.questions.length}
                  />
                </div>
                <section className="learning-question">
                  <h2>{q.text}</h2>
                  {q.choices.map((choice, i) => (
                    <button
                      key={i}
                      className={`test-choice ${result?.choice === i ? "selected" : ""}`}
                      disabled={busy || !!result}
                      onClick={() => answer(i)}
                    >
                      {i + 1}. {choice}
                    </button>
                  ))}
                </section>
                {!result && (
                  <section className="learning-hints">
                    <button
                      className="admin-button"
                      disabled={busy || hint >= 2}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await api(
                            "/learning-support/" + session.id + "/hint",
                            "POST",
                            { questionId: q.id, level: hint + 1 },
                          );
                          setHint(hint + 1);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {hint ? "もう少しヒントを見る" : "ヒントを見る"}
                    </button>
                    {hint > 0 && (
                      <p>
                        {(hint === 1 ? q.hint1 : q.hint2) ||
                          "問題文の条件を一つずつ確認してみましょう。"}
                      </p>
                    )}
                  </section>
                )}
                {result && (
                  <section
                    className={`learning-feedback ${result.correct ? "correct" : "incorrect"}`}
                    role="status"
                  >
                    <h2>
                      {result.correct
                        ? "正解です！"
                        : "解説を読んで、理解しよう"}
                    </h2>
                    <p>正解：{q.choices[q.answer!]}</p>
                    <p>{q.explanation}</p>
                    <button
                      className="admin-button primary"
                      onClick={() => {
                        if (index === session.questions.length - 1)
                          setSummary(true);
                        else {
                          setIndex(index + 1);
                          setHint(0);
                        }
                      }}
                    >
                      {index === session.questions.length - 1
                        ? "結果を見る"
                        : "次の問題へ"}
                    </button>
                  </section>
                )}
                <AIChatModal
                  key={q.id}
                  onUseHelp={async () => {
                    if (!result)
                      await api(
                        "/learning-support/" + session.id + "/hint",
                        "POST",
                        { questionId: q.id, level: 2 },
                      );
                  }}
                  currentQuestion={{
                    subject: session.subject,
                    topic: session.unitName,
                    questionText: q.text,
                    choices: q.choices,
                    correctAnswer:
                      q.answer === undefined
                        ? "回答前のため非公開"
                        : q.choices[q.answer],
                    explanation: q.explanation || "",
                    hint1: q.hint1,
                    hint2: q.hint2,
                  }}
                />
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
