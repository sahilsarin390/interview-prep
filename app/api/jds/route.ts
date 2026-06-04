import { NextResponse } from "next/server";
import { createJd, listJds } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = listJds().map(({ text, ...rest }) => ({ ...rest, chars: text.length }));
  return NextResponse.json({ jds: rows });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = String(body.text ?? "").trim();
    if (text.length < 30) {
      return NextResponse.json({ error: "JD text is too short." }, { status: 400 });
    }
    const company = body.company ? String(body.company).trim() : null;
    const title = body.title ? String(body.title).trim() : null;
    const row = createJd({ company, title, text });
    return NextResponse.json({ jd: { ...row, text: undefined, chars: text.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
