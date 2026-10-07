import { describe, expect, it } from 'vitest';
import { buildEmail, greenhouseRef, makeHandler, type Deps } from '../../../../supabase/functions/apply/core.ts';
import { docxBytes, toBase64 } from '@/lib/apply/docx';

const APP = '11111111-1111-4111-8111-111111111111';
const USER = { id: '22222222-2222-4222-8222-222222222222', email: 'leyla@example.com' };
const CV = toBase64(docxBytes([{ kind: 'name', text: 'Leyla Mammadova' }], 'CV'));
const ANSWERS = [
  { label: 'Full name', value: 'Leyla Mammadova' },
  { label: 'Email', value: 'leyla@example.com' },
  { label: 'Phone', value: '+994 50 555 01 23' },
];

type World = {
  ctx: Record<string, unknown>;
  mail: { status: number; body: unknown } | 'throw';
  sent: { url: string; headers: Record<string, string>; body: { to: string[]; reply_to: string; subject: string; text: string; attachments: { filename: string; content: string }[] } }[];
  finished: { to: string; detail: Record<string, unknown> }[];
};
const world = (over: Partial<World['ctx']> = {}, mail: World['mail'] = { status: 200, body: { id: 'msg_1' } }): World => ({
  ctx: { ok: true, status: 'submitting', channel: 'madevisa', title: 'Data Analyst', company: 'Acme GmbH', open: true, to: 'jobs@acme.example', candidateEmail: 'leyla@example.com', sentBefore: null, resendKey: 're_key', from: 'MadeVisa <apply@madevisa.com>', ...over },
  mail,
  sent: [],
  finished: [],
});
const deps = (w: World, user: typeof USER | null = USER): Deps => ({
  getUser: async () => user,
  rpc: async (name, args) => {
    if (name === 'apply_send_context') return { data: w.ctx, error: null };
    if (name === 'apply_finish') {
      w.finished.push({ to: String(args?.p_to), detail: args?.p_detail as Record<string, unknown> });
      return { data: { ok: true, app: { id: APP, status: args?.p_to } }, error: null };
    }
    if (name === 'apply_job_link') return { data: w.ctx.link ?? null, error: null };
    return { data: null, error: { message: 'unknown' } };
  },
  fetch: (async (url: string, init?: RequestInit) => {
    if (String(url).includes('greenhouse')) return new Response(JSON.stringify({ questions: [{ label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text' }] }] }), { status: 200 });
    if (w.mail === 'throw') throw new Error('down');
    w.sent.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(w.mail.body), { status: w.mail.status });
  }) as typeof fetch,
});
const call = async (w: World, body: unknown, user: typeof USER | null = USER) => {
  const res = await makeHandler(deps(w, user))(new Request('https://x/apply', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const submit = { action: 'submit', application_id: APP, cv: { name: 'Leyla Data Analyst CV', base64: CV }, letter: 'Dear Acme GmbH hiring team,\n\nI am applying…', answers: ANSWERS };

describe('the sending function', () => {
  it('sends one email to the address the employer gave, CV attached, replies going to the candidate', async () => {
    const w = world();
    const r = await call(w, submit);
    expect(r.body).toMatchObject({ ok: true, confirmation: { kind: 'email', id: 'msg_1' } });
    expect(w.sent).toHaveLength(1);
    const m = w.sent[0];
    expect(m.url).toBe('https://api.resend.com/emails');
    expect(m.body.to).toEqual(['jobs@acme.example']);
    expect(m.body.reply_to).toBe('leyla@example.com');
    expect(m.body.subject).toBe('Application: Data Analyst — Leyla Mammadova');
    expect(m.body.text).toContain('I am applying…');
    expect(m.body.text).toContain('Phone: +994 50 555 01 23');
    expect(m.body.text).toContain('Sent through MadeVisa (madevisa.com) at Leyla Mammadova’s request');
    expect(m.body.attachments[0]).toMatchObject({ filename: 'Leyla Data Analyst CV.docx', content: CV });
    expect(m.headers['Idempotency-Key']).toBe(`madevisa-apply-${APP}`);
    // Recorded as submitted with the mail service's own id and the file's fingerprint.
    expect(w.finished).toHaveLength(1);
    expect(w.finished[0].to).toBe('submitted');
    expect(w.finished[0].detail.confirmation).toEqual({ kind: 'email', id: 'msg_1' });
    expect(String(w.finished[0].detail.sha256)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('needs a signed-in person', async () => {
    const w = world();
    expect((await call(w, submit, null)).status).toBe(401);
    expect(w.sent).toEqual([]);
  });

  it('sends nothing unless the database has moved the application to “submitting”', async () => {
    for (const status of ['queued', 'preparing', 'review_required', 'failed']) {
      const w = world({ status });
      const r = await call(w, submit);
      expect(r.body.ok).toBe(false);
      expect(w.sent).toEqual([]);
      expect(w.finished).toEqual([]);
    }
  });

  it('a refused message is “could not submit” — never “submitted”', async () => {
    const w = world({}, { status: 422, body: { message: 'invalid to' } });
    const r = await call(w, submit);
    expect(r.body).toMatchObject({ ok: false, handover: false, code: 'mail_422' });
    expect(w.finished.map((f) => f.to)).toEqual(['failed']);
    expect(w.finished[0].detail.confirmation).toBeUndefined();
  });

  it('an unreachable mail service is a failure that can be retried', async () => {
    const w = world({}, 'throw');
    const r = await call(w, submit);
    expect(r.body).toMatchObject({ ok: false, code: 'mail_unreachable' });
    expect(w.finished.map((f) => f.to)).toEqual(['failed']);
  });

  it('a 200 without a message id is not a confirmation', async () => {
    const w = world({}, { status: 200, body: {} });
    expect((await call(w, submit)).body.ok).toBe(false);
    expect(w.finished.map((f) => f.to)).toEqual(['failed']);
  });

  it('one that was sent before is recorded, not sent again', async () => {
    const w = world({ sentBefore: { kind: 'email', id: 'msg_old' } });
    const r = await call(w, submit);
    expect(r.body).toMatchObject({ ok: true, confirmation: { id: 'msg_old' } });
    expect(w.sent).toEqual([]);
    expect(w.finished[0]).toMatchObject({ to: 'submitted', detail: { confirmation: { id: 'msg_old' } } });
  });

  it('hands it to the person when the employer no longer takes applications through MadeVisa', async () => {
    const w = world({ to: null });
    const r = await call(w, submit);
    expect(r.body).toMatchObject({ ok: false, handover: true, code: 'channel_off' });
    expect(w.sent).toEqual([]);
    expect(w.finished.map((f) => f.to)).toEqual(['review_required']);
  });

  it('does not send to a closed job, without a name, without a reply address, or without the CV', async () => {
    const cases: [Partial<World['ctx']>, Record<string, unknown>, string][] = [
      [{ open: false }, submit, 'closed'],
      [{}, { ...submit, answers: ANSWERS.slice(1) }, 'no_name'],
      [{ candidateEmail: null }, { ...submit, answers: [ANSWERS[0]] }, 'no_reply_to'],
      [{}, { ...submit, cv: { name: 'x', base64: '' } }, 'no_cv'],
      [{}, { ...submit, cv: { name: 'x', base64: 'aGVsbG8=' } }, 'bad_cv'],
      [{ resendKey: null }, submit, 'mail_not_set_up'],
    ];
    for (const [ctx, body, code] of cases) {
      const w = world(ctx);
      const r = await call(w, body, ctx.candidateEmail === null ? { ...USER, email: null as unknown as string } : USER);
      expect(r.body.code).toBe(code);
      expect(w.sent).toEqual([]);
      expect(w.finished.map((f) => f.to)).toEqual(['failed']);
    }
  });

  it('keeps line breaks out of the subject and the file name', () => {
    const m = buildEmail({ title: 'Analyst\r\nBcc: x@evil.example', company: 'Acme', name: 'Leyla\nM', replyTo: 'l@example.com', letter: null, answers: [] });
    expect(m.subject).toBe('Application: Analyst Bcc: x@evil.example — Leyla M');
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.text).toContain('Please find my application for the Analyst Bcc: x@evil.example role attached.');
  });

  it('reads a job’s public question list only from the hiring system’s own API', async () => {
    const w = world({ link: 'https://boards.greenhouse.io/acme/jobs/4012345' });
    const r = await call(w, { action: 'questions', job_id: APP });
    expect(r.body).toMatchObject({ ok: true, source: 'greenhouse' });
    expect((r.body.questions as unknown[]).length).toBe(1);
    const none = await call(world({ link: 'https://careers.acme.example/jobs/1' }), { action: 'questions', job_id: APP });
    expect(none.body).toEqual({ ok: true, source: null, questions: null });
    // A link that tries to climb out of the path resolves to something that isn't a job: no fetch.
    expect(greenhouseRef('https://boards.greenhouse.io/acme/jobs/1/../../../x')).toBeNull();
    expect(greenhouseRef('https://evil.example/boards.greenhouse.io/acme/jobs/1')).toBeNull();
  });
});
