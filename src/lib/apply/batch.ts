// One batch of applications, planned together.
//
// The person picks 16 jobs and presses "Apply to 16 jobs". Before anything
// is sent, MadeVisa looks at every one of those application forms and works
// out, for every question on every form:
//   • whether it already knows the answer (account, CV, saved answers, or
//     something that follows from them), and where that answer comes from;
//   • otherwise, which *concept* the question is — so that "Will you need
//     sponsorship?" on twelve forms becomes ONE question for the person.
//
// The result (BatchPlan) drives the single "We only need 3 answers" form,
// the "MadeVisa already has 92% of the information" line, and — once the
// person has answered — the exact answers each application is sent with.
//
// Nothing here guesses. A question that no saved answer, account fact, CV
// fact or explicit consent covers is asked, or the one application that
// needs it is marked "Needs attention". Pure functions; no network.

import { askKey, askLabel, checkboxValue, classifyQuestion, conceptOf, declineOption, fitAnswer, isCountryKey, questionId, type InfoCategory, type Input } from '@/lib/apply/concepts';
import { EDU_NAME, type CvProfile } from '@/lib/cv/cvProfile';
import type { Ats } from '@/lib/apply/channels';
import type { ApplyPrefs, ApplyProfile, Question, QuestionKey, SavedAnswer, SponsorState } from '@/lib/apply/types';

/** What is known about one job's application form, before anything is filled in. */
export type FormInfo = {
  platform: Ats | 'email' | string | null;
  /**
   *   ok       the form's questions were read
   *   live     the form can be filled, but its questions are only seen when it is opened
   *   login    the employer requires an account sign-in MadeVisa can't do
   *   none     no application link at all
   *   closed   the job is no longer open
   */
  status: 'ok' | 'live' | 'login' | 'none' | 'closed';
  questions: Question[] | null;
};

export type BatchJob = {
  /** The application's id. */
  id: string;
  title: string;
  company: string;
  cc: string | null;
  country: string | null;
  sponsorship: SponsorState;
  form: FormInfo;
  /** A cover letter will be written for this one. */
  letter: boolean;
};

export type Source = SavedAnswer['source'] | 'madevisa' | 'derived' | 'batch';

export type Resolution =
  | { state: 'known'; value: string; source: Source; category: InfoCategory | null; key: QuestionKey | null }
  /** A file MadeVisa attaches (the tailored CV, the letter). */
  | { state: 'file'; what: 'cv' | 'cover_letter' }
  /** Can be asked once, for every job that needs it. */
  | { state: 'ask'; ask: string; key: QuestionKey | null }
  /** Optional and unknown: left empty on purpose. */
  | { state: 'leave'; why: string }
  /** Required, and nothing MadeVisa may do answers it: that application needs the person. */
  | { state: 'stuck'; why: string; ask?: string };

export type BatchContext = {
  profile: ApplyProfile;
  prefs: ApplyPrefs;
  /** The person saved their preferences at least once (so they aren't just defaults). */
  prefsSaved: boolean;
  cv: CvProfile | null;
  cvText: string | null;
  /** Answers given in the consolidated form, by ask key. */
  given: Record<string, string>;
};

const RELOCATE_TEXT = { yes: 'Yes', no: 'No' };

/** A name with the legal-form words removed, for "have you worked here before?". */
const companyCore = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\b(gmbh|ag|inc|llc|ltd|limited|plc|bv|b\.v\.|sa|s\.a\.|sas|srl|spa|oy|ab|as|aps|co|corp|corporation|company|group|holding|holdings)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** What the account, the CV and the person's saved answers say, for one concept and one job. Null = nothing. */
function knownFor(key: QuestionKey, job: Pick<BatchJob, 'cc' | 'company' | 'sponsorship'>, ctx: BatchContext): { value: string; source: Source } | null {
  const { profile, prefs, cv } = ctx;
  const saved = (k: QuestionKey) => {
    const a = profile.answers[k];
    return a && !a.askEachTime && a.value.trim() ? { value: a.value.trim(), source: a.source as Source } : null;
  };

  if (isCountryKey(key)) {
    const cc = job.cc?.toUpperCase() ?? '';
    const byCountry = cc ? profile.byCountry?.[cc]?.[key] : undefined;
    if (byCountry && !byCountry.askEachTime && byCountry.value.trim()) return { value: byCountry.value.trim(), source: byCountry.source };
    if (profile.answers[key]?.askEachTime) return null;
    // Follows from the person's nationality and where they live (the same reading the match uses).
    if (job.sponsorship === 'not_needed') return { value: key === 'sponsorship' ? 'No' : 'Yes', source: 'derived' };
    if (prefs.sponsorship === 'need' && ctx.prefsSaved) return { value: key === 'sponsorship' ? 'Yes' : 'No', source: 'you' };
    // An answer saved before country answers existed applies only to jobs abroad.
    const old = saved(key);
    if (old && job.sponsorship !== 'unclear') return old;
    return null;
  }

  const s = saved(key);
  if (s) return s;
  if (profile.answers[key]?.askEachTime) return null;

  const full = saved('full_name');
  switch (key) {
    case 'first_name':
      return full ? { value: full.value.split(/\s+/)[0], source: full.source } : null;
    case 'last_name': {
      const parts = full?.value.split(/\s+/) ?? [];
      // A one-word name has no family name to give.
      return parts.length >= 2 ? { value: parts.slice(1).join(' '), source: full!.source } : null;
    }
    case 'full_name': {
      const f = saved('first_name');
      const l = saved('last_name');
      return f && l ? { value: `${f.value} ${l.value}`, source: f.source } : null;
    }
    case 'current_title':
      return cv?.titles[0] ? { value: cv.titles[0], source: 'cv' } : null;
    case 'languages':
      return cv?.languages.length ? { value: cv.languages.map((l) => l.name).join(', '), source: 'cv' } : null;
    case 'years_experience':
      return cv?.years != null && cv.years > 0 ? { value: String(Math.floor(cv.years)), source: 'cv' } : null;
    case 'education':
      return cv && cv.education > 0 ? { value: EDU_NAME[cv.education].replace(/^an? /, '').replace(/^\w/, (c) => c.toUpperCase()), source: 'cv' } : null;
    case 'previously_employed': {
      const core = companyCore(job.company);
      if (!ctx.cvText || core.length < 3) return null;
      // Only "No" can be read from a CV: the company isn't anywhere on it. If it is, the person says.
      return companyCore(ctx.cvText).includes(core) ? null : { value: 'No', source: 'cv' };
    }
    case 'relocation':
      return ctx.prefsSaved ? { value: prefs.relocate ? RELOCATE_TEXT.yes : RELOCATE_TEXT.no, source: 'you' } : null;
    case 'remote_preference':
      return ctx.prefsSaved && prefs.arrangements.length === 1 ? { value: { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }[prefs.arrangements[0]], source: 'you' } : null;
    case 'source':
      return { value: 'MadeVisa', source: 'madevisa' };
    default:
      return null;
  }
}

/**
 * One question on one job's form → what MadeVisa does with it.
 * Used both to plan the batch and to build the exact answers it is sent with.
 */
export function resolveQuestion(q: Question, job: Pick<BatchJob, 'cc' | 'country' | 'company' | 'sponsorship' | 'letter'>, ctx: BatchContext): Resolution {
  if (q.kind === 'file') {
    const what = q.file ?? (/cover|letter|anschreiben|motivation/i.test(q.label) ? 'cover_letter' : /resume|cv\b|curriculum|lebenslauf/i.test(q.label) ? 'cv' : 'other');
    if (what === 'cv') return { state: 'file', what: 'cv' };
    if (what === 'cover_letter') return job.letter || q.required ? { state: 'file', what: 'cover_letter' } : { state: 'leave', why: 'Optional cover letter' };
    return q.required ? { state: 'stuck', why: `The employer asks for a document MadeVisa doesn’t have: “${q.label}”.` } : { state: 'leave', why: 'Optional document' };
  }

  const key = classifyQuestion(q.label);
  const concept = key ? conceptOf(key) : undefined;
  const category = concept?.category ?? null;
  const ak = askKey(key, q.label, job);
  const fit = (value: string, source: Source): Resolution => {
    const v = fitAnswer(value, q, key);
    if (v != null) return { state: 'known', value: v, source, category, key };
    // Known, but the form's choices don't clearly include it: this employer's version needs the person.
    return q.required ? { state: 'stuck', why: `Your answer “${value}” doesn’t match the choices on this form.`, ask: `${ak}#${questionId(q.label)}` } : { state: 'leave', why: 'No matching choice' };
  };

  // An answer given in this batch's form — for this exact form question, or for its concept.
  const exact = ctx.given[`${ak}#${questionId(q.label)}`]?.trim();
  if (exact) return fit(exact, 'batch');

  // Voluntary self-identification: never answered. "I'd rather not say" is picked where a required one offers it.
  if (key === 'demographic') {
    const decline = declineOption(q.options);
    if (decline && q.required) return { state: 'known', value: decline, source: 'madevisa', category, key };
    return q.required ? { state: 'stuck', why: `“${q.label}” is a personal question MadeVisa never answers for you.` } : { state: 'leave', why: 'Voluntary question' };
  }

  // Consent: only the ones an application requires, and only with the person's yes for this batch.
  if (key === 'consent') {
    if (!q.required) return { state: 'leave', why: 'Optional consent — never ticked for you' };
    const yes = ctx.given.consent?.trim();
    if (!yes) return { state: 'ask', ask: 'consent', key };
    return checkboxValue(yes) ? fit('Yes', 'batch') : { state: 'stuck', why: 'You chose not to let MadeVisa accept this employer’s privacy notice.' };
  }

  const batch = ctx.given[ak]?.trim();
  if (batch) return fit(batch, 'batch');

  if (key && ctx.prefs.alwaysAsk.includes(key)) return q.required || isCountryKey(key) ? { state: 'ask', ask: ak, key } : { state: 'leave', why: 'You answer this one yourself' };

  if (key) {
    const k = knownFor(key, job, ctx);
    if (k) return fit(k.value, k.source);
    // Something the person can answer once for every job that asks.
    if (q.required) return concept ? { state: 'ask', ask: ak, key } : { state: 'stuck', why: 'MadeVisa can’t safely answer this question for you.' };
    // Optional, and nothing known: worth asking only when it's a preference that many forms use.
    return concept?.category === 'preference' && concept.scope !== 'company' ? { state: 'ask', ask: ak, key } : { state: 'leave', why: 'Optional' };
  }

  // A question MadeVisa doesn't know: a saved answer to these exact words, or the person.
  const custom = ctx.profile.custom[questionId(q.label)];
  if (custom && !custom.askEachTime && custom.value.trim()) return fit(custom.value, custom.source);
  return q.required ? { state: 'ask', ask: ak, key: null } : { state: 'leave', why: 'Optional question' };
}

// --- The batch ---------------------------------------------------------------------------

/** One question in the consolidated form. */
export type AskItem = {
  /** What the answer is stored under (see askKey). */
  key: string;
  concept: QuestionKey | null;
  label: string;
  hint?: string;
  input: Input;
  options?: string[];
  /** Applications this answer completes. */
  jobs: string[];
  /** The companies, for "Only for Acme". */
  companies: string[];
  /** Saved for next time (a concept), or used for this batch only (a one-off question, consent). */
  remember: boolean;
};

export type JobOutcome = 'apply' | 'attention' | 'blocked';
export type JobPlan = {
  id: string;
  title: string;
  company: string;
  outcome: JobOutcome;
  /** Plain words, for anything that isn't 'apply'. */
  reason: string | null;
  reasonCode: string | null;
  /** Ask keys this application waits on. */
  waits: string[];
  /** Fields that need a value, and how many MadeVisa has without asking. */
  fields: number;
  known: number;
};

export type Reused = { label: string; value: string; source: Source; jobs: number };

export type BatchPlan = {
  jobs: JobPlan[];
  /** The consolidated form: concepts several applications need (or that are saved for every future application). */
  ask: AskItem[];
  /** Questions only one application asks, which MadeVisa can't answer: optional to answer now. */
  extra: AskItem[];
  coverage: { fields: number; known: number; pct: number };
  /** What MadeVisa will reuse, with where it came from. */
  reused: Reused[];
  /** How many applications will go once the questions in `ask` are answered. */
  ready: number;
};

/** The fields every application needs, when a form's own list can't be read until it is opened. */
export function assumedQuestions(job: Pick<BatchJob, 'sponsorship'> & { form?: Pick<FormInfo, 'status'> }): Question[] {
  const qs: Question[] = [
    { id: 'basic:first_name', label: 'First name', required: true, kind: 'text' },
    { id: 'basic:last_name', label: 'Last name', required: true, kind: 'text' },
    { id: 'basic:email', label: 'Email', required: true, kind: 'text' },
    { id: 'basic:phone', label: 'Phone', required: true, kind: 'text' },
    { id: 'basic:resume', label: 'Resume/CV', required: true, kind: 'file', file: 'cv' },
  ];
  // A job in another country nearly always asks; better to know before the form does.
  if (job.sponsorship !== 'not_needed') {
    qs.push({ id: 'basic:work_authorization', label: 'Are you legally authorized to work in this country?', required: true, kind: 'yesno' });
    qs.push({ id: 'basic:sponsorship', label: 'Will you require visa sponsorship?', required: true, kind: 'yesno' });
  }
  // A form only seen when it is opened very often has a required privacy notice: better to ask once now
  // than to stop that application later.
  if (job.form?.status === 'live') qs.push({ id: 'basic:consent', label: 'I agree to the employer’s privacy notice', required: true, kind: 'checkbox' });
  return qs;
}

const LOGIN_TEXT = 'This employer requires an account login that MadeVisa cannot complete automatically.';
const OUTCOME_TEXT: Record<Exclude<FormInfo['status'], 'ok' | 'live'>, [string, string]> = {
  login: [LOGIN_TEXT, 'login_required'],
  none: ['This job has no online application form MadeVisa can reach.', 'no_form'],
  closed: ['The job is no longer open.', 'closed'],
};

/** The plain wording for an ask key, with the input it needs. */
function askItemFor(key: string, concept: QuestionKey | null, q: Question, job: BatchJob): Omit<AskItem, 'jobs' | 'companies'> {
  if (!concept) {
    // A one-off question: asked in the employer's own words, with its own choices.
    const input: Input = q.options?.length ? 'choice' : q.kind === 'long' ? 'long' : q.kind === 'yesno' || q.kind === 'checkbox' ? 'yesno' : q.kind === 'number' ? 'number' : 'text';
    return { key, concept: null, label: q.label.replace(/\s*[*✱]\s*$/, ''), input, options: q.options, remember: true };
  }
  const c = conceptOf(concept)!;
  if (key.includes('#')) {
    // This employer's own choices for a concept MadeVisa knows.
    return { key, concept, label: q.label.replace(/\s*[*✱]\s*$/, ''), input: 'choice', options: q.options, remember: false };
  }
  return {
    key,
    concept,
    label: askLabel(concept, job),
    hint: c.hint,
    input: c.input,
    options: c.input === 'yesno' ? ['Yes', 'No'] : c.choices,
    remember: concept !== 'consent',
  };
}

export function planBatch(jobs: BatchJob[], ctx: BatchContext): BatchPlan {
  const asks = new Map<string, AskItem>();
  const reused = new Map<string, Reused>();
  const out: JobPlan[] = [];
  let fields = 0;
  let known = 0;

  for (const job of jobs) {
    const st = job.form.status;
    if (st === 'login' || st === 'none' || st === 'closed') {
      const [reason, code] = OUTCOME_TEXT[st];
      out.push({ id: job.id, title: job.title, company: job.company, outcome: 'blocked', reason, reasonCode: code, waits: [], fields: 0, known: 0 });
      continue;
    }
    const questions = job.form.questions?.length ? job.form.questions : assumedQuestions(job);
    const waits = new Set<string>();
    let stuck: string | null = null;
    let jf = 0;
    let jk = 0;
    for (const q of questions) {
      const r = resolveQuestion(q, job, ctx);
      if (r.state === 'leave') continue;
      jf += 1;
      if (r.state === 'known' || r.state === 'file') {
        jk += 1;
        if (r.state === 'known' && r.key) {
          const label = conceptOf(r.key)?.ask ?? q.label;
          const k = `${r.key}=${r.value}`;
          const prev = reused.get(k);
          if (prev) prev.jobs += 1;
          else reused.set(k, { label: label.replace('{country}', job.country ?? 'the job’s country').replace('{company}', job.company), value: r.value, source: r.source, jobs: 1 });
        }
        continue;
      }
      if (r.state === 'stuck' && !r.ask) {
        stuck ??= r.why;
        continue;
      }
      const ak = r.state === 'ask' ? r.ask : r.ask!;
      waits.add(ak);
      const item = asks.get(ak);
      if (item) {
        if (!item.jobs.includes(job.id)) item.jobs.push(job.id);
        if (!item.companies.includes(job.company)) item.companies.push(job.company);
      } else {
        asks.set(ak, { ...askItemFor(ak, r.state === 'ask' ? r.key : classifyQuestion(q.label), q, job), jobs: [job.id], companies: [job.company] });
      }
    }
    fields += jf;
    known += jk;
    out.push({
      id: job.id,
      title: job.title,
      company: job.company,
      outcome: stuck ? 'attention' : 'apply',
      reason: stuck,
      reasonCode: stuck ? 'question' : null,
      waits: [...waits],
      fields: jf,
      known: jk,
    });
  }

  // Concepts go in the one form (they're saved and reused for every future application too);
  // a question in an employer's own words goes there only when more than one application asks it.
  const all = [...asks.values()].sort((a, b) => b.jobs.length - a.jobs.length || (a.concept ? 0 : 1) - (b.concept ? 0 : 1));
  const ask = all.filter((a) => (a.concept && !a.key.includes('#')) || a.jobs.length > 1);
  const extra = all.filter((a) => !ask.includes(a));
  const askSet = new Set(ask.map((a) => a.key));
  const ready = out.filter((j) => j.outcome === 'apply' && j.waits.every((w) => askSet.has(w))).length;
  return {
    jobs: out,
    ask,
    extra,
    // Never claim 100% while anything is missing.
    coverage: { fields, known, pct: fields ? Math.min(known < fields ? 99 : 100, Math.floor((100 * known) / fields)) : 100 },
    reused: [...reused.values()].sort((a, b) => b.jobs - a.jobs),
    ready,
  };
}

/** After the form: which applications can go, and which still wait on something. */
export function readyAfter(plan: BatchPlan, given: Record<string, string>): { go: string[]; wait: { id: string; missing: string[] }[] } {
  const go: string[] = [];
  const wait: { id: string; missing: string[] }[] = [];
  for (const j of plan.jobs) {
    if (j.outcome !== 'apply') continue;
    const missing = j.waits.filter((w) => !given[w]?.trim());
    if (missing.length) wait.push({ id: j.id, missing });
    else go.push(j.id);
  }
  return { go, wait };
}

/**
 * Save what the person answered in the batch form, so the same concept is never asked again
 * (unless they want it to be). Country answers are kept per country; one-off questions by their words.
 */
export function rememberBatch(profile: ApplyProfile, items: AskItem[], given: Record<string, string>, now = new Date().toISOString()): ApplyProfile {
  const next: ApplyProfile = { answers: { ...profile.answers }, custom: { ...profile.custom }, byCountry: { ...(profile.byCountry ?? {}) } };
  for (const item of items) {
    const value = given[item.key]?.trim();
    if (!value || !item.remember || item.key.includes('#')) continue;
    const answer: SavedAnswer = { value, askEachTime: false, source: 'you', question: item.label, updatedAt: now };
    const [base, scope] = item.key.split('@');
    if (item.concept && isCountryKey(item.concept) && scope) {
      next.byCountry![scope] = { ...(next.byCountry![scope] ?? {}), [item.concept]: answer };
    } else if (item.concept && conceptOf(item.concept)?.scope === 'company') {
      continue; // About one company: used for this batch only.
    } else if (item.concept) {
      // "Ask me each time" stays as it was: the value is used for this batch, the next one asks again.
      const prev = next.answers[item.concept];
      next.answers[item.concept] = { ...answer, askEachTime: Boolean(prev?.askEachTime) };
    } else if (base.startsWith('custom:')) {
      next.custom[base.slice(7)] = answer;
    }
  }
  return next;
}

/** The exact answers one application is sent with: every question on its form that has a value. */
export function answersFor(job: BatchJob, ctx: BatchContext): { id: string; label: string; value: string; source: string; key: string | null }[] {
  const questions = job.form.questions?.length ? job.form.questions : assumedQuestions(job);
  const out: { id: string; label: string; value: string; source: string; key: string | null }[] = [];
  for (const q of questions) {
    const r = resolveQuestion(q, job, ctx);
    if (r.state === 'known') out.push({ id: q.id, label: q.label, value: r.value, source: r.source === 'batch' ? 'you' : r.source, key: r.key });
  }
  return out;
}

/**
 * The person's answers by concept, for this one job — what the worker falls back on when the live form
 * asks something its published question list didn't show. Only what is known; nothing else.
 */
export function conceptAnswers(job: Pick<BatchJob, 'cc' | 'country' | 'company' | 'sponsorship' | 'letter'>, ctx: BatchContext): Record<string, string> {
  const out: Record<string, string> = {};
  const keys: QuestionKey[] = ['full_name', 'first_name', 'last_name', 'email', 'phone', 'city', 'country', 'linkedin', 'website', 'work_authorization', 'sponsorship', 'salary_expectation', 'notice_period', 'availability', 'relocation', 'years_experience', 'education', 'languages', 'current_title', 'current_company', 'remote_preference', 'onsite_ok', 'travel', 'over_18', 'previously_employed', 'source'];
  for (const key of keys) {
    if (ctx.prefs.alwaysAsk.includes(key) && !ctx.given[askKey(key, '', job)]) continue;
    const given = ctx.given[askKey(key, '', job)]?.trim();
    const k = given ? { value: given } : knownFor(key, job, ctx);
    if (k?.value) out[key] = k.value;
  }
  if (ctx.given.consent && checkboxValue(ctx.given.consent)) out.consent = 'Yes';
  return out;
}
