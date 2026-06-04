/**
 * Pipeline orchestrator (PROJECT.md §5).
 * acquire → prepare (jd facts, resume facts, research) → process (generate,
 * critic) → parse. Every intermediate is persisted under data/runs/{id}/ and
 * each stage is skipped when its file already exists (idempotent + cached).
 */
import { nanoid } from "nanoid";
import { resolveModel, type Role } from "../llm";
import {
  cachedJson,
  cachedText,
  clearRun,
  clearStages,
  writeJsonStage,
} from "./runs";
import {
  runCritic,
  runGenerate,
  runJdFacts,
  runResearch,
  runResumeFacts,
} from "./stages";
import type {
  CritiqueResult,
  JdFacts,
  PipelineInputs,
  Question,
  QuestionBank,
  ResumeFacts,
} from "./types";

export type FreshMode = "none" | "critic" | "process" | "research" | "all";

export type RunOptions = {
  runId?: string;
  resumeId: string;
  jdId: string;
  resumeText: string;
  jdText: string;
  fresh?: FreshMode;
};

export type RunResult = {
  runId: string;
  resumeFacts: ResumeFacts;
  jdFacts: JdFacts;
  research: string;
  draft: QuestionBank;
  critique: CritiqueResult;
  questions: Question[]; // final validated bank for the review screen
  diagnostics: {
    droppedInGenerate: Array<{ index: number; reason: string }>;
    droppedInCritic: Array<{ index: number; reason: string }>;
    usedFallbackToDraft: boolean;
  };
  meta: {
    tier: string;
    models: Record<Role, { provider: string; model: string }>;
    timingsMs: Record<string, number>;
  };
};

function applyFresh(id: string, fresh: FreshMode): void {
  if (fresh === "all") clearRun(id);
  else if (fresh === "research") clearStages(id, ["research", "draft", "critique"]);
  else if (fresh === "process") clearStages(id, ["draft", "critique"]);
  else if (fresh === "critic") clearStages(id, ["critique"]);
}

async function timed<T>(
  store: Record<string, number>,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const t0 = Date.now();
  const out = await fn();
  store[key] = Date.now() - t0;
  return out;
}

export async function runPipeline(opts: RunOptions): Promise<RunResult> {
  const runId = opts.runId ?? nanoid();
  const fresh = opts.fresh ?? "none";
  applyFresh(runId, fresh);

  const timingsMs: Record<string, number> = {};

  // acquire ----------------------------------------------------------------
  const inputs = await cachedJson<PipelineInputs>(runId, "inputs", false, async () => ({
    resume_id: opts.resumeId,
    jd_id: opts.jdId,
    resume_text: opts.resumeText,
    jd_text: opts.jdText,
  }));

  // prepare · JD facts -----------------------------------------------------
  const jdFacts = await timed(timingsMs, "jd_facts", () =>
    cachedJson<JdFacts>(runId, "jd_facts", false, () => runJdFacts(inputs.jd_text))
  );

  // prepare · resume facts -------------------------------------------------
  const resumeFacts = await timed(timingsMs, "resume_facts", () =>
    cachedJson<ResumeFacts>(runId, "resume_facts", false, () =>
      runResumeFacts(inputs.resume_text, inputs.jd_text)
    )
  );

  // prepare · research -----------------------------------------------------
  const research = await timed(timingsMs, "research", () =>
    cachedText(runId, "research", false, () => runResearch(jdFacts))
  );

  // process · generate -----------------------------------------------------
  let droppedInGenerate: Array<{ index: number; reason: string }> = [];
  const draft = await timed(timingsMs, "generate", () =>
    cachedJson<QuestionBank>(runId, "draft", false, async () => {
      const { bank, dropped } = await runGenerate({
        resumeFacts,
        jdFacts,
        researchMd: research,
      });
      droppedInGenerate = dropped;
      return bank;
    })
  );

  // process · critic -------------------------------------------------------
  let droppedInCritic: Array<{ index: number; reason: string }> = [];
  const critique = await timed(timingsMs, "critic", () =>
    cachedJson<CritiqueResult>(runId, "critique", false, async () => {
      const { critique, dropped } = await runCritic({ resumeFacts, jdFacts, draft });
      droppedInCritic = dropped;
      return critique;
    })
  );

  // parse / select ---------------------------------------------------------
  const usedFallbackToDraft = critique.questions.length === 0;
  const questions = usedFallbackToDraft ? draft : critique.questions;

  return {
    runId,
    resumeFacts,
    jdFacts,
    research,
    draft,
    critique,
    questions,
    diagnostics: { droppedInGenerate, droppedInCritic, usedFallbackToDraft },
    meta: {
      tier: resolveModel("GENERATE").tier,
      models: {
        PARSE: pick("PARSE"),
        GENERATE: pick("GENERATE"),
        CRITIC: pick("CRITIC"),
      },
      timingsMs,
    },
  };
}

function pick(role: Role): { provider: string; model: string } {
  const { provider, model } = resolveModel(role);
  return { provider, model };
}

/** Persist the human-approved bank as final.json (render stage; used in Phase 3). */
export function writeFinal(runId: string, questions: QuestionBank): void {
  writeJsonStage(runId, "final", questions);
}
