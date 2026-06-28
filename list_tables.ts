import { Database } from 'bun:sqlite';
const db = new Database('local.db');
console.log(db.query("SELECT name FROM sqlite_master WHERE type='table'").all());
