// CV ↔ job match: one percentage, and exactly where it comes from.
//
// Six parts, each scored 0–100 and weighted:
//   Skills 40 · Role 20 · Experience 15 · Wording 10 · Languages 8 · Education 7
// A part the ad says nothing about (no degree asked, no language named) is
// left out and the others share its weight — an ad can't lower your score
// with something it never asked for.
//
// The score is about the CV against the ad's own words. It is not a
// prediction of getting hired, and it never looks at age, gender,
// nationality or a photo.

import { EDU_NAME, type CvProfile } from './cvProfile';
import { familyOf, type JobProfile } from './jobProfile';
import { LEVEL_NAME } from './languages';
import { SKILL_BY_ID, skillName } from './skills';
import { terms, TITLE_NOISE } from './text';

export type PartKey = 'skills' | 'role' | 'experience' | 'wording' | 'languages' | 'education';
export type Finding = { ok: boolean; text: string };
export type Part = {
  key: PartKey;
  name: string;
  /** 0–100, or null when the ad doesn't ask for this. */
  score: number | null;
  /** Share of the final score this part carries (0–100, all parts add up to 100). */
  weight: number;
  summary: string;
  findings: Finding[];
};

export type MissingKind = 'skill' | 'experience' | 'nice';

export type MatchResult = {
  score: number;
  label: 'Strong match' | 'Good match' | 'Partial match' | 'Low match';
  /** Set when a missing required language holds the score down. */
  capReason: string | null;
  parts: Part[];
  skills: {
    /** Asked for in the ad and found in the CV. */
    matched: string[];
    /** Asked for and not found — must-haves first. `kind`: a core skill for this kind of job, industry or
     *  other-field experience the ad also wants (dental, go-to-market…), or a nice-to-have. */
    missing: { name: string; required: boolean; kind: MissingKind }[];
    asked: number;
    /** How many of them the CV covers (alternatives like “SAP or NetSuite” count once met). */
    covered: number;
  };
  /** Words the ad leans on that the CV never uses. */
  missingWords: string[];
  /** What to change in the CV for this job, most valuable first. */
  fixes: string[];
  /** Checks on the CV itself, the same for every job. */
  health: Finding[];
};

const BASE: Record<PartKey, number> = { skills: 40, role: 20, experience: 15, wording: 10, languages: 8, education: 7 };
const NAME: Record<PartKey, string> = { skills: 'Skills', role: 'Role fit', experience: 'Experience', wording: 'Wording', languages: 'Languages', education: 'Education' };

export const labelFor = (score: number): MatchResult['label'] => (score >= 80 ? 'Strong match' : score >= 65 ? 'Good match' : score >= 45 ? 'Partial match' : 'Low match');

const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);
const list = (items: string[], max = 4) => (items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} and ${items.length - max} more`);
const yrs = (n: number) => `${n % 1 === 0 ? n : n.toFixed(1)} year${n === 1 ? '' : 's'}`;

export function matchCv(cv: CvProfile, cvText: string, job: JobProfile): MatchResult {
  const parts: Part[] = [];
  const fixes: string[] = [];

  // ---- Skills ----
  const hard = job.skills.filter((s) => !SKILL_BY_ID.get(s.id)?.soft);
  // "SAP or NetSuite": having one covers the other.
  const altMet = new Set(job.skills.filter((s) => s.alt != null && cv.skills[s.id]).map((s) => s.alt));
  const has = (s: JobProfile['skills'][number]) => Boolean(cv.skills[s.id]) || (s.alt != null && altMet.has(s.alt));
  const totalW = job.skills.reduce((a, s) => a + s.weight, 0);
  const gotW = job.skills.reduce((a, s) => a + (has(s) ? s.weight : 0), 0);
  const matched = job.skills.filter((s) => cv.skills[s.id]).map((s) => s.label);
  // A core skill is one from this kind of job's own field. The rest — the employer's industry, another
  // team's field — is experience the ad would like, shown apart so "Missing skills" stays about skills.
  const family = familyOf(job.category);
  const kindOf = (s: JobProfile['skills'][number]): MissingKind => {
    const k = SKILL_BY_ID.get(s.id);
    if (k && (k.broad || (family.length > 0 && !family.includes(k.group)))) return 'experience';
    return s.required ? 'skill' : 'nice';
  };
  const KIND_ORDER: Record<MissingKind, number> = { skill: 0, experience: 1, nice: 2 };
  const missing = job.skills
    .filter((s) => !has(s) && !SKILL_BY_ID.get(s.id)?.soft)
    .map((s) => ({ name: s.label, required: s.required, kind: kindOf(s), weight: s.weight }))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || Number(b.required) - Number(a.required) || b.weight - a.weight)
    .map(({ name, required, kind }) => ({ name, required, kind }));
  const hardW = hard.reduce((a, s) => a + s.weight, 0);
  const skillsScore = totalW > 0 ? gotW / totalW : null;
  {
    const must = missing.filter((m) => m.kind === 'skill');
    const domain = missing.filter((m) => m.kind === 'experience');
    const nice = missing.filter((m) => m.kind === 'nice');
    const findings: Finding[] = [];
    if (matched.length) findings.push({ ok: true, text: `In your CV: ${list(matched, 8)}.` });
    if (must.length) findings.push({ ok: false, text: `Skills asked for, not in your CV: ${list(must.map((m) => m.name), 8)}.` });
    if (domain.length) findings.push({ ok: false, text: `Experience the ad also wants: ${list(domain.map((m) => m.name), 6)}.` });
    if (nice.length) findings.push({ ok: false, text: `Nice to have, not in your CV: ${list(nice.map((m) => m.name), 6)}.` });
    parts.push({
      key: 'skills',
      name: NAME.skills,
      score: skillsScore == null ? null : pct(skillsScore),
      weight: 0,
      summary: skillsScore == null ? 'The ad doesn’t name specific skills.' : `${job.skills.filter(has).length} of ${job.skills.length} skills the ad names are covered by your CV.`,
      findings,
    });
    if (must.length) fixes.push(`Add ${list(must.slice(0, 5).map((m) => m.name), 5)} to your CV if you have used ${must.length === 1 ? 'it' : 'them'} — the ad lists ${must.length === 1 ? 'it' : 'them'} as required, and recruiters search for those exact words.`);
    const buried = job.skills.filter((s) => s.weight >= 1.5 && cv.skills[s.id] === 1).map((s) => s.label);
    if (buried.length) fixes.push(`${list(buried, 3)} ${buried.length === 1 ? 'is' : 'are'} in the job title but only mentioned once in your CV. Put ${buried.length === 1 ? 'it' : 'them'} in your summary and in the role where you used ${buried.length === 1 ? 'it' : 'them'} most.`);
  }

  // ---- Role ----
  const cvTitleTerms = new Set(cv.titles.flatMap((t) => terms(t)));
  const cvTerms = new Set(terms(cvText));
  const wanted = job.titleTerms;
  const inTitles = wanted.length ? wanted.filter((t) => cvTitleTerms.has(t)).length / wanted.length : 0;
  const inText = wanted.length ? wanted.filter((t) => cvTerms.has(t)).length / wanted.length : 0;
  const sameRole = job.category ? cv.roles.some((r) => r.label === job.category!.label) : false;
  const sameField = job.category ? cv.roles.some((r) => r.group === job.category!.group) : false;
  let role = Math.max(sameRole ? 1 : sameField ? 0.65 + 0.35 * inText : 0, 0.95 * inTitles, 0.55 * inText);
  // No titles could be read from the CV: judge by the text alone, gently.
  if (!cv.titles.length) role = Math.max(role, 0.25 + 0.5 * inText);
  const gap = job.seniority != null ? job.seniority - cv.seniority : 0;
  if (gap >= 2) role *= 0.85;
  {
    const findings: Finding[] = [];
    if (sameRole) findings.push({ ok: true, text: `You’ve held this kind of role: ${job.category!.label}.` });
    else if (sameField && inText >= 0.75) findings.push({ ok: true, text: `Your background is in the same field (${job.category!.group}) and your CV speaks the title’s language.` });
    else if (sameField) findings.push({ ok: true, text: `Your background is in the same field (${job.category!.group}), in a different role.` });
    else if (cv.titles.length) findings.push({ ok: false, text: `Your recent titles (${list(cv.titles.slice(0, 3), 3)}) are a different kind of role${job.category ? ` from ${job.category.label}` : ''}.` });
    else findings.push({ ok: false, text: 'We couldn’t find job titles in your CV. Put each title on its own line above its dates.' });
    if (gap >= 2) findings.push({ ok: false, text: 'The title is a more senior level than your CV shows.' });
    if (gap <= -2) findings.push({ ok: true, text: 'You are more senior than this role asks for.' });
    parts.push({
      key: 'role',
      name: NAME.role,
      score: pct(role),
      weight: 0,
      summary: role >= 0.9 ? 'Same kind of role as your experience.' : role >= 0.6 ? 'Same field, a somewhat different role.' : role >= 0.35 ? 'Some overlap with the roles on your CV.' : 'A different kind of role from your CV.',
      findings,
    });
    if (!sameRole && inTitles < 0.5 && wanted.length)
      fixes.push(`None of your titles says “${job.title.replace(/\s*\(.*?\)\s*/g, ' ').trim()}”. If your work was the same under another name, add a one-line headline under your name that uses the ad’s wording.`);
  }

  // ---- Experience ----
  {
    let score: number | null = null;
    let summary = 'The ad doesn’t ask for a number of years.';
    const findings: Finding[] = [];
    if (job.years != null) {
      if (cv.years == null) {
        score = 0.5;
        summary = `The ad asks for ${job.years}+ years; your CV has no dates we could read.`;
        findings.push({ ok: false, text: 'Add month and year to every role (for example “Mar 2021 – Present”).' });
        fixes.push(`The ad asks for ${job.years}+ years of experience, and your CV has no readable dates. Add start and end dates to every role.`);
      } else {
        const ratio = cv.years / job.years;
        // Years in another kind of work count, but for less.
        const relevance = 0.4 + 0.6 * role;
        score = (ratio >= 1 ? 1 : Math.pow(ratio, 0.8)) * relevance;
        summary = `The ad asks for ${job.years}+ years; your CV shows about ${yrs(Math.round(cv.years))}.`;
        findings.push({ ok: ratio >= 1, text: ratio >= 1 ? 'You meet the years asked for.' : `About ${yrs(Math.max(1, Math.round(job.years - cv.years)))} short of what the ad asks.` });
        if (role < 0.5) findings.push({ ok: false, text: 'Most of those years are in a different kind of role, so they count for less here.' });
        if (ratio < 1 && ratio >= 0.6) fixes.push(`You’re close to the ${job.years} years asked. Internships, freelance work and relevant projects count — list them with dates so they add up.`);
      }
    } else if (cv.years != null) {
      findings.push({ ok: true, text: `Your CV shows about ${yrs(Math.round(cv.years))} of work.` });
    }
    parts.push({ key: 'experience', name: NAME.experience, score: score == null ? null : pct(score), weight: 0, summary, findings });
  }

  // ---- Wording ----
  const jobTerms = [...job.terms];
  const termW = jobTerms.reduce((a, [, w]) => a + w, 0);
  const termGot = jobTerms.reduce((a, [t, w]) => a + (cvTerms.has(t) ? w : 0), 0);
  const skillWords = new Set(job.skills.flatMap((s) => [...terms(skillName(s.id)), ...terms(s.label)]));
  const missingWords = (cv.writtenIn !== job.writtenIn ? [] : jobTerms)
    // Only words the ad repeats or puts in the title — a word used once proves little.
    .filter(([t, w]) => (w >= 1.6 || job.titleTerms.includes(t)) && !cvTerms.has(t) && !skillWords.has(t) && !TITLE_NOISE.has(t))
    .map(([t]) => job.termWords.get(t) ?? t)
    .filter((w) => w.length > 3)
    .slice(0, 10);
  {
    // An English CV can't share words with a German ad — that is the Languages part's job, not this one's.
    const sameLanguage = cv.writtenIn === job.writtenIn;
    const score = termW > 0 && sameLanguage ? termGot / termW : null;
    const findings: Finding[] = [];
    if (missingWords.length && sameLanguage) findings.push({ ok: false, text: `Words the ad repeats that your CV never uses: ${missingWords.join(', ')}.` });
    else if (score != null) findings.push({ ok: true, text: 'Your CV uses the ad’s main words.' });
    parts.push({
      key: 'wording',
      name: NAME.wording,
      score: score == null ? null : pct(score),
      weight: 0,
      summary: !sameLanguage ? 'Your CV and the ad are in different languages, so wording isn’t compared.' : score == null ? 'The ad is too short to compare wording.' : `Your CV uses ${pct(score)}% of the words the ad leans on.`,
      findings,
    });
    if (missingWords.length >= 4 && sameLanguage) fixes.push(`Use the ad’s own words where they are true for you: ${missingWords.slice(0, 6).join(', ')}. Screening software and recruiters look for the same terms.`);
  }

  // ---- Languages ----
  {
    const asked = job.languages.filter((l) => l.required);
    const findings: Finding[] = [];
    let score: number | null = null;
    if (asked.length) {
      let sum = 0;
      for (const l of asked) {
        const mine = cv.languages.find((c) => c.code === l.code);
        if (!mine) {
          findings.push({ ok: false, text: l.inferred ? `The ad is written in ${l.name}; your CV doesn’t mention ${l.name}.` : `${l.name}${l.level ? ` (${LEVEL_NAME[l.level]})` : ''} is asked for; your CV doesn’t mention it.` });
          fixes.push(l.inferred ? `This ad is in ${l.name}. If you speak it, say so with your level; if not, check whether the team works in English before you apply.` : `Add ${l.name} with your level to a Languages section — the ad requires it.`);
          continue;
        }
        if (l.level && mine.level && mine.level < l.level) {
          sum += 0.6;
          findings.push({ ok: false, text: `${l.name}: the ad asks for ${LEVEL_NAME[l.level]}, your CV says ${LEVEL_NAME[mine.level]}.` });
        } else {
          sum += 1;
          findings.push({ ok: true, text: `${l.name}: on your CV${mine.level ? ` (${LEVEL_NAME[mine.level]})` : ''}.` });
          if (!mine.level && !l.inferred) fixes.push(`State your ${l.name} level (for example “${l.name} — C1”). The ad asks for it and your CV doesn’t say how well you speak it.`);
        }
      }
      score = sum / asked.length;
    }
    parts.push({
      key: 'languages',
      name: NAME.languages,
      score: score == null ? null : pct(score),
      weight: 0,
      summary: !asked.length ? 'The ad doesn’t require a specific language.' : `${asked.map((l) => l.name).join(', ')} asked for.`,
      findings,
    });
  }

  // ---- Education ----
  {
    let score: number | null = null;
    const findings: Finding[] = [];
    let summary = 'The ad doesn’t ask for a degree.';
    if (job.education > 0) {
      const need = EDU_NAME[job.education];
      summary = `The ad asks for ${need}${job.educationFlexible ? ' or equivalent experience' : ''}.`;
      if (cv.education === 0) {
        score = job.educationFlexible ? 0.7 : 0.5;
        findings.push({ ok: false, text: 'We couldn’t find a degree or qualification in your CV.' });
        fixes.push(`Add an Education section with your highest qualification — the ad asks for ${need}.`);
      } else if (cv.education >= job.education) {
        score = 1;
        findings.push({ ok: true, text: `You have ${EDU_NAME[cv.education]}.` });
      } else {
        const short = job.education - cv.education;
        score = job.educationFlexible ? (short === 1 ? 0.85 : 0.6) : short === 1 ? 0.6 : 0.3;
        findings.push({ ok: false, text: `Your CV shows ${EDU_NAME[cv.education]}.${job.educationFlexible ? ' The ad accepts equivalent experience.' : ''}` });
      }
    }
    parts.push({ key: 'education', name: NAME.education, score: score == null ? null : pct(score), weight: 0, summary, findings });
  }

  // ---- weights ----
  const w: Record<PartKey, number> = { ...BASE };
  // Few concrete skills named → the ad's wording and the role itself say more.
  const depth = Math.min(1, hardW / 4);
  const spare = w.skills * (1 - depth);
  w.skills -= spare;
  w.wording += spare * 0.6;
  w.role += spare * 0.4;
  for (const p of parts) if (p.score == null) w[p.key] = 0;
  const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  let total = 0;
  for (const p of parts) {
    p.weight = Math.round((w[p.key] / sum) * 100);
    if (p.score != null) total += (p.score * w[p.key]) / sum;
  }
  // A language the ad requires and the CV doesn't have is a stop for most employers:
  // however good the rest is, the match can't read as "good".
  let cap = 98;
  let capReason: string | null = null;
  for (const l of job.languages) {
    if (!l.required || cv.languages.some((c) => c.code === l.code)) continue;
    const limit = l.inferred ? 74 : 60;
    if (limit < cap) {
      cap = limit;
      capReason = l.inferred ? `The ad is written in ${l.name} and your CV doesn’t mention ${l.name}, so the match is held at ${limit}%.` : `The ad requires ${l.name} and your CV doesn’t mention it, so the match is held at ${limit}%.`;
    }
  }
  if (Math.round(total) <= cap) {
    cap = 98;
    capReason = null;
  }
  // An ad that says almost nothing can't be matched closely: don't let it read as a near-perfect fit.
  if (job.words < 60 && hardW < 2 && Math.round(total) > 70 && cap > 70) {
    cap = 70;
    capReason = 'This ad says very little about what it needs, so the match is a rough one, held at 70%.';
  }
  const score = Math.max(3, Math.min(cap, Math.round(total)));

  // ---- the CV itself ----
  const health: Finding[] = [
    { ok: cv.has.email && cv.has.phone, text: cv.has.email && cv.has.phone ? 'Email and phone are on the CV.' : `Missing contact details: ${[!cv.has.email && 'email', !cv.has.phone && 'phone'].filter(Boolean).join(' and ')}.` },
    { ok: cv.has.dates, text: cv.has.dates ? 'Roles have dates.' : 'No dates found on your roles — add month and year to each.' },
    {
      ok: cv.words >= 250 && cv.words <= 1100,
      text: cv.words < 250 ? `Short: ${cv.words} words. Aim for 400–800 so each role has room for what you did.` : cv.words > 1100 ? `Long: ${cv.words} words. Aim for two pages (400–800 words).` : `Good length: ${cv.words} words.`,
    },
    { ok: cv.numbers >= 3, text: cv.numbers >= 3 ? `${cv.numbers} lines show results with numbers.` : 'Few numbers. Add results you can count (“cut delivery time by 20%”, “managed 12 people”).' },
    { ok: cv.has.skillsSection, text: cv.has.skillsSection ? 'Has a Skills section.' : 'No Skills section found. A short list of your tools and methods makes them easy to find.' },
    { ok: cv.has.linkedin, text: cv.has.linkedin ? 'LinkedIn link included.' : 'No LinkedIn link. Add it if you have a profile.' },
  ];
  if (!cv.has.dates && !fixes.some((f) => f.includes('dates'))) fixes.push('Add month and year to every role. Without dates, employers and screening software can’t tell how much experience you have.');
  if (cv.numbers < 3) fixes.push('Add numbers to your last two roles: how many, how much, how fast. Results stand out more than duties.');

  return {
    score,
    label: labelFor(score),
    capReason,
    parts,
    skills: { matched, missing, asked: job.skills.length, covered: job.skills.filter(has).length },
    missingWords,
    fixes: fixes.slice(0, 8),
    health,
  };
}
