/**
 * Pipeline data contracts (PROJECT.md §4 question schema + §5 intermediates).
 * The Question shape is the contract every stage emits/consumes.
 */

export type Question = {
  category: string; // "Culture Fit" | "Behavioral" | "Technical · SQL" | ...
  q: string;
  options: string[]; // exactly 4
  correct: number; // 0-based index of best answer (0-3)
  explanation: string; // why best wins AND why the tempting wrong one falls short
  delivery: string; // tactical in-the-room guidance
};

export type QuestionBank = Question[];

/** prepare · resume facts (PARSE_MODEL) */
export type ResumeFacts = {
  candidate_name: string | null;
  headline: string | null;
  narrative: string; // the candidate's story / career pivot
  achievements: Array<{
    text: string;
    metric: string | null; // quantified result if present
    skills: string[];
  }>;
  skills: string[];
  projects: Array<{ name: string; description: string }>;
  domains: string[]; // industries / data domains worked in
  education: string[]; // degrees + field (e.g. "B.Tech, Computer Science")
  certifications: string[]; // named certs / credentials (e.g. "Penn FinTech foundations")
  apparent_gaps: string[]; // gaps vs the JD (degree, years, domain, etc.)
};

/** prepare · JD facts (PARSE_MODEL) */
export type JdFacts = {
  company: string | null;
  title: string | null;
  team: string | null;
  requirements: string[]; // explicit must-haves (years, degree, etc.)
  named_skills: string[]; // tools/skills named in the JD
  responsibilities: string[];
  values: string[]; // stated company values / culture signals
  nice_to_have: string[];
};

/** process · critic (CRITIC_MODEL) output envelope */
export type CritiqueResult = {
  questions: QuestionBank;
  log: Array<{ index: number; issue: string; action: "kept" | "rewrote" }>;
};

/** acquire output */
export type PipelineInputs = {
  resume_id: string;
  jd_id: string;
  resume_text: string;
  jd_text: string;
};

export type StageName =
  | "inputs"
  | "resume_facts"
  | "jd_facts"
  | "research"
  | "draft"
  | "critique"
  | "final";
