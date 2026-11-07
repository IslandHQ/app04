import type { Assignment, Attempt } from "../../lib/platform";
export default function ResultAnalysis({
  results,
  assignments,
}: {
  results: Attempt[];
  assignments: Assignment[];
}) {
  const rows = new Map<
    string,
    {
      title: string;
      text: string;
      category: string;
      correct: number;
      total: number;
    }
  >();
  for (const r of results)
    for (const q of r.questions) {
      const key = `${assignments.find((a) => a.id === r.assignmentId)?.testId || r.assignmentId}:${q.id}`;
      const row = rows.get(key) || {
        title: r.title,
        text: q.text,
        category: q.category,
        correct: 0,
        total: 0,
      };
      row.total++;
      if (r.answers[q.id] === q.answer) row.correct++;
      rows.set(key, row);
    }
  if (!rows.size) return null;
  return (
    <section className="admin-card admin-table-wrap">
      <h2>設問別の正答率</h2>
      <p className="admin-muted">
        現在の検索条件に一致する提出結果を集計します。再受験はそれぞれ1回として数えます。
      </p>
      <table>
        <thead>
          <tr>
            <th>テスト / 問題</th>
            <th>分野</th>
            <th>正解 / 受験</th>
            <th>正答率</th>
          </tr>
        </thead>
        <tbody>
          {[...rows.entries()]
            .sort(([, a], [, b]) => a.correct / a.total - b.correct / b.total)
            .map(([key, r]) => (
              <tr key={key}>
                <td style={{ whiteSpace: "normal", minWidth: 220 }}>
                  <b>{r.title}</b>
                  <small>{r.text}</small>
                </td>
                <td>{r.category || "—"}</td>
                <td>
                  {r.correct} / {r.total}
                </td>
                <td>{Math.round((r.correct / r.total) * 100)}%</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}
