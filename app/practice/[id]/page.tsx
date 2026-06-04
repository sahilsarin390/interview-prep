"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Question = {
  category: string;
  q: string;
  options: string[];
  correct: number;
  explanation: string;
  delivery: string;
};
type AnswerState = Record<number, { chosen: number; correct: boolean }>;

const LETTERS = ["A", "B", "C", "D", "E"];
const FILTER_ORDER = ["All", "Culture Fit", "Behavioral", "Technical", "Situational", "Role Fit"];

export default function PracticePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  const [filter, setFilter] = useState("All");
  const [idx, setIdx] = useState(0);
  const [state, setState] = useState<AnswerState>({});
  const [done, setDone] = useState(false);

  const storageKey = `ip-progress-${id}`;

  // load questionnaire + saved progress
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/questionnaires/${id}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed to load");
        setTitle(d.title ?? "Interview prep");
        setQuestions(d.questions ?? []);
        try {
          const saved = localStorage.getItem(storageKey);
          if (saved) setState(JSON.parse(saved));
        } catch {
          /* ignore */
        }
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function persist(next: AnswerState) {
    setState(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: questions.length };
    for (const q of questions) {
      const g = q.category.split(" · ")[0];
      c[g] = (c[g] ?? 0) + 1;
    }
    return c;
  }, [questions]);

  const order = useMemo(() => {
    return questions
      .map((_, i) => i)
      .filter((i) => filter === "All" || questions[i].category.split(" · ")[0] === filter);
  }, [questions, filter]);

  const answered = Object.keys(state).length;
  const correct = Object.values(state).filter((s) => s.correct).length;
  const rate = answered ? Math.round((correct / answered) * 100) : 0;
  const total = questions.length;

  function choose(originalIndex: number, k: number) {
    if (state[originalIndex]) return;
    persist({ ...state, [originalIndex]: { chosen: k, correct: k === questions[originalIndex].correct } });
  }
  function resetProgress() {
    persist({});
    setIdx(0);
    setDone(false);
  }

  if (loading) {
    return (
      <div className="wrap">
        <div className="card">
          <span className="spinner" style={{ borderColor: "rgba(16,34,28,.2)", borderTopColor: "var(--green)" }} />
          Loading questionnaire…
        </div>
      </div>
    );
  }
  if (loadErr) {
    return (
      <div className="wrap">
        <div className="topnav">
          <Link href="/library">← Library</Link>
        </div>
        <div className="card">
          <div className="banner err">{loadErr}</div>
        </div>
      </div>
    );
  }

  const safeIdx = Math.min(idx, Math.max(0, order.length - 1));
  const oi = order[safeIdx];
  const q = oi !== undefined ? questions[oi] : null;
  const prev = oi !== undefined ? state[oi] : undefined;

  return (
    <div className="wrap">
      <div className="topnav">
        <Link href="/">← Home</Link>
        <Link href="/library">Library</Link>
      </div>

      <header className="masthead">
        <div className="kicker">Practice</div>
        <h1 dangerouslySetInnerHTML={{ __html: escapeEm(title) }} />
        <div className="sub">
          Pick the strongest answer, then study the “why” and the delivery note until it’s yours.
        </div>
        <div className="meta-row">
          <span>
            <b>Questions</b> · {total}
          </span>
          <span>
            <span className="up-link" onClick={resetProgress} style={{ cursor: "pointer" }} role="button" tabIndex={0}>
              Reset progress
            </span>
          </span>
        </div>
        <div className="statbar">
          <div className="stat">
            <div className="n">{answered}</div>
            <div className="l">Answered</div>
          </div>
          <div className="stat score">
            <div className="n">{correct}</div>
            <div className="l">Correct</div>
          </div>
          <div className="stat">
            <div className="n">{answered ? rate + "%" : "—"}</div>
            <div className="l">Hit Rate</div>
          </div>
          <div className="stat">
            <div className="n">{total - answered}</div>
            <div className="l">Remaining</div>
          </div>
        </div>
        <div className="progress-shell">
          <div className="progress-fill" style={{ width: (total ? (answered / total) * 100 : 0) + "%" }} />
        </div>
      </header>

      <div className="filters">
        {FILTER_ORDER.filter((g) => counts[g] !== undefined).map((g) => (
          <button
            key={g}
            className={"pill" + (filter === g ? " active" : "")}
            onClick={() => {
              setFilter(g);
              setIdx(0);
              setDone(false);
            }}
          >
            {g} <span className="c">{counts[g]}</span>
          </button>
        ))}
      </div>

      {done ? (
        <DoneScreen
          rate={rate}
          answered={answered}
          correct={correct}
          total={total}
          onAgain={() => {
            setIdx(0);
            setDone(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : q ? (
        <div className="card">
          <div className="qtop">
            <span className="tag">{q.category}</span>
            <span className="qnum">
              {safeIdx + 1} / {order.length}
            </span>
          </div>
          <div className="qtext" dangerouslySetInnerHTML={{ __html: escapeHtml(q.q) }} />

          <div className="options">
            {q.options.map((txt, k) => {
              let cls = "opt";
              let mark = "";
              if (prev) {
                if (k === q.correct) {
                  cls += " correct";
                  mark = "✓ Best answer";
                } else if (k === prev.chosen) {
                  cls += " wrong";
                  mark = "✕ Your pick";
                } else cls += " dim";
              }
              return (
                <button key={k} className={cls} disabled={!!prev} onClick={() => choose(oi, k)}>
                  <span className="letter">{LETTERS[k]}</span>
                  <span dangerouslySetInnerHTML={{ __html: escapeHtml(txt) }} />
                  {mark ? <span className="mark">{mark}</span> : null}
                </button>
              );
            })}
          </div>

          {prev && (
            <div className="reveal show">
              <div className={"verdict " + (prev.correct ? "good" : "bad")}>
                <span className="dot" />
                {prev.correct
                  ? "Nailed it — that's the answer you want to give."
                  : "Not quite — here's the answer that lands better, and why."}
              </div>
              <div className="block why">
                <h4>
                  <span className="ico">◆</span> Why this is the strongest answer
                </h4>
                <p dangerouslySetInnerHTML={{ __html: escapeHtml(q.explanation) }} />
              </div>
              <div className="block deliver">
                <h4>
                  <span className="ico">◆</span> How to deliver it in the room
                </h4>
                <p dangerouslySetInnerHTML={{ __html: escapeHtml(q.delivery) }} />
              </div>
            </div>
          )}

          <div className="nav">
            <button className="btn ghost" disabled={safeIdx === 0} onClick={() => safeIdx > 0 && setIdx(safeIdx - 1)}>
              ← Previous
            </button>
            <button
              className="btn primary"
              onClick={() => {
                if (safeIdx < order.length - 1) setIdx(safeIdx + 1);
                else setDone(true);
              }}
            >
              {safeIdx >= order.length - 1 ? "Finish ✓" : "Next question →"}
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="muted sans">No questions in this filter.</p>
        </div>
      )}

      <footer>
        Model answers are starting points — make them yours, in your own voice.
      </footer>
    </div>
  );
}

function DoneScreen({
  rate,
  answered,
  correct,
  total,
  onAgain,
}: {
  rate: number;
  answered: number;
  correct: number;
  total: number;
  onAgain: () => void;
}) {
  let msg = "Keep drilling — review the explanations until each answer feels like your own.";
  if (rate >= 85) msg = "You're interview-ready. Now practice saying these out loud, on the clock.";
  else if (rate >= 60) msg = "Solid foundation. Tighten the misses and rehearse delivery.";
  return (
    <div className="card done">
      <div className="big">
        {rate}
        <em>%</em>
      </div>
      <div className="msg">{msg}</div>
      <p>
        You answered <b>{answered}</b> of <b>{total}</b> questions and picked the strongest answer{" "}
        <b>{correct}</b> times. The score is a warm-up signal — the real value is in the “why” and the
        delivery notes.
      </p>
      <div className="nav" style={{ justifyContent: "center", marginTop: 24 }}>
        <button className="btn primary" onClick={onAgain}>
          Review again from the top ↻
        </button>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
// title may contain an <em> emphasis we want to keep; escape then unescape <em>
function escapeEm(s: string): string {
  return escapeHtml(s);
}
