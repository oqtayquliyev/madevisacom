// Turns a CV file into plain text, in the browser — the file never has to
// leave the person's device to be read.
//
//   PDF   → pdf.js (loaded only when a PDF is opened)
//   DOCX  → it's a zip of XML; unzipped with fflate
//   ODT   → same idea
//   TXT / RTF / MD → read as text

export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_MAX_CHARS = 60_000;
export const CV_ACCEPT = '.pdf,.docx,.odt,.rtf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

export type Extracted = { ok: true; text: string } | { ok: false; error: string };

const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

const xmlText = (xml: string) =>
  xml
    .replace(/<w:tab\/>|<text:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>|<text:line-break\/>/g, '\n')
    .replace(/<\/w:p>|<\/text:p>|<\/text:h>|<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));

async function fromZip(buf: ArrayBuffer, wanted: (name: string) => boolean, order: (a: string, b: string) => number): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => wanted(f.name) });
  return Object.keys(files)
    .sort(order)
    .map((n) => xmlText(strFromU8(files[n])))
    .join('\n');
}

async function fromPdf(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 12); p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Rebuild lines from each piece's position: a new line when the baseline moves.
    let out = '';
    let lastY: number | null = null;
    let lastEnd = 0;
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean };
      if (item.str == null || !item.transform) continue;
      const [, , , , x, y] = item.transform;
      const size = Math.abs(item.height || item.transform[3] || 10);
      if (lastY != null && Math.abs(y - lastY) > size * 0.5) out += '\n';
      else if (lastY != null && x - lastEnd > size * 0.25 && !out.endsWith(' ') && !item.str.startsWith(' ')) out += ' ';
      out += item.str;
      lastY = y;
      lastEnd = x + (item.width ?? 0);
      if (item.hasEOL) {
        out += '\n';
        lastY = null;
      }
    }
    pages.push(out);
  }
  void doc.destroy();
  return pages.join('\n');
}

const fromRtf = (rtf: string) =>
  rtf
    .replace(/\\par[d]?\b|\\line\b/g, '\n')
    .replace(/\\'[0-9a-f]{2}/gi, '')
    .replace(/\\u(-?\d+)\??/g, (_, n: string) => String.fromCharCode((Number(n) + 65536) % 65536))
    .replace(/\{\\\*[^{}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, '');

/** Tidy what came out: no repeated blank lines, no stray control characters. */
export function tidy(text: string): string {
  return (
    text
      .replace(/\r/g, '')
      // eslint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufeff]/g, '')
      .replace(/[ \t\u00a0]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, CV_MAX_CHARS)
  );
}

export async function extractCvText(file: File): Promise<Extracted> {
  if (file.size > CV_MAX_BYTES) return { ok: false, error: 'That file is over 5 MB. Export your CV as a PDF without large images and try again.' };
  const kind = ext(file.name);
  try {
    let text: string;
    if (kind === 'pdf' || file.type === 'application/pdf') text = await fromPdf(await file.arrayBuffer());
    else if (kind === 'docx') text = await fromZip(await file.arrayBuffer(), (n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n), (a, b) => Number(b.includes('header')) - Number(a.includes('header')) || a.localeCompare(b));
    else if (kind === 'odt') text = await fromZip(await file.arrayBuffer(), (n) => n === 'content.xml', (a, b) => a.localeCompare(b));
    else if (kind === 'rtf') text = fromRtf(await file.text());
    else if (kind === 'txt' || kind === 'md' || file.type.startsWith('text/')) text = await file.text();
    else if (kind === 'doc') return { ok: false, error: 'Old Word files (.doc) can’t be read here. Save it as PDF or .docx and upload that.' };
    else if (/^(png|jpe?g|heic|webp)$/.test(kind) || file.type.startsWith('image/')) return { ok: false, error: 'That’s a picture of a CV. Upload the PDF or Word file itself, or paste the text.' };
    else return { ok: false, error: 'Upload your CV as a PDF or Word (.docx) file, or paste the text.' };
    text = tidy(text);
    if (text.split(/\s+/).length < 40) {
      return {
        ok: false,
        error: kind === 'pdf' ? 'We couldn’t read any text in this PDF — it looks like a scan or a picture. Export it from Word or Google Docs as a PDF, or paste the text.' : 'There’s almost no text in this file. Check it’s your CV, or paste the text.',
      };
    }
    return { ok: true, text };
  } catch (err) {
    console.error('CV read failed', err);
    return { ok: false, error: 'We couldn’t open that file. It may be password-protected or damaged — try saving it again as a PDF, or paste the text.' };
  }
}

export const CV_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain',
  md: 'text/plain',
};
export const cvExt = (name: string) => (ext(name) in CV_MIME ? ext(name) : null);
