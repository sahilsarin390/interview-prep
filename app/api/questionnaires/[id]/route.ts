import { NextResponse } from "next/server";
import { getQuestionnaire } from "@/lib/repo";
import type { QuestionBank } from "@/lib/pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = getQuestionnaire(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let questions: QuestionBank = [];
  try {
    questions = JSON.parse(row.questions_json) as QuestionBank;
  } catch {
    /* ignore */
  }
  return NextResponse.json({
    id: row.id,
    title: row.title,
    resume_id: row.resume_id,
    jd_id: row.jd_id,
    created_at: row.created_at,
    questions,
  });
}
