const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** §14 step "extraer texto": one branch per supported MIME type. Anything else is rejected
 * upstream by ALLOWED_KNOWLEDGE_MIME_TYPES before this is ever called. */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case "application/pdf": {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      return result.text;
    }
    case DOCX_MIME: {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "text/html":
      return stripHtml(buffer.toString("utf-8"));
    case "text/plain":
    case "text/markdown":
      return buffer.toString("utf-8");
    default:
      throw new Error(`Tipo de documento no soportado para extracción: ${mimeType}`);
  }
}

/** Collapses excess whitespace/blank lines produced by extraction — keeps chunk boundaries
 * meaningful without altering the actual content. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
