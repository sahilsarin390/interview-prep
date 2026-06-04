import { NextResponse } from "next/server";
import { readJsonStage, readTextStage } from "@/lib/pipeline/runs";
import { runRegenerateOne } from "@/lib/pipeline/stages";
import { validateQuestion } from "@/lib/pipeline/json";
import type { JdFacts, ResumeFacts } from "@/lib/pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/runs/:runId/regenerate {current, instruction?} → one new question. */
export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await ctx.params;
    const body = await req.json();

    const cur = validateQuestion(body.current);
    if (!("ok" in cur)) {
      return NextResponse.json({ error: "Invalid current question" }, { status: 400 });
    }

    const resumeFacts = readJsonStage<ResumeFacts>(runId, "resume_facts");
    const jdFacts = readJsonStage<JdFacts>(runId, "jd_facts");
    const researchMd = readTextStage(runId, "research") ?? "";
    if (!resumeFacts || !jdFacts) {
      return NextResponse.json(
        { error: "Run context missing (facts not found); cannot regenerate." },
        { status: 404 }
      );
    }

    const question = await runRegenerateOne({
      resumeFacts,
      jdFacts,
      researchMd,
      current: cur.ok,
      instruction: body.instruction ? String(body.instruction) : undefined,
    });
    if (!question) {
      return NextResponse.json({ error: "Model returned an invalid question; try again." }, { status: 502 });
    }
    return NextResponse.json({ question });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
