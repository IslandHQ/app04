import type { Question } from "./platform";
export interface DrillUnit {
  id: string;
  courseId: string;
  courseName: string;
  subject: string;
  name: string;
  sortOrder: number;
}
export interface LearningQuestion extends Question {
  hint1: string;
  hint2: string;
}
export interface LearningDrill {
  id: string;
  unitId: string;
  courseId: string;
  courseName: string;
  subject: string;
  unitName: string;
  title: string;
  status: "draft" | "published" | "archived";
  targetCount: number;
  questionCount: number;
  questions: LearningQuestion[];
  createdAt: string;
}
export interface DrillAssignment {
  id: string;
  drillId: string;
  userId: string;
  userName: string;
  title: string;
  courseId: string;
  courseName: string;
  subject: string;
  unitName: string;
  targetDate: string | null;
  questionCount: number;
  completedCount: number;
  answeredCount: number;
  bestCorrect: number;
  currentSessionId: string | null;
  active: boolean;
}
export interface LearningSession {
  id: string;
  assignmentId: string;
  title: string;
  courseName: string;
  subject: string;
  unitName: string;
  mode: "all" | "mistakes";
  completed: boolean;
  questions: (Omit<LearningQuestion, "answer" | "explanation"> & {
    answer?: number;
    explanation?: string;
  })[];
  answers: Record<string, { choice: number; correct: boolean }>;
}
