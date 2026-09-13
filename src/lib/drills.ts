export type {
  DrillUnit,
  LearningQuestion,
  LearningDrill,
  DrillAssignment,
  LearningSession,
} from "../../shared/drills";
import type { LearningQuestion } from "../../shared/drills";
import type { DrillQuestion } from "./ai";
export const emptyLearningQuestion = (): LearningQuestion => ({
  id: crypto.randomUUID(),
  text: "",
  choices: ["", "", "", ""],
  answer: 0,
  points: 1,
  category: "",
  explanation: "",
  hint1: "",
  hint2: "",
});
export const learningQuestions = (
  questions: DrillQuestion[],
): LearningQuestion[] =>
  questions.map((q) => ({
    id: crypto.randomUUID(),
    text: q.questionText,
    choices: q.choices,
    answer: q.choices.indexOf(q.correctAnswer),
    points: 1,
    category: q.topic,
    explanation: q.explanation,
    hint1: q.hint1,
    hint2: q.hint2,
  }));
