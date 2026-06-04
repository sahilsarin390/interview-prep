/**
 * Extract the hand-tuned QUESTION_BANK from reference/golden-example.html.
 * It serves as the generator's worked example (PROJECT.md §2): the depth,
 * grounding, and distractor quality the pipeline must reproduce.
 *
 * The array is a JS object literal (unquoted keys, smart quotes inside
 * strings), so we evaluate the literal in a sandboxed Function rather than
 * JSON.parse. The source is a trusted local asset.
 */
import fs from "node:fs";
import path from "node:path";
import type { Question, QuestionBank } from "./pipeline/types";

let cache: QuestionBank | null = null;

const GOLDEN_PATH = path.join(process.cwd(), "reference", "golden-example.html");

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function loadGoldenBank(): QuestionBank {
  if (cache) return cache;
  const html = fs.readFileSync(GOLDEN_PATH, "utf8");
  // Match from the array open to the first newline-anchored "];" (statement end).
  const m = html.match(/const\s+QUESTION_BANK\s*=\s*(\[[\s\S]*?\n\];)/);
  if (!m) throw new Error("QUESTION_BANK array not found in golden-example.html");
  const literal = m[1].replace(/;$/, "");
  const raw = new Function(`"use strict"; return (${literal});`)() as Question[];
  cache = raw.map((q) => ({
    category: decodeEntities(q.category),
    q: decodeEntities(q.q),
    options: q.options.map(decodeEntities),
    correct: q.correct,
    explanation: decodeEntities(q.explanation),
    delivery: decodeEntities(q.delivery),
  }));
  return cache;
}

/** Golden bank serialized for embedding in the generator prompt. */
export function goldenBankJson(): string {
  return JSON.stringify(loadGoldenBank(), null, 2);
}
