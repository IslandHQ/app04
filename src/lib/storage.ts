export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatLog {
  id: string;
  user_id: string;
  subject: string;
  topic: string;
  chat_history: ChatMessage[];
  created_at: string;
}

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: string;
  grade: string;
  level: number;
  exp: number;
  streak: number;
  last_study_date?: string;
}

export interface AISettings {
  hasApiKey?: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  duplicatePreventionMode: 'history' | 'seed';
}

export interface DailyRecord {
  date: string; // YYYY-MM-DD
  studyMinutes: number;
  totalQuestions: number;
  correctAnswers: number;
}

import type { DrillQuestion } from './ai';

export interface CustomDrillSet {
  id: string;
  title: string;
  subject: string;
  topic: string;
  createdAt: number;
  questions: DrillQuestion[];
  is_public?: boolean;
}

export interface UserData {
  grade: string;
  name: string;
  streak: number;
  lastStudyDate: string;
  level: number;
  exp: number;
  topicStats: Record<string, { total: number; correct: number }>;
  detailedStats: Record<string, { total: number; correct: number }>;
}

export const Storage = {
  async getSettings(): Promise<AISettings> {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },
  
  async saveSettings(settings: AISettings): Promise<void> {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!res.ok) throw new Error('保存に失敗しました');
  },
  
  async getUserData(): Promise<UserData> {
    const res = await fetch('/api/auth/me');
    if (!res.ok) throw new Error('Failed to fetch user data');
    const data = await res.json();
    const user = data.user;
    return {
      grade: user.grade || '',
      name: user.name,
      streak: user.streak || 0,
      lastStudyDate: user.last_study_date || '',
      level: user.level || 1,
      exp: user.exp || 0,
      topicStats: user.topicStats || {},
      detailedStats: user.detailedStats || {}
    };
  },
  
  async saveUserData(userData: UserData): Promise<void> {
    const res = await fetch('/api/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: userData.name, grade: userData.grade })
    });
    if (!res.ok) throw new Error('保存に失敗しました');
  },
  
  async getDailyRecords(): Promise<DailyRecord[]> {
    const res = await fetch('/api/daily_records');
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((d: { date: string; study_minutes: number; total_questions: number; correct_answers: number }) => ({
      date: d.date,
      studyMinutes: d.study_minutes,
      totalQuestions: d.total_questions,
      correctAnswers: d.correct_answers
    }));
  },
  
  async getCustomDrillSets(): Promise<CustomDrillSet[]> {
    const res = await fetch('/api/custom_drills');
    if (!res.ok) return [];
    return res.json();
  },
  
  async saveCustomDrillSet(drillSet: CustomDrillSet): Promise<void> {
    const res = await fetch('/api/custom_drills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(drillSet)
    });
    if (!res.ok) throw new Error('保存に失敗しました');
  },
  
  async deleteCustomDrillSet(id: string): Promise<void> {
    const res = await fetch(`/api/custom_drills/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('削除に失敗しました');
  },
  
  async addStudyResult(subject: string, topic: string, minutes: number, isCorrect: boolean): Promise<{ gainedExp: number, leveledUp: boolean }> {
    const res = await fetch('/api/study_result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, topic, minutes, isCorrect })
    });
    if (!res.ok) throw new Error('Failed to add study result');
    return res.json();
  },
  
  async saveChatLog(subject: string, topic: string, chatHistory: ChatMessage[]): Promise<void> {
    const res = await fetch('/api/chat_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, topic, chatHistory })
    });
    if (!res.ok) throw new Error('保存に失敗しました');
  },
  
  async getAdminUsers(): Promise<AdminUser[]> {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error('Failed to fetch admin users');
    return res.json();
  },

  async getAdminUserRecords(userId: string): Promise<DailyRecord[]> {
    const res = await fetch(`/api/admin/users/${userId}/records`);
    if (!res.ok) throw new Error('Failed to fetch admin user records');
    const records = await res.json();
    return records.map((r: { date: string; study_minutes: number; total_questions: number; correct_answers: number }) => ({
      date: r.date,
      studyMinutes: r.study_minutes,
      totalQuestions: r.total_questions,
      correctAnswers: r.correct_answers
    }));
  },

  async getAdminUserChatLogs(userId: string): Promise<ChatLog[]> {
    const res = await fetch(`/api/admin/users/${userId}/chat_logs`);
    if (!res.ok) throw new Error('Failed to fetch admin chat logs');
    return res.json();
  }
};
