// Parsers for the official sponsor registers (used by auto-pipeline/sponsors.ts, tested in
// src/lib/__tests__/sponsorParsers.test.ts). Plain TypeScript: no Deno or browser APIs.
//
//   NL  IND "public register recognised sponsors" — an HTML page with a table:
//       organisation name | Chamber of Commerce (KvK) number
//   US  USCIS H-1B Employer Data Hub — one CSV per fiscal year (sometimes UTF-16 and
//       tab-separated). Column names changed in FY2024, so columns are found by name.

export type RegisterRow = { n: string; c: string | null; d: Record<string, unknown> };

/** RFC 4180 CSV (quotes, escaped quotes, separators and newlines in quotes). */
export function parseDelimited(text: string, sep = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

/** Bytes → text: UTF-16 (with or without BOM, as USCIS sometimes exports) or UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  // UTF-16LE without a BOM: every second byte of ASCII text is zero.
  if (bytes.length > 8 && bytes[1] === 0 && bytes[3] === 0 && bytes[0] !== 0) return new TextDecoder('utf-16le').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const clean = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();

/** IND register page → one row per organisation. `category` is the register's name (e.g. "Regular labour and highly skilled migrants"). */
export function parseIndRegister(html: string, category: string): RegisterRow[] {
  const out: RegisterRow[] = [];
  const seen = new Set<string>();
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1]));
    if (!cells.length) continue;
    const name = cells[0];
    if (!name || name.length < 2 || /^(organisation|organization|naam|kvk)/i.test(name)) continue;
    const kvk = cells.find((c) => /^\d{8}$/.test(c)) ?? null;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ n: name, c: null, d: { category, kvk } });
  }
  return out;
}

/** The newest data-hub CSV linked from the USCIS files page (highest fiscal year in the name). */
export function pickUscisCsv(html: string, base = 'https://www.uscis.gov'): string | null {
  const links = [...html.matchAll(/href="([^"]+\.csv)"/gi)].map((m) => m[1]).filter((u) => /h-?1b/i.test(u) || /datahub/i.test(u));
  if (!links.length) return null;
  const year = (u: string) => Math.max(0, ...[...u.matchAll(/(20\d{2})/g)].map((m) => Number(m[1])));
  const best = links.sort((a, b) => year(b) - year(a))[0];
  return best.startsWith('http') ? best : `${base}${best.startsWith('/') ? '' : '/'}${best}`;
}

/** USCIS data hub CSV → one row per employer line, approvals added up. */
export function parseUscisHub(text: string): { rows: RegisterRow[]; year: number | null; error?: string } {
  const first = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : 2000);
  const sep = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? '\t' : ',';
  const rows = parseDelimited(text, sep);
  if (rows.length < 2) return { rows: [], year: null, error: 'empty file' };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const iName = head.findIndex((h) => /employer/.test(h) && !/approval|denial/.test(h));
  const iCity = head.findIndex((h) => /city/.test(h));
  const iYear = head.findIndex((h) => /fiscal year/.test(h));
  const approval = head.map((h, i) => (/approval/.test(h) && !/denial/.test(h) ? i : -1)).filter((i) => i >= 0);
  const fresh = head.map((h, i) => (/(initial|new employment|change of employer|new concurrent) approval/.test(h) ? i : -1)).filter((i) => i >= 0);
  if (iName < 0 || !approval.length) return { rows: [], year: null, error: `Unknown header: ${rows[0].join(' | ').slice(0, 300)}` };
  const num = (v: string | undefined) => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  let year: number | null = null;
  const out: RegisterRow[] = [];
  for (const r of rows.slice(1)) {
    const n = (r[iName] ?? '').trim();
    if (!n) continue;
    const approvals = approval.reduce((s, i) => s + num(r[i]), 0);
    if (approvals <= 0) continue;
    const y = iYear >= 0 ? num(r[iYear]) : 0;
    if (y > 2000) year = Math.max(year ?? 0, y);
    out.push({ n, c: iCity >= 0 ? (r[iCity] ?? '').trim() || null : null, d: { approvals, new_approvals: fresh.reduce((s, i) => s + num(r[i]), 0), year: y > 2000 ? y : null } });
  }
  // A file covering several years: keep the newest year only (approvals are per year).
  const latest = year;
  return { rows: latest ? out.filter((r) => r.d.year == null || r.d.year === latest) : out, year };
}
