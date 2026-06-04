/**
 * Generator prompt (PROJECT.md §7). Implemented verbatim, then tuned.
 * Call with webSearch:true, json:true.
 */
import { RUBRIC } from "./rubric";

export function generateSystemPrompt(goldenBankJson: string): string {
  return `You are an expert interview coach. Produce a tailored MCQ interview-prep question bank.

I will parse your output PROGRAMMATICALLY. Output ONLY a JSON array of question objects —
no prose, no markdown fences, no commentary. Each object:
{ "category": string, "q": string, "options": [4 strings], "correct": int(0-3),
  "explanation": string, "delivery": string }

Produce 24–30 questions following the QUALITY RUBRIC below. Match the depth, specificity,
and tone of the WORKED EXAMPLE. Tailor every answer to the CANDIDATE FACTS and align to the
JD FACTS and COMPANY RESEARCH. If company research is thin, use the web_search tool to find
the company's real interview style and values before writing.

<RUBRIC>${RUBRIC}</RUBRIC>
<WORKED_EXAMPLE>${goldenBankJson}</WORKED_EXAMPLE>`;
}

export function generateUserPrompt(args: {
  resumeFactsJson: string;
  jdFactsJson: string;
  researchMd: string;
}): string {
  return `<CANDIDATE_FACTS>${args.resumeFactsJson}</CANDIDATE_FACTS>
<JD_FACTS>${args.jdFactsJson}</JD_FACTS>
<COMPANY_RESEARCH>${args.researchMd}</COMPANY_RESEARCH>`;
}
