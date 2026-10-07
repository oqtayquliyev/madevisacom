// Auto Apply in the page: what the database knows (allowance, the batch in
// progress, every application), the person's preferences and saved answers,
// and the queue as it runs.
//
// One store for the whole page, like the CV and the matches. The rules live
// in the database (migration 20261204090000); this file asks, shows and
// runs — it never decides that an application was submitted.

import { useEffect, useSyncExternalStore } from 'react';
import { track } from '@vercel/analytics';
import { supabase } from '@/lib/supabase';
import { useAuth, type Profile } from '@/lib/auth';
import type { StoredCv } from '@/lib/cv/store';
import type { Planned } from '@/lib/apply/decision';
import { prepareApplication, type Kept } from '@/lib/apply/prepare';
import { mergeProfile, remember, suggestProfile } from '@/lib/apply/profile';
import { runQueue, type MoveDetail, type MoveResult, type RunEnd, type Step } from '@/lib/apply/runner';
import type { SubmitResult } from '@/lib/apply/channels';
import { DEFAULT_PREFS, EMPTY_PROFILE, type AppStatus, type Application, type ApplyPrefs, type ApplyProfile, type Needed, type PauseReason, type QueueState, type ServerFacts } from '@/lib/apply/types';

export type QueueInfo = { id: string; state: QueueState; reason: PauseReason; cvAt: string | null; createdAt: string };
export type ApplyStatus = {
  signedIn: boolean;
  enabled: boolean;
  pro: boolean;
  /** Applications a month that come with the person's plan, and how many are left. */
  monthly: number;
  used: number;
  left: number;
  freeMonthly: number;
  proMonthly: number;
  /** The most a day: the person's own choice, and the site's ceiling. */
  daily: number;
  dailyMax: number;
  today: number;
  resetsAt: string | null;
  queue: QueueInfo | null;
};

type State = {
  /** null = not asked yet · false = the database part isn't installed (the page shows nothing new). */
  available: boolean | null;
  status: ApplyStatus | null;
  prefs: ApplyPrefs;
  /** The person has saved preferences before (so the first-time setup isn't shown again). */
  prefsSaved: boolean;
  profile: ApplyProfile;
  /** What only the database knows about each matched job. */
  server: Map<string, ServerFacts>;
  serverFor: string | null;
  queue: QueueInfo | null;
  apps: App[];
  running: boolean;
  /** The application being worked on, and where it is. */
  current: { id: string; step: Step } | null;
  /** Seconds one application takes at the moment — for "time remaining". */
  pace: number;
  error: string | null;
  loadedFor: string | null;
};

let state: State = {
  available: null,
  status: null,
  prefs: DEFAULT_PREFS,
  prefsSaved: false,
  profile: EMPTY_PROFILE,
  server: new Map(),
  serverFor: null,
  queue: null,
  apps: [],
  running: false,
  current: null,
  pace: 3,
  error: null,
  loadedFor: null,
};
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;

const missing = (message: string) => /function|schema cache|does not exist|not find|relation/i.test(message);

// --- Events ----------------------------------------------------------------------

type PageEvent = 'cv_uploaded' | 'matches_loaded' | 'auto_apply_opened' | 'auto_apply_preferences_saved' | 'auto_apply_review_opened';
/** A product event from the page. Everything about an application itself is logged by the database where it happens. */
export function logEvent(name: PageEvent | 'auto_apply_started' | 'auto_apply_paused' | 'auto_apply_completed', props?: Record<string, string | number | boolean | null>): void {
  try {
    track(name, props);
  } catch {
    /* analytics blocked: fine */
  }
  if (state.available && state.status?.signedIn && (name === 'cv_uploaded' || name === 'matches_loaded' || name === 'auto_apply_opened' || name === 'auto_apply_preferences_saved' || name === 'auto_apply_review_opened')) {
    void supabase.rpc('apply_event', { p_name: name, p_props: props ?? null, p_queue: state.queue?.id ?? null });
  }
}

// --- Loading -----------------------------------------------------------------------

const cleanPrefs = (raw: unknown): ApplyPrefs => {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<ApplyPrefs>;
  const list = <T extends string>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as T[]) : []);
  return {
    minScore: Math.min(95, Math.max(55, Number(p.minScore) || DEFAULT_PREFS.minScore)),
    roles: list(p.roles),
    countries: list<string>(p.countries).map((c) => c.toUpperCase()),
    arrangements: list(p.arrangements),
    salaryMin: typeof p.salaryMin === 'number' && p.salaryMin > 0 ? p.salaryMin : null,
    salaryCurrency: typeof p.salaryCurrency === 'string' && p.salaryCurrency ? p.salaryCurrency : DEFAULT_PREFS.salaryCurrency,
    sponsorship: p.sponsorship === 'need' || p.sponsorship === 'no_need' ? p.sponsorship : 'auto',
    relocate: p.relocate !== false,
    maxPerDay: Math.min(40, Math.max(1, Number(p.maxPerDay) || DEFAULT_PREFS.maxPerDay)),
    alwaysAsk: Array.isArray(p.alwaysAsk) ? list(p.alwaysAsk) : DEFAULT_PREFS.alwaysAsk,
  };
};

async function readStatus(): Promise<ApplyStatus | null> {
  const { data, error } = await supabase.rpc('apply_status');
  if (error) {
    if (missing(error.message)) set({ available: false });
    return null;
  }
  const s = data as ApplyStatus;
  set({ available: true, status: s, queue: s.queue ?? null });
  return s;
}

async function readApps(): Promise<void> {
  const { data, error } = await supabase
    .from('job_applications')
    .select('id, job_id, queue_id, title, company, cc, country, score, status, priority, rank, channel, sponsorship, url, reason, reason_code, needs, verified, confirmation, cv_name, cover_letter, submitted_at, updated_at, created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return;
  set({ apps: ((data ?? []) as Row[]).map(fromRow) });
}

type Row = {
  id: string; job_id: string; queue_id: string | null; title: string; company: string; cc: string | null; country: string | null; score: number; status: AppStatus;
  priority: Application['priority']; rank: number; channel: Application['channel']; sponsorship: Application['sponsorship']; url: string | null; reason: string | null; reason_code: string | null;
  needs: Needed[] | null; verified: boolean; confirmation: Application['confirmation']; cv_name: string | null; cover_letter: boolean; submitted_at: string | null; updated_at: string; created_at: string;
};
export type App = Application & { queueId: string | null; createdAt: string };
const fromRow = (r: Row): App => ({
  id: r.id, jobId: r.job_id, queueId: r.queue_id, title: r.title, company: r.company, cc: r.cc, country: r.country, score: r.score, status: r.status, priority: r.priority, rank: r.rank,
  channel: r.channel, sponsorship: r.sponsorship, url: r.url, reason: r.reason, reasonCode: r.reason_code, needs: r.needs ?? [], verified: r.verified, confirmation: r.confirmation,
  cvName: r.cv_name, coverLetter: r.cover_letter, submittedAt: r.submitted_at, updatedAt: r.updated_at, createdAt: r.created_at,
});

async function load(userId: string, account: Profile | null, email: string | null, cvText: string | null): Promise<void> {
  if (state.loadedFor === userId) return;
  set({ loadedFor: userId });
  const s = await readStatus();
  if (!s) return;
  const [prefs, profile] = await Promise.all([
    supabase.from('application_preferences').select('prefs').eq('user_id', userId).maybeSingle(),
    supabase.from('application_profiles').select('answers, custom').eq('user_id', userId).maybeSingle(),
  ]);
  const saved: ApplyProfile = profile.data ? { answers: (profile.data as ApplyProfile).answers ?? {}, custom: (profile.data as ApplyProfile).custom ?? {} } : EMPTY_PROFILE;
  set({
    prefs: cleanPrefs((prefs.data as { prefs?: unknown } | null)?.prefs),
    prefsSaved: Boolean(prefs.data),
    profile: mergeProfile(saved, suggestProfile({ fullName: account?.full_name, email: account?.email ?? email, phone: account?.phone, linkedin: account?.linkedin_url }, cvText)),
  });
  await readApps();
}

function reset(): void {
  if (!state.loadedFor && !state.apps.length) return;
  control = 'stop';
  set({ loadedFor: null, status: state.status ? { ...state.status, signedIn: false } : null, apps: [], queue: null, server: new Map(), serverFor: null, profile: EMPTY_PROFILE, prefs: DEFAULT_PREFS, prefsSaved: false, running: false, current: null });
}

/** For a list of matched jobs: how each can be sent, and which must be left out. One request per result. */
export async function loadServerFacts(key: string, jobIds: string[]): Promise<void> {
  if (!state.available || !state.status?.signedIn || state.serverFor === key || !jobIds.length) return;
  set({ serverFor: key });
  const { data, error } = await supabase.rpc('apply_preview', { p_jobs: jobIds.slice(0, 80) });
  if (error) return set({ serverFor: null });
  const m = new Map<string, ServerFacts>();
  for (const x of (data ?? []) as (ServerFacts & { id: string })[]) m.set(x.id, { channel: x.channel, applied: x.applied, twin: x.twin, closed: x.closed, url: x.url, knownSponsor: x.knownSponsor });
  set({ server: m });
}

// --- Preferences and saved answers ---------------------------------------------------

export async function savePrefs(prefs: ApplyPrefs): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return { ok: false, error: 'Sign in first.' };
  const clean = cleanPrefs(prefs);
  const { error } = await supabase.from('application_preferences').upsert({ user_id: userId, prefs: clean }, { onConflict: 'user_id' });
  if (error) return { ok: false, error: error.message };
  set({ prefs: clean, prefsSaved: true });
  logEvent('auto_apply_preferences_saved', { minScore: clean.minScore, maxPerDay: clean.maxPerDay });
  void readStatus();
  return { ok: true };
}

export async function saveProfile(profile: ApplyProfile): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return { ok: false, error: 'Sign in first.' };
  // Empty answers aren't kept.
  const answers = Object.fromEntries(Object.entries(profile.answers).filter(([, a]) => a && (a.value.trim() || a.askEachTime)));
  const next: ApplyProfile = { answers, custom: profile.custom };
  const { error } = await supabase.from('application_profiles').upsert({ user_id: userId, answers: next.answers, custom: next.custom }, { onConflict: 'user_id' });
  if (error) return { ok: false, error: error.message };
  set({ profile: next });
  return { ok: true };
}

// --- Answers given for one application only ("just this once") ------------------------

const GIVEN_KEY = 'mv:applyGiven';
function readGiven(): Record<string, Record<string, string>> {
  try {
    return JSON.parse(window.sessionStorage.getItem(GIVEN_KEY) ?? '{}') as Record<string, Record<string, string>>;
  } catch {
    return {};
  }
}
function writeGiven(appId: string, answers: Record<string, string>) {
  try {
    const all = readGiven();
    all[appId] = { ...(all[appId] ?? {}), ...answers };
    window.sessionStorage.setItem(GIVEN_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

// --- Moving applications --------------------------------------------------------------

const put = (app: App) => set({ apps: state.apps.some((a) => a.id === app.id) ? state.apps.map((a) => (a.id === app.id ? { ...a, ...app } : a)) : [app, ...state.apps] });
type RpcMove = { ok: boolean; code?: string; message?: string; app?: Omit<App, 'needs'> & { needs: Needed[] | null } };

async function move(id: string, to: AppStatus, detail?: MoveDetail): Promise<MoveResult> {
  const { data, error } = await supabase.rpc('apply_move', { p_id: id, p_to: to, p_detail: detail ?? null });
  if (error) return { ok: false, code: 'error', message: error.message };
  const r = data as RpcMove;
  const app = r.app ? ({ ...r.app, needs: r.app.needs ?? [] } as App) : undefined;
  if (app) put(app);
  if (r.ok && app) return { ok: true, app };
  return { ok: false, code: (r.code as Exclude<MoveResult, { ok: true }>['code']) ?? 'error', message: r.message ?? 'That didn’t work.', app };
}

/** Send through MadeVisa: the server does it, and records the outcome itself. */
async function sendViaMadeVisa(pack: { applicationId: string; cv: { name: string; base64: string }; letter: string | null; answers: { label: string; value: string }[] }): Promise<SubmitResult> {
  const { data, error } = await supabase.functions.invoke('apply', { body: { action: 'submit', application_id: pack.applicationId, cv: pack.cv, letter: pack.letter, answers: pack.answers } });
  let body = data as { ok?: boolean; handover?: boolean; reason?: string; code?: string; confirmation?: { kind: 'email'; id: string } } | null;
  // A refusal arrives as an HTTP error with the reason in its body.
  if (error && !body) {
    try {
      body = (await (error as { context?: Response }).context?.json()) ?? null;
    } catch {
      body = null;
    }
  }
  if (body?.ok && body.confirmation?.id) return { ok: true, confirmation: body.confirmation };
  if (body?.handover) return { ok: false, handover: true, reason: body.reason ?? 'Your application is ready to send on the employer’s site.', code: body.code ?? 'handover' };
  return { ok: false, handover: false, reason: body?.reason ?? 'MadeVisa couldn’t reach its sending service. Nothing was sent; you can try again.', code: body?.code ?? 'unreachable' };
}

// --- The run -------------------------------------------------------------------------

let control: 'run' | 'pause' | 'stop' = 'run';
let runCv: StoredCv | null = null;
/** Each step stays on screen at least this long, so the person can read what is happening. */
const PACE_MS = 420;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

async function setQueue(s: QueueState, reason?: PauseReason): Promise<void> {
  if (!state.queue) return;
  const { data, error } = await supabase.rpc('apply_queue_set', { p_queue: state.queue.id, p_state: s, p_reason: reason ?? null });
  if (!error && data) set({ queue: data as QueueInfo });
}

async function run(): Promise<void> {
  if (state.running || !state.queue || !runCv) return;
  const cv = runCv;
  control = 'run';
  set({ running: true, error: null });
  const kept = new Map<string, Kept>();
  const queueId = state.queue.id;
  let started = performance.now();
  let end: RunEnd;
  try {
    // Start from what the database says, not what this page last saw: after a pause, a closed tab or
    // another device, an application may have moved (one left "preparing" is back in the queue).
    await readApps();
    // Left "submitting" by a page that closed mid-send: there is no confirmation, so it is not submitted.
    // It is tried again — the sending function never mails the same application twice.
    for (const a of state.apps.filter((x) => x.queueId === queueId && x.status === 'submitting')) {
      const failed = await move(a.id, 'failed', { reason: 'Sending was interrupted before MadeVisa got a confirmation.', code: 'interrupted' });
      if (failed.ok) await move(a.id, 'queued');
    }
    end = await runQueue(
      state.apps.filter((a) => a.queueId === queueId),
      {
        move: async (id, to, detail) => {
          // "Checking required questions" is on screen: let it be read before the outcome replaces it.
          if (to === 'needs_answer' || to === 'review_required' || to === 'submitting') await wait(PACE_MS);
          const r = await move(id, to, detail);
          // One finished: note how long it took, for "time remaining".
          if (to !== 'preparing' && to !== 'submitting') {
            set({ pace: Math.min(20, Math.max(1.5, 0.6 * state.pace + 0.4 * ((performance.now() - started) / 1000))), current: null });
            started = performance.now();
          }
          return r;
        },
        prepare: async (app, onStep) => {
          const t0 = performance.now();
          // The runner announces each step as it reaches it; inside preparing, only the first is shown.
          const res = await prepareApplication(app, { cv, profile: state.profile, prefs: state.prefs, given: readGiven()[app.id] ?? {} }, (s) => {
            if (s === 'cv') onStep(s);
          });
          if (res.ok && res.kept) kept.set(app.id, res.kept);
          await wait(Math.max(0, PACE_MS * 1.5 - (performance.now() - t0)));
          return res;
        },
        save: async (app) => {
          const k = kept.get(app.id);
          if (k) await supabase.rpc('apply_save', { p_id: app.id, p_cv: k.cv, p_letter: k.letter, p_answers: k.answers });
          await wait(PACE_MS);
        },
        submit: { madevisa: (pack) => sendViaMadeVisa(pack) },
        control: () => control,
        onUpdate: (app, step) => {
          put(app as App);
          set({ current: step ? { id: app.id, step } : null });
        },
      },
    );
  } catch (e) {
    end = { state: 'paused', reason: 'offline', processed: 0 };
    set({ error: e instanceof Error ? e.message : 'Something interrupted the applications. Nothing was lost.' });
  }
  set({ running: false, current: null });
  if (end.state === 'paused') await setQueue('paused', end.reason ?? 'you');
  else if (end.state === 'stopped') await setQueue('stopped');
  else {
    await readStatus();
    logEvent('auto_apply_completed', { processed: end.processed });
  }
  await Promise.all([readStatus(), readApps()]);
}

/** "Apply to N jobs": queue them and start. */
export async function startBatch(planned: Planned[], cv: StoredCv): Promise<{ ok: boolean; error?: string }> {
  if (!planned.length) return { ok: false, error: 'Nothing to apply to.' };
  const items = planned.map((p) => ({ jobId: p.job.id, score: p.job.score, quality: p.a.quality, decision: p.a.decision, priority: p.a.priority, rank: Math.round(p.a.rank), sponsorship: p.a.sponsorship.state }));
  const { data, error } = await supabase.rpc('apply_enqueue', { p_items: items, p_cv_at: cv.at });
  if (error) return { ok: false, error: error.message };
  const r = data as { queue: QueueInfo; applications: (Omit<App, 'needs'> & { needs: Needed[] | null })[] };
  const fresh = r.applications.map((a) => ({ ...a, needs: a.needs ?? [] }) as App);
  const ids = new Set(fresh.map((a) => a.id));
  set({ queue: r.queue, apps: [...fresh, ...state.apps.filter((a) => !ids.has(a.id))], serverFor: null });
  logEvent('auto_apply_started', { asked: planned.length });
  runCv = cv;
  void run();
  return { ok: true };
}

export function pause(): void {
  control = 'pause';
  logEvent('auto_apply_paused');
  // Nothing in hand: the batch can be marked paused straight away.
  if (!state.running) void setQueue('paused', 'you');
  else set({});
}
export async function resume(cv: StoredCv): Promise<void> {
  runCv = cv;
  await setQueue('running');
  void run();
}
export async function stop(): Promise<void> {
  control = 'stop';
  if (!state.running) await setQueue('stopped');
}
export const isHalting = () => state.running && control !== 'run';

/**
 * The person answered what was asked. Saved for next time unless they chose
 * "just this once"; either way the application goes back in the queue.
 */
export async function answer(app: App, answers: { need: Needed; value: string; keep: 'save' | 'ask' | 'once' }[], cv: StoredCv | null): Promise<{ ok: boolean; error?: string }> {
  let profile = state.profile;
  const once: Record<string, string> = {};
  for (const a of answers) {
    if (!a.value.trim()) continue;
    // "Ask me each time" still needs this answer for this application.
    once[a.need.id] = a.value.trim();
    if (a.keep !== 'once') profile = remember(profile, a.need, a.value, a.keep === 'ask');
  }
  writeGiven(app.id, once);
  if (profile !== state.profile) {
    const saved = await saveProfile(profile);
    if (!saved.ok) return saved;
  }
  const r = await move(app.id, 'queued');
  if (!r.ok) return { ok: false, error: r.message };
  if (cv && state.queue && (state.queue.state === 'running' || state.queue.state === 'done')) {
    runCv = cv;
    if (state.queue.state === 'done') await setQueue('running');
    void run();
  }
  return { ok: true };
}

/** "I've sent it" — on the employer's site, by the person. Submitted, never verified. */
export async function markSent(app: App): Promise<MoveResult> {
  const r = await move(app.id, 'submitted', { confirmation: { kind: 'self' } });
  void readStatus();
  return r;
}
export const skip = (app: App) => move(app.id, 'skipped', { reason: 'You chose to skip this one.', code: 'you' });
export async function retry(app: App, cv: StoredCv | null): Promise<void> {
  const r = await move(app.id, 'queued');
  if (r.ok && cv && state.queue) {
    runCv = cv;
    if (state.queue.state !== 'running') await setQueue('running');
    void run();
  }
}

// --- What was used (the receipt) ----------------------------------------------------------

export type Receipt = {
  cv: { name: string; content: string; lines: Kept['cv']['meta']['lines']; changes: string[] } | null;
  letter: { name: string; content: string } | null;
  answers: { label: string; value: string; source: string }[];
  outcomes: { stage: string; at: string; source: string }[];
};
export async function fetchReceipt(appId: string): Promise<Receipt> {
  const [docs, answers, outcomes] = await Promise.all([
    supabase.from('application_documents').select('kind, name, content, meta').eq('application_id', appId),
    supabase.from('application_answers').select('label, value, source').eq('application_id', appId).order('id'),
    supabase.from('application_outcomes').select('stage, at, source').eq('application_id', appId).order('at'),
  ]);
  const rows = (docs.data ?? []) as { kind: string; name: string; content: string; meta: Partial<Kept['cv']['meta']> | null }[];
  const cv = rows.find((d) => d.kind === 'cv');
  const letter = rows.find((d) => d.kind === 'cover_letter');
  return {
    cv: cv ? { name: cv.name, content: cv.content, lines: cv.meta?.lines ?? [], changes: cv.meta?.changes ?? [] } : null,
    letter: letter ? { name: letter.name, content: letter.content } : null,
    answers: (answers.data ?? []) as Receipt['answers'],
    outcomes: (outcomes.data ?? []) as Receipt['outcomes'],
  };
}

export const STAGES = ['viewed', 'response', 'interview', 'assessment', 'final_round', 'offer', 'rejected', 'withdrawn'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage | 'applied', string> = { applied: 'Applied', viewed: 'Viewed', response: 'Recruiter response', interview: 'Interview', assessment: 'Assessment', final_round: 'Final round', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn' };

export async function recordOutcome(appId: string, stage: Stage, on: boolean): Promise<Receipt['outcomes'] | null> {
  const { data, error } = await supabase.rpc('apply_outcome', { p_id: appId, p_stage: stage, p_on: on });
  return error ? null : ((data ?? []) as Receipt['outcomes']);
}

/** Every outcome on the person's applications, for the funnel line. */
export async function fetchOutcomes(): Promise<{ application_id: string; stage: string }[]> {
  const { data } = await supabase.from('application_outcomes').select('application_id, stage').limit(2000);
  return (data ?? []) as { application_id: string; stage: string }[];
}

// --- The hook -------------------------------------------------------------------------

export function useAutoApply(cv: StoredCv | null): State & { refresh: () => Promise<void> } {
  const { user, profile, loading } = useAuth();
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (loading) return;
    if (user) void load(user.id, profile, user.email ?? null, cv?.text ?? null);
    else {
      reset();
      // Guests: is the feature there at all, and what comes with each plan.
      if (state.available == null) void readStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loading]);
  // A batch left unfinished stays where it was: the person presses Continue (nothing restarts by itself).
  return { ...s, refresh: async () => void (await Promise.all([readStatus(), readApps()])) };
}
