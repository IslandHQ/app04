import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/platform";
export default function LearningSupport({
  sessionId,
  skillIds,
}: {
  sessionId: string;
  skillIds?: string[];
}) {
  const [support, setSupport] = useState<{
    skillIds: string[];
    returnSessionId: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    api<{ skillIds: string[]; returnSessionId: string | null }>(
      "/learning-support/" + sessionId,
    )
      .then((s) => {
        if (active) setSupport(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionId]);
  const skill = skillIds?.[0] || support?.skillIds[0];
  return (
    <aside className="admin-card" style={{ padding: 16, margin: "18px 0" }}>
      <h3>難しいと感じたら</h3>
      <Link
        className="admin-button"
        to={
          "/understanding?" +
          new URLSearchParams({
            ...(skill ? { skill } : {}),
            return: sessionId,
          })
        }
      >
        もっとやさしく・例で説明
      </Link>
      {support?.returnSessionId && (
        <Link className="admin-button" to={"/learn/" + support.returnSessionId}>
          元の問題に戻る
        </Link>
      )}
      {!skill && (
        <p>この問題の技能は未設定です。理解度一覧から基礎を選べます。</p>
      )}
    </aside>
  );
}
