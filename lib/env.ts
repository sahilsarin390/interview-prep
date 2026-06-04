/**
 * Env bootstrap (defensive).
 *
 * Next.js loads `.env.local` via dotenv, which by design does NOT override a
 * variable that already exists in `process.env`. Some shells / sandboxes export
 * keys like ANTHROPIC_API_KEY as an EMPTY string, which then shadows the real
 * value in `.env.local`. This helper fills in only keys that are missing or
 * empty — it never clobbers a genuinely-set value, so it's a no-op in a normal
 * local run.
 */
import fs from "node:fs";
import path from "node:path";

let loaded = false;

function parseDotenv(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function ensureEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  try {
    const parsed = parseDotenv(fs.readFileSync(file, "utf8"));
    for (const [k, v] of Object.entries(parsed)) {
      const cur = process.env[k];
      if (cur === undefined || cur === "") process.env[k] = v;
    }
  } catch {
    /* best-effort; ignore */
  }
}
