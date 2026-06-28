import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { DrillQuestion } from './ai';

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
  duplicatePreventionMode: 'seed'
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

const INDEXED_DB_NAME = 'app04_sqlite_db';
const INDEXED_DB_VERSION = 1;
const INDEXED_DB_STORE = 'databases';
const INDEXED_DB_KEY = 'main';

let sqlPromise: Promise<SqlJsStatic> | null = null;
let dbPromise: Promise<Database> | null = null;

function loadSql() {
  sqlPromise ??= initSqlJs({
    locateFile: () => sqlWasmUrl
  });
  return sqlPromise;
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(INDEXED_DB_STORE)) {
        db.createObjectStore(INDEXED_DB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readPersistedDb(): Promise<Uint8Array | null> {
  const indexedDb = await openIndexedDb();

  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(INDEXED_DB_STORE, 'readonly');
    const store = transaction.objectStore(INDEXED_DB_STORE);
    const request = store.get(INDEXED_DB_KEY);

    request.onsuccess = () => {
      const result = request.result;
      resolve(result instanceof Uint8Array ? result : null);
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => indexedDb.close();
    transaction.onerror = () => {
      indexedDb.close();
      reject(transaction.error);
    };
  });
}

async function persistDb(db: Database): Promise<void> {
  const data = db.export();
  const indexedDb = await openIndexedDb();

  return new Promise((resolve, reject) => {
    const transaction = indexedDb.transaction(INDEXED_DB_STORE, 'readwrite');
    const store = transaction.objectStore(INDEXED_DB_STORE);
    store.put(data, INDEXED_DB_KEY);

    transaction.oncomplete = () => {
      indexedDb.close();
      resolve();
    };
    transaction.onerror = () => {
      indexedDb.close();
      reject(transaction.error);
    };
  });
}

function initializeSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_records (
      date TEXT PRIMARY KEY,
      study_minutes INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      correct_answers INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_drill_sets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      questions_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

async function getDb() {
  dbPromise ??= (async () => {
    const [SQL, persisted] = await Promise.all([loadSql(), readPersistedDb()]);
    const db = persisted ? new SQL.Database(persisted) : new SQL.Database();
    initializeSchema(db);
    if (!persisted) {
      await persistDb(db);
    }
    return db;
  })();

  return dbPromise;
}

function readKv<T>(db: Database, key: string, fallback: T): T {
  const result = db.exec('SELECT value FROM kv WHERE key = ?', [key]);
  const value = result[0]?.values[0]?.[0];
  return typeof value === 'string' ? JSON.parse(value) : structuredClone(fallback);
}

async function writeKv<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  db.run(
    'INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)',
    [key, JSON.stringify(value), Date.now()]
  );
  await persistDb(db);
}

function normalizeUserData(userData: UserData): UserData {
  return {
    ...userData,
    level: userData.level ?? 1,
    exp: userData.exp ?? 0,
    topicStats: userData.topicStats ?? {},
    detailedStats: userData.detailedStats ?? {}
  };
}

export const Storage = {
  async getSettings(): Promise<AISettings> {
    const db = await getDb();
    return readKv(db, 'app_settings', DEFAULT_SETTINGS);
  },

  async saveSettings(settings: AISettings): Promise<void> {
    await writeKv('app_settings', settings);
  },

  async getUserData(): Promise<UserData> {
    const db = await getDb();
    return normalizeUserData(readKv(db, 'user_data', DEFAULT_USER_DATA));
  },

  async saveUserData(userData: UserData): Promise<void> {
    await writeKv('user_data', normalizeUserData(userData));
  },

  async getDailyRecords(): Promise<DailyRecord[]> {
    const db = await getDb();
    const result = db.exec(`
      SELECT date, study_minutes, total_questions, correct_answers
      FROM daily_records
      ORDER BY date ASC
    `);

    return (result[0]?.values ?? []).map(([date, studyMinutes, totalQuestions, correctAnswers]) => ({
      date: String(date),
      studyMinutes: Number(studyMinutes),
      totalQuestions: Number(totalQuestions),
      correctAnswers: Number(correctAnswers)
    }));
  },

  async saveDailyRecords(records: DailyRecord[]): Promise<void> {
    const db = await getDb();
    const now = Date.now();
    db.run('DELETE FROM daily_records');

    const statement = db.prepare(`
      INSERT INTO daily_records (date, study_minutes, total_questions, correct_answers, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    try {
      for (const record of records) {
        statement.run([
          record.date,
          record.studyMinutes,
          record.totalQuestions,
          record.correctAnswers,
          now
        ]);
      }
    } finally {
      statement.free();
    }

    await persistDb(db);
  },

  async getCustomDrillSets(): Promise<CustomDrillSet[]> {
    const db = await getDb();
    const result = db.exec(`
      SELECT id, title, subject, topic, created_at, questions_json
      FROM custom_drill_sets
      ORDER BY created_at DESC
    `);

    return (result[0]?.values ?? []).map(([id, title, subject, topic, createdAt, questionsJson]) => ({
      id: String(id),
      title: String(title),
      subject: String(subject),
      topic: String(topic),
      createdAt: Number(createdAt),
      questions: JSON.parse(String(questionsJson))
    }));
  },

  async saveCustomDrillSet(drillSet: CustomDrillSet): Promise<void> {
    const db = await getDb();
    db.run(
      `
      INSERT OR REPLACE INTO custom_drill_sets
        (id, title, subject, topic, created_at, questions_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        drillSet.id,
        drillSet.title,
        drillSet.subject,
        drillSet.topic,
        drillSet.createdAt,
        JSON.stringify(drillSet.questions),
        Date.now()
      ]
    );
    await persistDb(db);
  },

  async deleteCustomDrillSet(id: string): Promise<void> {
    const db = await getDb();
    db.run('DELETE FROM custom_drill_sets WHERE id = ?', [id]);
    await persistDb(db);
  },

  async addStudyResult(
    subject: string,
    topic: string,
    minutes: number,
    isCorrect: boolean
  ): Promise<{ gainedExp: number; leveledUp: boolean }> {
    const today = new Date().toISOString().split('T')[0];
    const records = await this.getDailyRecords();
    let todayRecord = records.find(r => r.date === today);
    const userData = await this.getUserData();

    if (!todayRecord) {
      todayRecord = { date: today, studyMinutes: 0, totalQuestions: 0, correctAnswers: 0 };
      records.push(todayRecord);

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

    const gainedExp = isCorrect ? 10 : 2;
    userData.exp += gainedExp;

    let leveledUp = false;
    const expNeeded = userData.level * 50;
    if (userData.exp >= expNeeded) {
      userData.level += 1;
      userData.exp -= expNeeded;
      leveledUp = true;
    }

    if (!userData.topicStats[subject]) {
      userData.topicStats[subject] = { total: 0, correct: 0 };
    }
    userData.topicStats[subject].total += 1;
    if (isCorrect) userData.topicStats[subject].correct += 1;

    const topicKey = `${subject}:${topic}`;
    if (!userData.detailedStats[topicKey]) {
      userData.detailedStats[topicKey] = { total: 0, correct: 0 };
    }
    userData.detailedStats[topicKey].total += 1;
    if (isCorrect) userData.detailedStats[topicKey].correct += 1;

    await this.saveDailyRecords(records);
    await this.saveUserData(userData);

    return { gainedExp, leveledUp };
  }
};
