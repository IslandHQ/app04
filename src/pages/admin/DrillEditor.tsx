import { useState } from "react";
import { Dialog, Field } from "../../components/admin/Form";
import { api, type Course } from "../../lib/platform";
import {
  emptyLearningQuestion,
  learningQuestions,
  type LearningDrill,
  type DrillUnit,
  type LearningQuestion,
} from "../../lib/drills";
import { generateDrills } from "../../lib/ai";
export default function DrillEditor({
  initial,
  units,
  courses,
  onClose,
  onSaved,
}: {
  initial: LearningDrill;
  units: DrillUnit[];
  courses: Course[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [drill, setDrill] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const readonly = drill.status !== "draft";
  const q = drill.questions[index];
  function patch(value: Partial<LearningQuestion>) {
    setDrill({
      ...drill,
      questions: drill.questions.map((q, i) =>
        i === index ? { ...q, ...value } : q,
      ),
    });
  }
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const u = units.find((u) => u.id === drill.unitId)!;
      const c = courses.find((c) => c.id === u.courseId);
      const qs = await generateDrills(
        u.subject,
        u.name,
        Math.min(drill.targetCount, 20),
        drill.questions.map((q) => q.text),
        undefined,
        `コース：${c?.name}。対象：${c?.audience}。学習範囲：${c?.description}。`,
      );
      if (!qs.length)
        throw new Error("管理画面のシステム設定でAIキーを登録してください");
      setDrill({
        ...drill,
        questions: [
          ...drill.questions.filter((q) => q.text.trim()),
          ...learningQuestions(qs),
        ],
      });
      setIndex(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={readonly ? "ドリル内容" : "ドリルを編集"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(`/admin/drills/${drill.id}`, "PUT", drill);
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && (
          <p role="alert" className="admin-alert error">
            {error}
          </p>
        )}
        {readonly && (
          <p className="admin-muted">
            公開後の問題は固定されます。変更する場合は一覧から複製してください。
          </p>
        )}
        <fieldset disabled={readonly || busy}>
          <div className="admin-form-grid">
            <Field label="ドリル名">
              <input
                required
                value={drill.title}
                onChange={(e) => setDrill({ ...drill, title: e.target.value })}
              />
            </Field>
            <Field label="単元">
              <select
                value={drill.unitId}
                onChange={(e) => setDrill({ ...drill, unitId: e.target.value })}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.courseName} / {u.subject} / {u.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </fieldset>
        <div className="drill-question-nav" aria-label="問題を選択">
          {drill.questions.map((_, i) => (
            <button
              type="button"
              key={i}
              className={`admin-button ${index === i ? "primary" : ""}`}
              onClick={() => setIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {q ? (
          <fieldset disabled={readonly || busy}>
            <h3>
              問題 {index + 1} / {drill.questions.length}
            </h3>
            <Field label="問題文">
              <textarea
                required
                value={q.text}
                onChange={(e) => patch({ text: e.target.value })}
              />
            </Field>
            <div className="admin-form-grid">
              {q.choices.map((choice, i) => (
                <Field key={i} label={`選択肢 ${i + 1}`}>
                  <input
                    required
                    value={choice}
                    onChange={(e) =>
                      patch({
                        choices: q.choices.map((v, j) =>
                          i === j ? e.target.value : v,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <Field label="正解">
              <select
                value={q.answer}
                onChange={(e) => patch({ answer: Number(e.target.value) })}
              >
                {q.choices.map((_, i) => (
                  <option key={i} value={i}>
                    選択肢 {i + 1}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="解説">
              <textarea
                value={q.explanation}
                onChange={(e) => patch({ explanation: e.target.value })}
              />
            </Field>
            <div className="admin-form-grid">
              <Field label="ヒント1">
                <textarea
                  value={q.hint1}
                  onChange={(e) => patch({ hint1: e.target.value })}
                />
              </Field>
              <Field label="ヒント2">
                <textarea
                  value={q.hint2}
                  onChange={(e) => patch({ hint2: e.target.value })}
                />
              </Field>
            </div>
            <button
              type="button"
              className="admin-button danger"
              onClick={() => {
                setDrill({
                  ...drill,
                  questions: drill.questions.filter((_, i) => i !== index),
                });
                setIndex(Math.max(0, index - 1));
              }}
            >
              この問題を削除
            </button>
          </fieldset>
        ) : (
          <p className="admin-empty">
            問題はまだありません。手動入力またはAIで作成できます。
          </p>
        )}
        {!readonly && (
          <fieldset disabled={busy}>
            <div className="admin-actions">
              <button
                type="button"
                className="admin-button"
                disabled={drill.questions.length >= 100}
                onClick={() => {
                  setIndex(drill.questions.length);
                  setDrill({
                    ...drill,
                    questions: [...drill.questions, emptyLearningQuestion()],
                  });
                }}
              >
                手動で問題を追加
              </button>
              <button
                type="button"
                className="admin-button"
                disabled={
                  drill.questions.length + Math.min(drill.targetCount, 20) > 100
                }
                onClick={generate}
              >
                AIで{Math.min(drill.targetCount, 20)}問追加
              </button>
              <button className="admin-button primary">
                {busy ? "処理中..." : "下書きを保存"}
              </button>
            </div>
          </fieldset>
        )}
      </form>
    </Dialog>
  );
}
