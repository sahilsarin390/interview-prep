import { NextResponse } from "next/server";
import { createResume, listResumes } from "@/lib/repo";
import { extractPdfText } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Don't ship full resume text in the list payload.
  const rows = listResumes().map(({ text, ...rest }) => ({
    ...rest,
    chars: text.length,
  }));
  return NextResponse.json({ resumes: rows });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // PDF upload (multipart) → extract text, with paste fallback on failure.
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const label = (form.get("label") as string) || "Uploaded resume";
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const { text, error } = await extractPdfText(buf);
      if (!text || text.trim().length < 30) {
        return NextResponse.json(
          {
            error:
              "Could not extract enough text from the PDF. Paste the resume text instead." +
              (error ? ` (${error})` : ""),
          },
          { status: 422 }
        );
      }
      const row = createResume({ label, text });
      return NextResponse.json({ resume: { ...row, text: undefined, chars: text.length } });
    }

    // JSON paste.
    const body = await req.json();
    const text = String(body.text ?? "").trim();
    const label = String(body.label ?? "Pasted resume").trim() || "Pasted resume";
    if (text.length < 30) {
      return NextResponse.json(
        { error: "Resume text is too short." },
        { status: 400 }
      );
    }
    const row = createResume({ label, text });
    return NextResponse.json({ resume: { ...row, text: undefined, chars: text.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
