import { describe, expect, it } from 'vitest';
import { ashbyRef, leverRef, parseAshby, parseGreenhouse, parseLever, platformOf, readForm, readForms } from '../../../../supabase/functions/apply/forms.ts';
import { makeHandler, type Deps } from '../../../../supabase/functions/apply/core.ts';
import { planBatch } from '@/lib/apply/batch';
import { cv, CV_TEXT, prefs, profile } from './fixtures';

export const GREENHOUSE_JSON = {
  id: 1001,
  title: 'Data Analyst',
  questions: [
    { required: true, label: 'First Name', fields: [{ name: 'first_name', type: 'input_text', values: [] }] },
    { required: true, label: 'Last Name', fields: [{ name: 'last_name', type: 'input_text', values: [] }] },
    { required: true, label: 'Email', fields: [{ name: 'email', type: 'input_text', values: [] }] },
    { required: false, label: 'Phone', fields: [{ name: 'phone', type: 'input_text', values: [] }] },
    { required: true, label: 'Resume/CV', fields: [{ name: 'resume', type: 'input_file', values: [] }, { name: 'resume_text', type: 'textarea', values: [] }] },
    { required: false, label: 'Cover Letter', fields: [{ name: 'cover_letter', type: 'input_file', values: [] }, { name: 'cover_letter_text', type: 'textarea', values: [] }] },
    { required: false, label: 'LinkedIn Profile', fields: [{ name: 'question_1', type: 'input_text', values: [] }] },
    { required: true, label: 'Will you now or in the future require sponsorship for employment visa status?', fields: [{ name: 'question_2', type: 'multi_value_single_select', values: [{ label: 'Yes', value: 1 }, { label: 'No', value: 0 }] }] },
    { required: true, label: 'Are you legally authorized to work in the country where this job is located?', fields: [{ name: 'question_3', type: 'multi_value_single_select', values: [{ label: 'Yes', value: 1 }, { label: 'No', value: 0 }] }] },
    { required: true, label: 'What are your salary expectations?', fields: [{ name: 'question_4', type: 'input_text', values: [] }] },
    { required: false, label: 'Hidden', fields: [{ name: 'question_5', type: 'input_hidden', values: [] }] },
  ],
  data_compliance: [{ type: 'gdpr', requires_consent: true, requires_processing_consent: false, retention_days: 365 }],
};

const tpl = (fields: unknown[]) => JSON.stringify({ id: 'x', text: 'Questions', fields }).replace(/"/g, '&quot;');
export const LEVER_HTML = `<form id="application-form" method="POST" enctype="multipart/form-data">
<input type="file" name="resume" id="resume-upload-input" required>
<div class="application-question"><div class="application-label">Full name<span class="required">✱</span></div><input type="text" name="name" required></div>
<input type="email" name="email" required>
<input type="text" name="phone">
<input type="text" name="location" id="location-input">
<input type="text" name="org">
<input type="text" name="urls[LinkedIn]">
<input type="text" name="urls[GitHub]">
<input type="hidden" name="cards[1b2c3d4e-0000-4000-8000-000000000001][baseTemplate]" value="${tpl([
  { type: 'multiple-choice', text: 'Will you require visa sponsorship to work in Germany?', required: true, options: [{ text: 'Yes' }, { text: 'No' }] },
  { type: 'textarea', text: 'Why do you want to join Hansa?', required: true },
  { type: 'dropdown', text: 'How many years of experience do you have with SQL?', required: false, options: [{ text: '0-2' }, { text: '3-5' }, { text: '6+' }] },
])}">
<input type="checkbox" name="consent[marketing]" value="true">
<input type="checkbox" name="consent[store]" value="true" required>
</form>`;

export const ASHBY_JSON = {
  data: {
    jobPosting: {
      id: 'p1',
      applicationForm: {
        sections: [
          {
            fieldEntries: [
              { id: '1', isRequired: true, field: { path: '_systemfield_name', title: 'Name', type: 'String' } },
              { id: '2', isRequired: true, field: { path: '_systemfield_email', title: 'Email', type: 'Email' } },
              { id: '3', isRequired: true, field: { path: '_systemfield_resume', title: 'Resume', type: 'File' } },
              { id: '4', isRequired: true, field: { path: 'q_relocate', title: 'Are you open to relocation?', type: 'Boolean' } },
              { id: '5', isRequired: false, field: { path: 'q_pronouns', title: 'Pronouns', type: 'ValueSelect', selectableValues: [{ label: 'she/her', value: 'a' }, { label: 'Prefer not to say', value: 'b' }] } },
            ],
          },
        ],
      },
    },
  },
};

const fetcher = (async (url: string) => {
  if (url.includes('boards-api.greenhouse.io/v1/boards/hansa/jobs/1001')) return new Response(JSON.stringify(GREENHOUSE_JSON));
  if (url.includes('boards-api.greenhouse.io')) return new Response('{}', { status: 404 });
  if (url.includes('jobs.lever.co')) return new Response(LEVER_HTML);
  if (url.includes('ashbyhq')) return new Response(JSON.stringify(ASHBY_JSON));
  throw new Error(`unexpected ${url}`);
}) as (u: string) => Promise<Response>;

describe('reading application forms', () => {
  it('knows which hiring system a link belongs to, and which need a sign-in', () => {
    expect(platformOf('https://boards.greenhouse.io/hansa/jobs/1001')).toBe('greenhouse');
    expect(platformOf('https://www.hansa.de/careers?gh_jid=1001')).toBe('greenhouse');
    expect(platformOf('https://jobs.lever.co/hansa/0b1d2c3e-1111-4111-8111-111111111111')).toBe('lever');
    expect(platformOf('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/x')).toBe('workday');
    expect(platformOf('https://acme.example/careers/1')).toBe('other');
    expect(leverRef('https://jobs.eu.lever.co/hansa/0b1d2c3e-1111-4111-8111-111111111111/apply')).toEqual({ host: 'jobs.eu.lever.co', site: 'hansa', job: '0b1d2c3e-1111-4111-8111-111111111111' });
    expect(ashbyRef('https://jobs.ashbyhq.com/Hansa%20Freight/0b1d2c3e-1111-4111-8111-111111111111')).toEqual({ org: 'Hansa Freight', job: '0b1d2c3e-1111-4111-8111-111111111111' });
  });

  it('reads a Greenhouse form: fields, choices, files, the GDPR consent', () => {
    const qs = parseGreenhouse(GREENHOUSE_JSON);
    expect(qs.map((q) => q.id)).toEqual(['gh:first_name', 'gh:last_name', 'gh:email', 'gh:phone', 'gh:resume', 'gh:cover_letter', 'gh:question_1', 'gh:question_2', 'gh:question_3', 'gh:question_4', 'gh:gdpr_consent']);
    expect(qs.find((q) => q.id === 'gh:resume')).toMatchObject({ kind: 'file', file: 'cv', required: true });
    expect(qs.find((q) => q.id === 'gh:cover_letter')).toMatchObject({ kind: 'file', file: 'cover_letter', required: false });
    expect(qs.find((q) => q.id === 'gh:question_2')).toMatchObject({ kind: 'yesno', options: ['Yes', 'No'] });
    expect(qs[qs.length - 1]).toMatchObject({ kind: 'checkbox', required: true });
  });

  it('reads a Lever form, custom question cards included; optional consents are not questions', () => {
    const qs = parseLever(LEVER_HTML);
    expect(qs.map((q) => q.label)).toEqual([
      'Resume/CV', 'Full name', 'Email', 'Phone', 'Current location', 'Current company', 'LinkedIn', 'GitHub',
      'Will you require visa sponsorship to work in Germany?', 'Why do you want to join Hansa?', 'How many years of experience do you have with SQL?',
      'I consent to the processing of my data under the employer’s privacy notice',
    ]);
    expect(qs.find((q) => q.label.startsWith('Will you'))).toMatchObject({ id: 'lever:cards[1b2c3d4e-0000-4000-8000-000000000001][field0]', kind: 'yesno', required: true });
    expect(qs.find((q) => q.label.startsWith('Why'))).toMatchObject({ kind: 'long', required: true });
  });

  it('reads an Ashby form', () => {
    const qs = parseAshby(ASHBY_JSON)!;
    expect(qs.map((q) => [q.label, q.kind, q.required])).toEqual([
      ['Name', 'text', true], ['Email', 'text', true], ['Resume', 'file', true], ['Are you open to relocation?', 'yesno', true], ['Pronouns', 'select', false],
    ]);
  });

  it('routes each link to the right reader — and never fetches a link as given', async () => {
    expect((await readForm(fetcher, 'https://boards.greenhouse.io/hansa/jobs/1001')).status).toBe('ok');
    expect((await readForm(fetcher, 'https://boards.greenhouse.io/hansa/jobs/999')).status).toBe('closed');
    expect(await readForm(fetcher, 'https://nvidia.wd5.myworkdayjobs.com/x')).toEqual({ platform: 'workday', status: 'login', questions: null });
    expect(await readForm(fetcher, 'https://acme.example/careers/1')).toEqual({ platform: 'other', status: 'live', questions: null });
    expect(await readForm(fetcher, null)).toEqual({ platform: null, status: 'none', questions: null });
    expect((await readForm(fetcher, 'https://jobs.lever.co/hansa/0b1d2c3e-1111-4111-8111-111111111111')).questions).toHaveLength(12);
    const many = await readForms(fetcher, [{ id: 'a', url: 'https://boards.greenhouse.io/hansa/jobs/1001' }, { id: 'b', url: null, email: true }]);
    expect(many.b).toEqual({ platform: 'email', status: 'ok', questions: null });
  });

  it('a whole batch, from real-shaped forms to one consolidated set of questions', async () => {
    const forms = await readForms(fetcher, [
      { id: 'gh', url: 'https://boards.greenhouse.io/hansa/jobs/1001' },
      { id: 'lv', url: 'https://jobs.lever.co/hansa/0b1d2c3e-1111-4111-8111-111111111111' },
      { id: 'ab', url: 'https://jobs.ashbyhq.com/hansa/0b1d2c3e-1111-4111-8111-111111111111' },
      { id: 'wd', url: 'https://nvidia.wd5.myworkdayjobs.com/x' },
    ]);
    const jobs = Object.entries(forms).map(([id, form]) => ({ id, title: 'Data Analyst', company: id === 'lv' ? 'Hansa' : `Co ${id}`, cc: 'DE', country: 'Germany', sponsorship: 'unclear' as const, letter: false, form }));
    const plan = planBatch(jobs, { profile: profile(), prefs: prefs({ alwaysAsk: [] }), prefsSaved: false, cv, cvText: CV_TEXT, given: {} });
    // Sponsorship is asked once for both forms that ask it; the Lever essay is that job's own; Workday needs a login.
    expect(plan.ask.map((a) => a.key).sort()).toEqual(['consent', 'relocation', 'salary_expectation', 'sponsorship@DE', 'work_authorization@DE']);
    expect(plan.ask.find((a) => a.key === 'sponsorship@DE')!.jobs.sort()).toEqual(['gh', 'lv']);
    expect(plan.extra.map((e) => e.label)).toEqual(['Why do you want to join Hansa?']);
    expect(plan.jobs.find((j) => j.id === 'wd')).toMatchObject({ outcome: 'blocked', reasonCode: 'login_required' });
    expect(plan.ready).toBe(2);
  });
});

describe('the analyze action', () => {
  it('reads only the person’s own applications, keeps the forms, and marks closed jobs', async () => {
    const stored: unknown[] = [];
    const deps: Deps = {
      getUser: async () => ({ id: 'u1', email: 'u1@example.com' }),
      rpc: async (name, args) => {
        if (name === 'apply_form_targets') {
          expect(args?.p_user).toBe('u1');
          return { data: [
            { id: '11111111-1111-4111-8111-111111111111', url: 'https://boards.greenhouse.io/hansa/jobs/1001', email: false, open: true },
            { id: '22222222-2222-4222-8222-222222222222', url: 'https://acme.example/jobs/1', email: false, open: false },
          ], error: null };
        }
        if (name === 'apply_forms_store') {
          stored.push(args?.p_forms);
          return { data: 2, error: null };
        }
        return { data: null, error: { message: 'unknown' } };
      },
      fetch: fetcher as typeof fetch,
    };
    const res = await makeHandler(deps)(new Request('https://x/apply', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ action: 'analyze', application_ids: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'not-an-id'] }) }));
    const body = (await res.json()) as { ok: boolean; forms: Record<string, { status: string }> };
    expect(body.ok).toBe(true);
    expect(body.forms['11111111-1111-4111-8111-111111111111'].status).toBe('ok');
    expect(body.forms['22222222-2222-4222-8222-222222222222'].status).toBe('closed');
    expect(stored).toHaveLength(1);
  });
});
