// A tailored CV (or a cover letter) as a Word file, made in the browser.
// Word is what employers' systems read best, and the person can still edit
// it. Uses fflate, which the CV reader already needs — no new dependency.

import { strToU8, zipSync } from 'fflate';
import type { TLine } from '@/lib/apply/tailor';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const esc = (s: string) =>
  s
    // Characters XML 1.0 does not allow at all.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

type Run = { size: number; bold?: boolean; color?: string };
const run = (text: string, r: Run) =>
  `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${r.bold ? '<w:b/>' : ''}${r.color ? `<w:color w:val="${r.color}"/>` : ''}<w:sz w:val="${r.size}"/><w:szCs w:val="${r.size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

type Para = { before?: number; after?: number; indent?: number; hanging?: number; rule?: boolean; keep?: boolean };
const para = (inner: string, p: Para = {}) =>
  `<w:p><w:pPr>${p.keep ? '<w:keepNext/>' : ''}${p.rule ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="9AA5B4"/></w:pBdr>' : ''}<w:spacing w:before="${p.before ?? 0}" w:after="${p.after ?? 60}" w:line="264" w:lineRule="auto"/>${
    p.indent ? `<w:ind w:left="${p.indent}" w:hanging="${p.hanging ?? 0}"/>` : ''
  }</w:pPr>${inner}</w:p>`;

function body(lines: TLine[]): string {
  return lines
    .map((l, i) => {
      switch (l.kind) {
        case 'name':
          return para(run(l.text, { size: 36, bold: true, color: '0F172A' }), { after: 40 });
        case 'contact':
          return para(run(l.text, { size: 20, color: '475569' }), { after: 20 });
        case 'headline':
          return para(run(l.text, { size: 22, bold: true, color: '1D4ED8' }), { before: 100, after: 80 });
        case 'heading':
          return para(run(l.text.replace(/[:：]\s*$/, '').toUpperCase(), { size: 22, bold: true, color: '0F172A' }), { before: 220, after: 90, rule: true, keep: true });
        case 'bullet':
          return para(run(`•\u00a0\u00a0${l.text}`, { size: 21 }), { indent: 300, hanging: 220, after: 40 });
        default:
          // A line after a run of bullets starts the next role: give it some air.
          return para(run(l.text, { size: 21 }), { before: lines[i - 1]?.kind === 'bullet' ? 140 : 0, after: 50 });
      }
    })
    .join('');
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';

/** Lines → the bytes of a .docx file (A4, 2 cm margins). */
export function docxBytes(lines: TLine[], title: string): Uint8Array {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body(lines)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title></cp:coreProperties>`;
  return zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(RELS),
      'word/document.xml': strToU8(document),
      'docProps/core.xml': strToU8(core),
    },
    { level: 6 },
  );
}

/** Plain paragraphs (a cover letter) → lines for `docxBytes`. */
export const letterLines = (text: string): TLine[] => text.split('\n').map((t) => ({ kind: 'text', text: t }) as TLine);

export function downloadBytes(bytes: Uint8Array, fileName: string, mime = DOCX_MIME): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
