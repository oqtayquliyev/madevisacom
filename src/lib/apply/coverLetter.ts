// A cover letter — only when one is useful, and only from verified facts.
//
// Written for: ads that ask for one, senior roles, and the strongest
// matches. Not for every application: a letter that says nothing is worse
// than none.
// Every sentence is built from the CV (its own title, years, the skills it
// shares with the ad, and its own lines quoted as they are) or from the
// person's saved answers. Nothing is claimed that isn't written there.

import type { CvProfile } from '@/lib/cv/cvProfile';
import type { JobProfile } from '@/lib/cv/jobProfile';
import { findSkills } from '@/lib/cv/skills';
import { terms } from '@/lib/cv/text';
import { sharedSkills } from '@/lib/apply/tailor';
import type { ApplyProfile, Priority, SponsorState } from '@/lib/apply/types';

const ASKS_FOR_LETTER = /\b(cover letter|covering letter|motivation(?:al)? letter|letter of motivation|anschreiben|motivationsschreiben|lettre de motivation|carta de (?:presentación|motivación)|lettera di (?:presentazione|motivazione))\b/i;

export type LetterWhy = 'asked' | 'senior' | 'priority' | null;

/** Should this application carry a letter, and why. */
export function letterReason(adText: string, job: Pick<JobProfile, 'seniority'>, priority: Priority): LetterWhy {
  if (ASKS_FOR_LETTER.test(adText)) return 'asked';
  if ((job.seniority ?? 0) >= 4) return 'senior';
  if (priority === 'strong') return 'priority';
  return null;
}

export const LETTER_WHY_TEXT: Record<Exclude<LetterWhy, null>, string> = {
  asked: 'The ad asks for one.',
  senior: 'Senior roles are usually read with a letter.',
  priority: 'This is one of your strongest matches.',
};

const BULLET = /^\s*(?:[•\-–—*▪◦·●○■□➤►»]|\d{1,2}[.)])\s+/;

/** The CV's own lines that say most about this job — lines with a number in them first. */
export function bestLines(cvText: string, job: JobProfile, max = 2): string[] {
  const ids = new Set(job.skills.map((s) => s.id));
  const scored: { text: string; r: number; i: number }[] = [];
  cvText.split('\n').forEach((raw, i) => {
    if (!BULLET.test(raw)) return;
    const text = raw.replace(BULLET, '').replace(/\s+/g, ' ').trim();
    const words = text.split(' ').length;
    if (words < 5 || words > 40) return;
    let r = 0;
    for (const id of findSkills(text).keys()) if (ids.has(id)) r += 3;
    for (const t of new Set(terms(text))) r += Math.min(2, job.terms.get(t) ?? 0);
    if (r <= 0) return;
    if (/\d/.test(text.replace(/\b(?:19|20)\d{2}\b/g, ''))) r += 2;
    scored.push({ text: text.replace(/[.;]\s*$/, ''), r, i });
  });
  return scored
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .slice(0, max)
    .map((x) => x.text);
}

export type LetterInput = {
  cvText: string;
  cv: CvProfile;
  job: JobProfile;
  jobTitle: string;
  company: string;
  profile: ApplyProfile;
  sponsorship: SponsorState;
  jobCountry: string | null;
  /** Link to the person's sponsorship document for this job, if they made one. */
  documentUrl?: string | null;
};

/** The letter as plain text, or null when the CV gives too little to say anything true and specific. */
export function coverLetter(x: LetterInput): string | null {
  const name = x.profile.answers.full_name?.value.trim();
  const title = x.cv.titles[0] ?? null;
  const shared = sharedSkills(x.cvText, x.cv, x.job);
  const lines = bestLines(x.cvText, x.job);
  // Nothing specific to say: no letter.
  if (!name || (!shared.length && !lines.length)) return null;

  const years = x.cv.years != null && x.cv.years >= 1 ? Math.floor(x.cv.years) : null;
  const out: string[] = [];
  out.push(`Dear ${x.company} hiring team,`);
  out.push('');
  out.push(`I am applying for the ${x.jobTitle.replace(/\s*\((?:m|f|w|d|x|\/|\s|all genders)+\)\s*/gi, ' ').trim()} role.`);
  out.push('');

  const who = [title ? `My most recent role is ${title}` : null, years ? `${title ? 'and my CV shows' : 'My CV shows'} ${years} year${years === 1 ? '' : 's'} of work` : null].filter(Boolean).join(', ');
  if (who) out.push(`${who}.`);
  if (shared.length) out.push(`Your ad asks for ${list(shared.slice(0, 5))} — ${shared.length === 1 ? 'that is' : 'these are'} on my CV.`);
  if (lines.length) {
    out.push('');
    out.push(lines.length === 1 ? 'The line from my CV closest to what you describe:' : 'The lines from my CV closest to what you describe:');
    for (const l of lines) out.push(`– ${l}`);
  }

  // Only what the person has told us, in their own terms.
  const extras: string[] = [];
  const sponsor = x.profile.answers.sponsorship;
  if (x.sponsorship !== 'not_needed' && sponsor?.value && !sponsor.askEachTime && /^yes\b/i.test(sponsor.value.trim())) {
    extras.push(`I would need visa sponsorship to work in ${x.jobCountry ?? 'the country of this role'}.${x.documentUrl ? ` I have set out the route and what it asks of an employer here: ${x.documentUrl}` : ''}`);
  }
  const reloc = x.profile.answers.relocation;
  if (x.sponsorship !== 'not_needed' && reloc?.value && !reloc.askEachTime && /^yes\b/i.test(reloc.value.trim())) extras.push('I am willing to relocate.');
  const notice = x.profile.answers.notice_period;
  if (notice?.value && !notice.askEachTime) extras.push(`My notice period: ${notice.value.trim().replace(/\.$/, '')}.`);
  if (extras.length) {
    out.push('');
    out.push(extras.join(' '));
  }

  out.push('');
  out.push('My CV is attached. Thank you for your time.');
  out.push('');
  out.push(name);
  const contact = [x.profile.answers.email?.value, x.profile.answers.phone?.value].filter(Boolean).join(' · ');
  if (contact) out.push(contact);
  return out.join('\n');
}

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
