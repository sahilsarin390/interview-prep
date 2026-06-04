/**
 * Resume PDF → text (PROJECT.md §3: the only file parsing; paste is the
 * fallback). Uses pdf-parse v2 (PDFParse class). Never throws — returns an
 * error string so the route can fall back to paste.
 */
import { PDFParse } from "pdf-parse";

export async function extractPdfText(
  buf: Buffer
): Promise<{ text: string; error?: string }> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: new Uint8Array(buf) });
    const res = await parser.getText();
    return { text: (res.text ?? "").trim() };
  } catch (e) {
    return { text: "", error: e instanceof Error ? e.message : String(e) };
  } finally {
    try {
      await parser?.destroy();
    } catch {
      /* ignore */
    }
  }
}
