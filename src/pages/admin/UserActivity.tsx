import { useEffect, useState } from "react";
import { Storage, type DailyRecord, type ChatLog } from "../../lib/storage";
import type { Assignment, Attempt } from "../../lib/platform";

export default function UserActivity({
  userId,
  assignments,
  results,
  onResult,
}: {
  userId: string;
  assignments: Assignment[];
  results: Attempt[];
  onResult: (r: Attempt) => void;
}) {
  const [activity, setActivity] = useState<{
    userId: string;
    records: DailyRecord[];
    chats: ChatLog[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      Storage.getAdminUserRecords(userId),
      Storage.getAdminUserChatLogs(userId),
    ])
      .then(([records, chats]) => {
        if (!cancelled) setActivity({ userId, records, chats });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const own = results.filter((r) =>
    assignments.some((a) => a.userId === userId && a.id === r.assignmentId),
  );
  return (
    <section>
      <h3>テスト結果</h3>
      {own.length ? (
        own.map((r) => (
          <div className="admin-list-row" key={r.id}>
            <span>
              {r.title}
              <small>
                {r.score} / {r.total}点 · {r.passed ? "合格" : "不合格"}
              </small>
            </span>
            <button
              type="button"
              className="admin-button"
              onClick={() => onResult(r)}
            >
              答案
            </button>
          </div>
        ))
      ) : (
        <p className="admin-muted">提出済みのテストはありません。</p>
      )}
      <h3>通常ドリルの学習履歴</h3>
      {error ? (
        <p role="alert">{error}</p>
      ) : activity?.userId !== userId ? (
        <p>読み込み中...</p>
      ) : (
        <>
          <p>
            累計 {activity.records.reduce((s, r) => s + r.studyMinutes, 0)} 分 ·{" "}
            {activity.records.reduce((s, r) => s + r.totalQuestions, 0)} 問回答
          </p>
          {activity.records
            .slice(-7)
            .reverse()
            .map((r) => (
              <div className="admin-list-row" key={r.date}>
                <span>{r.date}</span>
                <span>
                  {r.studyMinutes}分 · {r.correctAnswers}/{r.totalQuestions}
                  問正解
                </span>
              </div>
            ))}
          <h3>AIとの会話履歴</h3>
          {activity.chats.slice(0, 10).map((log) => (
            <details className="admin-question" key={log.id}>
              <summary>
                {log.subject} / {log.topic} ·{" "}
                {new Date(log.created_at).toLocaleDateString("ja-JP")}
              </summary>
              {log.chat_history.map((m, i) => (
                <p key={i}>
                  <b>{m.role === "user" ? "学習者" : "AI"}：</b>
                  {m.content}
                </p>
              ))}
            </details>
          ))}
          {!activity.chats.length && (
            <p className="admin-muted">会話履歴はありません。</p>
          )}
        </>
      )}
    </section>
  );
}
