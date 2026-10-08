import { describe, expect, it } from 'vitest';
import { askKey, classifyQuestion, declineOption, fitAnswer, fitOption } from '@/lib/apply/concepts';
import { answersFor, conceptAnswers, planBatch, readyAfter, rememberBatch, resolveQuestion, type BatchContext, type BatchJob } from '@/lib/apply/batch';
import type { Question } from '@/lib/apply/types';
import { CV_TEXT, cv, prefs, profile } from './fixtures';

const q = (label: string, over: Partial<Question> = {}): Question => ({ id: label, label, required: true, kind: 'text', ...over });
const ctx = (over: Partial<BatchContext> = {}): BatchContext => ({ profile: profile(), prefs: prefs({ alwaysAsk: [] }), prefsSaved: false, cv, cvText: CV_TEXT, given: {}, ...over });
const job = (id: string, questions: Question[] | null, over: Partial<BatchJob> = {}): BatchJob => ({
  id,
  title: `Data Analyst ${id}`,
  company: `Company ${id}`,
  cc: 'US',
  country: 'United States',
  sponsorship: 'unclear',
  letter: false,
  form: { platform: 'greenhouse', status: 'ok', questions },
  ...over,
});
const basics = [q('First Name'), q('Last Name'), q('Email'), q('Phone'), q('Resume/CV', { kind: 'file' })];

describe('question normalization', () => {
  it('maps different wordings of one question to one concept', () => {
    for (const label of ['Will you now or in the future require sponsorship?', 'Will you need visa sponsorship?', 'Do you require employer sponsorship?', 'Will you require H-1B visa sponsorship to work for us?']) {
      expect(classifyQuestion(label)).toBe('sponsorship');
    }
    for (const label of ['Are you willing to relocate?', 'Would you relocate for this role?', 'Are you open to relocation?']) {
      expect(classifyQuestion(label)).toBe('relocation');
    }
    expect(classifyQuestion('Are you legally authorized to work in the United States?')).toBe('work_authorization');
    expect(classifyQuestion('Do you have the right to work in the UK?')).toBe('work_authorization');
    expect(classifyQuestion('What is your desired salary?')).toBe('salary_expectation');
    expect(classifyQuestion('Earliest start date')).toBe('availability');
    expect(classifyQuestion('How many years of professional experience do you have?')).toBe('years_experience');
    expect(classifyQuestion('Are you willing to travel up to 25%?')).toBe('travel');
    expect(classifyQuestion('Are you able to work on-site in our Berlin office 3 days a week?')).toBe('onsite_ok');
    expect(classifyQuestion('Are you 18 years of age or older?')).toBe('over_18');
    expect(classifyQuestion('Are you over the age of 18?')).toBe('over_18');
    expect(classifyQuestion('Have you previously worked for Stripe?')).toBe('previously_employed');
  });

  it('keeps sensitive and unknown questions apart', () => {
    expect(classifyQuestion('Gender')).toBe('demographic');
    expect(classifyQuestion('Are you a protected veteran?')).toBe('demographic');
    expect(classifyQuestion('I have read and agree to the Candidate Privacy Notice')).toBe('consent');
    expect(classifyQuestion('Why do you want to work at Acme?')).toBeNull();
  });

  it('asks country questions per country, and company questions per company', () => {
    expect(askKey('sponsorship', '', { cc: 'de' })).toBe('sponsorship@DE');
    expect(askKey('salary_expectation', '', { cc: 'DE' })).toBe('salary_expectation');
    expect(askKey('previously_employed', '', { company: 'Acme GmbH' })).toBe('previously_employed@acme-gmbh');
    expect(askKey(null, 'Why us?', {})).toBe('custom:why-us');
  });

  it('fits answers to a form’s choices only on a clear match', () => {
    expect(fitOption('Yes', ['Yes', 'No'])).toBe('Yes');
    expect(fitOption('Yes', ['Yes, now', 'Yes, in the future', 'No'])).toBeNull();
    expect(fitOption('6', ['0-2 years', '3-5 years', '6-9 years', '10+ years'], 'years_experience')).toBe('6-9 years');
    expect(fitOption('12', ['Less than 1 year', '1-4', '5 or more'], 'years_experience')).toBe('5 or more');
    expect(fitOption('Bachelor’s degree', ['High school', 'Bachelor', 'Master', 'PhD'], 'education')).toBe('Bachelor');
    expect(fitOption('Remote', ['Fully remote', 'Hybrid', 'On-site'])).toBe('Fully remote');
    expect(declineOption(['Male', 'Female', 'I don’t wish to answer'])).toBe('I don’t wish to answer');
    expect(fitAnswer('Yes', { kind: 'checkbox' }, 'consent')).toBe('Yes');
    expect(fitAnswer('about 6 years', { kind: 'number' }, 'years_experience')).toBe('6');
  });
});

describe('resolving one question', () => {
  it('answers verified and derived facts without asking, and says where they came from', () => {
    const c = ctx();
    expect(resolveQuestion(q('First Name'), job('a', null), c)).toMatchObject({ state: 'known', value: 'Leyla', source: 'you' });
    expect(resolveQuestion(q('Email'), job('a', null), c)).toMatchObject({ state: 'known', value: 'leyla.mammadova@example.com', source: 'cv' });
    expect(resolveQuestion(q('Years of experience', { kind: 'number' }), job('a', null), c)).toMatchObject({ state: 'known', source: 'cv' });
    expect(resolveQuestion(q('Current job title'), job('a', null), c)).toMatchObject({ state: 'known', value: cv.titles[0], source: 'cv' });
    expect(resolveQuestion(q('Resume', { kind: 'file' }), job('a', null), c)).toEqual({ state: 'file', what: 'cv' });
  });

  it('reads “worked here before?” from the CV only as a No', () => {
    expect(resolveQuestion(q('Have you previously worked for Acme?'), job('a', null, { company: 'Acme Inc' }), ctx())).toMatchObject({ state: 'known', value: 'No' });
    // The company is on the CV: only the person can say.
    expect(resolveQuestion(q('Have you previously worked for Silk Way?'), job('a', null, { company: 'Silk Way Logistics LLC' }), ctx())).toMatchObject({ state: 'ask' });
  });

  it('never answers demographic questions — picks “rather not say” only where a required one offers it', () => {
    const c = ctx();
    expect(resolveQuestion(q('Gender', { required: false, options: ['Male', 'Female'] }), job('a', null), c).state).toBe('leave');
    expect(resolveQuestion(q('Gender', { options: ['Male', 'Female', 'Decline to self-identify'] }), job('a', null), c)).toMatchObject({ state: 'known', value: 'Decline to self-identify' });
    expect(resolveQuestion(q('Gender', { options: ['Male', 'Female'] }), job('a', null), c).state).toBe('stuck');
  });

  it('ticks a required consent only with the person’s yes, and never an optional one', () => {
    const consent = q('I agree to the privacy notice', { kind: 'checkbox' });
    expect(resolveQuestion(consent, job('a', null), ctx())).toMatchObject({ state: 'ask', ask: 'consent' });
    expect(resolveQuestion(consent, job('a', null), ctx({ given: { consent: 'Yes' } }))).toMatchObject({ state: 'known', value: 'Yes' });
    expect(resolveQuestion(consent, job('a', null), ctx({ given: { consent: 'No' } })).state).toBe('stuck');
    expect(resolveQuestion(q('Keep my data for future roles (consent)', { kind: 'checkbox', required: false }), job('a', null), ctx({ given: { consent: 'Yes' } })).state).toBe('leave');
  });

  it('works out sponsorship from nationality where it can, and asks per country where it can’t', () => {
    const s = q('Will you require sponsorship?', { kind: 'yesno' });
    expect(resolveQuestion(s, job('a', null, { sponsorship: 'not_needed' }), ctx())).toMatchObject({ state: 'known', value: 'No', source: 'derived' });
    expect(resolveQuestion(s, job('a', null, { cc: 'DE' }), ctx())).toMatchObject({ state: 'ask', ask: 'sponsorship@DE' });
    const saved = ctx({ profile: { ...profile(), byCountry: { DE: { sponsorship: { value: 'Yes', askEachTime: false, source: 'you' } } } } });
    expect(resolveQuestion(s, job('a', null, { cc: 'DE' }), saved)).toMatchObject({ state: 'known', value: 'Yes' });
    expect(resolveQuestion(s, job('b', null, { cc: 'CA' }), saved)).toMatchObject({ state: 'ask', ask: 'sponsorship@CA' });
  });

  it('a known answer that fits none of a form’s choices is asked for that form only', () => {
    const c = ctx({ profile: profile({ relocation: { value: 'Depending on the opportunity', askEachTime: false, source: 'you' } }) });
    const r = resolveQuestion(q('Are you willing to relocate?', { options: ['Yes', 'No'] }), job('a', null), c);
    expect(r.state).toBe('stuck');
    expect(r.state === 'stuck' && r.ask).toMatch(/^relocation#/);
  });
});

describe('planning a batch', () => {
  const sixteen = Array.from({ length: 16 }, (_, i) =>
    job(`j${i}`, [
      ...basics,
      q(['Will you now or in the future require sponsorship?', 'Will you need visa sponsorship?', 'Do you require employer sponsorship?'][i % 3], { kind: 'yesno' }),
      q(i % 2 ? 'Desired salary' : 'What are your salary expectations?'),
      q(i % 4 === 0 ? 'Would you relocate for this role?' : 'Are you open to relocation?', { options: ['Yes', 'No'] }),
      q('LinkedIn Profile', { required: false }),
      q('Gender', { required: false, options: ['Male', 'Female', 'Decline'] }),
    ]),
  );

  it('asks each concept once, however many forms ask it and in whatever words', () => {
    const plan = planBatch(sixteen, ctx());
    expect(plan.ask.map((a) => a.key).sort()).toEqual(['relocation', 'salary_expectation', 'sponsorship@US']);
    for (const a of plan.ask) expect(a.jobs).toHaveLength(16);
    expect(plan.extra).toEqual([]);
    expect(plan.ready).toBe(16);
    // 16 × 8 counted fields (5 basics + 3 questions); 16 × 5 known.
    expect(plan.coverage).toEqual({ fields: 128, known: 80, pct: 62 });
  });

  it('reuses one answer across every application, and saves it for next time', () => {
    const plan = planBatch(sixteen, ctx());
    const given = { 'sponsorship@US': 'Yes', salary_expectation: '$90,000', relocation: 'Yes' };
    expect(readyAfter(plan, given).go).toHaveLength(16);
    const after = ctx({ given });
    const answers = answersFor(sixteen[3], after);
    expect(answers.find((a) => /sponsorship/i.test(a.label))?.value).toBe('Yes');
    expect(answers.find((a) => /salary/i.test(a.label))?.value).toBe('$90,000');

    const saved = rememberBatch(profile(), plan.ask, given, '2026-10-08T00:00:00Z');
    expect(saved.byCountry?.US?.sponsorship?.value).toBe('Yes');
    expect(saved.answers.salary_expectation?.value).toBe('$90,000');
    // The next batch asks nothing it already knows.
    const next = planBatch(sixteen, ctx({ profile: saved }));
    expect(next.ask).toEqual([]);
    expect(next.coverage.pct).toBe(100);
  });

  it('a question only one employer asks doesn’t hold up the others', () => {
    const jobs = [job('a', [...basics, q('Why do you want to work at A?', { kind: 'long' })]), job('b', basics), job('c', basics)];
    const plan = planBatch(jobs, ctx());
    expect(plan.ask).toEqual([]);
    expect(plan.extra.map((e) => e.companies)).toEqual([['Company a']]);
    expect(plan.ready).toBe(2);
    expect(readyAfter(plan, {}).wait).toEqual([{ id: 'a', missing: ['custom:why-do-you-want-to-work-at-a'] }]);
    expect(readyAfter(plan, { 'custom:why-do-you-want-to-work-at-a': 'Because…' }).go).toEqual(['a', 'b', 'c']);
  });

  it('the same unknown question on two forms is asked once', () => {
    const plan = planBatch([job('a', [...basics, q('Do you have a driving licence?')]), job('b', [...basics, q('Do you have a driving licence?')])], ctx());
    expect(plan.ask).toHaveLength(1);
    expect(plan.ask[0]).toMatchObject({ key: 'custom:do-you-have-a-driving-licence', jobs: ['a', 'b'] });
  });

  it('marks jobs behind a login as blocked, and the rest still go', () => {
    const plan = planBatch([job('a', basics), job('b', null, { form: { platform: 'workday', status: 'login', questions: null } })], ctx());
    expect(plan.jobs.find((j) => j.id === 'b')).toMatchObject({ outcome: 'blocked', reasonCode: 'login_required' });
    expect(plan.ready).toBe(1);
  });

  it('a form whose questions can only be seen live is planned with the basics', () => {
    const plan = planBatch([job('a', null, { form: { platform: 'other', status: 'live', questions: null }, cc: 'GB', country: 'United Kingdom' })], ctx());
    expect(plan.ask.map((a) => a.key).sort()).toEqual(['consent', 'sponsorship@GB', 'work_authorization@GB']);
    expect(plan.ask[0].label).toMatch(/United Kingdom/);
  });

  it('a required question no saved answer can cover marks only that application', () => {
    const plan = planBatch([job('a', [...basics, q('Ethnicity', { options: ['A', 'B'] })]), job('b', basics)], ctx());
    expect(plan.jobs.find((j) => j.id === 'a')).toMatchObject({ outcome: 'attention' });
    expect(plan.jobs.find((j) => j.id === 'b')).toMatchObject({ outcome: 'apply' });
  });

  it('gives the worker every concept it knows for a job — and nothing it doesn’t', () => {
    const c = ctx({ given: { 'sponsorship@US': 'Yes', consent: 'Yes' } });
    const a = conceptAnswers(job('a', null), c);
    expect(a).toMatchObject({ first_name: 'Leyla', last_name: 'Mammadova', sponsorship: 'Yes', consent: 'Yes', source: 'MadeVisa' });
    expect(a.salary_expectation).toBeUndefined();
    expect(a.work_authorization).toBeUndefined();
  });
});
