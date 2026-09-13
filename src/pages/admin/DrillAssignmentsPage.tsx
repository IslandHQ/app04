import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, type Group, type ManagedUser } from "../../lib/platform";
import type { LearningDrill, DrillAssignment } from "../../lib/drills";
import { Field } from "../../components/admin/Form";
export default function DrillAssignmentsPage() {
  const location = useLocation();
  const preset = location.state as {
    drillIds?: string[];
    userId?: string;
  } | null;
  const [drills, setDrills] = useState<LearningDrill[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [assignments, setAssignments] = useState<DrillAssignment[]>([]);
  const [tab, setTab] = useState<"assign" | "progress">("assign");
  const [filter, setFilter] = useState({
    course: "",
    subject: "",
    unit: "",
    search: "",
  });
  const [userSearch, setUserSearch] = useState("");
  const [form, setForm] = useState({
    drillIds: preset?.drillIds || [],
    userIds: preset?.userId ? [preset.userId] : ([] as string[]),
    groupIds: [] as string[],
    targetDate: "",
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("active");
  const [targetDate, setTargetDate] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const [d, u, g, a] = await Promise.all([
      api<LearningDrill[]>("/admin/drills"),
      api<ManagedUser[]>("/admin/users"),
      api<Group[]>("/admin/groups"),
      api<DrillAssignment[]>("/admin/drill-assignments"),
    ]);
    setDrills(d.filter((d) => d.status === "published"));
    setUsers(u);
    setGroups(g);
    setAssignments(a);
  }, []);
  useEffect(() => {
    // Load persisted data when this page mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setError(e.message));
  }, [load]);
  const toggle = (values: string[], id: string) =>
    values.includes(id) ? values.filter((x) => x !== id) : [...values, id];
  const materials = drills.filter(
    (d) =>
      (!filter.course || d.courseId === filter.course) &&
      (!filter.subject || d.subject === filter.subject) &&
      (!filter.unit || d.unitId === filter.unit) &&
      `${d.title} ${d.unitName}`.includes(filter.search),
  );
  const targets = users.filter(
    (u) =>
      u.status === "active" &&
      (form.userIds.includes(u.id) ||
        groups.some(
          (g) => form.groupIds.includes(g.id) && g.memberIds.includes(u.id),
        )),
  );
  const chosen = drills.filter((d) => form.drillIds.includes(d.id));
  const count = chosen.length * targets.length;
  const existing = assignments.filter(
    (a) =>
      a.active &&
      chosen.some((d) => d.id === a.drillId) &&
      targets.some((u) => u.id === a.userId),
  ).length;
  const history = assignments.filter(
    (a) =>
      (historyStatus === "all" ||
        (historyStatus === "active"
          ? a.active
          : historyStatus === "withdrawn"
            ? !a.active
            : historyStatus === "completed"
              ? a.active && a.completedCount > 0
              : a.active && a.completedCount === 0)) &&
      `${a.title} ${a.userName} ${a.courseName} ${a.subject} ${a.unitName}`
        .toLowerCase()
        .includes(historySearch.toLowerCase()),
  );
  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const message = await fn();
      await load();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
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
      <div className="drill-tabs">
        <button
          className={`admin-button ${tab === "assign" ? "primary" : ""}`}
          onClick={() => setTab("assign")}
        >
          ドリルを配布
        </button>
        <button
          className={`admin-button ${tab === "progress" ? "primary" : ""}`}
          onClick={() => setTab("progress")}
        >
          配布済み・学習進捗
        </button>
        <button
          className="admin-button"
          disabled={busy}
          onClick={() => run(async () => "最新の進捗に更新しました")}
        >
          進捗を更新
        </button>
      </div>
      {tab === "assign" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await api<{ count: number; skippedUsers: number }>(
                "/admin/drill-assignments",
                "POST",
                form,
              );
              setTab("progress");
              return `${r.count}件を配布しました。配布済みの教材は重複登録していません。${r.skippedUsers ? `停止中などの${r.skippedUsers}人を除外しました。` : ""}`;
            });
          }}
        >
          <fieldset disabled={busy}>
            <section className="admin-card">
              <h2>
                <span className="drill-step">1</span>配布する教材を選ぶ
              </h2>
              <div className="drill-filters">
                <Field label="配布するコース">
                  <select
                    value={filter.course}
                    onChange={(e) => {
                      setFilter({
                        course: e.target.value,
                        subject: "",
                        unit: "",
                        search: "",
                      });
                      setForm({ ...form, drillIds: [] });
                    }}
                  >
                    <option value="">すべてのコース</option>
                    {[
                      ...new Map(
                        drills.map((d) => [d.courseId, d.courseName]),
                      ).entries(),
                    ].map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="配布する科目">
                  <select
                    value={filter.subject}
                    onChange={(e) => {
                      setFilter({
                        ...filter,
                        subject: e.target.value,
                        unit: "",
                      });
                      setForm({ ...form, drillIds: [] });
                    }}
                  >
                    <option value="">すべての科目</option>
                    {[
                      ...new Set(
                        drills
                          .filter(
                            (d) =>
                              !filter.course || d.courseId === filter.course,
                          )
                          .map((d) => d.subject),
                      ),
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="配布する単元">
                  <select
                    value={filter.unit}
                    onChange={(e) => {
                      setFilter({ ...filter, unit: e.target.value });
                      setForm({ ...form, drillIds: [] });
                    }}
                  >
                    <option value="">すべての単元</option>
                    {[
                      ...new Map(
                        drills
                          .filter(
                            (d) =>
                              (!filter.course ||
                                d.courseId === filter.course) &&
                              (!filter.subject || d.subject === filter.subject),
                          )
                          .map((d) => [d.unitId, d.unitName]),
                      ).entries(),
                    ].map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="admin-toolbar">
                <Field label="教材名で検索">
                  <input
                    value={filter.search}
                    onChange={(e) =>
                      setFilter({ ...filter, search: e.target.value })
                    }
                  />
                </Field>
                <button
                  type="button"
                  className="admin-button"
                  disabled={!materials.length || materials.length > 100}
                  onClick={() =>
                    setForm({ ...form, drillIds: materials.map((d) => d.id) })
                  }
                >
                  この範囲の公開ドリルをすべて選択（{materials.length}件）
                </button>
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => setForm({ ...form, drillIds: [] })}
                >
                  教材の選択解除
                </button>
              </div>
              <div className="drill-material-list">
                {materials.map((d) => (
                  <label className="drill-material" key={d.id}>
                    <input
                      type="checkbox"
                      checked={form.drillIds.includes(d.id)}
                      onChange={() =>
                        setForm({
                          ...form,
                          drillIds: toggle(form.drillIds, d.id),
                        })
                      }
                    />
                    <span>
                      <b>{d.title}</b>
                      <small>
                        {d.courseName} / {d.subject} / {d.unitName} ·{" "}
                        {d.questionCount}問
                      </small>
                    </span>
                  </label>
                ))}
                {!materials.length && (
                  <p className="admin-empty">
                    公開中のドリルがありません。ドリル管理で問題を確認・公開してください。
                  </p>
                )}
              </div>
            </section>
            <section className="admin-card">
              <h2>
                <span className="drill-step">2</span>配布先を選ぶ
              </h2>
              <div className="admin-form-grid">
                <div>
                  <h3>グループにまとめて配布</h3>
                  <div className="admin-checklist">
                    {groups.map((g) => (
                      <label key={g.id}>
                        <input
                          type="checkbox"
                          checked={form.groupIds.includes(g.id)}
                          onChange={() =>
                            setForm({
                              ...form,
                              groupIds: toggle(form.groupIds, g.id),
                            })
                          }
                        />
                        {g.name}（利用中
                        {
                          users.filter(
                            (u) =>
                              u.status === "active" &&
                              g.memberIds.includes(u.id),
                          ).length
                        }
                        人）
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3>個人を追加</h3>
                  <Field label="配布先のユーザーを検索">
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                  </Field>
                  <div className="admin-checklist">
                    {users
                      .filter(
                        (u) =>
                          u.status === "active" &&
                          `${u.name} ${u.email}`
                            .toLowerCase()
                            .includes(userSearch.toLowerCase()),
                      )
                      .map((u) => (
                        <label key={u.id}>
                          <input
                            type="checkbox"
                            checked={form.userIds.includes(u.id)}
                            onChange={() =>
                              setForm({
                                ...form,
                                userIds: toggle(form.userIds, u.id),
                              })
                            }
                          />
                          {u.name}
                          <small>{u.email}</small>
                        </label>
                      ))}
                  </div>
                </div>
              </div>
              <p className="admin-muted">
                グループは現在のメンバーに配布します。後から追加されたメンバーには、同じ範囲を再配布できます。重複と停止中のユーザーは除外します。
              </p>
            </section>
            <section className="admin-card">
              <h2>
                <span className="drill-step">3</span>配布内容を確認
              </h2>
              <Field label="学習目標日（任意）">
                <input
                  type="date"
                  value={form.targetDate}
                  onChange={(e) =>
                    setForm({ ...form, targetDate: e.target.value })
                  }
                />
              </Field>
              <p className="admin-muted">
                目標日を過ぎても学習・復習できます。受験回数の制限はありません。
              </p>
              <p className="drill-summary">
                <b>
                  {chosen.length}ドリル × {targets.length}人
                </b>{" "}
                ＝ {count}件（配布済み {existing}件 / 新規・再開{" "}
                {count - existing}件）
              </p>
              <p>
                {[
                  ...new Set(
                    chosen.map((d) => `${d.courseName} / ${d.subject}`),
                  ),
                ].join("、")}
              </p>
              <button
                className="admin-button primary"
                disabled={busy || !count || count > 1000 || chosen.length > 100}
              >
                確認した内容でドリルを配布
              </button>
              {(count > 1000 || chosen.length > 100) && (
                <p role="alert">
                  1回100ドリル・合計1,000件までです。科目やグループで分けて配布してください。
                </p>
              )}
            </section>
          </fieldset>
        </form>
      ) : (
        <>
          <div className="admin-toolbar">
            <Field label="配布履歴の検索">
              <input
                value={historySearch}
                placeholder="ユーザー・コース・科目・教材名"
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  setPage(0);
                  setSelected([]);
                }}
              />
            </Field>
            <Field label="学習状態">
              <select
                value={historyStatus}
                onChange={(e) => {
                  setHistoryStatus(e.target.value);
                  setPage(0);
                  setSelected([]);
                }}
              >
                <option value="active">配布中</option>
                <option value="incomplete">未完了</option>
                <option value="completed">完了済み</option>
                <option value="withdrawn">取り下げ済み</option>
                <option value="all">すべて</option>
              </select>
            </Field>
            <button
              className="admin-button"
              disabled={history.length > 500}
              onClick={() => setSelected(history.map((a) => a.id))}
            >
              検索結果を選択（{history.length}件）
            </button>
          </div>
          {selected.length > 0 && (
            <div className="drill-bulk-bar">
              <b>{selected.length}件選択</b>
              <Field label="新しい目標日">
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </Field>
              <button
                className="admin-button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api("/admin/drill-assignments/actions", "POST", {
                      ids: selected,
                      action: "date",
                      targetDate,
                    });
                    setSelected([]);
                    return "目標日を変更しました";
                  })
                }
              >
                目標日を一括変更
              </button>
              <button
                className="admin-button danger"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm("選択した配布を取り下げます。学習履歴は残ります。")
                  )
                    run(async () => {
                      await api("/admin/drill-assignments/actions", "POST", {
                        ids: selected,
                        action: "withdraw",
                      });
                      setSelected([]);
                      return "配布を取り下げました";
                    });
                }}
              >
                配布を取り下げる
              </button>
            </div>
          )}
          <div className="admin-card admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>ユーザー / 教材</th>
                  <th>分類</th>
                  <th>学習進捗</th>
                  <th>目標日</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(page * 30, page * 30 + 30).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${a.userName} ${a.title}の配布を選択`}
                        checked={selected.includes(a.id)}
                        onChange={() => setSelected(toggle(selected, a.id))}
                      />
                    </td>
                    <td>
                      <b>{a.userName}</b>
                      <small>{a.title}</small>
                    </td>
                    <td>
                      {a.courseName}
                      <small>
                        {a.subject} / {a.unitName}
                      </small>
                    </td>
                    <td>
                      {!a.active
                        ? "取り下げ済み"
                        : a.completedCount
                          ? `${a.completedCount}回完了`
                          : `${a.answeredCount}/${a.questionCount}問`}
                      <small>
                        最高 {a.bestCorrect}/{a.questionCount}問正解
                      </small>
                    </td>
                    <td>{a.targetDate || "指定なし"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!history.length && (
              <p className="admin-empty">該当する配布はありません。</p>
            )}
            <div className="admin-toolbar">
              <button
                className="admin-button"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                前へ
              </button>
              <span>
                {page + 1} / {Math.max(1, Math.ceil(history.length / 30))}
              </span>
              <button
                className="admin-button"
                disabled={(page + 1) * 30 >= history.length}
                onClick={() => setPage(page + 1)}
              >
                次へ
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
