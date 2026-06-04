// Headless verification of the API + page routes (no new LLM calls).
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3025";
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const log = (...a) => console.log(...a);
let failures = 0;
function check(name, cond, extra = "") {
  log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`);
  if (!cond) failures++;
}

const resumeText = fs.readFileSync("reference/fixtures/fidelity-resume.txt", "utf8");
const jdText = fs.readFileSync("reference/fixtures/fidelity-jd.txt", "utf8");

// 1. create resume (paste)
let r = await fetch(`${BASE}/api/resumes`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ label: "Sahil — route test", text: resumeText }),
});
let { status, body } = await j(r);
const resumeId = body?.resume?.id;
check("POST /api/resumes", status === 200 && !!resumeId, `id=${resumeId} chars=${body?.resume?.chars}`);

// 2. create jd
r = await fetch(`${BASE}/api/jds`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ company: "Fidelity Investments", title: "Analyst, Data Analytics & Insights", text: jdText }),
});
({ status, body } = await j(r));
const jdId = body?.jd?.id;
check("POST /api/jds", status === 200 && !!jdId, `id=${jdId}`);

// 3. list
({ status, body } = await j(await fetch(`${BASE}/api/resumes`)));
check("GET /api/resumes", status === 200 && Array.isArray(body.resumes) && body.resumes.length >= 1);
({ status, body } = await j(await fetch(`${BASE}/api/jds`)));
check("GET /api/jds", status === 200 && Array.isArray(body.jds) && body.jds.length >= 1);

// 4. load cached run (review payload) — reuses fixture-fidelity from Phase 2
({ status, body } = await j(await fetch(`${BASE}/api/runs/fixture-fidelity`)));
const runQuestions = body?.questions ?? [];
check("GET /api/runs/fixture-fidelity", status === 200 && runQuestions.length > 0, `${runQuestions.length} questions`);

// 5. save questionnaire (approved) using the real resume/jd ids
r = await fetch(`${BASE}/api/questionnaires`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ resume_id: resumeId, jd_id: jdId, title: "Route Test — Fidelity", questions: runQuestions }),
});
({ status, body } = await j(r));
const qId = body?.questionnaire?.id;
check("POST /api/questionnaires", status === 200 && !!qId, `id=${qId} count=${body?.questionnaire?.questionCount}`);

// 6. fetch one + list
({ status, body } = await j(await fetch(`${BASE}/api/questionnaires/${qId}`)));
check("GET /api/questionnaires/:id", status === 200 && body.questions?.length > 0 && body.title);
({ status, body } = await j(await fetch(`${BASE}/api/questionnaires`)));
check("GET /api/questionnaires", status === 200 && body.questionnaires?.some((x) => x.id === qId));

// 7. page shells render (200 + key text)
async function page(path, needle) {
  const res = await fetch(`${BASE}${path}`);
  const html = await res.text();
  check(`GET ${path}`, res.status === 200 && html.includes(needle), `(${res.status})`);
}
await page("/", "Build a tailored");
await page("/library", "Saved");
await page(`/practice/${qId}`, "Practice");
await page("/review/fixture-fidelity", "Review");

log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
