export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  grade: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  profile: Record<string, string>;
  groupIds: string[];
}
export interface Group {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
}
export interface Course {
  id: string;
  name: string;
  description: string;
  audience: string;
}
export interface Question {
  id: string;
  text: string;
  choices: string[];
  answer: number;
  points: number;
  explanation: string;
  category: string;
}
export interface TestDefinition {
  id: string;
  title: string;
  courseId: string;
  description: string;
  status: "draft" | "published" | "closed";
  mode: "exam" | "practice";
  passPercent: number;
  questions: Question[];
  createdAt: string;
  timeLimitMinutes: number;
}
export interface Assignment {
  id: string;
  testId: string;
  title: string;
  userId: string;
  userName: string;
  testStatus: "published" | "closed";
  timeLimitMinutes: number;
  questionCount: number;
  mode: "exam" | "practice";
  dueAt: string | null;
  maxAttempts: number;
  attempts: number;
  status: "pending" | "in_progress" | "submitted" | "overdue";
}
export interface Attempt {
  id: string;
  assignmentId: string;
  title: string;
  userName?: string;
  status: "in_progress" | "submitted";
  startedAt: string;
  submittedAt: string | null;
  endsAt: string | null;
  answers: Record<string, number>;
  score: number | null;
  total: number;
  passed: boolean | null;
  questions: (Omit<Question, "answer" | "explanation"> & {
    answer?: number;
    explanation?: string;
  })[];
}
