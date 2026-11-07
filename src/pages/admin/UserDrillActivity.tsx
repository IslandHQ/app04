import { useEffect, useState } from "react";
import { api } from "../../lib/platform";
import type { DrillAssignment } from "../../lib/drills";
export default function UserDrillActivity({ userId }: { userId: string }) {
  const [rows, setRows] = useState<DrillAssignment[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    api<DrillAssignment[]>("/admin/drill-assignments")
      .then((a) => {
        if (!cancelled) setRows(a.filter((r) => r.userId === userId));
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return (
    <section>
      <h3>配布された学習ドリル</h3>
      {error && <p role="alert">{error}</p>}
      {rows === null ? (
        <p>読み込み中...</p>
      ) : rows.length ? (
        rows.map((a) => (
          <div className="admin-list-row" key={a.id}>
            <span>
              {a.title}
              <small>
                {a.courseName} / {a.subject} / {a.unitName}
              </small>
            </span>
            <span>
              {!a.active
                ? "取り下げ済み"
                : a.completedCount
                  ? `${a.completedCount}回完了`
                  : `${a.answeredCount}/${a.questionCount}問回答`}
              <small>
                最高 {a.bestCorrect}/{a.questionCount}問正解
              </small>
            </span>
          </div>
        ))
      ) : (
        <p className="admin-muted">まだドリルは配布されていません。</p>
      )}
    </section>
  );
}
