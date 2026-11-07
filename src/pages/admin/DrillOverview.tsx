import { useEffect, useState } from "react";
import { api } from "../../lib/platform";
import type { LearningDrill, DrillAssignment } from "../../lib/drills";
export default function DrillOverview({ userCount }: { userCount: number }) {
  const [data, setData] = useState<{
    drills: LearningDrill[];
    assignments: DrillAssignment[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<LearningDrill[]>("/admin/drills"),
      api<DrillAssignment[]>("/admin/drill-assignments"),
    ])
      .then(([drills, assignments]) => setData({ drills, assignments }))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div className="admin-metrics">
        {[
          ["利用中のユーザー", userCount],
          [
            "公開中のドリル",
            data?.drills.filter((d) => d.status === "published").length ?? "—",
          ],
          [
            "配布中の学習ドリル",
            data?.assignments.filter((a) => a.active).length ?? "—",
          ],
          [
            "完了した割り当て",
            data?.assignments.filter((a) => a.active && a.completedCount > 0)
              .length ?? "—",
          ],
        ].map(([label, count]) => (
          <div className="admin-card" key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
    </>
  );
}
