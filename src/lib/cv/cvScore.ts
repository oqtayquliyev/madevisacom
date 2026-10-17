// "Your CV score" — one number for the CV as a whole, shown at the end of /cv-match.
//
//   40  the CV itself: the same six checks as on every job (contact, dates, length, numbers,
//       Skills section, LinkedIn)
//   40  how well it fits the jobs it matches: the average of the best 10 match scores
//   20  how many of the skills those ads name the CV shows
//
// Plus what to add, most useful first: the fixes for failed checks, the skills employers ask
// for most often among the matches, and the experience they also want.
import type { CvProfile } from '@/lib/cv/cvProfile';
import type { TopMatch } from '@/lib/cv/topMatches';

export type CvCheck = { ok: boolean; label: string; fix: string };
export type CvScore = {
  score: number;
  parts: { label: string; got: number; max: number }[];
  checks: CvCheck[];
  /** Skills the matching ads ask for that the CV doesn't show, with how many ads ask. */
  skills: { name: string; n: number }[];
  /** Experience the matching ads also want. */
  experience: { name: string; n: number }[];
};

/** "Design system", "Design systems" and "design System" are one skill: same words, any case, singular or plural. */
const keyOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');

function countBy(items: TopMatch[], pick: (m: TopMatch) => string[] | undefined): { name: string; n: number }[] {
  const map = new Map<string, { name: string; n: number; names: Map<string, number> }>();
  for (const m of items) {
    const keys = new Map<string, string>();
    for (const s of pick(m) ?? []) if (!keys.has(keyOf(s))) keys.set(keyOf(s), s);
    for (const [k, s] of keys) {
      const row = map.get(k) ?? { name: s, n: 0, names: new Map() };
      row.n += 1;
      row.names.set(s, (row.names.get(s) ?? 0) + 1);
      map.set(k, row);
    }
  }
  // Shown under the spelling the ads use most.
  return [...map.values()]
    .map((r) => ({ name: [...r.names.entries()].sort((a, b) => b[1] - a[1])[0][0], n: r.n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/** How many things there are to add or fix: failed checks, missing skills, experience to mention. */
export const fixCount = (s: CvScore) => s.checks.filter((c) => !c.ok).length + s.skills.length + s.experience.length;

export function cvScore(p: CvProfile, items: TopMatch[]): CvScore {
  const checks: CvCheck[] = [
    { ok: p.has.email && p.has.phone, label: 'Email and phone', fix: `Add your ${[!p.has.email && 'email', !p.has.phone && 'phone number'].filter(Boolean).join(' and ')} at the top.` },
    { ok: p.has.dates, label: 'Dates on every role', fix: 'Add month and year to each role — without dates, employers can’t count your experience.' },
    { ok: p.words >= 250 && p.words <= 1100, label: 'Length', fix: p.words < 250 ? `Your CV is short (${p.words} words). Aim for 400–800 so each role shows what you did.` : `Your CV is long (${p.words} words). Aim for two pages, 400–800 words.` },
    { ok: p.numbers >= 3, label: 'Results with numbers', fix: 'Add results you can count to your last two roles: “cut delivery time by 20%”, “managed 12 people”.' },
    { ok: p.has.skillsSection, label: 'Skills section', fix: 'Add a short Skills section that names your tools and methods.' },
    { ok: p.has.linkedin, label: 'LinkedIn link', fix: 'Add your LinkedIn link next to your contact details.' },
  ];
  const health = (40 * checks.filter((c) => c.ok).length) / checks.length;
  const best = [...items].sort((a, b) => b.score - a.score).slice(0, 10);
  const fit = best.length ? (40 * best.reduce((a, m) => a + m.score, 0)) / best.length / 100 : 0;
  const asked = best.reduce((a, m) => a + (m.asked || 0), 0);
  const covered = best.reduce((a, m) => a + (m.covered || 0), 0);
  const skillsPart = asked ? (20 * covered) / asked : best.length ? 14 : 0;
  return {
    score: Math.max(1, Math.min(100, Math.round(health + fit + skillsPart))),
    parts: [
      { label: 'Your CV itself', got: Math.round(health), max: 40 },
      { label: 'Fit with your matching jobs', got: Math.round(fit), max: 40 },
      { label: 'Skills those jobs ask for', got: Math.round(skillsPart), max: 20 },
    ],
    checks,
    skills: countBy(items, (m) => m.missing).slice(0, 8),
    experience: countBy(items, (m) => m.wanted).slice(0, 6),
  };
}
