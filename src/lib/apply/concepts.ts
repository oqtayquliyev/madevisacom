// The question normalization engine.
//
// Employers ask the same thing in many words:
//   "Will you now or in the future require sponsorship?"
//   "Will you need visa sponsorship?"
//   "Do you require employer sponsorship?"
// are one concept — sponsorship — and the person should answer it once.
//
// This file is the one registry of those concepts: how to recognise each,
// what kind of information it is (verified, a saved preference, derivable
// from the CV, sensitive), whether its answer depends on the country of the
// job, and how a saved answer is fitted to the choices a form offers.
//
// It is plain TypeScript with no browser or server dependencies: the page
// (planning a batch) and the application worker (filling a live form) use
// the very same rules.
//
// To teach MadeVisa a new concept: add its key to QuestionKey (types.ts) and
// one entry to CONCEPTS below — patterns, category, scope, input. Nothing
// else needs to change.

import type { CountryKey, Question, QuestionKey } from '@/lib/apply/types';

/** What kind of information an answer is (product spec §7). */
export type InfoCategory =
  /** Read from the account or the CV: name, email, phone, LinkedIn, … */
  | 'verified'
  /** Something the person decides and MadeVisa remembers: salary, relocation, sponsorship, … */
  | 'preference'
  /** Worked out from verified data: years of experience, current title, … */
  | 'derived'
  /** Legally important or personal: answered only with explicit consent, or never. */
  | 'sensitive';

/** Whether one answer covers every job, or depends on the job's country or company. */
export type Scope = 'person' | 'country' | 'company';

/** How the consolidated form asks for it. */
export type Input = 'yesno' | 'choice' | 'text' | 'long' | 'number';

export type Concept = {
  key: QuestionKey;
  /** The canonical name used in logs and analytics. */
  canonical: string;
  category: InfoCategory;
  scope: Scope;
  input: Input;
  /** For `choice`. */
  choices?: string[];
  /** The question as MadeVisa asks it once, for every job that needs it. `{country}` / `{company}` are filled in. */
  ask: string;
  hint?: string;
  /** Recognisers, most specific concept first (the order of CONCEPTS matters). */
  patterns: RegExp[];
};

/**
 * The registry. ORDER MATTERS: the first concept whose pattern matches wins,
 * so narrower concepts come before broader ones ("18 years of age" before
 * the demographic "age", "sponsorship" before "authorized to work").
 */
export const CONCEPTS: Concept[] = [
  {
    key: 'over_18', canonical: 'minimum_age', category: 'preference', scope: 'person', input: 'yesno',
    ask: 'Are you at least 18 years old?',
    patterns: [/\b(at least|over|above|older than) (18|eighteen)\b|\b(18|eighteen) (years|yrs)( of age)?( or older| or over|\+)?\b|\bof legal (working )?age\b|\bage of (18|eighteen)\b/i],
  },
  {
    key: 'demographic', canonical: 'voluntary_self_identification', category: 'sensitive', scope: 'person', input: 'text',
    ask: 'Voluntary self-identification',
    patterns: [/\b(gender|sex\b|pronoun|race\b|racial|ethnic|hispanic|latin[oax]|veteran|disab|sexual orientation|lgbt|transgender|date of birth|birth ?date|marital|religio|nationality at birth|\bage\b)/i],
  },
  {
    key: 'consent', canonical: 'privacy_consent', category: 'sensitive', scope: 'person', input: 'yesno',
    ask: 'Some employers ask you to accept their privacy notice to apply. May MadeVisa accept it for you on these applications?',
    hint: 'Only the consent an application requires. Optional consents (marketing, keeping your data for other roles) are never ticked.',
    patterns: [/\b(consent|privacy (policy|notice|statement)|data (protection|processing)|gdpr|i (have read and )?agree|i acknowledge|i confirm|i certify|terms (and|&) conditions|datenschutz|candidate privacy)/i],
  },
  {
    key: 'sponsorship', canonical: 'sponsorship_requirement', category: 'preference', scope: 'country', input: 'yesno',
    ask: 'Will you need visa sponsorship to work in {country}?',
    hint: 'Now or in the future. Employers use this to plan the visa — answering honestly protects your application.',
    patterns: [/\b(sponsor|sponsorship|visa support|work visa|h-?1b|skilled worker visa|blue card|immigration (support|status))\b/i],
  },
  {
    key: 'work_authorization', canonical: 'work_authorization', category: 'preference', scope: 'country', input: 'yesno',
    ask: 'Are you legally allowed to work in {country} today, without a new visa?',
    patterns: [/\b(authori[sz]ed to work|legally (allowed|permitted|able|entitled|eligible) to work|right to work|work (permit|authori[sz]ation)|eligible to work|arbeitserlaubnis|permission to work|legally work)\b/i],
  },
  {
    key: 'salary_expectation', canonical: 'salary_expectation', category: 'preference', scope: 'person', input: 'text',
    ask: 'What salary do you expect?',
    hint: 'A yearly amount with currency, e.g. $90,000 or €60,000 — or “Negotiable”.',
    patterns: [
      /\b(salary|compensation|pay|remuneration|gehalt|rémunération|salarial|wage)\b.*\b(expect|desired|requirement|range|wish|vorstellung|souhait|looking for|target)/i,
      /\b(expected|desired|target)\b.*\b(salary|compensation|pay|wage)\b/i,
      /gehaltsvorstellung|prétentions salariales|\bsalary\b\s*$/i,
    ],
  },
  {
    key: 'notice_period', canonical: 'notice_period', category: 'preference', scope: 'person', input: 'text',
    ask: 'What is your notice period?', hint: 'For example “1 month”, or “Available now”.',
    patterns: [/\bnotice period\b|kündigungsfrist|préavis|\bhow much notice\b/i],
  },
  {
    key: 'availability', canonical: 'start_date', category: 'preference', scope: 'person', input: 'text',
    ask: 'When could you start?', hint: 'For example “From 1 December”, or “Immediately”.',
    patterns: [/\b(start date|earliest (possible )?start|when (can|could|would) you (be able to )?start|available to start|availability|date available|eintrittstermin|date de disponibilité)\b/i],
  },
  {
    key: 'relocation', canonical: 'relocation_preference', category: 'preference', scope: 'person', input: 'choice',
    choices: ['Yes', 'No', 'Depending on the opportunity'],
    ask: 'Are you willing to relocate for a job?',
    patterns: [/\b(relocat\w*|willing to move|open to moving|move to|umzug|déménag)/i],
  },
  {
    key: 'onsite_ok', canonical: 'onsite_willingness', category: 'preference', scope: 'person', input: 'yesno',
    ask: 'Are you happy to work on-site or hybrid when a role asks for it?',
    patterns: [/\b(able|willing|comfortable|open|happy) to (work|come|commute) (on-?site|in (the |our )?office|in person|hybrid)|\bcommut(e|ing) to\b|\b(on-?site|in-office) (requirement|days)\b/i],
  },
  {
    key: 'remote_preference', canonical: 'remote_preference', category: 'preference', scope: 'person', input: 'choice',
    choices: ['Remote', 'Hybrid', 'On-site', 'Any'],
    ask: 'How do you prefer to work?',
    patterns: [/\b(prefer(red)?|preference)\b.*\b(remote|hybrid|on-?site|work (arrangement|setup|location|model))\b|\b(remote|hybrid|on-?site) preference\b/i],
  },
  {
    key: 'travel', canonical: 'travel_willingness', category: 'preference', scope: 'person', input: 'yesno',
    ask: 'Are you willing to travel for work when a role needs it?',
    patterns: [/\b(willing|able|open|comfortable) to travel\b|\btravel (requirement|up to|\d+\s*%)|\b\d+\s*% travel\b/i],
  },
  {
    key: 'previously_employed', canonical: 'previously_employed', category: 'derived', scope: 'company', input: 'yesno',
    ask: 'Have you worked for {company} before?',
    patterns: [/\b(previously|ever|have you( ever)?) (been )?(worked|employed) (for|at|by|with)\b|\bformer (employee|intern)\b|\bworked (here|for us|at \w+) before\b|\bcurrent or (former|previous) employee\b/i],
  },
  {
    key: 'years_experience', canonical: 'years_of_experience', category: 'derived', scope: 'person', input: 'number',
    ask: 'How many years of relevant experience do you have?',
    patterns: [/\b(how many )?years? of (relevant |professional |work(ing)? |industry )?experience\b|\bjahre berufserfahrung\b|\byears (have you|of)\b.*\bexperience\b/i],
  },
  { key: 'linkedin', canonical: 'linkedin_url', category: 'verified', scope: 'person', input: 'text', ask: 'Your LinkedIn profile', patterns: [/\blinked ?in\b/i] },
  { key: 'website', canonical: 'website_url', category: 'verified', scope: 'person', input: 'text', ask: 'Website or portfolio', patterns: [/\b(website|portfolio|github|personal site|blog)\b|^url$|\bother (website|url|link)\b/i] },
  { key: 'first_name', canonical: 'first_name', category: 'verified', scope: 'person', input: 'text', ask: 'First name', patterns: [/\b(first|given|preferred first) name\b|\bvorname\b|\bprénom\b/i] },
  { key: 'last_name', canonical: 'last_name', category: 'verified', scope: 'person', input: 'text', ask: 'Last name', patterns: [/\b(last|family) name\b|\bsurname\b|\bnachname\b|\bnom de famille\b/i] },
  { key: 'full_name', canonical: 'full_name', category: 'verified', scope: 'person', input: 'text', ask: 'Full name', patterns: [/^(?:your )?(?:full |legal )?name\b|\bfull name\b|\blegal name\b|^name$/i] },
  { key: 'email', canonical: 'email', category: 'verified', scope: 'person', input: 'text', ask: 'Email', patterns: [/\be-?mail\b/i] },
  { key: 'phone', canonical: 'phone', category: 'verified', scope: 'person', input: 'text', ask: 'Phone', patterns: [/\b(phone|mobile|telephone|telefon|téléphone|cell)\b/i] },
  { key: 'current_company', canonical: 'current_company', category: 'derived', scope: 'person', input: 'text', ask: 'Current company', patterns: [/\b(current|most recent|latest)( or (most recent|latest|previous))? (company|employer|organi[sz]ation)\b|^(company|organi[sz]ation|employer)$/i] },
  { key: 'current_title', canonical: 'current_title', category: 'derived', scope: 'person', input: 'text', ask: 'Current job title', patterns: [/\b(current|most recent|latest)( or (most recent|latest|previous))? (job )?(title|role|position)\b|^(job )?title$/i] },
  { key: 'city', canonical: 'city', category: 'verified', scope: 'person', input: 'text', ask: 'City you live in', patterns: [/\b(city|town|current location|where are you (currently )?(based|located)|location \(city\)|wohnort|ville)\b|^location$/i] },
  { key: 'country', canonical: 'country_of_residence', category: 'verified', scope: 'person', input: 'text', ask: 'Country you live in', patterns: [/\b(country of residence|which country|country)\b|\bland\b|\bpays\b/i] },
  { key: 'education', canonical: 'highest_education', category: 'derived', scope: 'person', input: 'text', ask: 'Highest education', patterns: [/\b(highest (level of )?(education|degree)|degree|education level|level of education|abschluss|diplôme)\b/i] },
  { key: 'languages', canonical: 'languages', category: 'derived', scope: 'person', input: 'text', ask: 'Languages you speak', patterns: [/\b(which )?languages?\b.*\b(speak|fluent|proficien)|\blanguage skills\b|sprachkenntnisse/i] },
  {
    key: 'source', canonical: 'application_source', category: 'verified', scope: 'person', input: 'text', ask: 'How you heard about the job',
    patterns: [/\b(how did you (hear|find|learn)|where did you (hear|find|see)|referral source|source of application|how did you come across|where have you (seen|heard)|heard about us)\b/i],
  },
];

const BY_KEY = new Map(CONCEPTS.map((c) => [c.key, c]));
export const conceptOf = (key: QuestionKey): Concept | undefined => BY_KEY.get(key);

/** Which concept a question is, or null for one MadeVisa doesn't know. */
export function classifyQuestion(label: string): QuestionKey | null {
  const t = label.replace(/\s+/g, ' ').replace(/[*✱:?]+\s*$/, '').replace(/\s*\(required\)\s*$/i, '').trim();
  if (!t) return null;
  // Very long labels are statements (a privacy text with a checkbox), not questions about the person —
  // except consent, which is exactly that.
  for (const c of CONCEPTS) {
    if (t.length > 220 && c.key !== 'consent' && c.key !== 'demographic') continue;
    if (c.patterns.some((re) => re.test(t))) return c.key;
  }
  return null;
}

/** A stable id for a question: its own words, tidied. Two employers asking the identical question get the same id. */
export const questionId = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏЀ-ӿ]+/gi, ' ')
    .trim()
    .split(' ')
    .slice(0, 16)
    .join('-')
    .slice(0, 96);

export const isCountryKey = (k: QuestionKey | null): k is CountryKey => k === 'work_authorization' || k === 'sponsorship';

/**
 * The key one answer is stored and asked under.
 *   sponsorship@DE         a country concept, for jobs in Germany
 *   previously_employed@acme-gmbh
 *   salary_expectation     a concept for every job
 *   custom:why-do-you-want-to-work-here
 */
export function askKey(key: QuestionKey | null, label: string, job: { cc?: string | null; company?: string | null }): string {
  if (!key) return `custom:${questionId(label)}`;
  const c = BY_KEY.get(key);
  if (c?.scope === 'country' && job.cc) return `${key}@${job.cc.toUpperCase()}`;
  if (c?.scope === 'company' && job.company) return `${key}@${questionId(job.company)}`;
  return key;
}

/** The question as MadeVisa asks it once. */
export function askLabel(key: QuestionKey, job: { country?: string | null; company?: string | null }): string {
  const c = BY_KEY.get(key);
  const text = c?.ask ?? key;
  return text.replace('{country}', job.country || 'the country of the job').replace('{company}', job.company || 'this company');
}

// --- Fitting an answer to a form ------------------------------------------------------

const YES = /^(yes|y|true|ja|oui|sí|si)\b/i;
const NO = /^(no|n|false|nein|non)\b/i;
const DECLINE = /\b(decline|prefer not|do not wish|don[’']?t wish|choose not|not (to )?(say|disclose|answer|specify)|rather not|i do not want)/i;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The option that means "I'd rather not say", where a form offers one. */
export const declineOption = (options: string[] | undefined): string | null => options?.find((o) => DECLINE.test(o)) ?? null;

/** A number of years from "3", "3+", "about 4 years". */
const yearsIn = (s: string): number | null => {
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

/** "3-5 years", "5+", "Less than 1 year", "10 or more" → does `n` fall in it? */
function inRange(option: string, n: number): boolean {
  const o = option.toLowerCase();
  const nums = (o.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (!nums.length) return false;
  if (/less than|under|fewer than|<\s*\d/.test(o)) return n < nums[0];
  if (/\+|or more|more than|over|at least|>\s*\d/.test(o) && nums.length === 1) return /more than|over|>/.test(o) ? n > nums[0] : n >= nums[0];
  if (nums.length >= 2) return n >= nums[0] && n <= nums[1];
  return n === nums[0];
}

/**
 * Fit a value to the choices a form offers — only on a clear match.
 * Returns null when no option clearly means the same thing; MadeVisa then
 * asks rather than guesses.
 */
export function fitOption(value: string, options: string[], key: QuestionKey | null = null): string | null {
  const v = value.trim();
  if (!v || !options.length) return null;
  const lower = v.toLowerCase();
  const exact = options.find((o) => o.trim().toLowerCase() === lower) ?? options.find((o) => norm(o) === norm(v));
  if (exact) return exact;
  const yes = YES.test(lower);
  const no = NO.test(lower);
  if (yes || no) {
    const hits = options.filter((o) => (yes ? YES : NO).test(o.trim()));
    return hits.length === 1 ? hits[0] : null;
  }
  if (key === 'years_experience') {
    const n = yearsIn(v);
    if (n != null) {
      const hits = options.filter((o) => inRange(o, n));
      if (hits.length === 1) return hits[0];
    }
    return null;
  }
  if (key === 'education') {
    const level = educationRank(v);
    if (level) {
      const hits = options.filter((o) => educationRank(o) === level);
      if (hits.length === 1) return hits[0];
    }
    return null;
  }
  // Word containment, both ways, only when it singles out one option ("Remote" → "Fully remote").
  const nv = norm(v);
  const hits = options.filter((o) => {
    const no2 = norm(o);
    return no2.length > 2 && nv.length > 2 && (no2.includes(nv) || nv.includes(no2));
  });
  return hits.length === 1 ? hits[0] : null;
}

/** 1 secondary · 2 diploma · 3 bachelor · 4 master · 5 doctorate — the same ladder as the CV reader. */
export function educationRank(s: string): number | null {
  const t = s.toLowerCase();
  if (/\b(ph\.?\s?d|doctor|doctorate|dphil)\b/.test(t)) return 5;
  if (/\b(master|msc|m\.sc|mba|ma\b|m\.a\.|meng|llm)\b/.test(t)) return 4;
  if (/\b(bachelor|bsc|b\.sc|ba\b|b\.a\.|beng|undergraduate|licen[cs]e)\b/.test(t)) return 3;
  if (/\b(diploma|associate|vocational|college)\b/.test(t)) return 2;
  if (/\b(high school|secondary|gcse|a-?level|abitur|baccalaur)\b/.test(t)) return 1;
  return null;
}

/** What a checkbox should be, from a yes/no answer. Null = not a clear yes or no. */
export const checkboxValue = (value: string): boolean | null => (YES.test(value.trim()) ? true : NO.test(value.trim()) ? false : null);

/** Is this a field MadeVisa can fill at all, with this value? Returns the value to put in, or null. */
export function fitAnswer(value: string, q: Pick<Question, 'kind' | 'options'>, key: QuestionKey | null): string | null {
  const v = value.trim();
  if (!v) return null;
  if (q.options?.length) return fitOption(v, q.options, key);
  if (q.kind === 'checkbox' || q.kind === 'yesno') {
    const b = checkboxValue(v);
    return b == null ? null : b ? 'Yes' : 'No';
  }
  if (q.kind === 'number') {
    const n = yearsIn(v);
    return n == null ? null : String(Math.round(n));
  }
  return v;
}
