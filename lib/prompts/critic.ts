/**
 * Critic prompt (PROJECT.md §7). Implemented verbatim, then tuned.
 * Call with json:true. The `questions` array becomes critique.json.
 */
import { RUBRIC } from "./rubric";

export function criticSystemPrompt(): string {
  return `You are a ruthless QA reviewer for interview-prep questions. You receive a DRAFT question
bank. For EACH question, check it against the RUBRIC. Where it falls short — generic
distractor, hallucinated/ungrounded fact, weak or assertive-only explanation, off-target to
the JD, vague delivery note — REWRITE that question to fix it. Keep strong questions as-is.

I will parse your output PROGRAMMATICALLY. Output ONLY a JSON object — no prose, no fences:
{ "questions": [ ...corrected QuestionBank, same schema... ],
  "log": [ { "index": int, "issue": string, "action": "kept" | "rewrote" } ] }

Verify GROUNDING hardest: if a draft answer references a fact not present in CANDIDATE FACTS,
rewrite it to remove the fabrication.

<RUBRIC>${RUBRIC}</RUBRIC>`;
}

export function criticUserPrompt(args: {
  resumeFactsJson: string;
  jdFactsJson: string;
  draftJson: string;
}): string {
  return `<CANDIDATE_FACTS>${args.resumeFactsJson}</CANDIDATE_FACTS>
<JD_FACTS>${args.jdFactsJson}</JD_FACTS>
<DRAFT>${args.draftJson}</DRAFT>`;
}
