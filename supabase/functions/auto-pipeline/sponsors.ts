// UK register of licensed sponsors → public.uk_sponsors (daily, { cron: "sponsors" }).
//
// The gov.uk page links to a new CSV every day (the file name has the date),
// so we read the page first and follow its CSV link. ~10 MB, ~140k rows,
// one row per organisation + route. We merge routes per organisation and
// send batches to uk_sponsors_upsert(); uk_sponsors_finish() removes
// organisations that left the register — but only if today's import is
// clearly complete, so a broken download never wipes the data.

import type { Service } from './shared.ts';
import { decodeText, parseIndRegister, parseUscisHub, pickUscisCsv, type RegisterRow } from '../_shared/sponsorParsers.ts';

const PAGE = 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers';
const BATCH = 2000;

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, commas and newlines in quotes). */
function parseCsv(text: string): string[][] {
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
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
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

export async function runSponsors(service: Service): Promise<void> {
  // The other registers first, each on its own, so one failing never stops the rest (or the UK one).
  const seenDay = new Date().toISOString().slice(0, 10);
  const nl = await runRegister(service, 'NL', seenDay, loadNl).catch((e) => `NL: ${e instanceof Error ? e.message : String(e)}`);
  const us = await runRegister(service, 'US', seenDay, loadUs).catch((e) => `US: ${e instanceof Error ? e.message : String(e)}`);
  const log = (ok: boolean, summary: string) => service.rpc('pipeline_finished', { p_kind: 'sponsors', p_ok: ok, p_summary: [summary, nl, us].join(' · ').slice(0, 1500), p_detail: null });

  const page = await fetch(PAGE, { headers: { 'User-Agent': 'MadeVisa sponsor-register import (hello@madevisa.com)' } });
  if (!page.ok) return void (await log(false, `gov.uk page: HTTP ${page.status}`));
  const html = await page.text();
  const url = html.match(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[A-Za-z0-9]+\/[^"'\s<>]+?\.csv/)?.[0];
  if (!url) return void (await log(false, 'No CSV link found on the gov.uk page — its layout may have changed.'));

  const file = await fetch(url);
  if (!file.ok) return void (await log(false, `CSV: HTTP ${file.status}`));
  const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
  if (rows.length < 1000) return void (await log(false, `CSV has only ${rows.length} rows — skipped.`));

  // Find columns by name, not position, in case the order changes.
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iName = col(/organi[sz]ation/);
  const iCity = col(/town|city/);
  const iRating = col(/rating/);
  const iRoute = col(/^route|route$/);
  if (iName < 0) return void (await log(false, `Unknown CSV header: ${rows[0].join(' | ').slice(0, 300)}`));

  // One entry per organisation (+ city), routes merged.
  const orgs = new Map<string, { n: string; c: string; g: string; t: Set<string> }>();
  for (const r of rows.slice(1)) {
    const n = (r[iName] ?? '').trim();
    if (!n) continue;
    const c = iCity >= 0 ? (r[iCity] ?? '').trim() : '';
    const key = `${n.toLowerCase()}|${c.toLowerCase()}`;
    const o = orgs.get(key) ?? { n, c, g: iRating >= 0 ? (r[iRating] ?? '').trim() : '', t: new Set<string>() };
    const route = iRoute >= 0 ? (r[iRoute] ?? '').trim() : '';
    if (route) o.t.add(route);
    orgs.set(key, o);
  }

  const seen = new Date().toISOString().slice(0, 10);
  const all = [...orgs.values()].map((o) => ({ n: o.n, c: o.c || null, g: o.g || null, t: [...o.t] }));
  let saved = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const { data, error } = await service.rpc('uk_sponsors_upsert', { p_rows: all.slice(i, i + BATCH), p_seen: seen });
    if (error) return void (await log(false, `Saving batch ${i / BATCH + 1}: ${error.message} (saved ${saved} so far; old data kept)`));
    saved += Number(data) || 0;
  }
  const { data: done, error } = await service.rpc('uk_sponsors_finish', { p_seen: seen, p_url: url, p_min: 50000 });
  await log(!error, error ? `UK finishing: ${error.message}` : `UK register ${seen}: ${rows.length - 1} rows, ${all.length} organisations · ${String(done)}`);
}

// ---------------------------------------------------------------------------
// NL (IND recognised sponsors) and US (USCIS H-1B Employer Data Hub) → public.sponsor_registers
// ---------------------------------------------------------------------------
const UA = { 'User-Agent': 'MadeVisa sponsor-register import (hello@madevisa.com)', Accept: 'text/html,text/csv,*/*' };

/** IND publishes one register per residence purpose; the work ones matter for jobs. */
const IND_PAGES: [string, string][] = [
  ['https://ind.nl/en/public-register-recognised-sponsors/public-register-regular-labour-and-highly-skilled-migrants', 'Highly skilled migrants and regular labour'],
  ['https://ind.nl/en/public-register-recognised-sponsors/public-register-research', 'Researchers'],
];

async function loadNl(): Promise<{ rows: RegisterRow[]; url: string; min: number }> {
  const rows: RegisterRow[] = [];
  for (const [url, category] of IND_PAGES) {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) throw new Error(`IND page HTTP ${r.status}`);
    rows.push(...parseIndRegister(await r.text(), category));
  }
  return { rows, url: IND_PAGES[0][0], min: 3000 };
}

async function loadUs(): Promise<{ rows: RegisterRow[]; url: string; min: number }> {
  const page = 'https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub/h-1b-employer-data-hub-files';
  const r = await fetch(page, { headers: UA });
  if (!r.ok) throw new Error(`USCIS page HTTP ${r.status}`);
  const url = pickUscisCsv(await r.text());
  if (!url) throw new Error('no CSV link on the USCIS page — its layout may have changed');
  const f = await fetch(url, { headers: UA });
  if (!f.ok) throw new Error(`USCIS CSV HTTP ${f.status}`);
  const parsed = parseUscisHub(decodeText(new Uint8Array(await f.arrayBuffer())));
  if (parsed.error) throw new Error(parsed.error);
  return { rows: parsed.rows, url, min: 15000 };
}

async function runRegister(service: Service, country: string, seen: string, load: () => Promise<{ rows: RegisterRow[]; url: string; min: number }>): Promise<string> {
  const { rows, url, min } = await load();
  if (rows.length < min) return `${country}: only ${rows.length} rows — skipped, old data kept`;
  const begun = await service.rpc('sponsor_registers_begin', { p_country: country, p_seen: seen });
  if (begun.error) return `${country}: ${begun.error.message} (has migration 20261231120000 been run?)`;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await service.rpc('sponsor_registers_upsert', { p_country: country, p_rows: rows.slice(i, i + BATCH), p_seen: seen });
    if (error) return `${country}: batch ${i / BATCH + 1}: ${error.message}`;
  }
  const { data, error } = await service.rpc('sponsor_registers_finish', { p_country: country, p_seen: seen, p_url: url, p_min: Math.round(min * 0.8) });
  return error ? `${country} finishing: ${error.message}` : String(data);
}
