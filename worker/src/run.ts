// One application, start to finish: open the employer's careers page, find
// the form, fill it in, attach the tailored CV, submit — and report exactly
// what happened. Or, for an employer that takes applications by email,
// send it by email.
//
// The result is always one of:
//   submitted        with evidence (the confirmation page, its text, a screenshot)
//   needs_attention  a question only the person can answer, a CAPTCHA, a form
//                    MadeVisa couldn't complete — with the reason in plain words
//   blocked          the employer requires a sign-in
//   expired          the job is closed
//   ready            the site didn't respond: try again later
//   failed           something MadeVisa can't get past by trying again
//
// Rules this file keeps:
//   • A CAPTCHA, a sign-in or any other check that a person is applying is
//     never got round. The application is handed to the person.
//   • Submit is pressed at most once per attempt, and only after every
//     required field is filled. Once it is pressed the database knows
//     (progress 'submitting'), so an interrupted attempt is never repeated
//     blindly.
//   • "submitted" is reported only when the employer's page confirms it.

import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, BrowserContext, Frame, Page } from 'playwright-core';
import { docxBytes, letterLines } from '../../src/lib/apply/docx';
import type { TLine } from '../../src/lib/apply/tailor';
import { buildEmail } from '../../supabase/functions/apply/core';
import { act, clickApply, clickSubmit, findApply, findEmbed, findSubmit, readFields, readState, type PageState } from './page';
import { asksLogin, confirmationId, isClosed, isSuccess, planFill, successSnippet, type LiveField, type Pack } from './plan';

export type Job = {
  id: string;
  userId: string;
  jobId: string;
  title: string;
  company: string;
  cc: string | null;
  country: string | null;
  url: string | null;
  platform: string | null;
  channel: 'madevisa' | 'employer_site';
  email: string | null;
  autoSubmit: boolean;
  concepts: Record<string, string>;
  answers: { id: string; label: string; value: string; key: string | null }[];
  form: { platform: string | null; status: string; questions: unknown[] | null } | null;
  cv: { name: string; content: string; lines: TLine[] | null } | null;
  letter: { name: string; content: string } | null;
  mail: { to: string | null; key: string | null; from: string | null } | null;
};

export type Outcome = 'submitted' | 'failed' | 'needs_attention' | 'blocked' | 'ready' | 'expired';
export type Report = { to: Outcome; detail: Record<string, unknown> };

/** The CV file attached to the application. */
export type CvFile = { bytes: Uint8Array; fileName: string; type: string; original: boolean };

export type Deps = {
  browser: () => Promise<Browser>;
  /** The CV file the person uploaded (PDF, Word…), when MadeVisa should attach that one. Null = attach the tailored Word version. */
  originalCv?: () => Promise<Omit<CvFile, 'original'> | null>;
  progress: (stage: 'opening' | 'filling' | 'uploading' | 'submitting') => Promise<void>;
  /** Keep a file with the application (storage). Returns its path, or null. */
  upload: (name: string, bytes: Uint8Array, type: string) => Promise<string | null>;
  fetch: typeof fetch;
  log: (...a: unknown[]) => void;
  /** How long to wait for the employer's page after Submit (ms). */
  confirmWaitMs?: number;
};

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
/** A file name every employer's upload accepts: plain letters, digits, spaces and dashes. */
export const safeName = (s: string) =>
  (s
    .replace(/[əƏ]/g, (c) => (c === 'ə' ? 'e' : 'E'))
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .replace(/[øØ]/g, (c) => (c === 'ø' ? 'o' : 'O'))
    .replace(/[łŁ]/g, (c) => (c === 'ł' ? 'l' : 'L'))
    .replace(/æ/g, 'ae')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^A-Za-z0-9 ._()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[ .-]+|[ .-]+$/g, '')
    .slice(0, 80) || 'CV') + '.docx';

/** The same tidy name for a file the person uploaded, keeping its own extension (.pdf, .docx, …). */
export const safeFile = (name: string) => {
  const m = name.match(/\.(pdf|docx|doc|odt|rtf|txt)$/i);
  return safeName(m ? name.slice(0, -m[0].length) : name).replace(/\.docx$/, m ? `.${m[1].toLowerCase()}` : '.pdf');
};

const attention = (code: string, reason: string, extra: Record<string, unknown> = {}): Report => ({ to: 'needs_attention', detail: { code, reason, ...extra } });

/** Where the form itself is, for the hiring systems whose form has its own address. */
export function applyUrl(url: string, platform: string | null): string {
  try {
    const u = new URL(url);
    if (platform === 'lever' && /^\/[^/]+\/[0-9a-f-]{36}\/?$/i.test(u.pathname)) u.pathname = u.pathname.replace(/\/?$/, '/apply');
    if (platform === 'ashby' && /^\/[^/]+\/[0-9a-f-]{36}\/?$/i.test(u.pathname)) u.pathname = u.pathname.replace(/\/?$/, '/application');
    return u.toString();
  } catch {
    return url;
  }
}

export async function processJob(job: Job, deps: Deps): Promise<Report> {
  if (!job.cv?.lines?.length && !job.cv?.content) return { to: 'failed', detail: { code: 'no_cv', reason: 'The tailored CV was missing from this application.' } };
  const lines: TLine[] = job.cv.lines?.length ? job.cv.lines : job.cv.content.split('\n').map((t) => ({ kind: 'text', text: t }) as TLine);
  // The person's own file, as they uploaded it — or, when there is none (a pasted CV), the tailored Word version.
  const own = await deps.originalCv?.().catch(() => null);
  const file: CvFile = own ? { ...own, fileName: safeFile(own.fileName), original: true } : { bytes: docxBytes(lines, job.cv.name), fileName: safeName(job.cv.name), type: DOCX, original: false };
  const ext = file.fileName.split('.').pop() ?? 'docx';
  const keep = { sha256: sha256(file.bytes), cvPath: await deps.upload(`cv.${ext}`, file.bytes, file.type).catch(() => null), cvFile: file.original ? 'original' : 'tailored' };

  if (job.channel === 'madevisa') return withKeep(await sendEmail(job, file, deps), keep);
  if (!job.url) return withKeep(attention('no_form', 'This job has no online application form MadeVisa can reach.'), keep);
  return withKeep(await applyOnSite(job, file, deps), keep);
}

const withKeep = (r: Report, keep: Record<string, unknown>): Report => ({ to: r.to, detail: { ...keep, ...r.detail } });

// --- Email ---------------------------------------------------------------------------------

async function sendEmail(job: Job, file: CvFile, deps: Deps): Promise<Report> {
  const to = job.mail?.to;
  const key = job.mail?.key;
  if (!to) return { to: 'needs_attention', detail: { code: 'channel_off', reason: 'This employer no longer takes applications through MadeVisa.' } };
  if (!key) return { to: 'needs_attention', detail: { code: 'mail_not_set_up', reason: 'MadeVisa’s mail service isn’t set up yet, so this application wasn’t sent.' } };
  const c = job.concepts;
  const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ');
  const replyTo = job.email ?? c.email;
  if (!name) return attention('no_name', 'Your name is missing from the application.');
  if (!replyTo) return attention('no_reply_to', 'Your email address is missing, so the employer couldn’t reply.');
  const mail = buildEmail({ title: job.title, company: job.company, name, replyTo, letter: job.letter?.content ?? null, answers: job.answers.map((a) => ({ label: a.label, value: a.value })) });
  let res: Response;
  try {
    res = await deps.fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `madevisa-apply-${job.id}` },
      body: JSON.stringify({
        from: job.mail?.from || 'MadeVisa <onboarding@resend.dev>',
        to: [to],
        reply_to: replyTo,
        subject: mail.subject,
        text: mail.text,
        attachments: [{ filename: file.fileName, content: Buffer.from(file.bytes).toString('base64'), content_type: file.type }],
      }),
    });
  } catch {
    return { to: 'ready', detail: { code: 'mail_unreachable', reason: 'MadeVisa couldn’t reach its mail service.', retryInSeconds: 300 } };
  }
  const out = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (res.ok && out?.id) return { to: 'submitted', detail: { confirmation: { kind: 'email', id: out.id }, evidence: { kind: 'email', to, at: new Date().toISOString() } } };
  if (res.status === 429 || res.status >= 500) return { to: 'ready', detail: { code: `mail_${res.status}`, reason: 'The mail service was busy.', retryInSeconds: 300 } };
  return { to: 'failed', detail: { code: `mail_${res.status}`, reason: 'The employer’s address refused the message. Nothing was sent.' } };
}

// --- The employer's site ---------------------------------------------------------------------

async function settle(p: Page, ms = 6000) {
  await p.waitForLoadState('domcontentloaded', { timeout: ms }).catch(() => {});
  await p.waitForLoadState('networkidle', { timeout: ms }).catch(() => {});
}

const usable = (fs: LiveField[]) => fs.filter((f) => f.kind !== 'checkbox' && f.label).length;

/** Find the application form: on the page itself, in an embedded frame, or behind an "Apply" button. */
async function findForm(page: Page, ctx: BrowserContext, deps: Deps): Promise<{ where: Page | Frame; page: Page; fields: LiveField[] }> {
  let current = page;
  for (let hop = 0; hop < 3; hop += 1) {
    let fields = await readFields(current).catch(() => [] as LiveField[]);
    if (usable(fields) >= 2) return { where: current, page: current, fields };
    // A careers page that shows the hiring system's form in a frame: read the frame.
    const embed = await findEmbed(current).catch(() => null);
    if (embed) {
      const frame = current.frames().find((f) => f.url() === embed) ?? current.frames().find((f) => /greenhouse|lever|ashby|workable|smartrecruiters/i.test(f.url()));
      if (frame) {
        await frame.waitForLoadState('domcontentloaded').catch(() => {});
        fields = await readFields(frame).catch(() => [] as LiveField[]);
        if (usable(fields) >= 2) return { where: frame, page: current, fields };
      }
      await current.goto(embed, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await settle(current);
      continue;
    }
    const href = await findApply(current).catch(() => null);
    if (href == null) return { where: current, page: current, fields };
    deps.log('apply button', href);
    const popup = ctx.waitForEvent('page', { timeout: 6000 }).catch(() => null);
    await clickApply(current).catch(() => {});
    const opened = await popup;
    if (opened) current = opened;
    await settle(current);
  }
  return { where: current, page: current, fields: await readFields(current).catch(() => []) };
}

async function evidence(page: Page, deps: Deps, name: string): Promise<string | null> {
  const shot = await page.screenshot({ type: 'png', fullPage: false, timeout: 10000 }).catch(() => null);
  return shot ? deps.upload(name, new Uint8Array(shot), 'image/png').catch(() => null) : null;
}

async function applyOnSite(job: Job, file: CvFile, deps: Deps): Promise<Report> {
  const dir = await mkdtemp(join(tmpdir(), 'mv-apply-'));
  const browser = await deps.browser();
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 }, acceptDownloads: false });
  let pressed = false;
  try {
    const cvPath = join(dir, file.fileName);
    await writeFile(cvPath, file.bytes);
    let letterPath: string | null = null;
    if (job.letter?.content) {
      letterPath = join(dir, safeName(job.letter.name || 'Cover letter'));
      await writeFile(letterPath, docxBytes(letterLines(job.letter.content), job.letter.name || 'Cover letter'));
    }

    await deps.progress('opening');
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    let res;
    try {
      res = await page.goto(applyUrl(job.url!, job.platform), { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (e) {
      deps.log('open failed', String(e));
      return { to: 'ready', detail: { code: 'unreachable', reason: 'The employer’s careers page didn’t load.', retryInSeconds: 600 } };
    }
    if (res && (res.status() === 404 || res.status() === 410)) return { to: 'expired', detail: { code: 'closed', reason: 'The job is no longer on the employer’s site.' } };
    if (res && res.status() >= 500) return { to: 'ready', detail: { code: `http_${res.status()}`, reason: 'The employer’s site had an error.', retryInSeconds: 900 } };
    await settle(page);

    const { where, page: top, fields } = await findForm(page, ctx, deps);
    const before = await readState(where).catch(() => ({ captcha: false, password: false, errors: [], missing: [], text: '' }) as PageState);
    if (before.password || (usable(fields) < 2 && asksLogin(before.text))) {
      return { to: 'blocked', detail: { code: 'login_required', reason: 'This employer requires an account login that MadeVisa cannot complete automatically.' } };
    }
    if (usable(fields) < 2) {
      if (isClosed(before.text)) return { to: 'expired', detail: { code: 'closed', reason: 'The job is no longer open.' } };
      return attention('no_form', 'MadeVisa couldn’t find an application form on the employer’s page.', { evidence: { url: top.url() } });
    }
    if (before.captcha) return attention('captcha', 'The employer’s site asks for a human check (CAPTCHA) before you can apply. Open it to finish — everything else is prepared.', { evidence: { url: top.url() } });

    const pack: Pack = { answers: job.answers, concepts: job.concepts, hasLetter: Boolean(letterPath), letterText: job.letter?.content ?? null };
    const plan = planFill(fields, pack);
    deps.log('fields', fields.length, 'actions', plan.actions.length, 'missing', plan.missing.length);
    if (plan.missing.length) {
      return attention('question', plan.missing.length === 1 ? `The employer asks something MadeVisa can’t answer for you: “${plan.missing[0].label}”.` : `The employer asks ${plan.missing.length} things MadeVisa can’t answer for you.`, {
        needs: plan.missing,
        evidence: { url: top.url() },
      });
    }

    // Files first: some forms read the CV and fill fields from it — what MadeVisa fills afterwards wins.
    const files = { cv: cvPath, cover_letter: letterPath };
    await deps.progress('uploading');
    const failed: string[] = [];
    for (const a of plan.actions.filter((x) => x.do === 'file')) {
      await act(where, a, files).catch((e) => {
        deps.log('file failed', a.label, String(e));
        failed.push(a.label);
      });
    }
    await top.waitForTimeout(1500);
    await deps.progress('filling');
    for (const a of plan.actions.filter((x) => x.do !== 'file')) {
      await act(where, a, files).catch((e) => {
        deps.log('fill failed', a.label, String(e).slice(0, 200));
        failed.push(a.label);
      });
    }
    if (failed.length) return attention('fill_failed', `MadeVisa couldn’t fill in ${failed.length === 1 ? `“${failed[0]}”` : `${failed.length} fields`} on the employer’s form.`, { fields: failed.slice(0, 10), evidence: { url: top.url() } });

    const filled = await readState(where);
    if (filled.captcha) return attention('captcha', 'The employer’s site asks for a human check (CAPTCHA) before you can apply. Open it to finish — everything else is prepared.', { evidence: { url: top.url() } });
    if (filled.missing.length) {
      const labels = filled.missing.map((ref) => fields.find((f) => f.ref === ref || f.optionRefs?.includes(ref))?.label).filter(Boolean) as string[];
      return attention('fill_failed', `The employer’s form wouldn’t take ${labels.length ? labels.map((l) => `“${l}”`).slice(0, 3).join(', ') : 'some of the answers'}.`, { fields: labels, evidence: { url: top.url() } });
    }

    const button = await findSubmit(where);
    if (!button) return attention('no_submit', 'MadeVisa filled in the form but couldn’t find its Submit button.', { evidence: { url: top.url() } });

    if (!job.autoSubmit) {
      const shot = await evidence(top, deps, 'filled.png');
      return attention('dry_run', 'Test mode: MadeVisa filled in this application but did not submit it.', { evidence: { url: top.url(), screenshot: shot, button } });
    }

    // From here on, an interrupted attempt is never simply repeated.
    await deps.progress('submitting');
    pressed = true;
    const startUrl = top.url();
    await clickSubmit(where);

    const until = Date.now() + (deps.confirmWaitMs ?? 30000);
    let last: PageState | null = null;
    while (Date.now() < until) {
      await top.waitForTimeout(1000);
      // A form inside a frame may move the whole page, or only the frame.
      const pages = ctx.pages();
      const now = pages[pages.length - 1] ?? top;
      const url = now.url();
      const target: Page | Frame = now !== top ? now : where;
      last = await readState(target).catch(() => last);
      const text = last?.text ?? '';
      if (isSuccess(url, text) || (url !== startUrl && isSuccess(url, (await readState(now).catch(() => last))?.text ?? ''))) {
        const shot = await evidence(now, deps, 'confirmation.png');
        const id = confirmationId(text);
        return { to: 'submitted', detail: { confirmation: { kind: 'site', id: id ?? '' }, evidence: { url, text: successSnippet(text), screenshot: shot, at: new Date().toISOString() } } };
      }
      if (last?.captcha) {
        return attention('captcha', 'The employer’s site asked for a human check (CAPTCHA) when MadeVisa pressed Submit. It was not sent — open it to finish.', { evidence: { url } });
      }
      if (last?.errors.length && (url === startUrl || (await readFields(target).catch(() => [] as LiveField[])).length > 0)) {
        // The form refused it and is shown again with its errors: nothing was accepted.
        const shot = await evidence(now, deps, 'refused.png');
        return attention('form_refused', `The employer’s form didn’t accept the application: ${last.errors.slice(0, 3).join(' · ')}`, { evidence: { url, screenshot: shot } });
      }
    }
    const shot = await evidence(top, deps, 'after-submit.png');
    return attention('unconfirmed', 'MadeVisa pressed Submit but the employer’s site didn’t confirm it. Check your email for a confirmation before applying again.', { evidence: { url: top.url(), screenshot: shot } });
  } catch (e) {
    deps.log('error', String(e).slice(0, 500));
    if (pressed) return attention('unconfirmed', 'Something went wrong after MadeVisa pressed Submit. Check your email for a confirmation before applying again.');
    return { to: 'ready', detail: { code: 'error', reason: 'Something went wrong on the employer’s site.', retryInSeconds: 900 } };
  } finally {
    await ctx.close().catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
