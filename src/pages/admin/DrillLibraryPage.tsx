import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, BookOpen, Layers, Sparkles } from "lucide-react";
import { api, type Course } from "../../lib/platform";
import {
  type DrillUnit,
  type LearningDrill,
  learningQuestions,
} from "../../lib/drills";
import { generateDrills } from "../../lib/ai";
import { Dialog, Field } from "../../components/admin/Form";
import DrillEditor from "./DrillEditor";
const starter =
  "国語,漢字・語句\n数学,正負の数\n数学,文字式\n英語,基本単語\n英語,be動詞\n理科,身の回りの生物\n社会,日本の地理";
export default function DrillLibraryPage() {
  const navigate = useNavigate();
  const [drills, setDrills] = useState<LearningDrill[]>([]);
  const [units, setUnits] = useState<DrillUnit[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filter, setFilter] = useState({
    course: "",
    subject: "",
    unit: "",
    status: "",
    search: "",
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<LearningDrill | null>(null);
  const [unitDialog, setUnitDialog] = useState(false);
  const [renameUnit, setRenameUnit] = useState<DrillUnit | null>(null);
  const [bulkDialog, setBulkDialog] = useState(false);
  const [courseDialog, setCourseDialog] = useState(false);
  const [courseForm, setCourseForm] = useState({
    name: "",
    audience: "",
    description: "",
  });
  const [unitForm, setUnitForm] = useState({ courseId: "", lines: "" });
  const [bulk, setBulk] = useState({
    unitIds: [] as string[],
    setsPerUnit: 1,
    questionCount: 5,
    titlePrefix: "練習",
  });
  const [instructions, setInstructions] = useState("");
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    current: string;
    errors: { id: string; title: string; message: string }[];
  } | null>(null);
  const stop = useRef(false);
  const load = useCallback(async () => {
    const [d, u, c] = await Promise.all([
      api<LearningDrill[]>("/admin/drills"),
      api<DrillUnit[]>("/admin/drill-units"),
      api<Course[]>("/courses"),
    ]);
    setDrills(d);
    setUnits(u);
    setCourses(c);
  }, []);
  useEffect(() => {
    // Load persisted data when this page mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      stop.current = true;
    };
  }, [load]);
  async function run(fn: () => Promise<void>, message = "保存しました") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = drills.filter(
    (d) =>
      (!filter.course || d.courseId === filter.course) &&
      (!filter.subject || d.subject === filter.subject) &&
      (!filter.unit || d.unitId === filter.unit) &&
      (!filter.status || d.status === filter.status) &&
      `${d.title} ${d.unitName} ${d.subject}`
        .toLowerCase()
        .includes(filter.search.toLowerCase()),
  );
  const unitOptions = units.filter(
    (u) =>
      (!filter.course || u.courseId === filter.course) &&
      (!filter.subject || u.subject === filter.subject),
  );
  const chosen = drills.filter((d) => selected.includes(d.id));
  const toggle = (values: string[], id: string) =>
    values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
  const change = (patch: Partial<typeof filter>) => {
    setFilter({ ...filter, ...patch });
    setPage(0);
    setSelected([]);
  };
  async function generate(ids: string[]) {
    const targets = drills.filter(
      (d) =>
        ids.includes(d.id) && d.status === "draft" && d.questionCount === 0,
    );
    if (!targets.length) {
      setError("問題が空の下書きを選択してください");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    stop.current = false;
    const failures: { id: string; title: string; message: string }[] = [];
    let done = 0;
    for (const d of targets) {
      if (stop.current) break;
      setProgress({
        done,
        total: targets.length,
        current: d.title,
        errors: [...failures],
      });
      try {
        const c = courses.find((c) => c.id === d.courseId);
        const qs = await generateDrills(
          d.subject,
          d.unitName,
          d.targetCount,
          [],
          undefined,
          `コース：${c?.name}。対象者：${c?.audience}。範囲：${c?.description}。${instructions}`,
        );
        if (!qs.length)
          throw new Error("AIキーが未設定です。システム設定を確認してください");
        await api(`/admin/drills/${d.id}`, "PUT", {
          ...d,
          questions: learningQuestions(qs),
        });
      } catch (e) {
        failures.push({
          id: d.id,
          title: d.title,
          message: (e as Error).message,
        });
      }
      done++;
      setProgress({
        done,
        total: targets.length,
        current: "",
        errors: [...failures],
      });
    }
    try {
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    setNotice(
      `作成成功 ${done - failures.length}件 / 失敗 ${failures.length}件${stop.current ? "（残りは中断）" : ""}。問題と正解を確認してから公開してください。`,
    );
  }
  async function action(kind: string) {
    if (
      kind === "archive" &&
      !confirm(
        `${selected.length}件をアーカイブします。配布済みの学習は継続できます。`,
      )
    )
      return;
    await run(
      async () => {
        await api("/admin/drills/actions", "POST", {
          ids: selected,
          action: kind,
        });
        setSelected([]);
      },
      kind === "publish"
        ? "選択したドリルを公開しました"
        : kind === "duplicate"
          ? "下書きに複製しました"
          : "アーカイブしました",
    );
  }
  return (
    <div className="drill-library">
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
      <div className="drill-guide">
        <span>
          <b>1</b>コース・単元を登録
        </span>
        <span>
          <b>2</b>ドリルをまとめて作成
        </span>
        <span>
          <b>3</b>確認して公開・配布
        </span>
      </div>
      <div className="admin-toolbar">
        <div className="admin-actions">
          <button
            className="admin-button"
            disabled={busy}
            onClick={() => setCourseDialog(true)}
          >
            <BookOpen size={16} />
            コース追加
          </button>
          <button
            className="admin-button"
            disabled={busy || !courses.length}
            onClick={() => {
              setUnitForm({
                ...unitForm,
                courseId: filter.course || courses[0]?.id || "",
              });
              setUnitDialog(true);
            }}
          >
            <Layers size={16} />
            単元を一括登録
          </button>
          <button
            className="admin-button"
            disabled={busy || !filter.unit}
            onClick={() =>
              setRenameUnit(units.find((u) => u.id === filter.unit) || null)
            }
          >
            選択した単元を編集
          </button>
        </div>
        <button
          className="admin-button primary"
          disabled={busy || !units.length}
          onClick={() => {
            setBulk({ ...bulk, unitIds: filter.unit ? [filter.unit] : [] });
            setBulkDialog(true);
          }}
        >
          <Plus size={16} />
          ドリルをまとめて作成
        </button>
      </div>
      <div className="admin-card drill-filters">
        <Field label="コース">
          <select
            value={filter.course}
            onChange={(e) =>
              change({ course: e.target.value, subject: "", unit: "" })
            }
          >
            <option value="">すべてのコース</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="科目">
          <select
            value={filter.subject}
            onChange={(e) => change({ subject: e.target.value, unit: "" })}
          >
            <option value="">すべての科目</option>
            {[
              ...new Set(
                units
                  .filter((u) => !filter.course || u.courseId === filter.course)
                  .map((u) => u.subject),
              ),
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="単元">
          <select
            value={filter.unit}
            onChange={(e) => change({ unit: e.target.value })}
          >
            <option value="">すべての単元</option>
            {unitOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.subject} / {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="公開状態">
          <select
            value={filter.status}
            onChange={(e) => change({ status: e.target.value })}
          >
            <option value="">すべて</option>
            <option value="draft">下書き</option>
            <option value="published">公開中</option>
            <option value="archived">アーカイブ</option>
          </select>
        </Field>
        <div className="admin-search">
          <Search size={17} />
          <input
            aria-label="ドリル検索"
            placeholder="名前・単元で検索"
            value={filter.search}
            onChange={(e) => change({ search: e.target.value })}
          />
        </div>
      </div>
      <div className="admin-toolbar">
        <span>
          {visible.length}件のドリル · {selected.length}件選択
        </span>
        <button
          className="admin-button"
          disabled={busy || !visible.length || visible.length > 100}
          onClick={() => setSelected(visible.map((d) => d.id))}
        >
          絞り込み結果をすべて選択
        </button>
        <button
          className="admin-button"
          disabled={busy}
          onClick={() => setSelected([])}
        >
          選択解除
        </button>
      </div>
      {selected.length > 0 && (
        <div className="drill-bulk-bar">
          <button
            className="admin-button"
            disabled={
              busy ||
              !chosen.some((d) => d.status === "draft" && !d.questionCount)
            }
            onClick={() => generate(selected)}
          >
            <Sparkles size={16} />
            空の下書きをAI生成
          </button>
          <button
            className="admin-button"
            disabled={
              busy ||
              chosen.some((d) => d.status !== "draft" || !d.questionCount)
            }
            onClick={() => action("publish")}
          >
            一括公開
          </button>
          <button
            className="admin-button primary"
            disabled={busy || chosen.some((d) => d.status !== "published")}
            onClick={() =>
              navigate("/admin/drill-assignments", {
                state: { drillIds: selected },
              })
            }
          >
            選択したドリルを配布
          </button>
          <button
            className="admin-button"
            disabled={busy}
            onClick={() => action("duplicate")}
          >
            複製
          </button>
          <button
            className="admin-button danger"
            disabled={busy}
            onClick={() => action("archive")}
          >
            アーカイブ
          </button>
        </div>
      )}
      {progress && (
        <section className="admin-card" aria-live="polite">
          <b>
            AI作成 {progress.done} / {progress.total}
          </b>
          <progress max={progress.total} value={progress.done} />
          <p>{progress.current}</p>
          {busy && (
            <button
              className="admin-button"
              onClick={() => {
                stop.current = true;
                setNotice("現在の1件が完了したら停止します");
              }}
            >
              残りの作成を中断
            </button>
          )}
          {progress.errors.length > 0 && (
            <details open>
              <summary>作成できなかったドリル（下書きは保存済み）</summary>
              {progress.errors.map((e) => (
                <p key={e.id}>
                  {e.title}：{e.message}
                </p>
              ))}
              <button
                className="admin-button"
                disabled={busy}
                onClick={() => generate(progress.errors.map((e) => e.id))}
              >
                失敗した分を再試行
              </button>
            </details>
          )}
        </section>
      )}
      <div className="admin-card admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="このページを選択"
                  disabled={busy}
                  checked={
                    visible.slice(page * 25, page * 25 + 25).length > 0 &&
                    visible
                      .slice(page * 25, page * 25 + 25)
                      .every((d) => selected.includes(d.id))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [
                            ...new Set([
                              ...selected,
                              ...visible
                                .slice(page * 25, page * 25 + 25)
                                .map((d) => d.id),
                            ]),
                          ]
                        : selected.filter(
                            (id) =>
                              !visible
                                .slice(page * 25, page * 25 + 25)
                                .some((d) => d.id === id),
                          ),
                    )
                  }
                />
              </th>
              <th>ドリル / 単元</th>
              <th>コース・科目</th>
              <th>問題数</th>
              <th>状態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.slice(page * 25, page * 25 + 25).map((d) => (
              <tr key={d.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${d.title}を選択`}
                    checked={selected.includes(d.id)}
                    disabled={busy}
                    onChange={() => setSelected(toggle(selected, d.id))}
                  />
                </td>
                <td>
                  <b>{d.title}</b>
                  <small>{d.unitName}</small>
                </td>
                <td>
                  {d.courseName}
                  <small>{d.subject}</small>
                </td>
                <td>
                  {d.questionCount
                    ? `${d.questionCount}問`
                    : `未作成（予定${d.targetCount}問）`}
                </td>
                <td>
                  <span className={`admin-badge ${d.status}`}>
                    {
                      {
                        draft: "下書き",
                        published: "公開中",
                        archived: "アーカイブ",
                      }[d.status]
                    }
                  </span>
                </td>
                <td>
                  <button
                    className="admin-button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        setEditing(
                          await api<LearningDrill>(`/admin/drills/${d.id}`),
                        );
                      }, "")
                    }
                  >
                    {d.status === "draft" ? "編集" : "内容を見る"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="admin-empty">
            {loading
              ? "読み込み中..."
              : !units.length
                ? "コースを追加し、単元を登録して学習教材を作りましょう。"
                : "該当するドリルはありません。単元を選び、まとめて作成できます。"}
          </div>
        )}
        <div className="admin-toolbar">
          <button
            className="admin-button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            前へ
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(visible.length / 25))}ページ
          </span>
          <button
            className="admin-button"
            disabled={(page + 1) * 25 >= visible.length}
            onClick={() => setPage(page + 1)}
          >
            次へ
          </button>
        </div>
      </div>
      {editing && (
        <DrillEditor
          initial={editing}
          units={units}
          courses={courses}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            run(async () => {}, "下書きを保存しました");
          }}
        />
      )}
      {courseDialog && (
        <Dialog
          error={error}
          title="コースを追加"
          onClose={() => {
            if (!busy) setCourseDialog(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("/admin/courses", "POST", courseForm);
                setCourseDialog(false);
                setCourseForm({ name: "", description: "", audience: "" });
              });
            }}
          >
            <Field label="コース名">
              <input
                required
                value={courseForm.name}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, name: e.target.value })
                }
                placeholder="例：中学1年、簿記3級"
              />
            </Field>
            <Field label="対象者">
              <input
                value={courseForm.audience}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, audience: e.target.value })
                }
              />
            </Field>
            <Field label="学習範囲">
              <textarea
                value={courseForm.description}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, description: e.target.value })
                }
              />
            </Field>
            <button className="admin-button primary" disabled={busy}>
              コースを保存
            </button>
          </form>
        </Dialog>
      )}
      {renameUnit && (
        <Dialog
          title="単元を編集"
          error={error}
          onClose={() => setRenameUnit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(
                  `/admin/drill-units/${renameUnit.id}`,
                  "PUT",
                  renameUnit,
                );
                setRenameUnit(null);
                change({ subject: "", unit: "" });
              }, "単元を更新しました。配布済みの内容は維持されます");
            }}
          >
            <p>
              この単元の教材の分類を変更します。配布済みのドリルは配布時の表示を保持します。
            </p>
            <Field label="科目名">
              <input
                required
                maxLength={500}
                value={renameUnit.subject}
                onChange={(e) =>
                  setRenameUnit({ ...renameUnit, subject: e.target.value })
                }
              />
            </Field>
            <Field label="単元名">
              <input
                required
                maxLength={500}
                value={renameUnit.name}
                onChange={(e) =>
                  setRenameUnit({ ...renameUnit, name: e.target.value })
                }
              />
            </Field>
            <button className="admin-button primary" disabled={busy}>
              変更を保存
            </button>
          </form>
        </Dialog>
      )}
      {unitDialog && (
        <Dialog
          error={error}
          title="単元を一括登録"
          onClose={() => {
            if (!busy) setUnitDialog(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const rows = unitForm.lines
                  .split("\n")
                  .filter((l) => l.trim())
                  .map((l) => {
                    const [subject, ...name] = l.split(/[\t,、]/);
                    return {
                      subject: subject.trim(),
                      name: name.join("、").trim(),
                    };
                  });
                if (rows.some((r) => !r.name || !r.subject))
                  throw new Error(
                    "各行を「科目,単元名」の形で入力してください",
                  );
                await api("/admin/drill-units/bulk", "POST", {
                  courseId: unitForm.courseId,
                  units: rows,
                });
                setUnitDialog(false);
              }, "単元を登録しました。既存の同名単元は保持しました");
            }}
          >
            <Field label="登録先コース">
              <select
                required
                value={unitForm.courseId}
                onChange={(e) =>
                  setUnitForm({ ...unitForm, courseId: e.target.value })
                }
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="科目と単元（1行1単元）">
              <textarea
                rows={10}
                required
                placeholder={"数学,正負の数\n数学,文字式\n英語,be動詞"}
                value={unitForm.lines}
                onChange={(e) =>
                  setUnitForm({ ...unitForm, lines: e.target.value })
                }
              />
            </Field>
            <p className="admin-muted">
              表計算ソフトの「科目」「単元」の2列も貼り付けられます。科目名は自由に指定できます。
            </p>
            <div className="admin-actions">
              <button
                type="button"
                className="admin-button"
                onClick={() => setUnitForm({ ...unitForm, lines: starter })}
              >
                5科目の入力例を使う
              </button>
              <button className="admin-button primary" disabled={busy}>
                単元を登録
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {bulkDialog && (
        <Dialog
          error={error}
          title="ドリルをまとめて作成"
          onClose={() => {
            if (!busy) setBulkDialog(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("/admin/drills/bulk", "POST", bulk);
                setBulkDialog(false);
                setSelected([]);
              }, "空の下書きを作成しました。一覧で選択してAI生成、または個別に編集できます");
            }}
          >
            <p>
              現在のコース・科目の絞り込みから、作成する単元を選択してください。
            </p>
            <button
              type="button"
              className="admin-button"
              onClick={() =>
                setBulk({ ...bulk, unitIds: unitOptions.map((u) => u.id) })
              }
            >
              対象単元をすべて選択
            </button>
            <div className="admin-checklist">
              {unitOptions.map((u) => (
                <label key={u.id}>
                  <input
                    type="checkbox"
                    checked={bulk.unitIds.includes(u.id)}
                    onChange={() =>
                      setBulk({ ...bulk, unitIds: toggle(bulk.unitIds, u.id) })
                    }
                  />
                  {u.courseName} / {u.subject} / {u.name}
                </label>
              ))}
            </div>
            <div className="admin-form-grid">
              <Field label="単元ごとのドリル数">
                <input
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={bulk.setsPerUnit}
                  onChange={(e) =>
                    setBulk({ ...bulk, setsPerUnit: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="ドリルごとの予定問題数">
                <input
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={bulk.questionCount}
                  onChange={(e) =>
                    setBulk({ ...bulk, questionCount: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="タイトルの接尾語">
                <input
                  value={bulk.titlePrefix}
                  onChange={(e) =>
                    setBulk({ ...bulk, titlePrefix: e.target.value })
                  }
                />
              </Field>
            </div>
            <p className="drill-summary">
              {bulk.unitIds.length}単元 × {bulk.setsPerUnit}セット ＝{" "}
              <b>{bulk.unitIds.length * bulk.setsPerUnit}ドリル</b>（予定
              {bulk.unitIds.length * bulk.setsPerUnit * bulk.questionCount}問）
            </p>
            <button
              className="admin-button primary"
              disabled={
                busy ||
                !bulk.unitIds.length ||
                bulk.unitIds.length * bulk.setsPerUnit > 100
              }
            >
              下書きをまとめて作成
            </button>
            <p className="admin-muted">
              1回100ドリルまで。ここではAI通信は行いません。
            </p>
          </form>
        </Dialog>
      )}
      <details className="admin-card">
        <summary>AI一括生成の追加指示</summary>
        <Field label="問題作成の指示">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="例：基礎中心。日常的な例を使い、ヒントは段階的に。"
          />
        </Field>
        <p className="admin-muted">
          AI生成中にページを移動すると、残りの作成を中断します。作成済みの問題と未作成の下書きは残ります。
        </p>
      </details>
    </div>
  );
}
