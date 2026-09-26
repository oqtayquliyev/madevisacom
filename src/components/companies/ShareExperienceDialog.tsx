import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, CheckCircle2, ChevronDown, Loader2, Lock, MessageSquarePlus, Search, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  APPLIED_WHEN,
  EXPERIENCE_CHANNELS,
  EXPERIENCE_OUTCOMES,
  REPLY_AFTER,
  fetchCountryOptions,
  isoDaysAgo,
  submitCompanyExperience,
  type CountryOption,
  type ExperienceChannel,
  type ExperienceOutcome,
} from '@/lib/companyExperiences';

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
export function ShareExperienceDialog({ open, onClose, company, initial, companies = [], initialOutcome, onAuth }: Props) {
  const { session } = useAuth();
  const [picked, setPicked] = useState<PickCompany | null>(null);
  const [typed, setTyped] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [when, setWhen] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ExperienceOutcome | null>(null);
  const [more, setMore] = useState(false);
  const [channel, setChannel] = useState<ExperienceChannel>('company_site');
  const [role, setRole] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [website, setWebsite] = useState('');
  const [countryId, setCountryId] = useState('');
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setWhen(null);
    setOutcome(null);
    setMore(false);
    setChannel('company_site');
    setRole('');
    setReply(null);
    setWebsite('');
    setCountryId('');
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    reset();
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
  const canSend = name.length >= 2 && whenDays != null && outcome && !tooSoon && !busy;

  const send = async () => {
    if (!canSend || !outcome || whenDays == null) return;
    setBusy(true);
    setError(null);
    const r = await submitCompanyExperience({
      companyName: name,
      companyWebsite: picked ? undefined : website,
      countryId: countryId || null,
      roleTitle: role,
      appliedOn: isoDaysAgo(whenDays),
      channel,
      outcome,
      replyDays: REPLY_AFTER.find((x) => x.key === reply)?.days ?? null,
      publisherId: picked?.id ?? null,
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

        {!session ? (
          <div className="px-5 pb-8 pt-4 text-center">
            <p className="text-sm text-ink-600">Sign in with a verified email to share. Your name is never shown.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => (onClose(), onAuth?.('login'))} className="rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
                Sign in
              </button>
              <button onClick={() => (onClose(), onAuth?.('register'))} className="rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                Create account
              </button>
            </div>
          </div>
        ) : done ? (
          <div className="px-5 pb-8 pt-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 text-base font-bold text-ink-950">Thank you — that helps the next applicant</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">We review every report. Once approved it adds to {name}'s totals — never with your name.</p>
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
                    maxLength={120}
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
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-ink-600">Applied via</span>
                      <select value={channel} onChange={(e) => setChannel(e.target.value as ExperienceChannel)} className={field}>
                        {EXPERIENCE_CHANNELS.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-ink-600">Role</span>
                      <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} placeholder="e.g. Data Analyst" className={field} />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-ink-600">Job country</span>
                      <select value={countryId} onChange={(e) => setCountryId(e.target.value)} className={field}>
                        <option value="">—</option>
                        {countries.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!picked && (
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-ink-600">Company website</span>
                        <input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={200} placeholder="company.com" className={field} />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] leading-4 text-ink-400">Checked by MadeVisa before it counts. One report per company per month.</p>
              <button
                onClick={send}
                disabled={!canSend}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Share
              </button>
            </div>
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
