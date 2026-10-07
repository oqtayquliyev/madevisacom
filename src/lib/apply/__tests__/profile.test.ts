import { describe, expect, it } from 'vitest';
import { answerQuestions, basicQuestions, classifyQuestion, completeness, confidence, cvContacts, mergeProfile, questionId, remember, suggestProfile } from '@/lib/apply/profile';
import { EMPTY_PROFILE, type Question } from '@/lib/apply/types';
import { CV_TEXT, cv, prefs, profile } from './fixtures';

const q = (label: string, over: Partial<Question> = {}): Question => ({ id: label, label, required: true, kind: 'text', ...over });

describe('verified profile answers', () => {
  it('recognises standard application questions', () => {
    expect(classifyQuestion('Will you now or in the future require visa sponsorship?')).toBe('sponsorship');
    expect(classifyQuestion('Are you legally authorized to work in Germany?')).toBe('work_authorization');
    expect(classifyQuestion('What are your salary expectations?')).toBe('salary_expectation');
    expect(classifyQuestion('Gehaltsvorstellung')).toBe('salary_expectation');
    expect(classifyQuestion('Notice period')).toBe('notice_period');
    expect(classifyQuestion('First Name *')).toBe('first_name');
    expect(classifyQuestion('LinkedIn Profile')).toBe('linkedin');
    expect(classifyQuestion('How did you hear about us?')).toBe('source');
    expect(classifyQuestion('Gender')).toBe('demographic');
    expect(classifyQuestion('Describe a project you are proud of')).toBeNull();
  });

  it('answers from saved answers, and says where each came from', () => {
    const set = answerQuestions([q('Full name'), q('Email'), q('Phone'), q('First name'), q('Last name')], profile(), prefs());
    expect(set.needs).toEqual([]);
    expect(set.answered.map((a) => a.value)).toEqual(['Leyla Mammadova', 'leyla.mammadova@example.com', '+994 50 555 01 23', 'Leyla', 'Mammadova']);
    expect(set.answered[0].source).toBe('you');
    expect(set.answered[1].source).toBe('cv');
  });

  it('uses the same saved answer every time the question comes back', () => {
    let p = profile();
    const first = answerQuestions([q('What is your notice period?')], p, prefs());
    expect(first.needs).toHaveLength(1);
    p = remember(p, first.needs[0], '1 month', false);
    const again = answerQuestions([q('Notice period')], p, prefs());
    expect(again.needs).toEqual([]);
    expect(again.answered[0].value).toBe('1 month');
  });

  it('“Ask me each time” is always asked, even with an answer saved', () => {
    const p = profile({ notice_period: { value: '1 month', askEachTime: true, source: 'you' } });
    const set = answerQuestions([q('Notice period')], p, prefs());
    expect(set.answered).toEqual([]);
    expect(set.needs[0].why).toMatch(/each time/);
  });

  it('questions the person listed as “always ask” are never answered automatically', () => {
    const p = profile({ salary_expectation: { value: '€60,000', askEachTime: false, source: 'you' } });
    expect(answerQuestions([q('Salary expectations')], p, prefs({ alwaysAsk: ['salary_expectation'] })).needs).toHaveLength(1);
    expect(answerQuestions([q('Salary expectations')], p, prefs({ alwaysAsk: [] })).answered[0].value).toBe('€60,000');
  });

  it('an answer given for this one application wins', () => {
    const set = answerQuestions([q('Salary expectations')], profile(), prefs(), null, { 'Salary expectations': '€65,000' });
    expect(set.answered[0]).toMatchObject({ value: '€65,000', source: 'you' });
  });

  it('fits a saved yes/no to the form’s choices only on a clear match', () => {
    const p = profile({ sponsorship: { value: 'Yes', askEachTime: false, source: 'you' } });
    const yesNo = answerQuestions([q('Do you require sponsorship?', { kind: 'select', options: ['Yes', 'No'] })], p, prefs());
    expect(yesNo.answered[0].value).toBe('Yes');
    const wordy = answerQuestions([q('Do you require sponsorship?', { kind: 'select', options: ['Yes, now', 'Yes, in the future', 'No'] })], p, prefs());
    expect(wordy.answered).toEqual([]);
    expect(wordy.needs[0].why).toMatch(/doesn’t match/);
  });

  it('pre-fills only facts from the account and the CV, and saved answers win', () => {
    expect(cvContacts(CV_TEXT)).toEqual({ email: 'leyla.mammadova@example.com', phone: '+994 50 555 01 23', linkedin: 'https://linkedin.com/in/leyla-mammadova' });
    const suggested = suggestProfile({ fullName: 'Leyla M.', email: 'account@example.com' }, CV_TEXT);
    expect(suggested.full_name).toMatchObject({ value: 'Leyla M.', source: 'account' });
    expect(suggested.email?.value).toBe('account@example.com');
    expect(suggested.phone?.source).toBe('cv');
    // Nothing is suggested that neither source states.
    expect(suggested.sponsorship).toBeUndefined();
    expect(suggested.salary_expectation).toBeUndefined();
    expect(suggested.work_authorization).toBeUndefined();
    const merged = mergeProfile({ answers: { email: { value: 'mine@example.com', askEachTime: false, source: 'you' } }, custom: {} }, suggested);
    expect(merged.answers.email?.value).toBe('mine@example.com');
  });

  it('measures how complete and how confirmed the profile is', () => {
    expect(completeness(EMPTY_PROFILE)).toBe(0);
    expect(completeness(profile())).toBe(1);
    expect(confidence(EMPTY_PROFILE)).toBeNull();
    expect(confidence(profile())).toBeCloseTo(1 / 3);
  });
});

describe('unknown application questions', () => {
  it('a required question we don’t recognise needs the person’s answer', () => {
    const set = answerQuestions([q('Describe a project you are proud of', { kind: 'long' })], profile(), prefs());
    expect(set.answered).toEqual([]);
    expect(set.needs).toHaveLength(1);
    expect(set.needs[0].key).toBeNull();
  });

  it('a recognised question with nothing saved is not guessed', () => {
    const set = answerQuestions(
      [q('Will you require visa sponsorship?'), q('Are you authorized to work in Germany?'), q('Salary expectations'), q('Years of relevant experience'), q('Highest level of education')],
      profile(),
      prefs({ alwaysAsk: [] }),
      cv,
    );
    // The CV shows years and a degree, but those are estimates read from it — not answers the person gave.
    expect(set.answered).toEqual([]);
    expect(set.needs).toHaveLength(5);
  });

  it('an optional unknown question is left empty, not answered', () => {
    const set = answerQuestions([q('Anything else you would like us to know?', { required: false, kind: 'long' })], profile(), prefs());
    expect(set.answered).toEqual([]);
    expect(set.needs).toEqual([]);
    expect(set.left).toHaveLength(1);
  });

  it('demographic questions are never answered, required or not', () => {
    const p = { ...profile(), custom: { [questionId('Gender')]: { value: 'Female', askEachTime: false, source: 'you' as const } } };
    const set = answerQuestions([q('Gender', { kind: 'select', options: ['Female', 'Male', 'Decline to answer'] }), q('Are you a protected veteran?')], p, prefs());
    expect(set.answered).toEqual([]);
    expect(set.needs).toEqual([]);
    expect(set.left).toHaveLength(2);
  });

  it('once answered, an unknown question is remembered by its own words', () => {
    let p = profile();
    const label = 'Describe a project you are proud of';
    const first = answerQuestions([q(label)], p, prefs());
    p = remember(p, first.needs[0], 'The stock dashboard at Caspian Retail.', false);
    const again = answerQuestions([q(`${label}?`)], p, prefs());
    expect(again.answered[0].value).toBe('The stock dashboard at Caspian Retail.');
  });

  it('a one-word name gives no family name — asked, not made up', () => {
    const set = answerQuestions([q('Last name')], profile({ full_name: { value: 'Leyla', askEachTime: false, source: 'you' } }), prefs());
    expect(set.needs).toHaveLength(1);
  });

  it('every application abroad asks about sponsorship up front', () => {
    const set = answerQuestions(basicQuestions(true), profile(), prefs());
    expect(set.needs.map((n) => n.key)).toEqual(['sponsorship']);
    expect(answerQuestions(basicQuestions(false), profile(), prefs()).needs).toEqual([]);
  });

  it('files are attached by the channel, not answered', () => {
    const set = answerQuestions([q('Resume/CV', { kind: 'file' })], profile(), prefs());
    expect(set).toEqual({ answered: [], needs: [], left: [] });
  });
});
