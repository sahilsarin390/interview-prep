import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getJd, getResume } from "@/lib/repo";
import { runPipeline, type FreshMode } from "@/lib/pipeline";
import { writeRunStatus } from "@/lib/pipeline/runs";
import type { Tier } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const VALID_TIERS: Tier[] = ["fast", "balanced", "best"];

/**
 * POST /api/generate {resume_id, jd_id, tier?, fresh?}
 * Kicks the pipeline off as a BACKGROUND job and returns {runId} immediately.
 * The client polls GET /api/runs/:runId/status for progress, then loads
 * /review/:runId when state === "done". This avoids one giant blocking request
 * (which previously hung the browser when generation took several minutes).
 */
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

    const runId = nanoid();
    writeRunStatus(runId, { state: "running", stage: "starting", runId });

    // Fire and forget — the persistent Node server keeps the promise alive.
    void runPipeline({
      runId,
      resumeId,
      jdId,
      resumeText: resume.text,
      jdText: jd.text,
      fresh,
    })
      .then((result) =>
        writeRunStatus(runId, {
          state: "done",
          stage: "final",
          runId,
          questionCount: result.questions.length,
        })
      )
      .catch((err) =>
        writeRunStatus(runId, {
          state: "error",
          stage: "failed",
          runId,
          error: err instanceof Error ? err.message : String(err),
        })
      );

    return NextResponse.json({ runId }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
