import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactElement,
} from "react";
import {
  Link,
  Navigate,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Users,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  Send,
  BarChart3,
  Layers,
  ArrowLeft,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import {
  api,
  downloadCSV,
  type ManagedUser,
  type Group,
  type Course,
  type TestDefinition,
  type Assignment,
  type Attempt,
  type Question,
} from "../../lib/platform";
import { Storage, type CustomDrillSet } from "../../lib/storage";
import { generateDrills } from "../../lib/ai";
import "../../admin.css";
import UserActivity from "./UserActivity";
import ResultAnalysis from "./ResultAnalysis";

const menu = [
  ["overview", "概要", LayoutDashboard],
  ["users", "ユーザー", Users],
  ["groups", "グループ", Layers],
  ["courses", "学習コース", BookOpen],
  ["tests", "テスト", ClipboardList],
  ["assignments", "割り当て", Send],
  ["results", "結果", BarChart3],
] as const;
const stateLabel: Record<string, string> = {
  draft: "下書き",
  published: "公開中",
  closed: "終了",
  active: "利用中",
  disabled: "停止中",
  pending: "未着手",
  in_progress: "受験中",
  submitted: "提出済み",
  overdue: "期限超過",
};
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("ja-JP") : "期限なし";
const localDate = (value: string | null) =>
  value
    ? new Date(
        new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
const emptyQuestion = (): Question => ({
  id: crypto.randomUUID(),
  text: "",
  choices: ["", "", "", ""],
  answer: 0,
  points: 1,
  explanation: "",
  category: "",
});
const emptyTest = (): TestDefinition => ({
  id: "",
  title: "",
  courseId: "",
  description: "",
  status: "draft",
  mode: "exam",
  passPercent: 60,
  timeLimitMinutes: 0,
  questions: [emptyQuestion()],
  createdAt: "",
});
const blankUser = {
  id: "",
  name: "",
  email: "",
  grade: "",
  role: "user" as const,
  status: "active" as const,
  profile: {},
  groupIds: [],
  password: "",
};
type Data = {
  users: ManagedUser[];
  groups: Group[];
  courses: Course[];
  tests: TestDefinition[];
  assignments: Assignment[];
  results: Attempt[];
};
const initial: Data = {
  users: [],
  groups: [],
  courses: [],
  tests: [],
  assignments: [],
  results: [],
};
function Badge({ state }: { state: string }) {
  return (
    <span className={`admin-badge ${state}`}>{stateLabel[state] || state}</span>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="admin-empty">{children}</div>;
}

export default function AdminPage() {
  const { user } = useAuth();
  const { section = "overview" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Data>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [editingUser, setEditingUser] = useState<
    (ManagedUser & { password?: string }) | null
  >(null);
  const [profileRows, setProfileRows] = useState<[string, string][]>([]);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingTest, setEditingTest] = useState<TestDefinition | null>(null);
  const [selectedResult, setSelectedResult] = useState<Attempt | null>(null);
  const [assignment, setAssignment] = useState({
    testId: "",
    userIds: [] as string[],
    groupIds: [] as string[],
    dueAt: "",
    maxAttempts: 1,
  });
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(
    null,
  );
  const [instructions, setInstructions] = useState("");
  const [importSets, setImportSets] = useState<CustomDrillSet[] | null>(null);
  const load = useCallback(async () => {
    const [users, groups, courses, tests, assignments, results] =
      await Promise.all([
        api<ManagedUser[]>("/admin/users"),
        api<Group[]>("/admin/groups"),
        api<Course[]>("/courses"),
        api<TestDefinition[]>("/admin/tests"),
        api<Assignment[]>("/admin/assignments"),
        api<Attempt[]>("/admin/results"),
      ]);
    setData({ users, groups, courses, tests, assignments, results });
  }, []);
  // Populate the dashboard from the API after the authenticated role is available.
  useEffect(() => {
    if (user?.role === "admin") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load()
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [load, user?.role]);
  async function run(work: () => Promise<void>, message = "保存しました") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setBusy(false);
    }
  }
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  const title = menu.find((m) => m[0] === section)?.[1];
  if (!title) return <Navigate to="/admin/overview" replace />;
  const users = data.users.filter(
    (u) =>
      `${u.name} ${u.email} ${u.grade}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!userFilter || u.role === userFilter || u.status === userFilter),
  );
  const resultRows = data.results.filter((r) =>
    `${r.userName} ${r.title}`.toLowerCase().includes(search.toLowerCase()),
  );
  function openUser(u: ManagedUser) {
    setEditingUser({ ...u });
    setProfileRows(Object.entries(u.profile));
  }
  function updateQuestion(i: number, patch: Partial<Question>) {
    setEditingTest(
      (t) =>
        t && {
          ...t,
          questions: t.questions.map((q, index) =>
            index === i ? { ...q, ...patch } : q,
          ),
        },
    );
  }
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((x) => x !== id) : [...items, id];
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/admin/overview">
          <Layers size={26} />
          <span>
            Learning Admin<small>学びをつなぐ管理画面</small>
          </span>
        </Link>
        <nav aria-label="管理メニュー">
          {menu.map(([key, label, Icon]) => (
            <NavLink
              key={key}
              to={`/admin/${key}`}
              onClick={() => {
                setSearch("");
                setError("");
                setNotice("");
              }}
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <Link to="/settings">
            <Settings size={18} />
            システム設定
          </Link>
          <Link to="/">
            <ArrowLeft size={18} />
            学習画面へ
          </Link>
          <small>{user.name} · 管理者</small>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <div>
            <p className="admin-eyebrow">LEARNING MANAGEMENT</p>
            <h1>{title}</h1>
            <p className="admin-muted">
              学校の学習から資格試験・研修まで、学ぶ人とテストを管理します。
            </p>
          </div>
          <button
            className="admin-button"
            disabled={busy}
            onClick={() => run(async () => {}, "最新の状態に更新しました")}
          >
            更新
          </button>
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
          <Empty>読み込み中...</Empty>
        ) : (
          <>
            {section === "overview" && (
              <>
                <div className="admin-metrics">
                  {[
                    [
                      "利用中のユーザー",
                      data.users.filter((u) => u.status === "active").length,
                    ],
                    [
                      "公開中のテスト",
                      data.tests.filter((t) => t.status === "published").length,
                    ],
                    [
                      "提出済み",
                      data.assignments.filter((a) => a.status === "submitted")
                        .length,
                    ],
                    [
                      "期限超過",
                      data.assignments.filter((a) => a.status === "overdue")
                        .length,
                    ],
                  ].map(([label, n]) => (
                    <div className="admin-card" key={label}>
                      <span>{label}</span>
                      <strong>{n}</strong>
                    </div>
                  ))}
                </div>
                <section className="admin-card">
                  <h2>はじめの3ステップ</h2>
                  <div className="admin-steps">
                    <Link to="/admin/users">
                      <b>01</b>ユーザーを登録する
                      <span>個人やグループで対象者を整理</span>
                    </Link>
                    <Link to="/admin/tests">
                      <b>02</b>テストを用意する
                      <span>問題を作成し、確認して公開</span>
                    </Link>
                    <Link to="/admin/assignments">
                      <b>03</b>テストを割り当てる
                      <span>期限と受験回数を指定して配布</span>
                    </Link>
                  </div>
                </section>
                <section className="admin-card">
                  <h2>対応が必要な割り当て</h2>
                  {data.assignments.filter((a) => a.status === "overdue")
                    .length ? (
                    data.assignments
                      .filter((a) => a.status === "overdue")
                      .slice(0, 10)
                      .map((a) => (
                        <div className="admin-list-row" key={a.id}>
                          <div>
                            <b>{a.userName}</b>
                            <p>{a.title}</p>
                          </div>
                          <Badge state={a.status} />
                          <Link to="/admin/assignments">期限を確認</Link>
                        </div>
                      ))
                  ) : (
                    <Empty>期限を超過している割り当てはありません。</Empty>
                  )}
                </section>
              </>
            )}
            {section === "users" && (
              <>
                <div className="admin-toolbar">
                  <div className="admin-search">
                    <Search size={18} />
                    <input
                      aria-label="ユーザー検索"
                      placeholder="名前・メール・学習対象で検索"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="ユーザーの絞り込み"
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                  >
                    <option value="">すべて</option>
                    <option value="admin">管理者</option>
                    <option value="user">学習者</option>
                    <option value="active">利用中</option>
                    <option value="disabled">停止中</option>
                  </select>
                  <button
                    className="admin-button primary"
                    onClick={() => {
                      setEditingUser({ ...blankUser });
                      setProfileRows([]);
                    }}
                  >
                    <Plus size={17} />
                    ユーザー登録
                  </button>
                </div>
                <div className="admin-card admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ユーザー</th>
                        <th>学習対象</th>
                        <th>所属グループ</th>
                        <th>権限</th>
                        <th>状態</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <b>{u.name}</b>
                            <small>{u.email}</small>
                          </td>
                          <td>{u.grade || "未設定"}</td>
                          <td>
                            {data.groups
                              .filter((g) => u.groupIds.includes(g.id))
                              .map((g) => g.name)
                              .join("、") || "—"}
                          </td>
                          <td>{u.role === "admin" ? "管理者" : "学習者"}</td>
                          <td>
                            <Badge state={u.status} />
                          </td>
                          <td>
                            <button
                              className="admin-button"
                              onClick={() => openUser(u)}
                            >
                              詳細・編集
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!users.length && <Empty>該当するユーザーはいません。</Empty>}
                </div>
              </>
            )}
            {section === "groups" && (
              <>
                <div className="admin-toolbar">
                  <p>学級・部署・受験者など、自由な単位でまとめます。</p>
                  <button
                    className="admin-button primary"
                    onClick={() =>
                      setEditingGroup({
                        id: "",
                        name: "",
                        description: "",
                        memberIds: [],
                      })
                    }
                  >
                    <Plus size={17} />
                    グループ作成
                  </button>
                </div>
                <div className="admin-grid">
                  {data.groups.map((g) => (
                    <section className="admin-card" key={g.id}>
                      <Layers />
                      <h2>{g.name}</h2>
                      <p>{g.description || "説明なし"}</p>
                      <p className="admin-muted">{g.memberIds.length} 人</p>
                      <button
                        className="admin-button"
                        onClick={() => setEditingGroup({ ...g })}
                      >
                        メンバー・詳細を編集
                      </button>
                    </section>
                  ))}
                </div>
                {!data.groups.length && (
                  <Empty>
                    グループを作成すると、複数人にまとめてテストを配布できます。
                  </Empty>
                )}
              </>
            )}
            {section === "courses" && (
              <>
                <div className="admin-toolbar">
                  <p>
                    教科・資格・研修ごとに、テストとAI出題の対象を整理します。
                  </p>
                  <button
                    className="admin-button primary"
                    onClick={() =>
                      setEditingCourse({
                        id: "",
                        name: "",
                        description: "",
                        audience: "",
                      })
                    }
                  >
                    <Plus size={17} />
                    コース作成
                  </button>
                </div>
                <div className="admin-grid">
                  {data.courses.map((c) => (
                    <section className="admin-card" key={c.id}>
                      <BookOpen />
                      <h2>{c.name}</h2>
                      <p>{c.description}</p>
                      <p className="admin-muted">
                        対象：{c.audience || "指定なし"}
                      </p>
                      <button
                        className="admin-button"
                        onClick={() => setEditingCourse({ ...c })}
                      >
                        編集
                      </button>
                    </section>
                  ))}
                </div>
                {!data.courses.length && (
                  <Empty>
                    例：「中2数学」「簿記3級」「入社時研修」から始められます。
                  </Empty>
                )}
              </>
            )}
            {section === "tests" && (
              <>
                <div className="admin-toolbar">
                  <p>
                    公開後は内容を固定します。変更する場合は複製してください。
                  </p>
                  <button
                    className="admin-button primary"
                    onClick={() => setEditingTest(emptyTest())}
                  >
                    <Plus size={17} />
                    テスト作成
                  </button>
                </div>
                <div className="admin-grid">
                  {data.tests.map((t) => (
                    <section className="admin-card" key={t.id}>
                      <Badge state={t.status} />
                      <h2>{t.title}</h2>
                      <p className="admin-muted">
                        {data.courses.find((c) => c.id === t.courseId)?.name ||
                          "コース未設定"}{" "}
                        · {t.questions.length}問 ·{" "}
                        {t.mode === "exam" ? "試験" : "練習"}
                      </p>
                      <p>合格基準 {t.passPercent}%</p>
                      <div className="admin-actions">
                        <button
                          className="admin-button"
                          onClick={() => setEditingTest(structuredClone(t))}
                        >
                          {t.status === "draft" ? "編集" : "内容を見る"}
                        </button>
                        <button
                          className="admin-button"
                          disabled={busy}
                          onClick={() =>
                            setEditingTest({
                              ...structuredClone(t),
                              id: "",
                              title: t.title + "（コピー）",
                              status: "draft",
                            })
                          }
                        >
                          複製
                        </button>
                        {t.status === "draft" && (
                          <button
                            className="admin-button primary"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  "この内容で公開します。公開後は問題を変更できません。",
                                )
                              )
                                run(async () => {
                                  await api(`/admin/tests/${t.id}`, "PUT", {
                                    status: "published",
                                  });
                                }, "公開しました");
                            }}
                          >
                            公開
                          </button>
                        )}
                        {t.status === "published" && (
                          <button
                            className="admin-button danger"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  "テストを終了すると、受験中の回答も提出できなくなります。終了しますか？",
                                )
                              )
                                run(async () => {
                                  await api(`/admin/tests/${t.id}`, "PUT", {
                                    status: "closed",
                                  });
                                }, "終了しました");
                            }}
                          >
                            終了
                          </button>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
                {!data.tests.length && (
                  <Empty>
                    手動入力、既存問題集の取り込み、AI生成でテストを作成できます。
                  </Empty>
                )}
              </>
            )}
            {section === "assignments" && (
              <>
                <form
                  className="admin-card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const r = await api<{ count: number }>(
                        "/admin/assignments",
                        "POST",
                        {
                          ...assignment,
                          dueAt: assignment.dueAt
                            ? new Date(assignment.dueAt).toISOString()
                            : null,
                        },
                      );
                      if (!r.count)
                        throw new Error(
                          "選択した対象者には既に割り当て済みです",
                        );
                      setAssignment({
                        ...assignment,
                        userIds: [],
                        groupIds: [],
                      });
                    }, "新しい対象者に割り当てました（既存の割り当ては保持）");
                  }}
                >
                  <h2>テストを割り当てる</h2>
                  <div className="admin-form-grid">
                    <Field label="公開中のテスト">
                      <select
                        required
                        value={assignment.testId}
                        onChange={(e) =>
                          setAssignment({
                            ...assignment,
                            testId: e.target.value,
                          })
                        }
                      >
                        <option value="">テストを選択</option>
                        {data.tests
                          .filter((t) => t.status === "published")
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="提出期限（任意）">
                      <input
                        type="datetime-local"
                        value={assignment.dueAt}
                        onChange={(e) =>
                          setAssignment({
                            ...assignment,
                            dueAt: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="受験可能回数">
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={assignment.maxAttempts}
                        onChange={(e) =>
                          setAssignment({
                            ...assignment,
                            maxAttempts: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="admin-form-grid">
                    <fieldset>
                      <legend>個人を選択</legend>
                      <div className="admin-checklist">
                        {data.users
                          .filter((u) => u.status === "active")
                          .map((u) => (
                            <label key={u.id}>
                              <input
                                type="checkbox"
                                checked={assignment.userIds.includes(u.id)}
                                onChange={() =>
                                  setAssignment({
                                    ...assignment,
                                    userIds: toggle(assignment.userIds, u.id),
                                  })
                                }
                              />
                              {u.name}
                              <small>{u.email}</small>
                            </label>
                          ))}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>グループを選択</legend>
                      <div className="admin-checklist">
                        {data.groups.map((g) => (
                          <label key={g.id}>
                            <input
                              type="checkbox"
                              checked={assignment.groupIds.includes(g.id)}
                              onChange={() =>
                                setAssignment({
                                  ...assignment,
                                  groupIds: toggle(assignment.groupIds, g.id),
                                })
                              }
                            />
                            {g.name}（{g.memberIds.length}人）
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                  <p className="admin-muted">
                    グループは配布時点のメンバーに割り当てます。後から追加したメンバーには再度配布してください。
                  </p>
                  <button
                    className="admin-button primary"
                    disabled={
                      busy ||
                      (!assignment.userIds.length &&
                        !assignment.groupIds.length)
                    }
                  >
                    割り当てる
                  </button>
                </form>
                <div className="admin-card admin-table-wrap">
                  <h2>割り当て一覧</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>対象者 / テスト</th>
                        <th>期限</th>
                        <th>状態</th>
                        <th>受験回数</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.assignments.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <b>{a.userName}</b>
                            <small>{a.title}</small>
                          </td>
                          <td>{date(a.dueAt)}</td>
                          <td>
                            <Badge state={a.status} />
                          </td>
                          <td>
                            {a.attempts} / {a.maxAttempts}
                          </td>
                          <td>
                            <button
                              className="admin-button"
                              onClick={() => setEditingAssignment({ ...a })}
                            >
                              期限・回数を変更
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.assignments.length && (
                    <Empty>まだ割り当てはありません。</Empty>
                  )}
                </div>
              </>
            )}
            {section === "results" && (
              <>
                <div className="admin-toolbar">
                  <div className="admin-search">
                    <Search size={18} />
                    <input
                      aria-label="結果検索"
                      placeholder="ユーザー・テスト名で検索"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <button
                    className="admin-button"
                    onClick={() =>
                      downloadCSV(
                        [
                          [
                            "受験ID",
                            "ユーザー",
                            "テスト",
                            "得点",
                            "満点",
                            "合否",
                            "提出日時",
                          ],
                          ...resultRows.map((r) => [
                            r.id,
                            r.userName,
                            r.title,
                            r.score,
                            r.total,
                            r.passed ? "合格" : "不合格",
                            r.submittedAt,
                          ]),
                        ],
                        "test-results.csv",
                      )
                    }
                  >
                    CSV出力
                  </button>
                </div>
                <div className="admin-card admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ユーザー / テスト</th>
                        <th>得点</th>
                        <th>合否</th>
                        <th>提出日時</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {resultRows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <b>{r.userName}</b>
                            <small>{r.title}</small>
                          </td>
                          <td>
                            {r.score} / {r.total}
                          </td>
                          <td>{r.passed ? "合格" : "不合格"}</td>
                          <td>{date(r.submittedAt)}</td>
                          <td>
                            <button
                              className="admin-button"
                              onClick={() => setSelectedResult(r)}
                            >
                              回答を見る
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!resultRows.length && (
                    <Empty>提出された結果はありません。</Empty>
                  )}
                </div>
              </>
            )}
            {section === "results" && (
              <ResultAnalysis
                results={resultRows}
                assignments={data.assignments}
              />
            )}
          </>
        )}

        {editingUser && (
          <div className="admin-overlay">
            <section
              className="admin-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="ユーザー編集"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    if (
                      profileRows.some(([k]) => !k.trim()) ||
                      new Set(profileRows.map(([k]) => k.trim())).size !==
                        profileRows.length
                    )
                      throw new Error("属性名は空欄や重複を避けてください");
                    await api(
                      editingUser.id
                        ? `/admin/users/${editingUser.id}`
                        : "/admin/users",
                      editingUser.id ? "PUT" : "POST",
                      {
                        ...editingUser,
                        profile: Object.fromEntries(
                          profileRows.map(([k, v]) => [k.trim(), v]),
                        ),
                      },
                    );
                    setEditingUser(null);
                  });
                }}
              >
                <h2>{editingUser.id ? "ユーザー詳細" : "ユーザー登録"}</h2>
                <div className="admin-form-grid">
                  <Field label="名前">
                    <input
                      required
                      value={editingUser.name}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="メールアドレス">
                    <input
                      type="email"
                      required
                      disabled={!!editingUser.id}
                      value={editingUser.email}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          email: e.target.value,
                        })
                      }
                    />
                  </Field>
                  {!editingUser.id && (
                    <Field label="初期パスワード（8文字以上）">
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={editingUser.password || ""}
                        onChange={(e) =>
                          setEditingUser({
                            ...editingUser,
                            password: e.target.value,
                          })
                        }
                      />
                    </Field>
                  )}
                  <Field label="学年・学習対象（任意）">
                    <input
                      placeholder="簿記3級、初学者、中2など"
                      value={editingUser.grade}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          grade: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="権限">
                    <select
                      disabled={editingUser.id === user.id}
                      value={editingUser.role}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          role: e.target.value as ManagedUser["role"],
                        })
                      }
                    >
                      <option value="user">学習者</option>
                      <option value="admin">管理者</option>
                    </select>
                  </Field>
                  {editingUser.id && (
                    <Field label="利用状態">
                      <select
                        disabled={editingUser.id === user.id}
                        value={editingUser.status}
                        onChange={(e) =>
                          setEditingUser({
                            ...editingUser,
                            status: e.target.value as ManagedUser["status"],
                          })
                        }
                      >
                        <option value="active">利用中</option>
                        <option value="disabled">停止中</option>
                      </select>
                    </Field>
                  )}
                </div>
                {!!editingUser.id && (
                  <>
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="admin-button primary"
                        onClick={() => {
                          setAssignment({
                            ...assignment,
                            userIds: [editingUser.id],
                            groupIds: [],
                          });
                          setEditingUser(null);
                          navigate("/admin/assignments");
                        }}
                      >
                        このユーザーにテストを割り当てる
                      </button>
                    </div>
                    <h3>追加プロフィール</h3>
                    {profileRows.map(([k, v], i) => (
                      <div className="admin-actions" key={i}>
                        <input
                          aria-label={`属性名${i + 1}`}
                          placeholder="属性名（受験予定日など）"
                          value={k}
                          onChange={(e) =>
                            setProfileRows(
                              profileRows.map((r, j) =>
                                j === i ? [e.target.value, v] : r,
                              ),
                            )
                          }
                        />
                        <input
                          aria-label={`属性値${i + 1}`}
                          placeholder="値"
                          value={v}
                          onChange={(e) =>
                            setProfileRows(
                              profileRows.map((r, j) =>
                                j === i ? [k, e.target.value] : r,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="admin-button"
                          onClick={() =>
                            setProfileRows(
                              profileRows.filter((_, j) => j !== i),
                            )
                          }
                        >
                          削除
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="admin-button"
                      disabled={profileRows.length >= 20}
                      onClick={() => setProfileRows([...profileRows, ["", ""]])}
                    >
                      属性を追加
                    </button>
                    <h3>割り当て・受験状況</h3>
                    {data.assignments
                      .filter((a) => a.userId === editingUser.id)
                      .map((a) => (
                        <div className="admin-list-row" key={a.id}>
                          <span>
                            {a.title}
                            <small>{date(a.dueAt)}</small>
                          </span>
                          <Badge state={a.status} />
                        </div>
                      ))}
                    <p className="admin-muted">
                      所属変更はグループ画面、期限・再受験回数の変更は割り当て画面で行えます。
                    </p>
                    <UserActivity
                      key={editingUser.id}
                      userId={editingUser.id}
                      assignments={data.assignments}
                      results={data.results}
                      onResult={setSelectedResult}
                    />
                  </>
                )}
                <div className="admin-actions">
                  <button className="admin-button primary" disabled={busy}>
                    保存
                  </button>
                  <button
                    type="button"
                    className="admin-button"
                    disabled={busy}
                    onClick={() => setEditingUser(null)}
                  >
                    閉じる
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
        {editingGroup && (
          <div className="admin-overlay">
            <form
              className="admin-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="グループ編集"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api(
                    editingGroup.id
                      ? `/admin/groups/${editingGroup.id}`
                      : "/admin/groups",
                    editingGroup.id ? "PUT" : "POST",
                    editingGroup,
                  );
                  setEditingGroup(null);
                });
              }}
            >
              <h2>グループ設定</h2>
              <Field label="グループ名">
                <input
                  required
                  value={editingGroup.name}
                  onChange={(e) =>
                    setEditingGroup({ ...editingGroup, name: e.target.value })
                  }
                />
              </Field>
              <Field label="説明">
                <textarea
                  value={editingGroup.description}
                  onChange={(e) =>
                    setEditingGroup({
                      ...editingGroup,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
              {editingGroup.id ? (
                <fieldset>
                  <legend>メンバー</legend>
                  <div className="admin-checklist">
                    {data.users.map((u) => (
                      <label key={u.id}>
                        <input
                          type="checkbox"
                          checked={editingGroup.memberIds.includes(u.id)}
                          onChange={() =>
                            setEditingGroup({
                              ...editingGroup,
                              memberIds: toggle(editingGroup.memberIds, u.id),
                            })
                          }
                        />
                        {u.name} ({u.email})
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <p>作成後にメンバーを追加できます。</p>
              )}
              <div className="admin-actions">
                <button className="admin-button primary" disabled={busy}>
                  保存
                </button>
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => setEditingGroup(null)}
                >
                  閉じる
                </button>
              </div>
            </form>
          </div>
        )}
        {editingCourse && (
          <div className="admin-overlay">
            <form
              className="admin-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="コース編集"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api(
                    editingCourse.id
                      ? `/admin/courses/${editingCourse.id}`
                      : "/admin/courses",
                    editingCourse.id ? "PUT" : "POST",
                    editingCourse,
                  );
                  setEditingCourse(null);
                });
              }}
            >
              <h2>学習コース設定</h2>
              <Field label="コース名">
                <input
                  required
                  placeholder="例：簿記3級"
                  value={editingCourse.name}
                  onChange={(e) =>
                    setEditingCourse({ ...editingCourse, name: e.target.value })
                  }
                />
              </Field>
              <Field label="対象者・難易度">
                <input
                  placeholder="例：日商簿記3級を初めて受験する社会人"
                  value={editingCourse.audience}
                  onChange={(e) =>
                    setEditingCourse({
                      ...editingCourse,
                      audience: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="説明・出題範囲">
                <textarea
                  value={editingCourse.description}
                  onChange={(e) =>
                    setEditingCourse({
                      ...editingCourse,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
              <div className="admin-actions">
                <button className="admin-button primary" disabled={busy}>
                  保存
                </button>
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => setEditingCourse(null)}
                >
                  閉じる
                </button>
              </div>
            </form>
          </div>
        )}
        {editingTest && (
          <div className="admin-overlay">
            <form
              className="admin-dialog wide"
              role="dialog"
              aria-modal="true"
              aria-label="テスト編集"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api(
                    editingTest.id
                      ? `/admin/tests/${editingTest.id}`
                      : "/admin/tests",
                    editingTest.id ? "PUT" : "POST",
                    editingTest,
                  );
                  setEditingTest(null);
                });
              }}
            >
              <h2>
                {editingTest.status === "draft" ? "テスト編集" : "テスト内容"}
              </h2>
              <fieldset disabled={editingTest.status !== "draft" || busy}>
                <div className="admin-form-grid">
                  <Field label="テスト名">
                    <input
                      required
                      value={editingTest.title}
                      onChange={(e) =>
                        setEditingTest({
                          ...editingTest,
                          title: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="コース">
                    <select
                      value={editingTest.courseId}
                      onChange={(e) =>
                        setEditingTest({
                          ...editingTest,
                          courseId: e.target.value,
                        })
                      }
                    >
                      <option value="">指定なし</option>
                      {data.courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="実施モード">
                    <select
                      value={editingTest.mode}
                      onChange={(e) =>
                        setEditingTest({
                          ...editingTest,
                          mode: e.target.value as TestDefinition["mode"],
                        })
                      }
                    >
                      <option value="exam">試験（提出後に解説を公開）</option>
                      <option value="practice">
                        練習（解説を見ながら回答）
                      </option>
                    </select>
                  </Field>
                  <Field label="制限時間（分・0で無制限）">
                    <input
                      type="number"
                      min={0}
                      max={480}
                      required
                      value={editingTest.timeLimitMinutes || 0}
                      onChange={(e) =>
                        setEditingTest({
                          ...editingTest,
                          timeLimitMinutes: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="合格基準（得点率%）">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      required
                      value={editingTest.passPercent}
                      onChange={(e) =>
                        setEditingTest({
                          ...editingTest,
                          passPercent: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="説明">
                  <textarea
                    value={editingTest.description}
                    onChange={(e) =>
                      setEditingTest({
                        ...editingTest,
                        description: e.target.value,
                      })
                    }
                  />
                </Field>
                {editingTest.status === "draft" && (
                  <div className="admin-ai-box">
                    <Field label="AI作成への指示（任意）">
                      <input
                        placeholder="例：仕訳の基礎を3問。初学者向け。"
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                      />
                    </Field>
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="admin-button"
                        onClick={() =>
                          run(async () => {
                            const c = data.courses.find(
                              (c) => c.id === editingTest.courseId,
                            );
                            const qs = await generateDrills(
                              c?.name || editingTest.title,
                              "確認問題",
                              3,
                              [],
                              undefined,
                              `対象者: ${c?.audience || "一般の学習者"}。範囲: ${c?.description || ""}。${instructions}`,
                            );
                            if (!qs.length)
                              throw new Error("AI設定を確認してください");
                            const added = qs.map((q) => ({
                              id: crypto.randomUUID(),
                              text: q.questionText,
                              choices: q.choices,
                              answer: q.choices.indexOf(q.correctAnswer),
                              points: 1,
                              explanation: q.explanation,
                              category: q.topic,
                            }));
                            setEditingTest(
                              (t) =>
                                t && {
                                  ...t,
                                  questions: [
                                    ...t.questions.filter((q) => q.text.trim()),
                                    ...added,
                                  ],
                                },
                            );
                          }, "AI問題を追加しました。内容と正解を確認してください")
                        }
                      >
                        AIで3問追加
                      </button>
                      <button
                        type="button"
                        className="admin-button"
                        onClick={() =>
                          run(async () => {
                            const sets = await Storage.getCustomDrillSets();
                            if (!sets.length)
                              throw new Error("取り込める問題集がありません");
                            setImportSets(sets);
                          }, "取り込む問題集を選択してください")
                        }
                      >
                        既存問題集から取り込む
                      </button>
                    </div>
                  </div>
                )}
                {editingTest.questions.map((q, i) => (
                  <section className="admin-question" key={q.id}>
                    <div className="admin-toolbar">
                      <h3>問題 {i + 1}</h3>
                      <button
                        type="button"
                        className="admin-button danger"
                        disabled={editingTest.questions.length === 1}
                        onClick={() =>
                          setEditingTest({
                            ...editingTest,
                            questions: editingTest.questions.filter(
                              (_, j) => j !== i,
                            ),
                          })
                        }
                      >
                        問題を削除
                      </button>
                    </div>
                    <Field label="問題文">
                      <textarea
                        required
                        value={q.text}
                        onChange={(e) =>
                          updateQuestion(i, { text: e.target.value })
                        }
                      />
                    </Field>
                    <div className="admin-form-grid">
                      {q.choices.map((choice, j) => (
                        <Field key={j} label={`選択肢 ${j + 1}`}>
                          <input
                            required
                            value={choice}
                            onChange={(e) =>
                              updateQuestion(i, {
                                choices: q.choices.map((s, k) =>
                                  k === j ? e.target.value : s,
                                ),
                              })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    <div className="admin-form-grid">
                      <Field label="正解">
                        <select
                          required
                          value={q.answer}
                          onChange={(e) =>
                            updateQuestion(i, {
                              answer: Number(e.target.value),
                            })
                          }
                        >
                          <option value={-1} disabled>
                            正解を選択
                          </option>
                          {q.choices.map((_, j) => (
                            <option key={j} value={j}>
                              選択肢 {j + 1}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="配点">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          required
                          value={q.points}
                          onChange={(e) =>
                            updateQuestion(i, {
                              points: Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field label="分野">
                        <input
                          value={q.category}
                          onChange={(e) =>
                            updateQuestion(i, { category: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="解説">
                      <textarea
                        value={q.explanation}
                        onChange={(e) =>
                          updateQuestion(i, { explanation: e.target.value })
                        }
                      />
                    </Field>
                  </section>
                ))}
                <button
                  type="button"
                  className="admin-button"
                  disabled={editingTest.questions.length >= 100}
                  onClick={() =>
                    setEditingTest({
                      ...editingTest,
                      questions: [...editingTest.questions, emptyQuestion()],
                    })
                  }
                >
                  問題を追加
                </button>
              </fieldset>
              <div className="admin-actions">
                {editingTest.status === "draft" && (
                  <button className="admin-button primary" disabled={busy}>
                    下書き保存
                  </button>
                )}
                <button
                  type="button"
                  className="admin-button"
                  disabled={busy}
                  onClick={() => setEditingTest(null)}
                >
                  閉じる
                </button>
              </div>
            </form>
          </div>
        )}
        {importSets && (
          <div className="admin-overlay">
            <section
              className="admin-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="問題集の取り込み"
            >
              <h2>問題集を選択</h2>
              {importSets.map((s) => (
                <button
                  className="admin-list-row"
                  key={s.id}
                  onClick={() => {
                    setEditingTest(
                      (t) =>
                        t && {
                          ...t,
                          questions: [
                            ...t.questions.filter((q) => q.text.trim()),
                            ...s.questions.map((q) => ({
                              id: crypto.randomUUID(),
                              text: q.questionText,
                              choices: q.choices,
                              answer: q.choices.indexOf(q.correctAnswer),
                              points: 1,
                              explanation: q.explanation,
                              category: q.topic,
                            })),
                          ],
                        },
                    );
                    setImportSets(null);
                  }}
                >
                  {s.title}（{s.questions.length}問）
                </button>
              ))}
              <button
                className="admin-button"
                onClick={() => setImportSets(null)}
              >
                閉じる
              </button>
            </section>
          </div>
        )}
        {editingAssignment && (
          <div className="admin-overlay">
            <form
              className="admin-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="割り当て変更"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api(
                    `/admin/assignments/${editingAssignment.id}`,
                    "PUT",
                    {
                      dueAt: editingAssignment.dueAt,
                      maxAttempts: editingAssignment.maxAttempts,
                    },
                  );
                  setEditingAssignment(null);
                });
              }}
            >
              <h2>期限・受験回数を変更</h2>
              <p>
                {editingAssignment.userName} / {editingAssignment.title}
              </p>
              <Field label="提出期限（空欄で期限なし）">
                <input
                  type="datetime-local"
                  value={localDate(editingAssignment.dueAt)}
                  onChange={(e) =>
                    setEditingAssignment({
                      ...editingAssignment,
                      dueAt: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                />
              </Field>
              <Field label="受験可能回数（増やすと再受験を許可）">
                <input
                  type="number"
                  min={Math.max(1, editingAssignment.attempts)}
                  max={20}
                  value={editingAssignment.maxAttempts}
                  onChange={(e) =>
                    setEditingAssignment({
                      ...editingAssignment,
                      maxAttempts: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <div className="admin-actions">
                <button className="admin-button primary" disabled={busy}>
                  保存
                </button>
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => setEditingAssignment(null)}
                >
                  閉じる
                </button>
              </div>
            </form>
          </div>
        )}
        {selectedResult && (
          <div className="admin-overlay">
            <section
              className="admin-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="受験結果"
            >
              <h2>
                {selectedResult.userName} — {selectedResult.title}
              </h2>
              <p>
                {selectedResult.score} / {selectedResult.total}点 ·{" "}
                {selectedResult.passed ? "合格" : "不合格"}
              </p>
              {selectedResult.questions.map((q, i) => (
                <div className="admin-question" key={q.id}>
                  <h3>
                    {i + 1}. {q.text}
                  </h3>
                  <p>
                    回答：{q.choices[selectedResult.answers[q.id]] || "未回答"}
                  </p>
                  <p>
                    正解：{q.choices[q.answer!]}（{q.points}点）
                  </p>
                  <p>{q.explanation}</p>
                </div>
              ))}
              <button
                className="admin-button"
                onClick={() => setSelectedResult(null)}
              >
                閉じる
              </button>
            </section>
          </div>
        )}
        {error &&
          (editingUser ||
            editingGroup ||
            editingCourse ||
            editingTest ||
            editingAssignment) && (
            <div role="alert" className="admin-floating-error">
              {error}
            </div>
          )}
      </main>
    </div>
  );
}
