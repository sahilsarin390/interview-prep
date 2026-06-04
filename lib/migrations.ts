import type { Database } from "better-sqlite3";

type Migration = { id: string; sql: string };

const MIGRATIONS: Migration[] = [
  {
    id: "0001_init",
    sql: `
      CREATE TABLE IF NOT EXISTS resumes (
        id         TEXT PRIMARY KEY,
        label      TEXT NOT NULL,
        text       TEXT NOT NULL,
        is_active  INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_descriptions (
        id         TEXT PRIMARY KEY,
        company    TEXT,
        title      TEXT,
        text       TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS questionnaires (
        id             TEXT PRIMARY KEY,
        resume_id      TEXT NOT NULL REFERENCES resumes(id),
        jd_id          TEXT NOT NULL REFERENCES job_descriptions(id),
        title          TEXT NOT NULL,
        questions_json TEXT NOT NULL,
        created_at     TEXT NOT NULL
      );
    `,
  },
];

export function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const isApplied = db.prepare("SELECT 1 FROM _migrations WHERE id = ?");
  const markApplied = db.prepare(
    "INSERT INTO _migrations (id, applied_at) VALUES (?, ?)"
  );

  const apply = db.transaction((m: Migration) => {
    db.exec(m.sql);
    markApplied.run(m.id, new Date().toISOString());
  });

  for (const m of MIGRATIONS) {
    if (!isApplied.get(m.id)) apply(m);
  }
}

export function listTables(db: Database): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}
