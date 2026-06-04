import { NextResponse } from "next/server";
import { getDb, DB_FILE_PATH } from "@/lib/db";
import { listTables } from "@/lib/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const tables = listTables(db);
    const ok =
      tables.includes("resumes") &&
      tables.includes("job_descriptions") &&
      tables.includes("questionnaires") &&
      tables.includes("_migrations");
    return NextResponse.json({
      ok,
      dbPath: DB_FILE_PATH,
      tables,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
