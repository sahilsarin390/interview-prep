/**
 * Pipeline stages (PROJECT.md §5). Each LLM stage goes through the provider
 * seam (lib/llm.ts) — never a vendor SDK directly — and is file-cached by the
 * caller via runs.ts. Deterministic stages (acquire/parse) are cheap; the
 * LLM stages (prepare/generate/critic) are where cost concentrates.
 */
import { modelFor, type LlmAdapter, type LlmRequest } from "../llm";
import { goldenBankJson } from "../golden";
import { parseJsonLoose, validateBank, validateQuestion } from "./json";
import type {
  CritiqueResult,
  JdFacts,
  Question,
  QuestionBank,
  ResumeFacts,
} from "./types";
import {
  jdFactsSystemPrompt,
  jdFactsUserPrompt,
  researchSystemPrompt,
  researchUserPrompt,
  resumeFactsSystemPrompt,
  resumeFactsUserPrompt,
} from "../prompts/facts";
import { generateSystemPrompt, generateUserPrompt } from "../prompts/generate";
import { criticSystemPrompt, criticUserPrompt } from "../prompts/critic";

/** Call the seam expecting JSON; retry once with a clean-JSON nudge on parse failure. */
async function completeJson<T>(
  adapter: LlmAdapter,
  req: LlmRequest,
  kind: "array" | "object"
): Promise<T> {
  const first = await adapter.complete(req);
  try {
    return parseJsonLoose<T>(first.text, kind);
  } catch {
    const nudge =
      kind === "array"
        ? "\n\nYour previous reply could not be parsed. Reply again with ONLY a valid JSON array — no prose, no markdown fences."
        : "\n\nYour previous reply could not be parsed. Reply again with ONLY a valid JSON object — no prose, no markdown fences.";
    const second = await adapter.complete({
      ...req,
      prompt: req.prompt + nudge,
      webSearch: false, // force clean JSON (also restores Gemini JSON mode)
      json: true,
    });
    try {
      return parseJsonLoose<T>(second.text, kind);
    } catch (e) {
      const t = second.text ?? "";
      const tail = t.slice(-160).replace(/\s+/g, " ");
      const looksTruncated = !t.trimEnd().endsWith(kind === "array" ? "]" : "}");
      throw new Error(
        `JSON parse failed (${kind}). chars=${t.length} truncated≈${looksTruncated} ` +
          `tail="${tail}" cause=${(e as Error).message}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// prepare · JD facts (PARSE)
// ---------------------------------------------------------------------------
export async function runJdFacts(jdText: string): Promise<JdFacts> {
  const adapter = modelFor("PARSE");
  return completeJson<JdFacts>(
    adapter,
    {
      system: jdFactsSystemPrompt(),
      prompt: jdFactsUserPrompt({ jdText }),
      json: true,
      maxTokens: 4096,
    },
    "object"
  );
}

// ---------------------------------------------------------------------------
// prepare · resume facts (PARSE)
// ---------------------------------------------------------------------------
export async function runResumeFacts(
  resumeText: string,
  jdText: string
): Promise<ResumeFacts> {
  const adapter = modelFor("PARSE");
  return completeJson<ResumeFacts>(
    adapter,
    {
      system: resumeFactsSystemPrompt(),
      prompt: resumeFactsUserPrompt({ resumeText, jdText }),
      json: true,
      maxTokens: 4096,
    },
    "object"
  );
}

// ---------------------------------------------------------------------------
// prepare · research (GENERATE + web search → markdown)
// ---------------------------------------------------------------------------
export async function runResearch(jd: JdFacts): Promise<string> {
  const adapter = modelFor("GENERATE");
  const res = await adapter.complete({
    system: researchSystemPrompt(),
    prompt: researchUserPrompt({
      company: jd.company,
      title: jd.title,
      team: jd.team,
      values: jd.values ?? [],
    }),
    webSearch: true,
    json: false,
    maxTokens: 4096,
  });
  return res.text.trim();
}

// ---------------------------------------------------------------------------
// process · generate (GENERATE → QuestionBank draft)
// ---------------------------------------------------------------------------
// NOTE (deviation from §7, flagged to user): the generate stage runs WITHOUT
// its own web_search. The dedicated `research` stage already performs the live
// search and feeds research.md here, so a second search per question round only
// adds large latency/cost (balanced/best generation was exceeding 5 min) and,
// on Gemini, disables JSON mode. Grounding is preserved via research.md.
export async function runGenerate(args: {
  resumeFacts: ResumeFacts;
  jdFacts: JdFacts;
  researchMd: string;
}): Promise<{ bank: QuestionBank; dropped: Array<{ index: number; reason: string }> }> {
  const adapter = modelFor("GENERATE");
  const arr = await completeJson<unknown[]>(
    adapter,
    {
      system: generateSystemPrompt(goldenBankJson()),
      prompt: generateUserPrompt({
        resumeFactsJson: JSON.stringify(args.resumeFacts, null, 2),
        jdFactsJson: JSON.stringify(args.jdFacts, null, 2),
        researchMd: args.researchMd,
      }),
      webSearch: false,
      json: true,
      maxTokens: 16000,
    },
    "array"
  );
  const { questions, dropped } = validateBank(arr);
  return { bank: questions, dropped };
}

// ---------------------------------------------------------------------------
// process · critic (CRITIC → corrected QuestionBank + log)
// ---------------------------------------------------------------------------
export async function runCritic(args: {
  resumeFacts: ResumeFacts;
  jdFacts: JdFacts;
  draft: QuestionBank;
}): Promise<{ critique: CritiqueResult; dropped: Array<{ index: number; reason: string }> }> {
  const adapter = modelFor("CRITIC");
  const raw = await completeJson<{ questions?: unknown[]; log?: unknown }>(
    adapter,
    {
      system: criticSystemPrompt(),
      prompt: criticUserPrompt({
        resumeFactsJson: JSON.stringify(args.resumeFacts, null, 2),
        jdFactsJson: JSON.stringify(args.jdFacts, null, 2),
        draftJson: JSON.stringify(args.draft, null, 2),
      }),
      json: true,
      maxTokens: 32000,
    },
    "object"
  );
  const items = Array.isArray(raw.questions) ? raw.questions : [];
  const { questions, dropped } = validateBank(items);
  const log = Array.isArray(raw.log)
    ? (raw.log as CritiqueResult["log"])
    : [];
  return { critique: { questions, log }, dropped };
}

// ---------------------------------------------------------------------------
// per-question regenerate (review screen → one improved question)
// ---------------------------------------------------------------------------
export async function runRegenerateOne(args: {
  resumeFacts: ResumeFacts;
  jdFacts: JdFacts;
  researchMd: string;
  current: Question;
  instruction?: string;
}): Promise<Question | null> {
  const adapter = modelFor("GENERATE");
  const system =
    generateSystemPrompt(goldenBankJson()) +
    "\n\nFOR THIS REQUEST ONLY: output ONE question object (NOT an array), same schema.";
  const instruction =
    args.instruction?.trim() ||
    "Replace this question with a stronger one in the SAME category that better satisfies the rubric.";
  const prompt =
    generateUserPrompt({
      resumeFactsJson: JSON.stringify(args.resumeFacts, null, 2),
      jdFactsJson: JSON.stringify(args.jdFacts, null, 2),
      researchMd: args.researchMd,
    }) +
    `\n\n<CURRENT_QUESTION>${JSON.stringify(args.current)}</CURRENT_QUESTION>` +
    `\n<INSTRUCTION>${instruction} Keep category "${args.current.category}".</INSTRUCTION>`;
  const obj = await completeJson<unknown>(
    adapter,
    { system, prompt, json: true, maxTokens: 2500 },
    "object"
  );
  const res = validateQuestion(obj);
  return "ok" in res ? res.ok : null;
}
