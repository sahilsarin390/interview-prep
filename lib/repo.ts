/**
 * Data-access layer for the four SQLite tables (PROJECT.md §4).
 * Pages/routes use these helpers; nothing else touches the DB directly.
 */
import { nanoid } from "nanoid";
import { getDb } from "./db";
import type { QuestionBank } from "./pipeline/types";

export type ResumeRow = {
  id: string;
  label: string;
  text: string;
  is_active: number;
  created_at: string;
};

export type JdRow = {
  id: string;
  company: string | null;
  title: string | null;
  text: string;
  created_at: string;
};

export type QuestionnaireRow = {
  id: string;
  resume_id: string;
  jd_id: string;
  title: string;
  questions_json: string;
  created_at: string;
};

// --- resumes ---------------------------------------------------------------

export function createResume(input: {
  label: string;
  text: string;
  makeActive?: boolean;
}): ResumeRow {
  const db = getDb();
  const id = nanoid();
  const created_at = new Date().toISOString();
  const makeActive = input.makeActive ?? true;
  const tx = db.transaction(() => {
    if (makeActive) db.prepare("UPDATE resumes SET is_active = 0").run();
    db.prepare(
      "INSERT INTO resumes (id, label, text, is_active, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, input.label, input.text, makeActive ? 1 : 0, created_at);
  });
  tx();
  return getResume(id)!;
}

export function listResumes(): ResumeRow[] {
  return getDb()
    .prepare("SELECT * FROM resumes ORDER BY created_at DESC")
    .all() as ResumeRow[];
}

export function getResume(id: string): ResumeRow | null {
  return (
    (getDb().prepare("SELECT * FROM resumes WHERE id = ?").get(id) as
      | ResumeRow
      | undefined) ?? null
  );
}

export function setActiveResume(id: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE resumes SET is_active = 0").run();
    db.prepare("UPDATE resumes SET is_active = 1 WHERE id = ?").run(id);
  })();
}

// --- job descriptions ------------------------------------------------------

export function createJd(input: {
  company?: string | null;
  title?: string | null;
  text: string;
}): JdRow {
  const db = getDb();
  const id = nanoid();
  const created_at = new Date().toISOString();
  db.prepare(
    "INSERT INTO job_descriptions (id, company, title, text, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, input.company ?? null, input.title ?? null, input.text, created_at);
  return getJd(id)!;
}

export function listJds(): JdRow[] {
  return getDb()
    .prepare("SELECT * FROM job_descriptions ORDER BY created_at DESC")
    .all() as JdRow[];
}

export function getJd(id: string): JdRow | null {
  return (
    (getDb().prepare("SELECT * FROM job_descriptions WHERE id = ?").get(id) as
      | JdRow
      | undefined) ?? null
  );
}

// --- questionnaires --------------------------------------------------------

export function createQuestionnaire(input: {
  id?: string;
  resume_id: string;
  jd_id: string;
  title: string;
  questions: QuestionBank;
}): QuestionnaireRow {
  const db = getDb();
  const id = input.id ?? nanoid();
  const created_at = new Date().toISOString();
  db.prepare(
    `INSERT INTO questionnaires (id, resume_id, jd_id, title, questions_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       resume_id = excluded.resume_id,
       jd_id = excluded.jd_id,
       title = excluded.title,
       questions_json = excluded.questions_json`
  ).run(
    id,
    input.resume_id,
    input.jd_id,
    input.title,
    JSON.stringify(input.questions),
    created_at
  );
  return getQuestionnaire(id)!;
}

export function listQuestionnaires(): QuestionnaireRow[] {
  return getDb()
    .prepare("SELECT * FROM questionnaires ORDER BY created_at DESC")
    .all() as QuestionnaireRow[];
}

export function getQuestionnaire(id: string): QuestionnaireRow | null {
  return (
    (getDb().prepare("SELECT * FROM questionnaires WHERE id = ?").get(id) as
      | QuestionnaireRow
      | undefined) ?? null
  );
}
