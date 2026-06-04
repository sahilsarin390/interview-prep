import { NextResponse } from "next/server";
import { describeResolution, modelFor, type Role } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 1 smoke test.
 *   GET /api/llm-smoke                  → tier resolution only (NO API calls, zero cost)
 *   GET /api/llm-smoke?live=gemini      → one tiny Gemini call (free tier)
 *   GET /api/llm-smoke?live=anthropic   → one tiny Anthropic call (paid — minimal: max 16 tokens)
 *   GET /api/llm-smoke?live=both        → both of the above
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const live = url.searchParams.get("live");

  const resolution = describeResolution();
  const result: Record<string, unknown> = { resolution };

  async function tinyCall(role: Role, label: string) {
    const adapter = modelFor(role);
    const t0 = Date.now();
    const { text } = await adapter.complete({
      prompt: "Reply with exactly the word: OK",
      maxTokens: 16,
    });
    return { label, ms: Date.now() - t0, text: text.trim() };
  }

  try {
    if (live === "gemini" || live === "both") {
      // PARSE role is Gemini in every tier.
      result.gemini = await tinyCall("PARSE", "gemini-via-PARSE");
    }
    if (live === "anthropic" || live === "both") {
      // GENERATE is Anthropic in balanced/best; if tier=fast it's Gemini, so
      // force a claude model regardless of tier for this check.
      const prev = process.env.GENERATE_MODEL;
      process.env.GENERATE_MODEL = "claude-sonnet-4-6";
      try {
        result.anthropic = await tinyCall("GENERATE", "anthropic-claude-sonnet-4-6");
      } finally {
        if (prev === undefined) delete process.env.GENERATE_MODEL;
        else process.env.GENERATE_MODEL = prev;
      }
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message, ...result }, { status: 500 });
  }
}
