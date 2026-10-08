// The apply function's logic (see index.ts for what it does and how to deploy it).
//
// Nothing here talks to Deno or Supabase directly: the database, the
// sign-in check and the network are handed in (Deps), so the same code runs
// in the tests against a pretend mail service.

// deno-lint-ignore no-explicit-any
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Deps = {
  /** A database function, called with the service role. */
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: Json; error: { message: string } | null }>;
  /** The signed-in person behind an Authorization header, or null. */
  getUser: (authorization: string) => Promise<{ id: string; email: string | null } | null>;
  fetch: typeof fetch;
  /** Ask GitHub to start the application worker now (GitHub Actions). Optional: without it, the scheduled run picks applications up. */
  kick?: () => Promise<boolean>;
};

import { readForms, type FormRead } from './forms.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]{2,}$/;
/** The tailored CV is a small Word file; anything bigger is not one of ours. */
export const MAX_CV_BYTES = 1_500_000;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** One line, no control characters: safe to put in a subject or a name. */
// eslint-disable-next-line no-control-regex
const line = (s: unknown, max = 200) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const fileName = (s: unknown) => (line(s, 80).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\.docx$/i, '').trim() || 'CV') + '.docx';

async function sha256(base64: string): Promise<string> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type Answer = { label: string; value: string };

/** The email an employer receives. Plain text, the person's own words and facts, and who to reply to. */
export function buildEmail(x: { title: string; company: string; name: string; replyTo: string; letter: string | null; answers: Answer[] }): { subject: string; text: string } {
  const name = line(x.name, 80) || 'A candidate';
  const first = name.split(' ')[0];
  const details = x.answers
    .map((a) => ({ label: line(a.label, 160), value: String(a.value ?? '').replace(/\r/g, '').trim().slice(0, 4000) }))
    .filter((a) => a.label && a.value)
    .map((a) => (a.value.includes('\n') || a.value.length > 90 ? `${a.label}\n${a.value}\n` : /[?:]$/.test(a.label) ? `${a.label} ${a.value}` : `${a.label}: ${a.value}`));
  const body = [
    x.letter?.trim() || `Dear ${line(x.company, 120)} hiring team,\n\nPlease find my application for the ${line(x.title, 160)} role attached.\n\n${name}`,
    '',
    '— — —',
    `Application for: ${line(x.title, 160)}`,
    ...details,
    '',
    `Sent through MadeVisa (madevisa.com) at ${name}’s request, with their CV attached.`,
    `Reply to this email to reach ${first} directly: ${x.replyTo}`,
  ];
  return { subject: `Application: ${line(x.title, 120)} — ${name}`, text: body.join('\n') };
}

/** board and job id from a Greenhouse link (the same reading as src/lib/apply/channels.ts greenhouseRef). */
export function greenhouseRef(url: string | null | undefined): { board: string; job: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)greenhouse\.io$/.test(u.hostname.toLowerCase())) return null;
    const embed = u.searchParams.get('for');
    const token = u.searchParams.get('token');
    if (embed && token && /^\d+$/.test(token) && /^[A-Za-z0-9_-]+$/.test(embed)) return { board: embed, job: token };
    const m = u.pathname.match(/^\/(?:embed\/job_app\/)?([A-Za-z0-9_-]+)\/jobs\/(\d+)/);
    return m ? { board: m[1], job: m[2] } : null;
  } catch {
    return null;
  }
}

type Ctx = {
  ok: boolean;
  status: string;
  channel: string;
  title: string;
  company: string;
  open: boolean;
  to: string | null;
  candidateEmail: string | null;
  sentBefore: { kind: string; id: string } | null;
  resendKey: string | null;
  from: string | null;
};

async function submit(deps: Deps, user: { id: string; email: string | null }, body: Json): Promise<Response> {
  const id = String(body?.application_id ?? '');
  if (!UUID.test(id)) return json({ ok: false, handover: false, code: 'bad_request', reason: 'This application could not be found.' }, 400);

  const read = await deps.rpc('apply_send_context', { p_id: id, p_user: user.id });
  const ctx = read.data as Ctx | null;
  if (read.error || !ctx?.ok) return json({ ok: false, handover: false, code: 'not_found', reason: 'This application could not be found.' }, 404);

  const finish = async (to: 'submitted' | 'failed' | 'review_required', detail: Record<string, unknown>) => {
    const r = await deps.rpc('apply_finish', { p_id: id, p_user: user.id, p_to: to, p_detail: detail });
    return (r.data?.app ?? null) as Json;
  };

  // Sent on an earlier try whose answer never arrived: record it, don't send it again.
  if (ctx.sentBefore?.id) {
    const app = await finish('submitted', { confirmation: ctx.sentBefore });
    return json({ ok: true, confirmation: ctx.sentBefore, app });
  }
  if (ctx.status === 'submitted') return json({ ok: false, handover: false, code: 'already', reason: 'This application was already submitted.' }, 409);
  // Only an application the database has moved to "submitting" (allowance set aside) is sent.
  if (ctx.status !== 'submitting') return json({ ok: false, handover: false, code: 'not_ready', reason: 'This application isn’t ready to send.' }, 409);

  if (!ctx.open) {
    const app = await finish('failed', { reason: 'The job closed before the application could be sent.', code: 'closed' });
    return json({ ok: false, handover: false, code: 'closed', reason: 'The job closed before the application could be sent.', app });
  }
  // The employer no longer takes applications through MadeVisa: hand it to the person.
  if (ctx.channel !== 'madevisa' || !ctx.to || !EMAIL.test(ctx.to)) {
    const reason = 'This employer now takes applications on its own site. Your application is ready to send there.';
    const app = await finish('review_required', { reason, code: 'channel_off' });
    return json({ ok: false, handover: true, code: 'channel_off', reason, app });
  }

  const fail = async (reason: string, code: string) => {
    const app = await finish('failed', { reason, code });
    return json({ ok: false, handover: false, code, reason, app });
  };

  const cv = body?.cv;
  const base64 = typeof cv?.base64 === 'string' ? cv.base64 : '';
  if (!base64 || !/^[A-Za-z0-9+/]+=*$/.test(base64)) return fail('The tailored CV was missing from the application.', 'no_cv');
  if (base64.length * 0.75 > MAX_CV_BYTES) return fail('The tailored CV is too large to send.', 'cv_too_large');
  // A Word file is a zip: it starts with "PK".
  if (!base64.startsWith('UEsD')) return fail('The tailored CV is not a Word file.', 'bad_cv');

  const answers: Answer[] = Array.isArray(body?.answers) ? body.answers.slice(0, 80) : [];
  const find = (re: RegExp) => answers.find((a) => re.test(String(a?.label ?? '')))?.value;
  const name = line(find(/^full name$/i) ?? '', 80);
  const replyTo = line(find(/^e-?mail$/i) ?? ctx.candidateEmail ?? user.email ?? '', 200);
  if (!name) return fail('Your name is missing from the application.', 'no_name');
  if (!EMAIL.test(replyTo)) return fail('Your email address is missing from the application, so the employer could not reply.', 'no_reply_to');
  if (!ctx.resendKey) return fail('MadeVisa’s mail service isn’t set up yet, so the application could not be sent.', 'mail_not_set_up');

  const letter = typeof body?.letter === 'string' && body.letter.trim() ? body.letter.slice(0, 12000) : null;
  const mail = buildEmail({ title: ctx.title, company: ctx.company, name, replyTo, letter, answers });
  const digest = await sha256(base64);

  let res: Response;
  try {
    res = await deps.fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.resendKey}`,
        'Content-Type': 'application/json',
        // The same application is never mailed twice, even if this call is repeated.
        'Idempotency-Key': `madevisa-apply-${id}`,
      },
      body: JSON.stringify({
        from: ctx.from || 'MadeVisa <onboarding@resend.dev>',
        to: [ctx.to],
        reply_to: replyTo,
        subject: mail.subject,
        text: mail.text,
        attachments: [{ filename: fileName(cv?.name), content: base64, content_type: DOCX }],
      }),
    });
  } catch {
    return fail('MadeVisa couldn’t reach its mail service. Nothing was sent; you can try again.', 'mail_unreachable');
  }
  const out = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok || !out?.id) {
    console.error('apply: mail refused', res.status, out?.message);
    return fail(res.status === 422 || res.status === 400 ? 'The employer’s address refused the message. Nothing was sent.' : 'The mail service didn’t accept the message. Nothing was sent; you can try again.', `mail_${res.status}`);
  }
  const confirmation = { kind: 'email', id: String(out.id) };
  const app = await finish('submitted', { confirmation, sha256: digest });
  return json({ ok: true, confirmation, app });
}

/** A job's public list of application questions, where the hiring system publishes one. */
async function questions(deps: Deps, body: Json): Promise<Response> {
  const jobId = String(body?.job_id ?? '');
  if (!UUID.test(jobId)) return json({ ok: false }, 400);
  const link = await deps.rpc('apply_job_link', { p_job: jobId });
  const ref = greenhouseRef(typeof link.data === 'string' ? link.data : null);
  // Only the hiring system's own public API, at an address built here — never a link from the page.
  if (!ref) return json({ ok: true, source: null, questions: null });
  try {
    const res = await deps.fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ref.board)}/jobs/${encodeURIComponent(ref.job)}?questions=true`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return json({ ok: true, source: 'greenhouse', questions: null });
    const data = (await res.json()) as { questions?: unknown };
    return json({ ok: true, source: 'greenhouse', questions: Array.isArray(data?.questions) ? data.questions.slice(0, 80) : null });
  } catch {
    return json({ ok: true, source: 'greenhouse', questions: null });
  }
}

/**
 * Read the application forms of a batch before anything is asked or sent: { action: 'analyze', application_ids }.
 * Only the person's own applications; the forms are kept (application_forms) and returned.
 */
async function analyze(deps: Deps, user: { id: string }, body: Json): Promise<Response> {
  const ids: string[] = Array.isArray(body?.application_ids) ? body.application_ids.filter((x: unknown) => typeof x === 'string' && UUID.test(x)).slice(0, 60) : [];
  if (!ids.length) return json({ ok: false, reason: 'Nothing to read.' }, 400);
  const t = await deps.rpc('apply_form_targets', { p_user: user.id, p_ids: ids });
  if (t.error) return json({ ok: false, reason: 'The applications could not be read.' }, 500);
  const targets = (Array.isArray(t.data) ? t.data : []) as { id: string; url: string | null; email: boolean; open: boolean }[];
  const open = targets.filter((x) => x.open);
  const forms: Record<string, FormRead> = await readForms(deps.fetch, open.map((x) => ({ id: x.id, url: x.url, email: x.email })));
  for (const x of targets) if (!x.open) forms[x.id] = { platform: null, status: 'closed', questions: null };
  await deps.rpc('apply_forms_store', { p_user: user.id, p_forms: forms });
  return json({ ok: true, forms });
}

export function makeHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ ok: false, reason: 'POST only.' }, 405);
    const user = await deps.getUser(req.headers.get('Authorization') ?? '');
    if (!user) return json({ ok: false, handover: false, code: 'signed_out', reason: 'Sign in to apply.' }, 401);
    const body = (await req.json().catch(() => null)) as Json;
    try {
      if (body?.action === 'submit') return await submit(deps, user, body);
      if (body?.action === 'questions') return await questions(deps, body);
      if (body?.action === 'analyze') return await analyze(deps, user, body);
      if (body?.action === 'kick') return json({ ok: true, started: deps.kick ? await deps.kick().catch(() => false) : false });
      return json({ ok: false, reason: 'Unknown action.' }, 400);
    } catch (e) {
      console.error('apply', e);
      return json({ ok: false, handover: false, code: 'error', reason: 'Something went wrong while sending. Nothing was marked as submitted.' }, 500);
    }
  };
}
