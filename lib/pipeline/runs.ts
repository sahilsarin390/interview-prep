/**
 * Run artifact store (PROJECT.md §5).
 *
 *   data/runs/{id}/
 *     inputs.json  resume_facts.json  jd_facts.json
 *     research.md  draft.json  critique.json  final.json
 *
 * Every intermediate is persisted so a stage can be re-run alone and runs are
 * auditable. A stage runs only if its output file is missing (idempotency +
 * caching). "Regenerate" = delete the file(s) and re-run downstream.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  CritiqueResult,
  JdFacts,
  PipelineInputs,
  QuestionBank,
  ResumeFacts,
  StageName,
} from "./types";

const RUNS_ROOT = path.join(process.cwd(), "data", "runs");

const FILE_FOR: Record<StageName, string> = {
  inputs: "inputs.json",
  resume_facts: "resume_facts.json",
  jd_facts: "jd_facts.json",
  research: "research.md",
  draft: "draft.json",
  critique: "critique.json",
  final: "final.json",
};

export function runDir(id: string): string {
  return path.join(RUNS_ROOT, id);
}

export function ensureRunDir(id: string): string {
  const dir = runDir(id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function stagePath(id: string, stage: StageName): string {
  return path.join(runDir(id), FILE_FOR[stage]);
}

export function stageExists(id: string, stage: StageName): boolean {
  return fs.existsSync(stagePath(id, stage));
}

export function readJsonStage<T>(id: string, stage: StageName): T | null {
  const p = stagePath(id, stage);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

export function writeJsonStage(id: string, stage: StageName, data: unknown): void {
  ensureRunDir(id);
  fs.writeFileSync(stagePath(id, stage), JSON.stringify(data, null, 2), "utf8");
}

export function readTextStage(id: string, stage: StageName): string | null {
  const p = stagePath(id, stage);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function writeTextStage(id: string, stage: StageName, text: string): void {
  ensureRunDir(id);
  fs.writeFileSync(stagePath(id, stage), text, "utf8");
}

export function clearStages(id: string, stages: StageName[]): void {
  for (const s of stages) {
    const p = stagePath(id, s);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}

export function clearRun(id: string): void {
  const dir = runDir(id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Run a stage with file caching. If the output exists and !fresh, parse and
 * return it. Otherwise run `produce()`, persist, and return.
 */
export async function cachedJson<T>(
  id: string,
  stage: StageName,
  fresh: boolean,
  produce: () => Promise<T>
): Promise<T> {
  if (!fresh) {
    const existing = readJsonStage<T>(id, stage);
    if (existing !== null) return existing;
  }
  const result = await produce();
  writeJsonStage(id, stage, result);
  return result;
}

export async function cachedText(
  id: string,
  stage: StageName,
  fresh: boolean,
  produce: () => Promise<string>
): Promise<string> {
  if (!fresh) {
    const existing = readTextStage(id, stage);
    if (existing !== null) return existing;
  }
  const result = await produce();
  writeTextStage(id, stage, result);
  return result;
}

export type RunReview = {
  runId: string;
  questions: QuestionBank; // critique questions (or draft fallback)
  criticLog: CritiqueResult["log"];
  inputs: PipelineInputs | null;
  jdFacts: JdFacts | null;
  resumeFacts: ResumeFacts | null;
};

/** Load a run's reviewable bank from disk (for /review/[runId]). */
export function loadReview(runId: string): RunReview | null {
  const critique = readJsonStage<CritiqueResult>(runId, "critique");
  const draft = readJsonStage<QuestionBank>(runId, "draft");
  const final = readJsonStage<QuestionBank>(runId, "final");
  const questions =
    final ?? (critique && critique.questions.length ? critique.questions : draft);
  if (!questions) return null;
  return {
    runId,
    questions,
    criticLog: critique?.log ?? [],
    inputs: readJsonStage<PipelineInputs>(runId, "inputs"),
    jdFacts: readJsonStage<JdFacts>(runId, "jd_facts"),
    resumeFacts: readJsonStage<ResumeFacts>(runId, "resume_facts"),
  };
}
