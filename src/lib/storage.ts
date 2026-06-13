export interface AISettings {
  endpoint: string;
  apiKey: string;
  model: string;
  duplicatePreventionMode: 'history' | 'seed';
  useReasoning: boolean;
}

export interface DailyRecord {
  date: string; // YYYY-MM-DD
  studyMinutes: number;
  totalQuestions: number;
  correctAnswers: number;
}

// ai.tsで定義されている型をインポート（型のみ）
import type { DrillQuestion } from './ai';

export interface CustomDrillSet {
  id: string;
  title: string;
  subject: string;
  topic: string;
  createdAt: number;
  questions: DrillQuestion[];
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

const DEFAULT_SETTINGS: AISettings = {
  endpoint: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  duplicatePreventionMode: 'seed',
  useReasoning: true
};

const DEFAULT_USER_DATA: UserData = {
  grade: '中1',
  name: 'たろう',
  streak: 0,
  lastStudyDate: '',
  level: 1,
  exp: 0,
  topicStats: {},
  detailedStats: {}
};

export const Storage = {
  getSettings(): AISettings {
    const data = localStorage.getItem('app_settings');
    if (!data) return DEFAULT_SETTINGS;
    const settings = JSON.parse(data);
    // 後方互換性のための補完
    if (settings.useReasoning === undefined) settings.useReasoning = DEFAULT_SETTINGS.useReasoning;
    return settings;
  },
  
  saveSettings(settings: AISettings) {
    localStorage.setItem('app_settings', JSON.stringify(settings));
  },
  
  getUserData(): UserData {
    const data = localStorage.getItem('user_data');
    const parsed = data ? JSON.parse(data) : DEFAULT_USER_DATA;
    // 後方互換性のためのデフォルト値補完
    if (parsed.level === undefined) parsed.level = 1;
    if (parsed.exp === undefined) parsed.exp = 0;
    if (!parsed.topicStats) parsed.topicStats = {};
    if (!parsed.detailedStats) parsed.detailedStats = {};
    return parsed;
  },
  
  saveUserData(userData: UserData) {
    localStorage.setItem('user_data', JSON.stringify(userData));
  },
  
  getDailyRecords(): DailyRecord[] {
    const data = localStorage.getItem('daily_records');
    return data ? JSON.parse(data) : [];
  },
  
  saveDailyRecords(records: DailyRecord[]) {
    localStorage.setItem('daily_records', JSON.stringify(records));
  },
  
  getCustomDrillSets(): CustomDrillSet[] {
    const data = localStorage.getItem('custom_drill_sets');
    return data ? JSON.parse(data) : [];
  },
  
  saveCustomDrillSet(drillSet: CustomDrillSet) {
    const sets = this.getCustomDrillSets();
    const existingIndex = sets.findIndex(s => s.id === drillSet.id);
    if (existingIndex >= 0) {
      sets[existingIndex] = drillSet;
    } else {
      sets.push(drillSet);
    }
    localStorage.setItem('custom_drill_sets', JSON.stringify(sets));
  },
  
  deleteCustomDrillSet(id: string) {
    const sets = this.getCustomDrillSets();
    const filtered = sets.filter(s => s.id !== id);
    localStorage.setItem('custom_drill_sets', JSON.stringify(filtered));
  },
  
  addStudyResult(subject: string, topic: string, minutes: number, isCorrect: boolean): { gainedExp: number, leveledUp: boolean } {
    const today = new Date().toISOString().split('T')[0];
    const records = this.getDailyRecords();
    let todayRecord = records.find(r => r.date === today);
    const userData = this.getUserData();
    
    if (!todayRecord) {
      todayRecord = { date: today, studyMinutes: 0, totalQuestions: 0, correctAnswers: 0 };
      records.push(todayRecord);
      
      // Update streak
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (userData.lastStudyDate === yesterday) {
        userData.streak += 1;
      } else if (userData.lastStudyDate !== today) {
        userData.streak = 1;
      }
      userData.lastStudyDate = today;
    }
    
    todayRecord.studyMinutes += minutes;
    todayRecord.totalQuestions += 1;
    if (isCorrect) todayRecord.correctAnswers += 1;
    
    this.saveDailyRecords(records);

    // Update EXP and Level
    const gainedExp = isCorrect ? 10 : 2;
    userData.exp += gainedExp;
    
    let leveledUp = false;
    const expNeeded = userData.level * 50;
    if (userData.exp >= expNeeded) {
      userData.level += 1;
      userData.exp -= expNeeded;
      leveledUp = true;
    }

    // Update Stats
    if (!userData.topicStats[subject]) {
      userData.topicStats[subject] = { total: 0, correct: 0 };
    }
    userData.topicStats[subject].total += 1;
    if (isCorrect) userData.topicStats[subject].correct += 1;

    // Update Detailed Stats
    const topicKey = `${subject}:${topic}`;
    if (!userData.detailedStats[topicKey]) {
      userData.detailedStats[topicKey] = { total: 0, correct: 0 };
    }
    userData.detailedStats[topicKey].total += 1;
    if (isCorrect) userData.detailedStats[topicKey].correct += 1;

    this.saveUserData(userData);

    return { gainedExp, leveledUp };
  }
};
