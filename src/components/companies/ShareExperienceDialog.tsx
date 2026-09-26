import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, MessageSquarePlus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  EXPERIENCE_CHANNELS,
  EXPERIENCE_OUTCOMES,
  fetchCountryOptions,
  submitCompanyExperience,
  type CountryOption,
  type ExperienceChannel,
  type ExperienceOutcome,
} from '@/lib/companyExperiences';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Set when opened from a company page — the company is fixed. */
  company?: { id: string; name: string } | null;
  onAuth?: (page: 'login' | 'register') => void;
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86_400_000);

/**
 * "Share your application experience" — for applications made outside
 * MadeVisa. Goes to the admin panel for review before it counts.
 */
export function ShareExperienceDialog({ open, onClose, company, onAuth }: Props) {
  const { session } = useAuth();
  const [name, setName] = useState(company?.name ?? '');
  const [website, setWebsite] = useState('');
  const [countryId, setCountryId] = useState('');
  const [role, setRole] = useState('');
  const [appliedOn, setAppliedOn] = useState('');
  const [channel, setChannel] = useState<ExperienceChannel>('company_site');
  const [outcome, setOutcome] = useState<ExperienceOutcome | null>(null);
  const [replyDays, setReplyDays] = useState('');
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(company?.name ?? '');
    setDone(false);
    setError(null);
    fetchCountryOptions().then(setCountries);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, company, onClose]);

  if (!open) return null;

  const tooSoon = outcome === 'no_response' && appliedOn && daysAgo(appliedOn) < 7;
  const canSend = name.trim().length >= 2 && appliedOn && outcome && !tooSoon && !busy;

  const send = async () => {
    if (!canSend || !outcome) return;
    setBusy(true);
    setError(null);
    const r = await submitCompanyExperience({
      companyName: name,
      companyWebsite: company ? undefined : website,
      countryId: countryId || null,
      roleTitle: role,
      appliedOn,
      channel,
      outcome,
      replyDays: replyDays ? Math.max(0, Math.min(365, Number(replyDays))) : null,
      publisherId: company?.id ?? null,
    });
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Something went wrong.');
    else {
      setDone(true);
      setRole('');
      setAppliedOn('');
      setOutcome(null);
      setReplyDays('');
      setWebsite('');
    }
  };

  const field = 'h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-[#1D4ED8]';
  const label = 'mb-1.5 block text-[12px] font-semibold text-ink-600';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Share your application experience" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-ink-100 px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8]">
            <MessageSquarePlus className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold text-ink-950">Share your application experience</h2>
            <p className="mt-0.5 text-[13px] text-ink-500">Applied somewhere outside MadeVisa? Tell others how it went.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!session ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-ink-600">Sign in to share your experience. Your name is never shown with it.</p>
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
          <div className="px-5 py-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 text-base font-bold text-ink-950">Thanks — sent for review</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">We check every report before it appears. It will show on the company's page once approved.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={() => setDone(false)} className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                Add another
              </button>
              <button onClick={onClose} className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <div>
              <label className={label}>Company</label>
              {company ? (
                <p className="flex h-11 items-center rounded-lg bg-[#1D4ED8]/5 px-3 text-sm font-semibold text-ink-900">{company.name}</p>
              ) : (
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Siemens" className={field} />
              )}
            </div>
            {!company && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Company website (optional)</label>
                  <input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={200} placeholder="siemens.com" className={field} />
                </div>
                <div>
                  <label className={label}>Job country (optional)</label>
                  <select value={countryId} onChange={(e) => setCountryId(e.target.value)} className={field}>
                    <option value="">Choose…</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Role (optional)</label>
                <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} placeholder="e.g. Data Analyst" className={field} />
              </div>
              <div>
                <label className={label}>When did you apply?</label>
                <input type="date" value={appliedOn} max={today()} onChange={(e) => setAppliedOn(e.target.value)} className={field} />
              </div>
            </div>
            <div>
              <label className={label}>Where did you apply?</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value as ExperienceChannel)} className={field}>
                {EXPERIENCE_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>What happened?</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {EXPERIENCE_OUTCOMES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setOutcome(o.value)}
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      outcome === o.value ? 'border-[#1D4ED8] bg-[#1D4ED8]/5 ring-1 ring-[#1D4ED8]' : 'border-ink-200 hover:border-[#1D4ED8]/40'
                    }`}
                  >
                    <span className="block text-[13px] font-bold text-ink-900">{o.label}</span>
                    <span className="block text-[11px] text-ink-500">{o.hint}</span>
                  </button>
                ))}
              </div>
              {tooSoon && <p className="mt-2 text-[12px] text-amber-700">You can report “No response” once a week has passed since applying.</p>}
            </div>
            {outcome && outcome !== 'no_response' && (
              <div>
                <label className={label}>How many days until they first replied? (optional)</label>
                <input type="number" min={0} max={365} value={replyDays} onChange={(e) => setReplyDays(e.target.value)} placeholder="e.g. 5" className={`${field} sm:w-40`} />
              </div>
            )}
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
              <p className="text-[11px] leading-4 text-ink-400">Reviewed by MadeVisa before it counts. Shown only as totals — never with your name.</p>
              <button
                onClick={send}
                disabled={!canSend}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Send for review
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
