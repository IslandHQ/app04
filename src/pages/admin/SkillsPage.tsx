import { useEffect, useState } from "react";
import { api } from "../../lib/platform";
import type { Skill } from "../../../shared/adaptive";
import type { DrillUnit } from "../../lib/drills";
import { Dialog, Field } from "../../components/admin/Form";
export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]),
    [units, setUnits] = useState<DrillUnit[]>([]),
    [edit, setEdit] = useState<Skill | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const [s, u] = await Promise.all([
      api<Skill[]>("/admin/skills"),
      api<DrillUnit[]>("/admin/drill-units"),
    ]);
    setSkills(s);
    setUnits(u);
  }
  useEffect(() => {
    void Promise.all([
      api<Skill[]>("/admin/skills"),
      api<DrillUnit[]>("/admin/drill-units"),
    ])
      .then(([s, u]) => {
        setSkills(s);
        setUnits(u);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <p>
        問題が測る技能と、その前提になる基礎を設定します。関連単元で今後保存する問題には技能が自動で付きます。配布済みの問題は変更されません。
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        className="admin-button primary"
        onClick={() =>
          setEdit({
            id: crypto.randomUUID(),
            subject: "",
            name: "",
            description: "",
            example: "",
            foundation: false,
            prerequisiteIds: [],
            unitIds: [],
          })
        }
      >
        技能を追加
      </button>
      <div className="admin-card">
        {skills.map((s) => (
          <div className="admin-list-row" key={s.id}>
            <span>
              <b>
                {s.subject} / {s.name}
              </b>
              <small>
                前提：
                {s.prerequisiteIds
                  .map((id) => skills.find((s) => s.id === id)?.name)
                  .join("、") || "基礎の出発点"}
              </small>
            </span>
            <button
              className="admin-button"
              onClick={() => {
                setError("");
                setEdit(s);
              }}
            >
              編集
            </button>
          </div>
        ))}
      </div>
      {edit && (
        <Dialog
          title="技能と前提関係を編集"
          error={error}
          onClose={() => !busy && setEdit(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api("/admin/skills/" + edit.id, "PUT", edit);
                await load();
                setEdit(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <Field label="科目">
                <input
                  required
                  maxLength={500}
                  value={edit.subject}
                  onChange={(e) =>
                    setEdit({ ...edit, subject: e.target.value })
                  }
                />
              </Field>
              <Field label="技能名">
                <input
                  required
                  maxLength={500}
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </Field>
              <Field label="やさしい説明">
                <textarea
                  maxLength={5000}
                  value={edit.description}
                  onChange={(e) =>
                    setEdit({ ...edit, description: e.target.value })
                  }
                />
              </Field>
              <Field label="具体例">
                <textarea
                  maxLength={5000}
                  value={edit.example}
                  onChange={(e) =>
                    setEdit({ ...edit, example: e.target.value })
                  }
                />
              </Field>
              <h3>先に理解しておく基礎</h3>
              {skills
                .filter((s) => s.id !== edit.id)
                .map((s) => (
                  <label className="drill-check" key={s.id}>
                    <input
                      type="checkbox"
                      checked={edit.prerequisiteIds.includes(s.id)}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          prerequisiteIds: e.target.checked
                            ? [...edit.prerequisiteIds, s.id]
                            : edit.prerequisiteIds.filter((id) => id !== s.id),
                        })
                      }
                    />
                    {s.subject} / {s.name}
                  </label>
                ))}
              <h3>この技能を扱う単元</h3>
              {units.map((u) => (
                <label className="drill-check" key={u.id}>
                  <input
                    type="checkbox"
                    checked={edit.unitIds.includes(u.id)}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        unitIds: e.target.checked
                          ? [...edit.unitIds, u.id]
                          : edit.unitIds.filter((id) => id !== u.id),
                      })
                    }
                  />
                  {u.courseName} / {u.subject} / {u.name}
                  {u.skillId && u.skillId !== edit.id
                    ? "（別の技能から変更）"
                    : ""}
                </label>
              ))}
              <button className="admin-button primary">技能を保存</button>
            </fieldset>
          </form>
        </Dialog>
      )}
    </>
  );
}
