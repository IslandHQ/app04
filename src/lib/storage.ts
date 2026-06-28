export interface AISettings {
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
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  },
  
  async getUserData(): Promise<UserData> {
    const res = await fetch('/api/auth/me');
    if (!res.ok) throw new Error('Failed to fetch user data');
    const data = await res.json();
    const user = data.user;
    return {
      grade: user.grade || '中1',
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
    await fetch('/api/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: userData.name, grade: userData.grade })
    });
  },
  
  async getDailyRecords(): Promise<DailyRecord[]> {
    const res = await fetch('/api/daily_records');
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((d: any) => ({
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
    await fetch('/api/custom_drills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(drillSet)
    });
  },
  
  async deleteCustomDrillSet(id: string): Promise<void> {
    await fetch(`/api/custom_drills/${id}`, { method: 'DELETE' });
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
  
  async saveChatLog(subject: string, topic: string, chatHistory: any[]): Promise<void> {
    await fetch('/api/chat_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, topic, chatHistory })
    });
  },
  
  async getAdminUsers(): Promise<any[]> {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error('Failed to fetch admin users');
    return res.json();
  },

  async getAdminUserRecords(userId: string): Promise<DailyRecord[]> {
    const res = await fetch(`/api/admin/users/${userId}/records`);
    if (!res.ok) throw new Error('Failed to fetch admin user records');
    const records = await res.json();
    return records.map((r: any) => ({
      date: r.date,
      studyMinutes: r.study_minutes,
      totalQuestions: r.total_questions,
      correctAnswers: r.correct_answers
    }));
  },

  async getAdminUserChatLogs(userId: string): Promise<any[]> {
    const res = await fetch(`/api/admin/users/${userId}/chat_logs`);
    if (!res.ok) throw new Error('Failed to fetch admin chat logs');
    return res.json();
  }
};
