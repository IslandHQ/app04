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
  db.exec(readFileSync("migrations/0002_test_time_limit.sql", "utf8"));
  const questions = JSON.stringify([
    {
      questionText: "1+1は？",
      choices: ["1", "2", "3", "4"],
      correctAnswer: "2",
      hint1: "足し算",
      hint2: "数える",
      explanation: "2です",
    },
  ]);
  db.prepare(
    "INSERT INTO custom_drill_sets(id,user_id,title,subject,topic,questions,created_at) VALUES('legacy','old','旧教材','数学','計算',?,'2026-01-01')",
  ).run(questions);
  db.exec(readFileSync("migrations/0003_learning_drills.sql", "utf8"));
  expect(
    db
      .prepare("SELECT questions FROM custom_drill_sets WHERE id='legacy'")
      .get(),
  ).toMatchObject({ questions });
  const imported = db
    .prepare(
      "SELECT status,questions FROM learning_drills WHERE id='legacy-legacy'",
    )
    .get()!;
  expect(imported.status).toBe("draft");
  expect(JSON.parse(String(imported.questions))[0]).toMatchObject({
    text: "1+1は？",
    answer: 1,
    hint1: "足し算",
  });
  expect(
    db
      .prepare(
        "SELECT total_questions,correct_answers FROM study_daily_totals WHERE user_id='old'",
      )
      .get(),
  ).toMatchObject({ total_questions: 5, correct_answers: 4 });
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
