import { NextResponse } from "next/server";
import { getJd, getResume } from "@/lib/repo";
import { runPipeline, type FreshMode } from "@/lib/pipeline";
import type { Tier } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const VALID_TIERS: Tier[] = ["fast", "balanced", "best"];

/** POST /api/generate {resume_id, jd_id, tier?, fresh?} → runs the pipeline. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const resumeId = String(body.resume_id ?? "");
    const jdId = String(body.jd_id ?? "");
    const tier = body.tier as string | undefined;
    const fresh = (body.fresh as FreshMode) ?? "none";

    const resume = getResume(resumeId);
    const jd = getJd(jdId);
    if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    if (!jd) return NextResponse.json({ error: "JD not found" }, { status: 404 });

    if (tier && VALID_TIERS.includes(tier as Tier)) {
      process.env.QUALITY_TIER = tier; // single-user localhost
    }

    const result = await runPipeline({
      resumeId,
      jdId,
      resumeText: resume.text,
      jdText: jd.text,
      fresh,
    });

    return NextResponse.json({
      runId: result.runId,
      questionCount: result.questions.length,
      meta: result.meta,
      diagnostics: result.diagnostics,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
