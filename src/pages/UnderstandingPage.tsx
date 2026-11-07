import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/platform";
import type { SkillEstimate } from "../../shared/adaptive";
const labels = {
  insufficient: "判断材料が不足",
  developing: "理解を確認中",
  secure: "できていそう",
};
export default function UnderstandingPage({ userId }: { userId?: string }) {
  const [rows, setRows] = useState<SkillEstimate[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate();
  const selected = params.get("skill"),
    returnId = params.get("return");
  useEffect(() => {
    let active = true;
    api<SkillEstimate[]>(
      userId ? "/admin/understanding/" + userId : "/understanding",
    )
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [userId]);
  const focus = rows.find((r) => r.id === selected);
  const uncertain = rows
    .filter((r) => r.status === "developing")
    .sort((a, b) => (a.estimate ?? 0) - (b.estimate ?? 0))[0];
  const next = uncertain
    ? rows.find(
        (r) =>
          uncertain.prerequisiteIds.includes(r.id) && r.status !== "secure",
      ) || uncertain
    : rows.find(
        (r) =>
          r.status === "insufficient" &&
          r.prerequisiteIds.every(
            (id) => rows.find((s) => s.id === id)?.status === "secure",
          ),
      );
  return (
    <section className="understanding-page">
      <h1>{userId ? "学習者の理解度" : "いまの理解と、次の一歩"}</h1>
      <p>
        正答率だけで決めず、初見の問題・ヒント・繰り返しを区別した推定です。診断結果や能力の断定ではありません。
      </p>
      {!userId && returnId && (
        <Link className="admin-button" to={"/learn/" + returnId}>
          元の問題に戻る
        </Link>
      )}
      {error && <p role="alert">{error}</p>}
      {!focus && next && (
        <div className="admin-card" style={{ padding: 20, marginTop: 16 }}>
          <h2>次のおすすめ：{next.name}</h2>
          <p>
            {uncertain
              ? `${uncertain.name}の回答に不安定な点があるため、基礎から確認できます。`
              : "判断材料がまだ少ないので、前提の基礎から少しずつ確かめましょう。"}
          </p>
          <button
            type="button"
            className="admin-button primary"
            onClick={() =>
              setParams({
                skill: next.id,
                ...(returnId ? { return: returnId } : {}),
              })
            }
          >
            説明と基礎問題を見る
          </button>
        </div>
      )}
      {focus && (
        <div className="admin-card">
          <h2>{focus.name}</h2>
          <p>{focus.description || "説明は準備中です。"}</p>
          <details open>
            <summary>例で説明</summary>
            <p style={{ whiteSpace: "pre-wrap" }}>
              {focus.example || "具体例は準備中です。"}
            </p>
          </details>
          <h3>もっとやさしく・一つ前の基礎へ</h3>
          {focus.prerequisiteIds.length ? (
            focus.prerequisiteIds.map((id) => (
              <button
                type="button"
                className="admin-button"
                key={id}
                onClick={() =>
                  setParams({
                    skill: id,
                    ...(returnId ? { return: returnId } : {}),
                  })
                }
              >
                {rows.find((r) => r.id === id)?.name || "基礎を確認"}
              </button>
            ))
          ) : (
            <p>
              ここが登録された基礎の出発点です。説明と基礎問題で、ゆっくり確認できます。
            </p>
          )}
          <button
            type="button"
            className="admin-button"
            onClick={() => setParams(returnId ? { return: returnId } : {})}
          >
            理解度一覧へ
          </button>
        </div>
      )}
      {(!focus ? rows : [focus]).map((s) => (
        <article
          className="admin-card"
          key={s.id}
          style={{ marginTop: 16, padding: 20 }}
        >
          <p className="admin-eyebrow">{s.subject}</p>
          <h2>{s.name}</h2>
          <strong>
            {labels[s.status]}
            {s.estimate !== null ? ` · 推定 ${s.estimate}%` : ""}
          </strong>
          {s.estimate !== null && <progress max={100} value={s.estimate} />}
          <p>
            異なる問題 {s.distinctQuestions}問 / 回答 {s.answers}回 / ヒント利用{" "}
            {s.assisted}回
          </p>
          {s.lastAnsweredAt && (
            <p className="admin-muted">
              最終回答：{new Date(s.lastAnsweredAt).toLocaleDateString("ja-JP")}
              。時間が空いたら初見の問題で再確認しましょう。
            </p>
          )}
          <p>
            {s.status === "insufficient"
              ? "異なる問題を3問以上解くと、傾向を示します。"
              : s.status === "secure"
                ? "別の初見問題でも確かめて、次へ進みましょう。"
                : "説明や前提の基礎を確認してから、新しい問題で試しましょう。"}
          </p>
          <div className="admin-actions">
            <button
              type="button"
              className="admin-button"
              onClick={() =>
                setParams({
                  skill: s.id,
                  ...(returnId ? { return: returnId } : {}),
                })
              }
            >
              説明・基礎を確認
            </button>
            {!userId && (
              <button
                type="button"
                className="admin-button primary"
                disabled={busy || !s.practiceAvailable}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const r = await api<{ id: string }>(
                      "/skills/" + s.id + "/practice",
                      "POST",
                      { returnSessionId: returnId },
                    );
                    navigate("/learn/" + r.id);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {s.practiceAvailable ? "基礎問題を解く" : "問題は準備中"}
              </button>
            )}
          </div>
        </article>
      ))}
      {loaded && !rows.length && (
        <p>技能が設定されたドリルを学習すると、理解度を確認できます。</p>
      )}
      <details style={{ marginTop: 20 }}>
        <summary>推定の根拠</summary>
        <p>
          同じ問題文は1問として扱い、初回を重み1、最後の再回答を0.2で加算します。ヒント1利用の正解は0.65、ヒント2は0.35、独力正解は1として計算し、少数回答への過信を避ける補正を加えています。3種類未満は判断材料不足、推定75%以上は「できていそう」です。未分類の問題は推定に含めません。
        </p>
      </details>
    </section>
  );
}
