import { NextResponse } from "next/server";
import { listPresentStages, readRunStatus } from "@/lib/pipeline/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/runs/:runId/status → background-job progress for the home page. */
export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const status = readRunStatus(runId);
  if (!status) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json({ ...status, stagesPresent: listPresentStages(runId) });
}
