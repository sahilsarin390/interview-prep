/**
 * Prepare-stage prompts (PROJECT.md §5). These run on the cheap PARSE model
 * (extraction) and the GENERATE model + web search (research). Output shapes
 * match lib/pipeline/types.ts.
 */

// ---------------------------------------------------------------------------
// prepare · resume facts
// ---------------------------------------------------------------------------

export function resumeFactsSystemPrompt(): string {
  return `You extract structured facts from a candidate's resume for an interview-prep pipeline.

I will parse your output PROGRAMMATICALLY. Output ONLY a JSON object — no prose, no fences:
{
  "candidate_name": string | null,
  "headline": string | null,
  "narrative": string,                       // the candidate's story / career pivot in 1-3 sentences
  "achievements": [                          // concrete, evidence-bearing wins
    { "text": string, "metric": string | null, "skills": [string] }
  ],
  "skills": [string],                        // tools, languages, platforms actually used
  "projects": [ { "name": string, "description": string } ],
  "domains": [string],                       // industries / data domains worked in
  "education": [string],                     // degrees WITH field, e.g. "B.Tech, Computer Science"
  "certifications": [string],                // named certs/credentials, e.g. "Penn FinTech foundations certificate"
  "apparent_gaps": [string]                  // honest gaps vs the JD (years, degree, domain, named skills)
}

Rules:
- Extract ONLY what is supported by the resume text. Do NOT invent metrics, employers, or skills.
- Preserve quantified results verbatim where present (e.g. "6-8 hrs to ~1 hr", "~95 datasets").
- Capture EVERY degree (with its field of study) and EVERY named certificate/credential — these
  drive role-fit and domain questions, so never omit them if present in the resume.
- "apparent_gaps" must be grounded in the gap between the resume and the JD provided; if none, use [].`;
}

export function resumeFactsUserPrompt(args: { resumeText: string; jdText: string }): string {
  return `<RESUME>
${args.resumeText}
</RESUME>

<JOB_DESCRIPTION_FOR_GAP_ANALYSIS>
${args.jdText}
</JOB_DESCRIPTION_FOR_GAP_ANALYSIS>`;
}

// ---------------------------------------------------------------------------
// prepare · JD facts
// ---------------------------------------------------------------------------

export function jdFactsSystemPrompt(): string {
  return `You extract structured facts from a job description for an interview-prep pipeline.

I will parse your output PROGRAMMATICALLY. Output ONLY a JSON object — no prose, no fences:
{
  "company": string | null,
  "title": string | null,
  "team": string | null,
  "requirements": [string],     // explicit must-haves: years, degree, certifications
  "named_skills": [string],     // tools / skills / methods explicitly named
  "responsibilities": [string], // what the role actually does, day to day
  "values": [string],           // stated company values / culture signals
  "nice_to_have": [string]      // preferred-but-not-required items
}

Rules:
- Extract ONLY what the JD states. Do NOT infer requirements that aren't written.
- Keep each list item short and specific (a phrase, not a paragraph).
- Capture stated company values / behaviours precisely — they drive culture-fit questions.`;
}

export function jdFactsUserPrompt(args: { jdText: string }): string {
  return `<JOB_DESCRIPTION>
${args.jdText}
</JOB_DESCRIPTION>`;
}

// ---------------------------------------------------------------------------
// prepare · research (GENERATE_MODEL + web search → markdown)
// ---------------------------------------------------------------------------

export function researchSystemPrompt(): string {
  return `You are an interview-research analyst. Using the web_search / google_search tool, research
how the named company actually interviews for the given role, and write a concise briefing in
Markdown (NOT JSON).

Cover, with specifics (cite what you find):
- The company's real stated values / leadership behaviours and how they show up in interviews.
- The interview style and process for this kind of role (rounds, formats, what they screen for).
- Role-specific question patterns: behavioral, technical, situational/case themes likely to come up.
- Anything distinctive about how this team frames its mission (it grounds culture-fit questions).

Keep it tight and factual (aim for 300-600 words). If reliable specifics are scarce, say so and
fall back to well-known patterns for this company and role type. Do not fabricate sources.`;
}

export function researchUserPrompt(args: {
  company: string | null;
  title: string | null;
  team: string | null;
  values: string[];
}): string {
  const company = args.company ?? "the company in the job description";
  const title = args.title ?? "the role in the job description";
  const team = args.team ? ` (team: ${args.team})` : "";
  const values = args.values.length
    ? `\nStated values to verify and expand on: ${args.values.join(", ")}.`
    : "";
  return `Research interview style, values, and role-specific question patterns for:
Company: ${company}
Role: ${title}${team}${values}`;
}
