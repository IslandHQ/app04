import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

test("additive migrations preserve existing records and protect the last administrator", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("schema.sql", "utf8"));
  db.exec(
    "INSERT INTO users(id,email,password_hash,name,grade,role,created_at) VALUES('old','old@example.test','hash','既存の管理者','中2','admin','2026-01-01'); INSERT INTO daily_records(id,user_id,date,study_minutes,total_questions,correct_answers) VALUES('record','old','2026-01-01',10,5,4)",
  );
  db.exec(readFileSync("migrations/0000_existing_schema.sql", "utf8"));
  db.exec(readFileSync("migrations/0001_admin_platform.sql", "utf8"));
  expect(
    db.prepare("SELECT name,status,profile FROM users").get(),
  ).toMatchObject({ name: "既存の管理者", status: "active", profile: "{}" });
  expect(
    db.prepare("SELECT correct_answers FROM daily_records").get(),
  ).toMatchObject({ correct_answers: 4 });
  expect(() => db.exec("UPDATE users SET role='user' WHERE id='old'")).toThrow(
    /LAST_ADMIN/,
  );
  expect(() =>
    db.exec("UPDATE users SET status='disabled' WHERE id='old'"),
  ).toThrow(/LAST_ADMIN/);
  db.close();
});
