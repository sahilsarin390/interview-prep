/**
 * Parsing & validation (PROJECT.md §8). Don't trust model formatting:
 * strip stray fences, tolerantly locate the JSON value, validate against the
 * Question schema, and drop+log malformed items rather than crashing.
 */
import type { Question } from "./types";

/** Remove ```json fences and locate the outermost array/object. */
export function extractJson(raw: string, kind: "array" | "object"): string {
  let s = raw.trim();
  // Strip a leading ```json / ``` fence and trailing ```.
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  const open = kind === "array" ? "[" : "{";
  const close = kind === "array" ? "]" : "}";
  const start = s.indexOf(open);
  const end = s.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) return s;
  return s.slice(start, end + 1);
}

export function parseJsonLoose<T>(raw: string, kind: "array" | "object"): T {
  const candidate = extractJson(raw, kind);
  return JSON.parse(candidate) as T;
}

export type ValidationResult = {
  questions: Question[];
  dropped: Array<{ index: number; reason: string }>;
};

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Validate one item against the Question contract. Returns null if invalid. */
export function validateQuestion(x: unknown): { ok: Question } | { error: string } {
  if (!x || typeof x !== "object") return { error: "not an object" };
  const q = x as Record<string, unknown>;
  if (!nonEmptyString(q.category)) return { error: "category empty/not string" };
  if (!nonEmptyString(q.q)) return { error: "q empty/not string" };
  if (!Array.isArray(q.options)) return { error: "options not array" };
  if (q.options.length !== 4) return { error: `options length ${q.options.length} (need 4)` };
  if (!q.options.every(nonEmptyString)) return { error: "an option is empty/not string" };
  if (
    typeof q.correct !== "number" ||
    !Number.isInteger(q.correct) ||
    q.correct < 0 ||
    q.correct > 3
  ) {
    return { error: `correct=${String(q.correct)} not int 0-3` };
  }
  if (!nonEmptyString(q.explanation)) return { error: "explanation empty/not string" };
  if (!nonEmptyString(q.delivery)) return { error: "delivery empty/not string" };
  return {
    ok: {
      category: q.category.trim(),
      q: q.q.trim(),
      options: (q.options as string[]).map((o) => o.trim()),
      correct: q.correct,
      explanation: q.explanation.trim(),
      delivery: q.delivery.trim(),
    },
  };
}

/**
 * Randomize each question's option order and remap `correct`, so the best
 * answer isn't stuck in the same slot every time (LLMs strongly bias the
 * correct answer toward one position — often "C"). Safe only because
 * explanations reference option CONTENT, not letters (rubric item 8).
 */
export function balanceAnswerPositions(questions: Question[]): Question[] {
  return questions.map((q) => {
    const order = q.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const options = order.map((i) => q.options[i]);
    const correct = order.indexOf(q.correct);
    return { ...q, options, correct };
  });
}

/** Validate a whole bank, dropping+logging malformed items. */
export function validateBank(items: unknown[]): ValidationResult {
  const questions: Question[] = [];
  const dropped: Array<{ index: number; reason: string }> = [];
  items.forEach((item, index) => {
    const res = validateQuestion(item);
    if ("ok" in res) questions.push(res.ok);
    else dropped.push({ index, reason: res.error });
  });
  return { questions, dropped };
}
