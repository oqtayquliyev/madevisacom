import { describe, expect, it } from 'vitest';
import { confirmationId, isClosed, isSuccess, planFill, successSnippet, type LiveField, type Pack } from '../../../../worker/src/plan';
import { safeName } from '../../../../worker/src/run';

const f = (label: string, over: Partial<LiveField> = {}): LiveField => ({ ref: label, kind: 'text', name: '', id: '', label, required: true, ...over });
const pack = (over: Partial<Pack> = {}): Pack => ({
  answers: [],
  concepts: { first_name: 'Leyla', last_name: 'Mammadova', full_name: 'Leyla Mammadova', email: 'leyla@example.com', phone: '+994 50 555 01 23', city: 'Baku', country: 'Azerbaijan', sponsorship: 'Yes', years_experience: '7', source: 'MadeVisa' },
  hasLetter: false,
  letterText: null,
  ...over,
});

describe('filling a live form', () => {
  it('fills what is known, from the application’s own answers first', () => {
    const p = planFill([f('First name'), f('Email', { kind: 'email' }), f('Will you require sponsorship?', { kind: 'radio', options: ['Yes', 'No'], optionRefs: ['y', 'n'] })], pack({ answers: [{ id: 'gh:email', label: 'Email', value: 'other@example.com', key: 'email' }] }));
    expect(p.missing).toEqual([]);
    expect(p.actions).toEqual([
      { ref: 'First name', do: 'type', value: 'Leyla', label: 'First name' },
      { ref: 'Email', do: 'type', value: 'other@example.com', label: 'Email' },
      { ref: 'y', do: 'click', value: 'Yes', label: 'Will you require sponsorship?' },
    ]);
  });

  it('matches an answer to its field by the form’s own field name', () => {
    const p = planFill([f('Why us?', { kind: 'long', name: 'cards[c1][field1]' })], pack({ answers: [{ id: 'lever:cards[c1][field1]', label: 'Why do you want to join?', value: 'Because…', key: null }] }));
    expect(p.actions[0]).toMatchObject({ do: 'type', value: 'Because…' });
  });

  it('a question nothing covers stops this application only — required ones; optional ones are left empty', () => {
    const p = planFill([f('Why do you want to work here?', { kind: 'long' }), f('Anything else?', { kind: 'long', required: false })], pack());
    expect(p.missing.map((m) => m.label)).toEqual(['Why do you want to work here?']);
    expect(p.actions).toEqual([]);
  });

  it('never answers demographic questions; picks “rather not say” only when a required one offers it', () => {
    const p = planFill([
      f('Gender', { kind: 'select', required: false, options: ['Male', 'Female', 'Decline to self-identify'] }),
      f('Race', { kind: 'select', options: ['A', 'B', 'I don’t wish to answer'] }),
    ], pack());
    expect(p.actions).toEqual([{ ref: 'Race', do: 'select', value: 'I don’t wish to answer', label: 'Race' }]);
  });

  it('ticks a required consent only with the person’s yes, never an optional one', () => {
    const fields = [f('I agree to the privacy policy', { kind: 'checkbox' }), f('Send me marketing emails (consent)', { kind: 'checkbox', required: false })];
    expect(planFill(fields, pack()).missing.map((m) => m.key)).toEqual(['consent']);
    const yes = planFill(fields, pack({ concepts: { ...pack().concepts, consent: 'Yes' } }));
    expect(yes.actions).toEqual([{ ref: 'I agree to the privacy policy', do: 'check', on: true, label: 'I agree to the privacy policy' }]);
  });

  it('attaches the tailored CV, and the letter only where one was written', () => {
    const fields = [f('Resume/CV', { kind: 'file' }), f('Cover Letter', { kind: 'file', required: false })];
    expect(planFill(fields, pack()).actions.map((a) => a.do === 'file' && a.file)).toEqual(['cv']);
    expect(planFill(fields, pack({ hasLetter: true })).actions.map((a) => a.do === 'file' && a.file)).toEqual(['cv', 'cover_letter']);
    expect(planFill([f('Cover letter', { kind: 'long' })], pack({ letterText: 'Dear…' })).actions[0]).toMatchObject({ do: 'type', value: 'Dear…' });
  });

  it('fits answers to the form’s own choices, or asks', () => {
    const p = planFill([
      f('Years of experience', { kind: 'select', options: ['0-2', '3-5', '6-10', '10+'] }),
      f('How did you hear about us?', { kind: 'select', options: ['LinkedIn', 'Job board', 'Referral'] }),
      f('Location', {}),
      f('Will you need sponsorship?', { kind: 'select', options: ['Yes, now', 'Yes, later', 'No'] }),
    ], pack());
    expect(p.actions.map((a) => ('value' in a ? a.value : ''))).toEqual(['6-10', 'Job board', 'Baku, Azerbaijan']);
    expect(p.missing.map((m) => m.label)).toEqual(['Will you need sponsorship?']);
  });

  it('reads the employer’s answer after Submit', () => {
    expect(isSuccess('https://boards.greenhouse.io/x/jobs/1/confirmation', '')).toBe(true);
    expect(isSuccess('https://x.example/apply', 'Thank you for applying to Hansa!')).toBe(true);
    expect(isSuccess('https://x.example/apply', 'Thanks! Your application has been submitted.')).toBe(true);
    expect(isSuccess('https://x.example/apply', 'Apply for this job')).toBe(false);
    expect(confirmationId('Your application ID: HX-48213.')).toBe('HX-48213');
    expect(successSnippet('Home. Thank you for applying! We will be in touch.')).toBe('Thank you for applying! We will be in touch.');
    expect(isClosed('Sorry, this job is no longer available.')).toBe(true);
    expect(safeName('Leyla Məmmədova — Data Analyst CV')).toBe('Leyla Memmedova - Data Analyst CV.docx');
  });
});
