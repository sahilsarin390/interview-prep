import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { runPipeline, type FreshMode } from "@/lib/pipeline";
import type { Question } from "@/lib/pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Phase 2 dev trigger — run the pipeline end-to-end on the bundled Fidelity
 * fixtures and inspect the result against golden-example.html.
 *
 *   GET /api/dev/generate                          (cached; balanced/env tier)
 *   GET /api/dev/generate?tier=fast                (cheap Gemini iteration)
 *   GET /api/dev/generate?tier=fast&fresh=process  (re-run generate+critic only)
 *   GET /api/dev/generate?fresh=all                (wipe the run, redo everything)
 *   GET /api/dev/generate?full=1                   (include every question in the response)
 */
function fixture(name: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "reference", "fixtures", name),
    "utf8"
  );
}

function categoryCounts(questions: Question[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of questions) {
    const group = q.category.split(" · ")[0];
    out[group] = (out[group] ?? 0) + 1;
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tier = url.searchParams.get("tier");
  const fresh = (url.searchParams.get("fresh") ?? "none") as FreshMode;
  const runId = url.searchParams.get("runId") ?? "fixture-fidelity";
  const full = url.searchParams.get("full") === "1";

  if (tier) process.env.QUALITY_TIER = tier; // single-user localhost; fine

  try {
    const result = await runPipeline({
      runId,
      resumeId: "fixture-resume",
      jdId: "fixture-jd",
      resumeText: fixture("fidelity-resume.txt"),
      jdText: fixture("fidelity-jd.txt"),
      fresh,
    });

    const summary = {
      ok: true,
      runId: result.runId,
      meta: result.meta,
      counts: {
        draft: result.draft.length,
        critique: result.critique.questions.length,
        final: result.questions.length,
        categories: categoryCounts(result.questions),
      },
      diagnostics: result.diagnostics,
      criticLog: result.critique.log,
      researchChars: result.research.length,
      jdFacts: result.jdFacts,
      resumeFacts: result.resumeFacts,
      questions: full ? result.questions : result.questions.slice(0, 3),
    };
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json({ ok: false, error: message, stack }, { status: 500 });
  }
}
