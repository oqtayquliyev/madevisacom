import { describe, expect, it } from 'vitest';
import { atsOf, greenhouseRef, handoverReason, parseGreenhouseQuestions } from '@/lib/apply/channels';
import { answerQuestions } from '@/lib/apply/profile';
import { prefs, profile } from './fixtures';

describe('channels', () => {
  it('recognises the hiring system behind an application link', () => {
    expect(atsOf('https://boards.greenhouse.io/acme/jobs/4012345')).toBe('greenhouse');
    expect(atsOf('https://acme.com/careers/role?gh_jid=4012345')).toBe('greenhouse');
    expect(atsOf('https://jobs.lever.co/acme/abc')).toBe('lever');
    expect(atsOf('https://jobs.ashbyhq.com/acme/abc')).toBe('ashby');
    expect(atsOf('https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/x')).toBe('workday');
    expect(atsOf('https://careers.acme.com/jobs/1')).toBe('other');
    expect(atsOf('not a url')).toBeNull();
    expect(atsOf(null)).toBeNull();
  });

  it('explains a handover in plain words', () => {
    expect(handoverReason('https://nvidia.wd5.myworkdayjobs.com/x')).toMatch(/sign in/);
    expect(handoverReason('https://boards.greenhouse.io/acme/jobs/1')).toMatch(/its own site/);
    expect(handoverReason(null)).toMatch(/no application link/);
    for (const u of ['https://boards.greenhouse.io/acme/jobs/1', null]) expect(handoverReason(u)).not.toMatch(/captcha|api|bot|ats/i);
  });

  it('reads board and job from a Greenhouse link', () => {
    expect(greenhouseRef('https://boards.greenhouse.io/acme/jobs/4012345?gh_src=x')).toEqual({ board: 'acme', job: '4012345' });
    expect(greenhouseRef('https://job-boards.greenhouse.io/acme/jobs/4012345')).toEqual({ board: 'acme', job: '4012345' });
    expect(greenhouseRef('https://boards.greenhouse.io/embed/job_app?for=acme&token=4012345')).toEqual({ board: 'acme', job: '4012345' });
    expect(greenhouseRef('https://acme.com/careers?gh_jid=4012345')).toBeNull();
  });

  it('turns a Greenhouse question list into questions, and answers only what is verified', () => {
    const json = {
      questions: [
        { label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text', values: [] }] },
        { label: 'Last Name', required: true, fields: [{ name: 'last_name', type: 'input_text', values: [] }] },
        { label: 'Email', required: true, fields: [{ name: 'email', type: 'input_text', values: [] }] },
        { label: 'Resume/CV', required: true, fields: [{ name: 'resume', type: 'input_file', values: [] }] },
        { label: 'Will you now or in the future require sponsorship?', required: true, fields: [{ name: 'question_1', type: 'multi_value_single_select', values: [{ label: 'Yes', value: 1 }, { label: 'No', value: 0 }] }] },
        { label: 'Why do you want to work here?', required: true, fields: [{ name: 'question_2', type: 'textarea', values: [] }] },
        { label: 'LinkedIn Profile', required: false, fields: [{ name: 'question_3', type: 'input_text', values: [] }] },
        { label: '', required: true, fields: [{ name: 'broken', type: 'input_text' }] },
        { label: 'No fields', required: true },
      ],
    };
    const qs = parseGreenhouseQuestions(json);
    expect(qs.map((q) => [q.id, q.kind, q.required])).toEqual([
      ['gh:first_name', 'text', true],
      ['gh:last_name', 'text', true],
      ['gh:email', 'text', true],
      ['gh:resume', 'file', true],
      ['gh:question_1', 'yesno', true],
      ['gh:question_2', 'long', true],
      ['gh:question_3', 'text', false],
    ]);
    const set = answerQuestions(qs, profile(), prefs());
    expect(set.answered.map((a) => a.id)).toEqual(['gh:first_name', 'gh:last_name', 'gh:email']);
    expect(set.needs.map((n) => n.id)).toEqual(['gh:question_1', 'gh:question_2']);
    expect(set.left).toEqual(['LinkedIn Profile']);
  });

  it('gives no questions for anything that is not a question list', () => {
    expect(parseGreenhouseQuestions(null)).toEqual([]);
    expect(parseGreenhouseQuestions({ error: 'not found' })).toEqual([]);
    expect(parseGreenhouseQuestions({ questions: 'x' })).toEqual([]);
  });
});
