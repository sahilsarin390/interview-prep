"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ResumeItem = { id: string; label: string; chars: number; is_active: number; created_at: string };
type JdItem = { id: string; company: string | null; title: string | null; chars: number; created_at: string };
type Tier = "fast" | "balanced" | "best";

export default function Home() {
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [jds, setJds] = useState<JdItem[]>([]);
  const [selResume, setSelResume] = useState<string | null>(null);
  const [selJd, setSelJd] = useState<string | null>(null);

  // resume add
  const [rMode, setRMode] = useState<"paste" | "pdf">("paste");
  const [rLabel, setRLabel] = useState("");
  const [rText, setRText] = useState("");
  const [rFile, setRFile] = useState<File | null>(null);
  const [rBusy, setRBusy] = useState(false);
  const [rErr, setRErr] = useState("");

  // jd add
  const [jCompany, setJCompany] = useState("");
  const [jTitle, setJTitle] = useState("");
  const [jText, setJText] = useState("");
  const [jBusy, setJBusy] = useState(false);
  const [jErr, setJErr] = useState("");

  const [tier, setTier] = useState<Tier>("fast");
  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState("");

  async function loadResumes() {
    const r = await fetch("/api/resumes");
    const d = await r.json();
    setResumes(d.resumes ?? []);
    if (!selResume && d.resumes?.length) {
      const active = d.resumes.find((x: ResumeItem) => x.is_active) ?? d.resumes[0];
      setSelResume(active.id);
    }
  }
  async function loadJds() {
    const r = await fetch("/api/jds");
    const d = await r.json();
    setJds(d.jds ?? []);
    if (!selJd && d.jds?.length) setSelJd(d.jds[0].id);
  }
  useEffect(() => {
    (async () => {
      await loadResumes();
      await loadJds();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addResume() {
    setRErr("");
    setRBusy(true);
    try {
      let res: Response;
      if (rMode === "pdf") {
        if (!rFile) {
          setRErr("Choose a PDF file or switch to paste.");
          setRBusy(false);
          return;
        }
        const fd = new FormData();
        fd.append("file", rFile);
        fd.append("label", rLabel || rFile.name.replace(/\.pdf$/i, ""));
        res = await fetch("/api/resumes", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/resumes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label: rLabel || "Pasted resume", text: rText }),
        });
      }
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to add resume");
      setRText("");
      setRFile(null);
      setRLabel("");
      await loadResumes();
      if (d.resume?.id) setSelResume(d.resume.id);
    } catch (e) {
      setRErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRBusy(false);
    }
  }

  async function addJd() {
    setJErr("");
    setJBusy(true);
    try {
      const res = await fetch("/api/jds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company: jCompany, title: jTitle, text: jText }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to add JD");
      setJText("");
      setJCompany("");
      setJTitle("");
      await loadJds();
      if (d.jd?.id) setSelJd(d.jd.id);
    } catch (e) {
      setJErr(e instanceof Error ? e.message : String(e));
    } finally {
      setJBusy(false);
    }
  }

  async function generate() {
    if (!selResume || !selJd) return;
    setGenErr("");
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resume_id: selResume, jd_id: selJd, tier }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Generation failed");
      router.push(`/review/${d.runId}`);
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : String(e));
      setGenerating(false);
    }
  }

  const tierNote: Record<Tier, string> = {
    fast: "Gemini Flash throughout — cheapest, ~2–4 min. Best for trying it out.",
    balanced: "Claude Sonnet for generate + critic — study-grade quality, ~5–8 min.",
    best: "Claude Opus for generate + critic — highest quality, ~7–10 min & priciest.",
  };

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="kicker">Interview Prep Generator</div>
        <h1>
          Build a tailored <em>question bank</em>
        </h1>
        <div className="sub">
          Add a resume and a job description, then generate a grounded, interactive MCQ
          interview-prep questionnaire — the same format as the golden example, for any role.
        </div>
        <div className="meta-row">
          <span>
            <b>{resumes.length}</b> resumes
          </span>
          <span>
            <b>{jds.length}</b> job descriptions
          </span>
          <span>
            <Link className="up-link" href="/library">
              View saved library →
            </Link>
          </span>
        </div>
      </header>

      {/* STEP 1 — RESUME */}
      <div className="card">
        <div className="section-title">1 · Resume</div>
        {resumes.length === 0 && <p className="muted sans">No resumes yet — add one below.</p>}
        <div className="list">
          {resumes.map((r) => (
            <div
              key={r.id}
              className={"list-item" + (selResume === r.id ? " selected" : "")}
              onClick={() => setSelResume(r.id)}
            >
              <div>
                <div>
                  {r.label} {r.is_active ? <span className="pick">· active</span> : null}
                </div>
                <div className="meta">
                  {r.chars.toLocaleString()} chars · {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              {selResume === r.id ? <span className="pick">✓ selected</span> : <span className="pick">pick</span>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className={"pill" + (rMode === "paste" ? " active" : "")} onClick={() => setRMode("paste")}>
              Paste text
            </button>
            <button className={"pill" + (rMode === "pdf" ? " active" : "")} onClick={() => setRMode("pdf")}>
              Upload PDF
            </button>
          </div>
          <label className="field">Label</label>
          <input type="text" value={rLabel} placeholder="e.g. Sahil — Data v3" onChange={(e) => setRLabel(e.target.value)} />
          {rMode === "paste" ? (
            <div style={{ marginTop: 10 }}>
              <label className="field">Resume text</label>
              <textarea value={rText} placeholder="Paste your resume as plain text…" onChange={(e) => setRText(e.target.value)} />
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <label className="field">PDF file</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setRFile(e.target.files?.[0] ?? null)}
                style={{ fontFamily: "var(--sans)", fontSize: 13 }}
              />
              <div className="meta sans" style={{ marginTop: 6 }}>
                If extraction struggles, switch to paste.
              </div>
            </div>
          )}
          {rErr && <div className="banner err">{rErr}</div>}
          <div style={{ marginTop: 12 }}>
            <button className="btn primary sm" onClick={addResume} disabled={rBusy}>
              {rBusy ? <span className="spinner" /> : null}
              {rBusy ? "Adding…" : "Add resume"}
            </button>
          </div>
        </div>
      </div>

      {/* STEP 2 — JD */}
      <div className="card">
        <div className="section-title">2 · Job description</div>
        {jds.length === 0 && <p className="muted sans">No job descriptions yet — add one below.</p>}
        <div className="list">
          {jds.map((j) => (
            <div
              key={j.id}
              className={"list-item" + (selJd === j.id ? " selected" : "")}
              onClick={() => setSelJd(j.id)}
            >
              <div>
                <div>{[j.company, j.title].filter(Boolean).join(" — ") || "Untitled JD"}</div>
                <div className="meta">
                  {j.chars.toLocaleString()} chars · {new Date(j.created_at).toLocaleString()}
                </div>
              </div>
              {selJd === j.id ? <span className="pick">✓ selected</span> : <span className="pick">pick</span>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="row">
            <div className="grow">
              <label className="field">Company</label>
              <input type="text" value={jCompany} placeholder="e.g. Fidelity Investments" onChange={(e) => setJCompany(e.target.value)} />
            </div>
            <div className="grow">
              <label className="field">Title</label>
              <input type="text" value={jTitle} placeholder="e.g. Analyst, Data Analytics & Insights" onChange={(e) => setJTitle(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="field">JD text</label>
            <textarea value={jText} placeholder="Paste the full job description…" onChange={(e) => setJText(e.target.value)} />
          </div>
          {jErr && <div className="banner err">{jErr}</div>}
          <div style={{ marginTop: 12 }}>
            <button className="btn primary sm" onClick={addJd} disabled={jBusy}>
              {jBusy ? <span className="spinner" /> : null}
              {jBusy ? "Adding…" : "Add job description"}
            </button>
          </div>
        </div>
      </div>

      {/* STEP 3 — GENERATE */}
      <div className="card">
        <div className="section-title">3 · Generate</div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ minWidth: 220 }}>
            <label className="field">Quality tier</label>
            <select value={tier} onChange={(e) => setTier(e.target.value as Tier)} disabled={generating}>
              <option value="fast">fast — cheap & quick</option>
              <option value="balanced">balanced — study-grade</option>
              <option value="best">best — top quality</option>
            </select>
          </div>
          <div className="grow muted sans" style={{ fontSize: 12.5 }}>
            {tierNote[tier]}
          </div>
        </div>
        {genErr && <div className="banner err">{genErr}</div>}
        {generating && (
          <div className="banner info">
            <span className="spinner" style={{ borderTopColor: "#8a6516", borderColor: "rgba(138,101,22,.3)" }} />
            Running the pipeline (research → generate → critic). This can take a few minutes on
            balanced/best — keep this tab open.
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={generate} disabled={!selResume || !selJd || generating}>
            {generating ? "Generating…" : "Generate question bank →"}
          </button>
          {(!selResume || !selJd) && (
            <span className="muted sans" style={{ marginLeft: 12, fontSize: 12.5 }}>
              Select a resume and a JD first.
            </span>
          )}
        </div>
      </div>

      <footer>
        Personal interview-prep tool · generated answers are starting points — make them yours.
      </footer>
    </div>
  );
}
