import Link from "next/link";
import { listQuestionnaires } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LibraryPage() {
  const rows = listQuestionnaires().map((r) => {
    let count = 0;
    try {
      count = (JSON.parse(r.questions_json) as unknown[]).length;
    } catch {
      /* ignore */
    }
    return { id: r.id, title: r.title, count, created_at: r.created_at };
  });

  return (
    <div className="wrap">
      <div className="topnav">
        <Link href="/">← Home</Link>
      </div>

      <header className="masthead">
        <div className="kicker">Library</div>
        <h1>
          Saved <em>questionnaires</em>
        </h1>
        <div className="sub">Every bank you’ve approved. Open one to practice — progress is saved per questionnaire.</div>
        <div className="meta-row">
          <span>
            <b>{rows.length}</b> saved
          </span>
          <span>
            <Link className="up-link" href="/">
              + Generate a new one
            </Link>
          </span>
        </div>
      </header>

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted sans">
            Nothing saved yet. <Link href="/" style={{ color: "var(--green-deep)", fontWeight: 600 }}>Generate your first questionnaire →</Link>
          </p>
        ) : (
          <div className="list">
            {rows.map((r) => (
              <Link key={r.id} href={`/practice/${r.id}`} className="list-item">
                <div>
                  <div>{r.title}</div>
                  <div className="meta">
                    {r.count} questions · {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <span className="pick">Practice →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
