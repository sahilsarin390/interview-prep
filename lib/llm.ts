/**
 * LLM provider seam (PROJECT.md §6).
 *
 * Single interface, two adapters. Pipeline code must call ONLY this module —
 * never an SDK directly. Models are swappable via QUALITY_TIER (+ per-role
 * env overrides) without touching pipeline code.
 */
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { ensureEnv } from "./env";

// ---------------------------------------------------------------------------
// Public contract (verbatim from §6)
// ---------------------------------------------------------------------------

export type LlmRequest = {
  system?: string;
  prompt: string;
  json?: boolean; // ask for raw JSON output
  webSearch?: boolean; // enable the provider's web search tool
  maxTokens?: number;
  timeoutMs?: number; // hard cap per attempt; aborts a stalled stream
};

export type LlmResponse = { text: string };

export interface LlmAdapter {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export type Role = "PARSE" | "GENERATE" | "CRITIC";
export type Tier = "fast" | "balanced" | "best";
export type Provider = "anthropic" | "gemini";

const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TIMEOUT_MS = 300_000; // 5 min per attempt — aborts a stalled call

/** Retry transient provider errors (429 / 5xx / overloaded) with backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      const transient =
        /\b(429|500|502|503|529)\b/.test(msg) ||
        /overloaded|unavailable|high demand|rate.?limit|resource_exhausted|timeout|temporarily/.test(
          msg
        );
      if (!transient || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Tier → model mapping (§6). Per-role env overrides win if set.
//   fast      PARSE/GENERATE/CRITIC = gemini-2.5-flash
//   balanced  PARSE = gemini-2.5-flash;  GENERATE/CRITIC = claude-sonnet-4-6
//   best      PARSE = gemini-2.5-flash;  GENERATE/CRITIC = claude-opus-4-8
// Model IDs verified against the installed @anthropic-ai/sdk Model union.
// ---------------------------------------------------------------------------

const TIER_MAP: Record<Tier, Record<Role, string>> = {
  fast: {
    PARSE: "gemini-2.5-flash",
    GENERATE: "gemini-2.5-flash",
    CRITIC: "gemini-2.5-flash",
  },
  balanced: {
    PARSE: "gemini-2.5-flash",
    GENERATE: "claude-sonnet-4-6",
    CRITIC: "claude-sonnet-4-6",
  },
  best: {
    PARSE: "gemini-2.5-flash",
    GENERATE: "claude-opus-4-8",
    CRITIC: "claude-opus-4-8",
  },
};

function currentTier(): Tier {
  const raw = (process.env.QUALITY_TIER ?? "balanced").trim().toLowerCase();
  if (raw === "fast" || raw === "balanced" || raw === "best") return raw;
  throw new Error(
    `Invalid QUALITY_TIER="${process.env.QUALITY_TIER}". Use fast | balanced | best.`
  );
}

function providerFor(model: string): Provider {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gemini")) return "gemini";
  throw new Error(`Cannot determine provider for model "${model}".`);
}

/** Resolve which provider+model a role maps to, WITHOUT constructing a client. */
export function resolveModel(role: Role): { provider: Provider; model: string; tier: Tier } {
  const tier = currentTier();
  const override = process.env[`${role}_MODEL`]?.trim();
  const model = override || TIER_MAP[tier][role];
  if (!model) throw new Error(`No model resolved for role ${role} (tier ${tier}).`);
  return { provider: providerFor(model), model, tier };
}

/** §6 entrypoint: return an adapter bound to the model for this role. */
export function modelFor(role: Role): LlmAdapter {
  const { provider, model } = resolveModel(role);
  return provider === "anthropic" ? new AnthropicAdapter(model) : new GeminiAdapter(model);
}

// ---------------------------------------------------------------------------
// Anthropic adapter — uses @anthropic-ai/sdk, web_search server tool.
// ---------------------------------------------------------------------------

export class AnthropicAdapter implements LlmAdapter {
  private client: Anthropic | null = null;
  constructor(private readonly model: string) {}

  private getClient(): Anthropic {
    if (!this.client) {
      ensureEnv();
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const client = this.getClient();

    // Anthropic has no forced-JSON mode in the Messages API; JSON is requested
    // at the prompt level (the prompts already say "output ONLY JSON") and the
    // parse stage strips any stray fences. So `json` needs no special handling
    // here — web_search and JSON output coexist without conflict.
    const tools: Anthropic.Messages.ToolUnion[] | undefined = req.webSearch
      ? [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }]
      : undefined;

    const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: maxTokens,
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: "user", content: req.prompt }],
      ...(tools ? { tools } : {}),
    };

    // For large outputs the SDK refuses non-streaming calls (potential >10 min).
    // Stream those and accumulate the final message; small calls stay simple.
    const STREAM_THRESHOLD = 8192;
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const text = await withRetry(async () => {
      const signal = AbortSignal.timeout(timeoutMs); // fresh per attempt
      const msg =
        maxTokens > STREAM_THRESHOLD
          ? await client.messages.stream(params, { signal }).finalMessage()
          : await client.messages.create(params, { signal });
      const blocks = msg.content as Array<{ type: string; text?: string }>;
      return blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
    });

    return { text };
  }
}

// ---------------------------------------------------------------------------
// Gemini adapter — uses @google/genai, google_search grounding.
// ---------------------------------------------------------------------------

export class GeminiAdapter implements LlmAdapter {
  private client: GoogleGenAI | null = null;
  constructor(private readonly model: string) {}

  private getClient(): GoogleGenAI {
    if (!this.client) {
      ensureEnv();
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const client = this.getClient();

    // Gemini constraint: responseMimeType:'application/json' CANNOT be combined
    // with the googleSearch tool (mutually exclusive). When both are requested
    // we keep web search and fall back to prompt-level JSON + fence-stripping in
    // the parse stage.
    const useJsonMime = !!req.json && !req.webSearch;

    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const res = await withRetry(() => {
      const config: Record<string, unknown> = {
        maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        abortSignal: AbortSignal.timeout(timeoutMs), // fresh per attempt
      };
      if (req.system) config.systemInstruction = req.system;
      if (useJsonMime) config.responseMimeType = "application/json";
      if (req.webSearch) config.tools = [{ googleSearch: {} }];
      return client.models.generateContent({
        model: this.model,
        contents: req.prompt,
        config,
      });
    });

    return { text: res.text ?? "" };
  }
}

/** Diagnostic helper: full tier→role→{provider,model} map for the current env. */
export function describeResolution(): {
  tier: Tier;
  roles: Record<Role, { provider: Provider; model: string }>;
} {
  const roles = ["PARSE", "GENERATE", "CRITIC"] as const;
  const out = {} as Record<Role, { provider: Provider; model: string }>;
  let tier: Tier = "balanced";
  for (const r of roles) {
    const { provider, model, tier: t } = resolveModel(r);
    tier = t;
    out[r] = { provider, model };
  }
  return { tier, roles: out };
}
