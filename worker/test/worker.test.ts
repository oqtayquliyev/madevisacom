// The worker against pretend employer sites in a real Chromium.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright-core';
import { processJob, applyUrl, type Deps, type Job } from '../src/run';
import { startSites, type Site } from './sites';

const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let site: Site;
let browser: Browser;
beforeAll(async () => {
  site = await startSites();
  browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-sandbox'] });
});
afterAll(async () => {
  await browser?.close();
  site?.server.close();
});

const job = (url: string, over: Partial<Job> = {}): Job => ({
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'u1',
  jobId: 'j1',
  title: 'Data Analyst',
  company: 'Hansa',
  cc: 'DE',
  country: 'Germany',
  url,
  platform: 'other',
  channel: 'employer_site',
  email: 'leyla@example.com',
  autoSubmit: true,
  concepts: {
    full_name: 'Leyla Mammadova', first_name: 'Leyla', last_name: 'Mammadova', email: 'leyla@example.com', phone: '+994 50 555 01 23',
    linkedin: 'https://linkedin.com/in/leyla', city: 'Baku', country: 'Azerbaijan', sponsorship: 'Yes', work_authorization: 'No',
    salary_expectation: '€60,000', years_experience: '7', consent: 'Yes', source: 'MadeVisa',
  },
  answers: [],
  form: null,
  cv: { name: 'Leyla Mammadova — Data Analyst CV', content: 'Leyla', lines: [{ kind: 'name', text: 'Leyla Mammadova' }, { kind: 'text', text: 'Data analyst' }] },
  letter: null,
  mail: null,
  ...over,
});

const calls: { stages: string[]; uploads: string[] } = { stages: [], uploads: [] };
const deps = (over: Partial<Deps> = {}): Deps => ({
  browser: async () => browser,
  progress: async (s) => void calls.stages.push(s),
  upload: async (name) => (calls.uploads.push(name), `u1/app/${name}`),
  fetch,
  log: () => {},
  confirmWaitMs: 6000,
  ...over,
});
const lastPost = () => site.posts[site.posts.length - 1];
const field = (body: string, name: string) => body.match(new RegExp(`name="${name.replace(/[[\]]/g, '\\$&')}"\\r\\n\\r\\n([^\\r]*)`))?.[1];

describe('the application worker', () => {
  it('fills and submits a Greenhouse-style form, and keeps the evidence', async () => {
    calls.stages = []; calls.uploads = [];
    const n = site.posts.length;
    const r = await processJob(job(`${site.base}/gh/jobs/1001`, { platform: 'greenhouse' }), deps());
    expect(r.to, JSON.stringify(r.detail)).toBe('submitted');
    expect(r.detail).toMatchObject({ confirmation: { kind: 'site', id: 'HX-48213' }, cvPath: 'u1/app/cv.docx' });
    expect((r.detail.evidence as { url: string }).url).toMatch(/\/gh\/confirmation$/);
    expect((r.detail.evidence as { text: string }).text).toMatch(/Thank you for applying/);
    expect(r.detail.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(calls.stages).toEqual(['opening', 'uploading', 'filling', 'submitting']);
    expect(calls.uploads).toEqual(['cv.docx', 'confirmation.png']);
    expect(site.posts.length).toBe(n + 1);
    const body = lastPost().body;
    expect(field(body, 'job_application[first_name]')).toBe('Leyla');
    expect(field(body, 'job_application[last_name]')).toBe('Mammadova');
    expect(field(body, 'job_application[email]')).toBe('leyla@example.com');
    expect(field(body, 'question_1')).toBe('https://linkedin.com/in/leyla');
    expect(field(body, 'question_2')).toBe('1');
    expect(field(body, 'question_4')).toBe('€60,000'.replace('€', 'â\u0082¬'));
    expect(field(body, 'gdpr')).toBe('on');
    // Never answered for anyone, never ticked for anyone.
    expect(field(body, 'gender')).toBe('');
    expect(body).not.toContain('name="talent_pool"');
    expect(body).toMatch(/name="resume"; filename="Leyla Mammadova — Data Analyst CV\.docx"|name="resume"; filename="Leyla Mammadova .* Data Analyst CV\.docx"/);
  });

  it('attaches the CV file the person uploaded, exactly as it is', async () => {
    calls.uploads = [];
    const pdf = new TextEncoder().encode('%PDF-1.4 Oqtay original CV');
    const r = await processJob(job(`${site.base}/acme/apply`), deps({ originalCv: async () => ({ bytes: pdf, fileName: 'Oqtay Quliyev CV.pdf', type: 'application/pdf' }) }));
    expect(r.to, JSON.stringify(r.detail)).toBe('submitted');
    expect(r.detail.cvFile).toBe('original');
    expect(calls.uploads[0]).toBe('cv.pdf');
    const body = lastPost().body;
    expect(body).toMatch(/name="cv"; filename="Oqtay Quliyev CV\.pdf"\r\nContent-Type: application\/pdf\r\n\r\n%PDF-1\.4 Oqtay original CV/);
  });

  it('stops before submitting when the form asks something only the person can answer — and says what', async () => {
    const n = site.posts.length;
    const r = await processJob(job(`${site.base}/lever/c1/apply`, { platform: 'lever' }), deps());
    expect(r.to).toBe('needs_attention');
    expect(r.detail.code).toBe('question');
    expect((r.detail.needs as { label: string }[]).map((x) => x.label)).toEqual(['Why do you want to join Hansa?']);
    expect(site.posts.length).toBe(n);
  });

  it('…and submits it once the person has answered', async () => {
    const r = await processJob(job(`${site.base}/lever/c1/apply`, { platform: 'lever', answers: [{ id: 'lever:cards[c1][field1]', label: 'Why do you want to join Hansa?', value: 'Your logistics data team is the one I want to learn from.', key: null }] }), deps());
    expect(r.to, JSON.stringify(r.detail)).toBe('submitted');
    const body = lastPost().body;
    expect(field(body, 'name')).toBe('Leyla Mammadova');
    expect(field(body, 'location')).toBe('Baku, Azerbaijan');
    expect(field(body, 'urls[LinkedIn]')).toBe('https://linkedin.com/in/leyla');
    expect(field(body, 'cards[c1][field0]')).toBe('Yes');
    expect(field(body, 'cards[c1][field1]')).toMatch(/logistics data team/);
  });

  it('finds the form behind an "Apply now" button on a company’s own careers page', async () => {
    const r = await processJob(job(`${site.base}/acme/jobs/7`), deps());
    expect(r.to, JSON.stringify(r.detail)).toBe('submitted');
    const body = lastPost().body;
    expect(lastPost().path).toBe('/acme/submit');
    expect(field(body, 'fname')).toBe('Leyla');
    expect(field(body, 'mail')).toBe('leyla@example.com');
    expect(field(body, 'auth')).toBe('n');
    expect(field(body, 'years')).toBe('6-9 years');
    expect(field(body, 'privacy')).toBe('on');
  });

  it('never gets round a CAPTCHA: the application is handed to the person, nothing is sent', async () => {
    const n = site.posts.length;
    const r = await processJob(job(`${site.base}/captcha`), deps());
    expect(r.to).toBe('needs_attention');
    expect(r.detail.code).toBe('captcha');
    expect(site.posts.length).toBe(n);
  });

  it('never signs in as the person', async () => {
    const r = await processJob(job(`${site.base}/login`), deps());
    expect(r).toMatchObject({ to: 'blocked', detail: { code: 'login_required', reason: 'This employer requires an account login that MadeVisa cannot complete automatically.' } });
  });

  it('a form the employer refuses is not called submitted', async () => {
    const r = await processJob(job(`${site.base}/refuse`), deps());
    expect(r.to).toBe('needs_attention');
    expect(r.detail.code).toBe('form_refused');
    expect(r.detail.reason).toMatch(/Phone is required/);
  });

  it('no confirmation from the employer: pressed, but not claimed as submitted', async () => {
    const r = await processJob(job(`${site.base}/silent`), deps());
    expect(r.to).toBe('needs_attention');
    expect(r.detail.code).toBe('unconfirmed');
  });

  it('test mode fills everything and presses nothing', async () => {
    const n = site.posts.length;
    calls.uploads = [];
    const r = await processJob(job(`${site.base}/acme/apply`, { autoSubmit: false }), deps());
    expect(r.to).toBe('needs_attention');
    expect(r.detail.code).toBe('dry_run');
    expect(site.posts.length).toBe(n);
    expect(calls.uploads).toContain('filled.png');
  });

  it('a closed job is expired, a missing page too', async () => {
    expect((await processJob(job(`${site.base}/closed`), deps())).to).toBe('expired');
    expect((await processJob(job(`${site.base}/nothing-here`), deps())).to).toBe('expired');
  });

  it('a site that doesn’t load is tried again later', async () => {
    const r = await processJob(job('http://127.0.0.1:1/jobs/1'), deps());
    expect(r.to).toBe('ready');
    expect(r.detail.retryInSeconds).toBeGreaterThan(0);
  });

  it('sends by email where the employer takes applications through MadeVisa — once, whatever happens', async () => {
    const sent: { headers: Record<string, string>; body: { to: string[]; reply_to: string; attachments: { filename: string }[] } }[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent.push({ headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ id: 'msg_9' }), { status: 200 });
    }) as typeof fetch;
    const r = await processJob(job('', { channel: 'madevisa', url: null, mail: { to: 'jobs@acme.example', key: 're_x', from: 'MadeVisa <apply@send.madevisa.com>' } }), deps({ fetch: fakeFetch }));
    expect(r).toMatchObject({ to: 'submitted', detail: { confirmation: { kind: 'email', id: 'msg_9' } } });
    expect(sent[0].headers['Idempotency-Key']).toBe('madevisa-apply-11111111-1111-4111-8111-111111111111');
    expect(sent[0].body.to).toEqual(['jobs@acme.example']);
    expect(sent[0].body.reply_to).toBe('leyla@example.com');
    expect(sent[0].body.attachments[0].filename).toMatch(/\.docx$/);
  });

  it('opens the form page for hiring systems that have one', () => {
    expect(applyUrl('https://jobs.lever.co/hansa/0b1d2c3e-1111-4111-8111-111111111111', 'lever')).toBe('https://jobs.lever.co/hansa/0b1d2c3e-1111-4111-8111-111111111111/apply');
    expect(applyUrl('https://jobs.ashbyhq.com/hansa/0b1d2c3e-1111-4111-8111-111111111111', 'ashby')).toBe('https://jobs.ashbyhq.com/hansa/0b1d2c3e-1111-4111-8111-111111111111/application');
    expect(applyUrl('https://boards.greenhouse.io/hansa/jobs/1', 'greenhouse')).toBe('https://boards.greenhouse.io/hansa/jobs/1');
  });
});
