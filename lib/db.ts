import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { runMigrations } from "./migrations";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "app.db");

declare global {
  var __ipDb: Database.Database | undefined;
}

function open(): Database.Database {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__ipDb) globalThis.__ipDb = open();
  return globalThis.__ipDb;
}

export const DB_FILE_PATH = DB_PATH;
