import { NextResponse } from "next/server";
import { createQuestionnaire, getJd, listQuestionnaires } from "@/lib/repo";
import { validateBank } from "@/lib/pipeline/json";
import { writeFinal } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = listQuestionnaires().map((r) => {
    let count = 0;
    try {
      count = (JSON.parse(r.questions_json) as unknown[]).length;
    } catch {
      /* ignore */
    }
    return {
      id: r.id,
      resume_id: r.resume_id,
      jd_id: r.jd_id,
      title: r.title,
      created_at: r.created_at,
      questionCount: count,
    };
  });
  return NextResponse.json({ questionnaires: rows });
}

/** POST {resume_id, jd_id, questions, runId?, title?} → save approved final. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const resumeId = String(body.resume_id ?? "");
    const jdId = String(body.jd_id ?? "");
    const runId = body.runId ? String(body.runId) : undefined;

    if (!resumeId || !jdId) {
      return NextResponse.json({ error: "resume_id and jd_id are required" }, { status: 400 });
    }
    if (!Array.isArray(body.questions)) {
      return NextResponse.json({ error: "questions[] is required" }, { status: 400 });
    }

    const { questions, dropped } = validateBank(body.questions);
    if (questions.length === 0) {
      return NextResponse.json(
        { error: "No valid questions to save", dropped },
        { status: 400 }
      );
    }

    const jd = getJd(jdId);
    const title =
      (body.title && String(body.title).trim()) ||
      [jd?.company, jd?.title].filter(Boolean).join(" — ") ||
      "Interview prep";

    // Use the runId as the questionnaire id so it matches data/runs/{id} (§5).
    const row = createQuestionnaire({ id: runId, resume_id: resumeId, jd_id: jdId, title, questions });
    if (runId) {
      try {
        writeFinal(runId, questions);
      } catch {
        /* run dir may not exist if saved without a pipeline run; ignore */
      }
    }

    return NextResponse.json({
      questionnaire: { id: row.id, title: row.title, questionCount: questions.length },
      dropped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
