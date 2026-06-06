export interface AISettings {
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface DailyRecord {
  date: string; // YYYY-MM-DD
  studyMinutes: number;
  totalQuestions: number;
  correctAnswers: number;
}

export interface UserData {
  grade: string;
  name: string;
  streak: number;
  lastStudyDate: string;
  level: number;
  exp: number;
  topicStats: Record<string, { total: number; correct: number }>;
}

const DEFAULT_SETTINGS: AISettings = {
  endpoint: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o'
};

const DEFAULT_USER_DATA: UserData = {
  grade: '中1',
  name: 'たろう',
  streak: 0,
  lastStudyDate: '',
  level: 1,
  exp: 0,
  topicStats: {}
};

export const Storage = {
  getSettings(): AISettings {
    const data = localStorage.getItem('app_settings');
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
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
  
  addStudyResult(subject: string, minutes: number, isCorrect: boolean): { gainedExp: number, leveledUp: boolean } {
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

    this.saveUserData(userData);

    return { gainedExp, leveledUp };
  }
};
