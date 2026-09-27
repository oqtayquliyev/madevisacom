import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Building2, CheckCircle2, ChevronDown, Loader2, Lock, Mail, MessageSquarePlus, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { confirmEmailVerified } from '@/lib/emailVerification';
import { useCaptcha } from '@/components/auth/Turnstile';
import { useAuth } from '@/lib/auth';
import {
  APPLIED_WHEN,
  EXPERIENCE_CHANNELS,
  EXPERIENCE_OUTCOMES,
  REPLY_AFTER,
  fetchCountryOptions,
  isoDaysAgo,
  matchWord,
  submitCompanyExperience,
  type CountryOption,
  type ExperienceChannel,
  type ExperienceOutcome,
} from '@/lib/companyExperiences';

/** Must match Supabase → Authentication → Email → "Email OTP length" (same as the sign-in page). */
const OTP_LENGTH = Number(import.meta.env.VITE_OTP_LENGTH) || 6;
const RESEND_SECONDS = 45;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function friendlyAuthError(message: string): string {
  if (/captcha/i.test(message)) return "The security check didn't go through. Please wait a moment and try again.";
  if (/rate limit|too many|security purposes|seconds/i.test(message)) return 'A code was sent a moment ago. Check your inbox (and spam), or try again in a minute.';
  if (/expired|invalid|token/i.test(message)) return "That code isn't right or has expired. Check the latest email, or send a new code.";
  if (/signups not allowed|not allowed/i.test(message)) return 'Sharing is paused for new emails right now. Please try again later.';
  if (/email/i.test(message) && /valid/i.test(message)) return 'Please enter a valid email address.';
  return message;
}

/** Short answers only — nothing here needs a paragraph. */
const LIMITS = { company: 80, role: 60, website: 100 };

export type PickCompany = { id: string; name: string; logo_url?: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Opened from a company page — the company is fixed. */
  company?: PickCompany | null;
  /** Pre-selected (or typed) company, still changeable. */
  initial?: { id?: string | null; name: string; logo_url?: string | null } | null;
  /** Companies to pick from. */
  companies?: PickCompany[];
  /** Answer to "What happened?" already chosen (quick buttons on /feedback). */
  initialOutcome?: ExperienceOutcome | null;
  onAuth?: (page: 'login' | 'register') => void;
};

/**
 * "Share your application experience" — 3 quick answers (company, when,
 * what happened); the rest is optional and folded away. Every report is
 * reviewed before it counts, and is only ever shown as a total.
 */
export function ShareExperienceDialog({ open, onClose, company, initial, companies = [], initialOutcome }: Props) {
  const { session } = useAuth();
  const [picked, setPicked] = useState<PickCompany | null>(null);
  const [typed, setTyped] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [when, setWhen] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ExperienceOutcome | null>(null);
  const [more, setMore] = useState(false);
  const [channel, setChannel] = useState<ExperienceChannel | ''>('');
  const [role, setRole] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [website, setWebsite] = useState('');
  const [countryId, setCountryId] = useState('');
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [match, setMatch] = useState<number | null>(null);
  const [trap, setTrap] = useState(''); // honeypot: people never see or fill this
  const openedAt = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Not signed in: the report is confirmed with a one-time email code in
  // this same dialog (no separate sign-up page). Verifying the code signs
  // them in, then the report is sent straight away.
  const [email, setEmail] = useState('');
  const [codeStep, setCodeStep] = useState(false);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [newlySignedIn, setNewlySignedIn] = useState(false);
  const captcha = useCaptcha({ invisible: true });
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const reset = () => {
    setWhen(null);
    setOutcome(null);
    setMore(false);
    setChannel('');
    setRole('');
    setReply(null);
    setWebsite('');
    setCountryId('');
    setMatch(null);
    setTrap('');
    setError(null);
    setCodeStep(false);
    setCode('');
  };

  useEffect(() => {
    if (!open) return;
    reset();
    openedAt.current = Date.now();
    if (initialOutcome) setOutcome(initialOutcome);
    setDone(false);
    const start = company ?? (initial?.id ? { id: initial.id, name: initial.name, logo_url: initial.logo_url } : null);
    setPicked(start);
    setTyped(start ? '' : initial?.name ?? '');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company, initial, initialOutcome]);

  useEffect(() => {
    if (more && !countries.length) fetchCountryOptions().then(setCountries);
  }, [more, countries.length]);

  const matches = useMemo(() => {
    const t = typed.trim().toLowerCase();
    if (!t) return companies.slice(0, 8);
    return companies.filter((c) => c.name.toLowerCase().includes(t)).slice(0, 8);
  }, [companies, typed]);

  if (!open) return null;

  const whenDays = APPLIED_WHEN.find((w) => w.key === when)?.days ?? null;
  const tooSoon = outcome === 'no_response' && whenDays != null && whenDays < 7;
  const name = picked?.name ?? typed.trim();
  const websiteOk = !website || /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(website);
  const canSend = name.length >= 2 && whenDays != null && outcome && !tooSoon && websiteOk && !busy;

  const emailOk = EMAIL_RE.test(email.trim());

  /** Step 1 (signed out): email a one-time code. */
  const sendCode = async () => {
    if (!canSend) return;
    if (trap) return setDone(true); // bot filled the hidden field — pretend it worked
    if (!emailOk) return setError('Please enter a valid email address.');
    if (!captcha.ready) return setError('One moment — finishing a quick security check. Try again in a second.');
    setSending(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, captchaToken: captcha.token, emailRedirectTo: window.location.href },
    });
    captcha.reset();
    setSending(false);
    if (err) return setError(friendlyAuthError(err.message));
    setCode('');
    setCodeStep(true);
    setResendIn(RESEND_SECONDS);
    window.setTimeout(() => codeRef.current?.focus(), 60);
  };

  /** Step 2 (signed out): check the code — that signs them in — then send the report. */
  const confirmCode = async (token = code) => {
    const clean = token.replace(/\D/g, '');
    if (clean.length < OTP_LENGTH) return setError(`Enter the ${OTP_LENGTH}-digit code from the email.`);
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: clean, type: 'email' });
    if (err) {
      setBusy(false);
      return setError(friendlyAuthError(err.message));
    }
    await confirmEmailVerified().catch(() => undefined);
    setNewlySignedIn(true);
    setBusy(false);
    await send(true);
  };

  const send = async (afterCode = false) => {
    if (!canSend && !afterCode) return;
    if (!outcome || whenDays == null) return;
    if (trap) return setDone(true); // bot filled the hidden field — pretend it worked
    setBusy(true);
    setError(null);
    const r = await submitCompanyExperience({
      companyName: name,
      companyWebsite: picked ? undefined : website,
      countryId: countryId || null,
      roleTitle: role,
      appliedOn: isoDaysAgo(whenDays),
      channel: channel || 'other',
      outcome,
      replyDays: REPLY_AFTER.find((x) => x.key === reply)?.days ?? null,
      publisherId: picked?.id ?? null,
      matchPct: match,
      formMs: Date.now() - openedAt.current,
    });
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Something went wrong.');
    else setDone(true);
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-[13px] font-semibold transition ${active ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-[#1D4ED8]/50'}`;
  const field = 'h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-[#1D4ED8]';
  const label = 'mb-2 block text-[13px] font-bold text-ink-800';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Share your application experience" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-3 px-5 pb-2 pt-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8]">
            <MessageSquarePlus className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold text-ink-950">How did your application go?</h2>
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-500">
              <Lock className="h-3 w-3" /> Private — only adds to totals that help the next applicants.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="px-5 pb-8 pt-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 text-base font-bold text-ink-950">Thank you — that helps the next applicant</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">We review every report. Once approved it adds to {name}'s totals — never with your name.</p>
            {newlySignedIn && (
              <p className="mx-auto mt-3 max-w-sm rounded-lg bg-ink-50 px-3 py-2 text-[12px] leading-5 text-ink-500">
                You're signed in as {email.trim()} — share about other companies without a code, or track your applications from your profile.
              </p>
            )}
            <div className="mt-5 flex justify-center gap-2">
              {!company && (
                <button
                  onClick={() => {
                    reset();
                    setPicked(null);
                    setTyped('');
                    setDone(false);
                  }}
                  className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
                >
                  Another company
                </button>
              )}
              <button onClick={onClose} className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 px-5 pb-5 pt-3">
            {/* 1. COMPANY */}
            <div>
              <span className={label}>Company</span>
              {picked ? (
                <div className="flex h-11 items-center gap-2.5 rounded-lg bg-[#1D4ED8]/5 px-3">
                  <Logo url={picked.logo_url} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">{picked.name}</span>
                  {!company && (
                    <button
                      onClick={() => {
                        setPicked(null);
                        setTyped('');
                        setListOpen(true);
                        window.setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="text-[12px] font-semibold text-[#1D4ED8] hover:underline"
                    >
                      Change
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <input
                    ref={inputRef}
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      setListOpen(true);
                    }}
                    onFocus={() => setListOpen(true)}
                    onBlur={() => window.setTimeout(() => setListOpen(false), 150)}
                    maxLength={LIMITS.company}
                    placeholder="Search or type a company"
                    className={`${field} h-11 pl-9`}
                  />
                  {listOpen && (matches.length > 0 || typed.trim().length >= 2) && (
                    <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border border-ink-200 bg-white py-1 shadow-lg">
                      {matches.map((c) => (
                        <li key={c.id}>
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setPicked(c);
                              setListOpen(false);
                            }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[#1D4ED8]/5"
                          >
                            <Logo url={c.logo_url} />
                            <span className="truncate font-medium text-ink-900">{c.name}</span>
                          </button>
                        </li>
                      ))}
                      {typed.trim().length >= 2 && !matches.some((m) => m.name.toLowerCase() === typed.trim().toLowerCase()) && (
                        <li className="border-t border-ink-100 px-3 py-2 text-[12px] text-ink-500">
                          Not listed? Keep “{typed.trim()}” — we'll check it and add the company.
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* 2. WHEN */}
            <div>
              <span className={label}>When did you apply?</span>
              <div className="flex flex-wrap gap-1.5">
                {APPLIED_WHEN.map((w) => (
                  <button key={w.key} type="button" onClick={() => setWhen(w.key)} className={chip(when === w.key)}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. OUTCOME */}
            <div>
              <span className={label}>What happened?</span>
              <div className="flex flex-wrap gap-1.5">
                {EXPERIENCE_OUTCOMES.map((o) => (
                  <button key={o.value} type="button" onClick={() => setOutcome(o.value)} className={chip(outcome === o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
              {tooSoon && <p className="mt-2 text-[12px] text-amber-700">“No response” can be shared once a week has passed since applying.</p>}
            </div>

            {/* 4. FIT */}
            <div>
              <span className={label}>
                How well did you match the requirements? <span className="font-normal text-ink-400">(optional)</span>
              </span>
              <MatchSlider value={match} onChange={setMatch} />
            </div>

            {/* Honeypot — hidden from people, bots tend to fill every field. */}
            <input
              type="text"
              name="company_url"
              tabIndex={-1}
              autoComplete="off"
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            {/* OPTIONAL */}
            <div className="rounded-lg border border-ink-100">
              <button type="button" onClick={() => setMore((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-[13px] font-semibold text-ink-600 hover:text-ink-900">
                More details (optional)
                <ChevronDown className={`h-4 w-4 transition-transform ${more ? 'rotate-180' : ''}`} />
              </button>
              {more && (
                <div className="space-y-4 border-t border-ink-100 px-3 pb-3 pt-3">
                  {outcome && outcome !== 'no_response' && (
                    <div>
                      <span className="mb-1.5 block text-[12px] font-semibold text-ink-600">First reply came</span>
                      <div className="flex flex-wrap gap-1.5">
                        {REPLY_AFTER.map((x) => (
                          <button key={x.key} type="button" onClick={() => setReply(reply === x.key ? null : x.key)} className={chip(reply === x.key)}>
                            {x.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <select aria-label="Applied via" value={channel} onChange={(e) => setChannel(e.target.value as ExperienceChannel | '')} className={`${field} ${channel ? '' : 'text-ink-400'}`}>
                      <option value="">Applied via…</option>
                      {EXPERIENCE_CHANNELS.map((c) => (
                        <option key={c.value} value={c.value} className="text-ink-900">
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <Limited value={role} max={LIMITS.role}>
                      <input aria-label="Role" value={role} onChange={(e) => setRole(e.target.value.replace(/\s{2,}/g, ' '))} maxLength={LIMITS.role} placeholder="Role — e.g. Data Analyst" className={field} />
                    </Limited>
                    <select aria-label="Your country" value={countryId} onChange={(e) => setCountryId(e.target.value)} className={`${field} ${countryId ? '' : 'text-ink-400'}`}>
                      <option value="">Your country…</option>
                      {countries.map((c) => (
                        <option key={c.id} value={c.id} className="text-ink-900">
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {!picked && (
                      <Limited value={website} max={LIMITS.website}>
                        <input
                          aria-label="Company website"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value.trim())}
                          maxLength={LIMITS.website}
                          placeholder="Company website — company.com"
                          className={`${field} ${website && !websiteOk ? 'border-rose-300' : ''}`}
                        />
                      </Limited>
                    )}
                  </div>
                </div>
              )}
            </div>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            {session ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] leading-4 text-ink-400">Checked by MadeVisa before it counts. One report per company per month.</p>
                <button
                  onClick={() => void send()}
                  disabled={!canSend}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-40"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Share
                </button>
              </div>
            ) : !codeStep ? (
              <div className="rounded-xl border border-[#1D4ED8]/15 bg-[#1D4ED8]/[0.03] p-3">
                <label className={label} htmlFor="share-email">
                  Your email <span className="font-normal text-ink-400">— to confirm it's a real report</span>
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative w-full sm:flex-1">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <input
                      id="share-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && canSend && emailOk && void sendCode()}
                      placeholder="you@example.com"
                      className={`${field} h-11 pl-9`}
                    />
                  </div>
                  <button
                    onClick={() => void sendCode()}
                    disabled={!canSend || !emailOk || sending}
                    className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-40"
                  >
                    {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Get code &amp; approve
                  </button>
                </div>
                {captcha.element}
                <p className="mt-2 text-[11px] leading-4 text-ink-500">
                  We email a {OTP_LENGTH}-digit code — no password. Your email is never shown or shared. {!canSend && 'Answer the questions above first.'}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-[#1D4ED8]/25 bg-[#1D4ED8]/[0.04] p-3">
                <label className={label} htmlFor="share-code">
                  Enter the {OTP_LENGTH}-digit code we sent to <span className="text-[#1D4ED8]">{email.trim()}</span>
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="share-code"
                    ref={codeRef}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
                      setCode(v);
                      if (v.length === OTP_LENGTH && !busy) void confirmCode(v);
                    }}
                    placeholder={'•'.repeat(OTP_LENGTH)}
                    className={`${field} h-12 w-full text-center text-xl font-bold tracking-[0.5em] sm:h-11 sm:flex-1`}
                  />
                  <button
                    onClick={() => void confirmCode()}
                    disabled={code.length < OTP_LENGTH || busy}
                    className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-40"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm & share
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                  <button
                    onClick={() => {
                      setCodeStep(false);
                      setCode('');
                      setError(null);
                    }}
                    className="font-semibold text-ink-600 hover:text-ink-900"
                  >
                    Change email
                  </button>
                  <button onClick={() => void sendCode()} disabled={resendIn > 0 || sending} className="font-semibold text-[#1D4ED8] hover:underline disabled:text-ink-400 disabled:no-underline">
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                  </button>
                  <span className="text-ink-400">Not there? Check spam.</span>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-ink-500">
                  Confirming also gives you a free MadeVisa login, so you can edit or remove your report later. Checked by MadeVisa before it counts.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Logo({ url }: { url?: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-7 w-7 shrink-0 rounded-md border border-ink-100 bg-white object-contain p-0.5" />
  ) : (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#1D4ED8]/10">
      <Building2 className="h-3.5 w-3.5 text-[#1D4ED8]/60" />
    </span>
  );
}

/**
 * "How well did you match?" — drag the circle; a word appears above it
 * ("Decent fit", "Great match"…). Keyboard: arrow keys move 5%.
 */
function MatchSlider({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const v = value ?? 50;
  const setFrom = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const pct = Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 100);
    onChange(Math.round(pct / 5) * 5);
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    setFrom(e.clientX);
  };
  return (
    <div className="select-none pt-9">
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="How well you matched the job requirements"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value == null ? 'Not answered' : `${value}% — ${matchWord(value)}`}
        onPointerDown={down}
        onPointerMove={(e) => dragging && setFrom(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(100, v + 5));
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(0, v - 5));
        }}
        className="relative h-3 cursor-pointer touch-none rounded-full bg-ink-100 outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/40"
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${value == null ? 'bg-transparent' : 'bg-gradient-to-r from-[#1D4ED8]/30 to-[#1D4ED8]'}`}
          style={{ width: `${v}%` }}
        />
        {/* Word bubble */}
        <div className="pointer-events-none absolute -top-9 -translate-x-1/2 transition-[left] duration-75" style={{ left: `${v}%` }}>
          <span
            className={`block whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold shadow-sm transition-all duration-200 ${
              value == null ? 'bg-ink-100 text-ink-500' : 'bg-[#1D4ED8] text-white'
            } ${dragging ? 'scale-110' : ''}`}
          >
            {value == null ? 'Drag me' : `${value}% · ${matchWord(value)}`}
          </span>
        </div>
        {/* Circle */}
        <div
          className={`absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 bg-white shadow-md transition-transform ${
            value == null ? 'border-ink-300' : 'border-[#1D4ED8]'
          } ${dragging ? 'scale-110' : 'hover:scale-105'}`}
          style={{ left: `${v}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-400">
        <span>Long shot</span>
        <span>Made for it</span>
      </div>
    </div>
  );
}

/** Input with a small "12/60" counter that appears near the limit. */
function Limited({ value, max, children }: { value: string; max: number; children: ReactNode }) {
  const near = value.length >= max * 0.8;
  return (
    <div className="relative">
      {children}
      {near && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-ink-400">{value.length}/{max}</span>}
    </div>
  );
}
