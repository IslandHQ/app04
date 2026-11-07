export interface Skill {
  id: string;
  subject: string;
  name: string;
  description: string;
  example: string;
  foundation: boolean;
  prerequisiteIds: string[];
  unitIds: string[];
}
export interface SkillEstimate extends Skill {
  estimate: number | null;
  status: "insufficient" | "developing" | "secure";
  distinctQuestions: number;
  answers: number;
  assisted: number;
  lastAnsweredAt: string | null;
  practiceAvailable: boolean;
}
export interface Evidence {
  skillId: string;
  questionKey: string;
  correct: boolean;
  hintLevel: number;
  answeredAt: string;
}
// Transparent provisional estimate, not a psychometric test score. At most two observations per item.
export function estimateSkill(evidence: Evidence[]) {
  const items = new Map<string, Evidence[]>();
  for (const e of [...evidence].sort((a, b) =>
    a.answeredAt.localeCompare(b.answeredAt),
  )) {
    const list = items.get(e.questionKey) || [];
    list.push(e);
    items.set(e.questionKey, list);
  }
  let earned = 1,
    weight = 2;
  for (const list of items.values()) {
    for (const [i, e] of [
      list[0],
      ...(list.length > 1 ? [list[list.length - 1]] : []),
    ].entries()) {
      const w = i === 0 ? 1 : 0.2;
      weight += w;
      earned +=
        w *
        (e.correct
          ? e.hintLevel >= 2
            ? 0.35
            : e.hintLevel === 1
              ? 0.65
              : 1
          : 0);
    }
  }
  const estimate = evidence.length ? Math.round((100 * earned) / weight) : null;
  return {
    estimate,
    status:
      items.size < 3
        ? ("insufficient" as const)
        : estimate !== null && estimate >= 75
          ? ("secure" as const)
          : ("developing" as const),
    distinctQuestions: items.size,
    answers: evidence.length,
    assisted: evidence.filter((e) => e.hintLevel > 0).length,
    lastAnsweredAt:
      evidence
        .map((e) => e.answeredAt)
        .sort()
        .at(-1) || null,
  };
}
export function hasCycle(edges: Map<string, string[]>) {
  const active = new Set<string>(),
    done = new Set<string>();
  function visit(id: string): boolean {
    if (active.has(id)) return true;
    if (done.has(id)) return false;
    active.add(id);
    if ((edges.get(id) || []).some(visit)) return true;
    active.delete(id);
    done.add(id);
    return false;
  }
  return [...edges.keys()].some(visit);
}
