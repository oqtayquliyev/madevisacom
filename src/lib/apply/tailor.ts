// A CV tailored to one job ad — from the person's own CV, and nothing else.
//
// What tailoring does here
//   • puts the skills the ad asks for at the front of each skills line;
//   • inside each role, puts the bullets closest to the ad first;
//   • adds one headline under the name, built from the CV's own most recent
//     title, its years of work and the skills it shares with the ad.
// What it never does: add a skill, a role, an employer, a date, a number or
// a sentence that isn't in the CV. `verifyTailored` checks exactly that and
// is run on every tailored CV before it is used.

import { sectionOf, type CvProfile, type Section } from '@/lib/cv/cvProfile';
import type { JobProfile } from '@/lib/cv/jobProfile';
import { findSkills, skillName } from '@/lib/cv/skills';
import { terms } from '@/lib/cv/text';

export type TLine = { kind: 'name' | 'contact' | 'headline' | 'heading' | 'text' | 'bullet'; text: string };

export type Tailored = {
  lines: TLine[];
  /** Plain text of the tailored CV. */
  text: string;
  /** What was changed, in plain words (empty = the CV already leads with what the ad asks for). */
  changes: string[];
  /** The headline that was added, or null. */
  headline: string | null;
  /** Skills the CV shares with the ad, most important first. */
  shared: string[];
};

const BULLET = /^\s*(?:[•\-–—*▪◦·●○■□➤►»]|\d{1,2}[.)])\s+/;
const isBullet = (t: string) => BULLET.test(t);
const bare = (t: string) => t.replace(BULLET, '').trim();

type Block = { section: Section; lines: { text: string; heading: boolean }[] };

function blocksOf(cvText: string): Block[] {
  const out: Block[] = [{ section: 'top', lines: [] }];
  for (const raw of cvText.replace(/\r/g, '').split('\n')) {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const s = sectionOf(text);
    if (s) out.push({ section: s, lines: [{ text, heading: true }] });
    else out[out.length - 1].lines.push({ text, heading: false });
  }
  return out;
}

/** How much a line says about this job: the ad's skills and its main words. */
function relevance(text: string, job: JobProfile, jobSkillIds: Set<string>): number {
  let score = 0;
  for (const id of findSkills(text).keys()) if (jobSkillIds.has(id)) score += 3;
  const seen = new Set<string>();
  for (const t of terms(text)) {
    if (seen.has(t)) continue;
    seen.add(t);
    const w = job.terms.get(t);
    if (w) score += Math.min(2, w);
    if (job.titleTerms.includes(t)) score += 1;
  }
  return score;
}

/** "Languages: Java, SQL, Python" → label and items, or null when the line isn't a list. */
function splitList(text: string): { label: string; items: string[]; sep: string } | null {
  const lead = text.match(BULLET)?.[0] ?? '';
  const rest = text.slice(lead.length);
  const colon = rest.match(/^([^:,;|•·]{2,40}):\s+/);
  const label = lead + (colon ? colon[0] : '');
  const body = rest.slice(colon ? colon[0].length : 0);
  const sep = [' • ', ' · ', ' | ', '; ', ', '].find((s) => body.split(s).length >= 3) ?? null;
  if (!sep) return null;
  // A sentence with commas isn't a list of skills.
  const items = body.split(sep).map((x) => x.trim()).filter(Boolean);
  if (items.some((x) => x.split(/\s+/).length > 6) || /[.!?]$/.test(body.trim()) && items.length < 4) return null;
  return { label, items, sep };
}

/**
 * Skills the ad asks for that the CV names in so many words — spelled as the
 * CV spells them, the ad's most important first. A skill the reader only
 * inferred ("dashboards" → data visualisation) is left out: the headline and
 * the letter repeat the CV's own words, nothing else.
 */
export function sharedSkills(cvText: string, cv: CvProfile, job: JobProfile): string[] {
  const out: string[] = [];
  const ranked = job.skills.filter((s) => cv.skills[s.id]).sort((a, b) => b.weight - a.weight || (cv.skills[b.id] ?? 0) - (cv.skills[a.id] ?? 0));
  for (const s of ranked) {
    const name = skillName(s.id);
    const m = cvText.match(new RegExp(`(?<![A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i'));
    if (m && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

export function tailorCv(cvText: string, cv: CvProfile, job: JobProfile): Tailored {
  const jobSkillIds = new Set(job.skills.map((s) => s.id));
  const blocks = blocksOf(cvText);
  const lines: TLine[] = [];
  let skillsMoved = 0;
  let rolesReordered = 0;

  const shared = sharedSkills(cvText, cv, job);

  // The headline: the CV's own latest title, its years, the shared skills.
  const title = cv.titles[0] ?? null;
  const years = cv.years != null && cv.years >= 1 ? Math.floor(cv.years) : null;
  const headline =
    title && shared.length
      ? [title, years ? `${years} year${years === 1 ? '' : 's'} of experience` : null, shared.slice(0, 5).join(', ')].filter(Boolean).join(' · ')
      : null;

  for (const b of blocks) {
    if (b.section === 'top') {
      b.lines.forEach((l, i) => lines.push({ kind: i === 0 ? 'name' : 'contact', text: l.text }));
      if (headline) lines.push({ kind: 'headline', text: headline });
      continue;
    }
    const head = b.lines[0]?.heading ? b.lines[0] : null;
    const body = head ? b.lines.slice(1) : b.lines;
    if (head) lines.push({ kind: 'heading', text: head.text });

    if (b.section === 'skills') {
      for (const l of body) {
        const list = splitList(l.text);
        if (!list) {
          lines.push({ kind: isBullet(l.text) ? 'bullet' : 'text', text: isBullet(l.text) ? bare(l.text) : l.text });
          continue;
        }
        const wanted = (item: string) => [...findSkills(item).keys()].some((id) => jobSkillIds.has(id));
        const first = list.items.filter(wanted);
        const rest = list.items.filter((x) => !wanted(x));
        const next = [...first, ...rest];
        if (next.some((x, i) => x !== list.items[i])) skillsMoved += first.length;
        const text = `${list.label}${next.join(list.sep)}`;
        lines.push({ kind: isBullet(text) ? 'bullet' : 'text', text: isBullet(text) ? bare(text) : text });
      }
      continue;
    }

    if (b.section === 'experience') {
      // Runs of bullets belong to the role above them: order each run by how much it says about this job.
      let run: string[] = [];
      const flush = () => {
        if (!run.length) return;
        const ranked = run.map((text, i) => ({ text, i, r: relevance(text, job, jobSkillIds) })).sort((x, y) => y.r - x.r || x.i - y.i);
        if (ranked.some((x, i) => x.i !== i)) rolesReordered += 1;
        for (const x of ranked) lines.push({ kind: 'bullet', text: bare(x.text) });
        run = [];
      };
      for (const l of body) {
        if (isBullet(l.text)) run.push(l.text);
        else {
          flush();
          lines.push({ kind: 'text', text: l.text });
        }
      }
      flush();
      continue;
    }

    for (const l of body) lines.push({ kind: isBullet(l.text) ? 'bullet' : 'text', text: isBullet(l.text) ? bare(l.text) : l.text });
  }

  const changes: string[] = [];
  if (headline) changes.push('Added a one-line headline from your own title, years and skills.');
  if (skillsMoved) changes.push(`Moved ${skillsMoved} ${skillsMoved === 1 ? 'skill' : 'skills'} the ad asks for to the front of your skills.`);
  if (rolesReordered) changes.push(`Put the results closest to this ad first in ${rolesReordered} ${rolesReordered === 1 ? 'role' : 'roles'}.`);

  const text = lines.map((l) => (l.kind === 'bullet' ? `• ${l.text}` : l.text)).join('\n');
  return { lines, text, changes, headline, shared };
}

/** The CV as it is, laid out the same way — used when a tailored version doesn't pass the check. */
export function untouchedCv(cvText: string): Tailored {
  const lines: TLine[] = [];
  for (const b of blocksOf(cvText)) {
    b.lines.forEach((l, i) => {
      const kind: TLine['kind'] = l.heading ? 'heading' : b.section === 'top' ? (i === 0 ? 'name' : 'contact') : isBullet(l.text) ? 'bullet' : 'text';
      lines.push({ kind, text: kind === 'bullet' ? bare(l.text) : l.text });
    });
  }
  return { lines, text: lines.map((l) => (l.kind === 'bullet' ? `• ${l.text}` : l.text)).join('\n'), changes: [], headline: null, shared: [] };
}

// --- The check ------------------------------------------------------------------

const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .replace(BULLET, ' ')
    .split(/[^a-z0-9+#.À-ɏЀ-ӿ@/-]+/i)
    .map((w) => w.replace(/^[.\-/]+|[.\-/]+$/g, ''))
    .filter(Boolean);

function bag(lines: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) for (const w of wordsOf(l)) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

/**
 * True only when the tailored CV says nothing the original doesn't:
 *   • apart from the headline, it is the same words the same number of times
 *     (only their order may differ);
 *   • the headline's title is a title from the CV, its skills are skills the
 *     CV names, and its years are the CV's years.
 */
export function verifyTailored(cvText: string, cv: CvProfile, t: Tailored): { ok: true } | { ok: false; why: string } {
  const before = bag(cvText.replace(/\r/g, '').split('\n'));
  const after = bag(t.lines.filter((l) => l.kind !== 'headline').map((l) => l.text));
  for (const [w, n] of after) if ((before.get(w) ?? 0) < n) return { ok: false, why: `“${w}” appears more often than in the CV.` };
  for (const [w, n] of before) if ((after.get(w) ?? 0) < n) return { ok: false, why: `“${w}” from the CV is missing.` };

  if (t.headline) {
    const parts = t.headline.split(' · ');
    if (!cv.titles.includes(parts[0])) return { ok: false, why: 'The headline’s title is not a title from the CV.' };
    const skills = parts[parts.length - 1].split(', ');
    const has = (w: string) => new RegExp(`(?<![A-Za-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`).test(cvText);
    if (skills.some((s) => !has(s))) return { ok: false, why: 'The headline names a skill the CV doesn’t.' };
    const y = t.headline.match(/(\d+) years? of experience/);
    if (y && (cv.years == null || Number(y[1]) > cv.years)) return { ok: false, why: 'The headline’s years are more than the CV shows.' };
  }
  return { ok: true };
}

/** "Oqtay Product Designer CV" — the person's first name and the role, for the file and the receipt. */
export function tailoredName(fullName: string | null, jobTitle: string): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  const role = jobTitle
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s[-–—|,@]\s.*$/, ' ')
    .replace(/\b(senior|junior|sr\.?|jr\.?|lead|principal|staff|m\/w\/d|m\/f\/d|f\/m\/d)\b/gi, ' ')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
  return [first, role, 'CV'].filter(Boolean).join(' ');
}
