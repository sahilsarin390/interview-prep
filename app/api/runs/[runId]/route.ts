import { NextResponse } from "next/server";
import { loadReview } from "@/lib/pipeline/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/runs/:runId → reviewable bank + context for the review screen. */
export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const review = loadReview(runId);
  if (!review) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json(review);
}
