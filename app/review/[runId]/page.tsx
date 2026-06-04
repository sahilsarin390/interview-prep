"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Question = {
  category: string;
  q: string;
  options: string[];
  correct: number;
  explanation: string;
  delivery: string;
};

const LETTERS = ["A", "B", "C", "D"];

export default function ReviewPage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [jdId, setJdId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [criticLog, setCriticLog] = useState<{ index: number; issue: string; action: string }[]>([]);

  const [regenIdx, setRegenIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/runs/${runId}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed to load run");
        setQuestions(d.questions ?? []);
        setResumeId(d.inputs?.resume_id ?? null);
        setJdId(d.inputs?.jd_id ?? null);
        setCriticLog(d.criticLog ?? []);
        const company = d.jdFacts?.company ?? "";
        const t = d.jdFacts?.title ?? "";
        setTitle([company, t].filter(Boolean).join(" — ") || "Interview prep");
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [runId]);

  function update(i: number, patch: Partial<Question>) {
    setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  }
  function updateOption(i: number, k: number, value: string) {
    setQuestions((qs) =>
      qs.map((q, idx) => (idx === i ? { ...q, options: q.options.map((o, j) => (j === k ? value : o)) } : q))
    );
  }
  function removeQuestion(i: number) {
    setQuestions((qs) => qs.filter((_, k) => k !== i));
  }

  async function regenerate(i: number) {
    setRegenIdx(i);
    try {
      const res = await fetch(`/api/runs/${runId}/regenerate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current: questions[i] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Regenerate failed");
      update(i, d.question);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenIdx(null);
    }
  }

  async function save() {
    if (!resumeId || !jdId) {
      setSaveErr("Missing resume/JD link for this run; cannot save.");
      return;
    }
    setSaveErr("");
    setSaving(true);
    try {
      const res = await fetch("/api/questionnaires", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resume_id: resumeId, jd_id: jdId, runId, title, questions }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Save failed");
      router.push(`/practice/${d.questionnaire.id}`);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="wrap">
        <div className="card">
          <span className="spinner" style={{ borderColor: "rgba(16,34,28,.2)", borderTopColor: "var(--green)" }} />
          Loading generated bank…
        </div>
      </div>
    );
  }
  if (loadErr) {
    return (
      <div className="wrap">
        <div className="topnav">
          <Link href="/">← Home</Link>
        </div>
        <div className="card">
          <div className="banner err">{loadErr}</div>
        </div>
      </div>
    );
  }

  const rewrites = criticLog.filter((l) => l.action === "rewrote").length;

  return (
    <div className="wrap">
      <div className="topnav">
        <Link href="/">← Home</Link>
        <Link href="/library">Library</Link>
      </div>

      <header className="masthead">
        <div className="kicker">Review &amp; edit</div>
        <h1>
          Review the <em>generated bank</em>
        </h1>
        <div className="sub">
          Edit any field inline, regenerate weak questions, then save to your library to practice.
        </div>
        <div className="meta-row">
          <span>
            <b>{questions.length}</b> questions
          </span>
          <span>
            critic rewrote <b>{rewrites}</b>
          </span>
          <span className="muted">run {runId}</span>
        </div>
      </header>

      <div className="card">
        <label className="field">Questionnaire title</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        {saveErr && <div className="banner err">{saveErr}</div>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={save} disabled={saving || questions.length === 0}>
            {saving ? <span className="spinner" /> : null}
            {saving ? "Saving…" : `Save to Library (${questions.length}) →`}
          </button>
        </div>
      </div>

      {questions.map((q, i) => (
        <div className="card" key={i}>
          <div className="qtop">
            <input
              type="text"
              value={q.category}
              onChange={(e) => update(i, { category: e.target.value })}
              style={{ maxWidth: 320 }}
            />
            <span className="qnum">
              {i + 1} / {questions.length}
            </span>
          </div>

          <label className="field">Question</label>
          <textarea value={q.q} style={{ minHeight: 70 }} onChange={(e) => update(i, { q: e.target.value })} />

          <label className="field" style={{ marginTop: 14 }}>
            Options (select the best answer)
          </label>
          <div className="edit-grid">
            {q.options.map((o, k) => (
              <div className="opt-edit" key={k}>
                <label className="corr">
                  <input type="radio" name={`correct-${i}`} checked={q.correct === k} onChange={() => update(i, { correct: k })} />
                  {LETTERS[k]}
                </label>
                <input type="text" value={o} className="grow" onChange={(e) => updateOption(i, k, e.target.value)} />
              </div>
            ))}
          </div>

          <label className="field" style={{ marginTop: 14 }}>
            Explanation (why best wins + why the tempting wrong one fails)
          </label>
          <textarea value={q.explanation} onChange={(e) => update(i, { explanation: e.target.value })} />

          <label className="field" style={{ marginTop: 14 }}>
            Delivery (in-the-room guidance)
          </label>
          <textarea value={q.delivery} onChange={(e) => update(i, { delivery: e.target.value })} />

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn sm" onClick={() => regenerate(i)} disabled={regenIdx !== null}>
              {regenIdx === i ? <span className="spinner" style={{ borderColor: "rgba(16,34,28,.2)", borderTopColor: "var(--green)" }} /> : null}
              {regenIdx === i ? "Regenerating…" : "↻ Regenerate this question"}
            </button>
            <button className="btn sm danger" onClick={() => removeQuestion(i)} disabled={regenIdx !== null}>
              Remove
            </button>
          </div>
        </div>
      ))}

      <div className="card">
        <div className="row">
          <button className="btn primary" onClick={save} disabled={saving || questions.length === 0}>
            {saving ? "Saving…" : `Save to Library (${questions.length}) →`}
          </button>
        </div>
      </div>
    </div>
  );
}
