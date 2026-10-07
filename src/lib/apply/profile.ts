// The verified application profile: the answers MadeVisa may give on a
// person's behalf — and the rule for when it may not.
//
// An application question is answered only from
//   • an answer the person saved (and didn't mark "ask me each time"),
//   • a fact on their account (name, email, phone, LinkedIn), or
//   • a fact read straight from their CV (email, phone, LinkedIn link).
// Everything else — and anything the person told us to always ask about —
// comes back as "needs your answer". A question is never answered by
// guessing, and demographic questions are never answered at all.

import type { CvProfile } from '@/lib/cv/cvProfile';
import type { Answered, ApplyPrefs, ApplyProfile, Needed, Question, QuestionKey, SavedAnswer } from '@/lib/apply/types';

export const QUESTION_LABEL: Record<QuestionKey, string> = {
  full_name: 'Full name',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  city: 'City you live in',
  country: 'Country you live in',
  linkedin: 'LinkedIn profile',
  website: 'Website or portfolio',
  work_authorization: 'Are you legally allowed to work in the country of the job?',
  sponsorship: 'Will you need visa sponsorship?',
  salary_expectation: 'Salary expectation',
  notice_period: 'Notice period',
  availability: 'When you can start',
  relocation: 'Are you willing to relocate?',
  years_experience: 'Years of relevant experience',
  education: 'Highest education',
  languages: 'Languages you speak',
  current_title: 'Current job title',
  source: 'How you heard about the job',
  consent: 'Consent to the employer’s privacy notice',
  demographic: 'Voluntary self-identification',
};

/** The details the profile screen asks for once. */
export const PROFILE_FIELDS: { key: QuestionKey; hint: string; kind: 'text' | 'yesno' }[] = [
  { key: 'full_name', hint: 'As on your CV', kind: 'text' },
  { key: 'email', hint: 'Where employers reply', kind: 'text' },
  { key: 'phone', hint: 'With country code', kind: 'text' },
  { key: 'city', hint: 'For example Baku', kind: 'text' },
  { key: 'country', hint: 'For example Azerbaijan', kind: 'text' },
  { key: 'linkedin', hint: 'linkedin.com/in/…', kind: 'text' },
  { key: 'sponsorship', hint: 'For jobs abroad. If it depends on the country, tick “Ask me each time”.', kind: 'yesno' },
  { key: 'relocation', hint: '', kind: 'yesno' },
  { key: 'notice_period', hint: 'For example 1 month, or Available now', kind: 'text' },
  { key: 'availability', hint: 'For example From 1 December', kind: 'text' },
  { key: 'salary_expectation', hint: 'For example €60,000 a year, or Negotiable', kind: 'text' },
  { key: 'years_experience', hint: 'A number, as you would write it on a form', kind: 'text' },
  { key: 'education', hint: 'For example BSc in Statistics', kind: 'text' },
];

/** What every application needs before it can go anywhere. */
export const BASIC_KEYS: QuestionKey[] = ['full_name', 'email', 'phone'];

// --- Recognising a question -------------------------------------------------------

const RULES: [QuestionKey, RegExp][] = [
  // Order matters: the most specific first.
  ['demographic', /\b(gender|sex\b|pronoun|race|ethnic|hispanic|latino|veteran|disab|sexual orientation|lgbt|date of birth|birth ?date|marital|religio|nationality at birth|age\b)/i],
  ['consent', /\b(consent|privacy (policy|notice|statement)|data protection|gdpr|i agree|i acknowledge|terms (and|&) conditions|datenschutz)/i],
  ['sponsorship', /\b(sponsor|sponsorship|visa support|work visa|h-?1b|skilled worker visa|blue card)\b/i],
  ['work_authorization', /\b(authori[sz]ed to work|legally (allowed|permitted|able|entitled|eligible) to work|right to work|work (permit|authori[sz]ation)|eligible to work|arbeitserlaubnis|permission to work)\b/i],
  ['salary_expectation', /\b(salary|compensation|pay|remuneration|gehalt|rémunération|salarial)\b.*\b(expect|desired|requirement|range|wish|vorstellung|souhait)|\b(expected|desired)\b.*\b(salary|compensation|pay)\b|gehaltsvorstellung|prétentions salariales/i],
  ['notice_period', /\bnotice period\b|kündigungsfrist|préavis/i],
  ['availability', /\b(start date|earliest (possible )?start|when (can|could) you start|available to start|availability|eintrittstermin|date de disponibilité)\b/i],
  ['relocation', /\b(relocat|willing to move|open to moving|umzug)\b/i],
  ['years_experience', /\b(how many )?years? of (relevant |professional |work(ing)? )?experience\b|\bjahre berufserfahrung\b/i],
  ['linkedin', /\blinked ?in\b/i],
  ['website', /\b(website|portfolio|github|personal site|url)\b/i],
  ['first_name', /\b(first|given) name\b|\bvorname\b|\bprénom\b/i],
  ['last_name', /\b(last|family) name\b|\bsurname\b|\bnachname\b|\bnom de famille\b/i],
  ['full_name', /^(?:your )?(?:full |legal )?name\b|\bfull name\b|\blegal name\b/i],
  ['email', /\be-?mail\b/i],
  ['phone', /\b(phone|mobile|telephone|telefon|téléphone|cell)\b/i],
  ['city', /\b(city|town|current location|where are you (based|located)|location \(city\)|wohnort|ville)\b/i],
  ['country', /\bcountry\b|\bland\b|\bpays\b/i],
  ['education', /\b(highest (level of )?education|degree|education level|abschluss|diplôme)\b/i],
  ['languages', /\b(which )?languages?\b.*\b(speak|fluent|proficien)|\blanguage skills\b|sprachkenntnisse/i],
  ['current_title', /\bcurrent (job )?title\b|\bcurrent (role|position)\b/i],
  ['source', /\b(how did you (hear|find|learn)|where did you (hear|find|see)|referral source|source of application)\b/i],
];

/** Which standard question this is, or null for one we don't know. */
export function classifyQuestion(label: string): QuestionKey | null {
  const t = label.replace(/\s+/g, ' ').replace(/[*:?]+\s*$/, '').trim();
  if (!t) return null;
  for (const [key, re] of RULES) if (re.test(t)) return key;
  return null;
}

/** A stable id for a question we don't recognise: its own words, tidied. */
export const questionId = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏЀ-ӿ]+/gi, ' ')
    .trim()
    .split(' ')
    .slice(0, 16)
    .join('-')
    .slice(0, 96);

// --- Facts we may use ---------------------------------------------------------------

export type Account = { fullName?: string | null; email?: string | null; phone?: string | null; linkedin?: string | null };

/** Contact details printed on the CV itself. */
export function cvContacts(cvText: string): { email: string | null; phone: string | null; linkedin: string | null } {
  const head = cvText.slice(0, 2500);
  const email = head.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/)?.[0] ?? null;
  const phone = head.match(/(?:\+|00)\d[\d\s().-]{7,}\d/)?.[0]?.replace(/\s+/g, ' ').trim() ?? null;
  const li = cvText.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?/i)?.[0] ?? null;
  return { email, phone, linkedin: li ? (li.startsWith('http') ? li : `https://${li}`) : null };
}

/**
 * The profile as it stands before the person has typed anything: only facts
 * from their account and the contact details printed on their CV. Used to
 * pre-fill the profile screen — the person confirms it there.
 */
export function suggestProfile(account: Account | null, cvText: string | null): ApplyProfile['answers'] {
  const out: ApplyProfile['answers'] = {};
  const put = (key: QuestionKey, value: string | null | undefined, source: SavedAnswer['source']) => {
    const v = (value ?? '').trim();
    if (v && !out[key]) out[key] = { value: v, askEachTime: false, source };
  };
  put('full_name', account?.fullName, 'account');
  put('email', account?.email, 'account');
  put('phone', account?.phone, 'account');
  put('linkedin', account?.linkedin, 'account');
  if (cvText) {
    const c = cvContacts(cvText);
    put('email', c.email, 'cv');
    put('phone', c.phone, 'cv');
    put('linkedin', c.linkedin, 'cv');
  }
  return out;
}

/** Saved answers on top of what the account and CV give. Saved always wins. */
export function mergeProfile(saved: ApplyProfile, suggested: ApplyProfile['answers']): ApplyProfile {
  return { answers: { ...suggested, ...saved.answers }, custom: saved.custom };
}

/** Share of the basics that are there (0–1). */
export function completeness(p: ApplyProfile): number {
  return BASIC_KEYS.filter((k) => p.answers[k]?.value.trim()).length / BASIC_KEYS.length;
}
/** Share of saved answers the person typed or confirmed themselves (0–1), or null with none saved. */
export function confidence(p: ApplyProfile): number | null {
  const all = [...Object.values(p.answers), ...Object.values(p.custom)].filter((a): a is SavedAnswer => Boolean(a?.value));
  return all.length ? all.filter((a) => a.source === 'you').length / all.length : null;
}

// --- Answering -------------------------------------------------------------------

const YES = /^(yes|y|true|ja|oui|sí|si)\b/i;
const NO = /^(no|n|false|nein|non)\b/i;

/** Fit a saved answer to the choices a form offers — only on a clear match. */
function pickOption(value: string, options: string[]): string | null {
  const v = value.trim().toLowerCase();
  const exact = options.find((o) => o.trim().toLowerCase() === v);
  if (exact) return exact;
  const yes = YES.test(v);
  const no = NO.test(v);
  if (yes || no) {
    const hits = options.filter((o) => (yes ? YES : NO).test(o.trim()));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

function derived(key: QuestionKey, p: ApplyProfile, cv: CvProfile | null): { value: string; source: SavedAnswer['source'] } | null {
  const full = p.answers.full_name;
  if (full?.value && !full.askEachTime) {
    const parts = full.value.trim().split(/\s+/);
    if (key === 'first_name' && parts.length >= 1) return { value: parts[0], source: full.source };
    // A one-word name has no family name to give: ask.
    if (key === 'last_name' && parts.length >= 2) return { value: parts.slice(1).join(' '), source: full.source };
  }
  // Read from the CV's own section headings and titles — facts, not estimates.
  if (key === 'current_title' && cv?.titles[0]) return { value: cv.titles[0], source: 'cv' };
  if (key === 'languages' && cv?.languages.length) return { value: cv.languages.map((l) => l.name).join(', '), source: 'cv' };
  return null;
}

export type AnswerSet = { answered: Answered[]; needs: Needed[]; left: string[] };

/**
 * Answer a form's questions from the verified profile.
 *   answered  filled in, with where each answer came from
 *   needs     required questions only the person can answer
 *   left      optional questions left empty on purpose
 */
export function answerQuestions(
  questions: Question[],
  profile: ApplyProfile,
  prefs: Pick<ApplyPrefs, 'alwaysAsk'>,
  cv: CvProfile | null = null,
  /** Answers the person gave for this one application (question id → value). They always win. */
  given: Record<string, string> = {},
): AnswerSet {
  const out: AnswerSet = { answered: [], needs: [], left: [] };
  for (const q of questions) {
    // A file is the CV or the letter: attached by the channel, not answered here.
    if (q.kind === 'file') continue;
    const key = classifyQuestion(q.label);
    const need = (why: string) => {
      if (q.required) out.needs.push({ id: q.id, label: q.label, key, kind: q.kind, options: q.options, why });
      else out.left.push(q.label);
    };

    const once = given[q.id]?.trim();
    if (once) {
      out.answered.push({ id: q.id, label: q.label, value: once, source: 'you', key });
      continue;
    }
    // Never answered for anyone.
    if (key === 'demographic') {
      out.left.push(q.label);
      continue;
    }
    if (key === 'source') {
      const value = q.options ? q.options.find((o) => /madevisa/i.test(o)) ?? q.options.find((o) => /job board|website|online|other/i.test(o)) ?? null : 'MadeVisa';
      if (value) out.answered.push({ id: q.id, label: q.label, value, source: 'madevisa', key });
      else need('Pick how you heard about this job.');
      continue;
    }
    if (key && prefs.alwaysAsk.includes(key)) {
      need('You asked to answer this one yourself each time.');
      continue;
    }

    const saved = key ? profile.answers[key] : profile.custom[questionId(q.label)];
    if (saved?.askEachTime) {
      need('You asked to answer this one yourself each time.');
      continue;
    }
    const fact = saved?.value.trim() ? { value: saved.value.trim(), source: saved.source } : key ? derived(key, profile, cv) : null;
    if (!fact) {
      need(key ? 'You haven’t saved an answer to this yet.' : 'This is a question MadeVisa can’t safely answer for you.');
      continue;
    }
    if (q.options?.length) {
      const picked = pickOption(fact.value, q.options);
      if (!picked) {
        need('Your saved answer doesn’t match any of the choices on this form.');
        continue;
      }
      out.answered.push({ id: q.id, label: q.label, value: picked, source: fact.source, key });
      continue;
    }
    out.answered.push({ id: q.id, label: q.label, value: fact.value, source: fact.source, key });
  }
  return out;
}

/** The questions every application carries, whatever the form: who you are and how to reach you. */
export function basicQuestions(abroad: boolean): Question[] {
  const qs: Question[] = [
    { id: 'basic:full_name', label: QUESTION_LABEL.full_name, required: true, kind: 'text' },
    { id: 'basic:email', label: QUESTION_LABEL.email, required: true, kind: 'text' },
    { id: 'basic:phone', label: QUESTION_LABEL.phone, required: true, kind: 'text' },
    { id: 'basic:linkedin', label: QUESTION_LABEL.linkedin, required: false, kind: 'text' },
  ];
  // A job in another country always asks this; better to know before the form does.
  if (abroad) qs.push({ id: 'basic:sponsorship', label: QUESTION_LABEL.sponsorship, required: true, kind: 'text' });
  return qs;
}

/** Save what the person just answered, so the same question is never asked twice (unless they want it to be). */
export function remember(profile: ApplyProfile, n: Pick<Needed, 'label' | 'key'>, value: string, askEachTime: boolean): ApplyProfile {
  const answer: SavedAnswer = { value: value.trim(), askEachTime, source: 'you', question: n.label, updatedAt: new Date().toISOString() };
  if (n.key && n.key !== 'demographic') return { ...profile, answers: { ...profile.answers, [n.key]: answer } };
  return { ...profile, custom: { ...profile.custom, [questionId(n.label)]: answer } };
}
