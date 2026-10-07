import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { allCountries } from '@/data/allCountries';
import { QUESTION_LABEL } from '@/lib/apply/profile';
import { savePrefs, saveProfile, type ApplyStatus } from '@/lib/apply/store';
import type { ApplyPrefs, ApplyProfile, Arrangement, QuestionKey } from '@/lib/apply/types';
import { ApplicationProfileFields, SavedCustomAnswers } from '@/components/apply/ApplicationProfile';
import { Sheet } from '@/components/apply/Sheet';
import { BTN, FIELD } from '@/components/apply/ui';

const ARRANGEMENTS: [Arrangement, string][] = [
  ['remote', 'Remote'],
  ['hybrid', 'Hybrid'],
  ['onsite', 'On-site'],
];
const ASKABLE: QuestionKey[] = ['salary_expectation', 'sponsorship', 'work_authorization', 'notice_period', 'availability', 'relocation', 'consent'];
const ASK_LABEL: Partial<Record<QuestionKey, string>> = { salary_expectation: 'Salary', sponsorship: 'Visa sponsorship', work_authorization: 'Right to work', notice_period: 'Notice period', availability: 'Start date', relocation: 'Relocation', consent: 'Privacy consent' };
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'AED', 'AZN', 'TRY', 'INR', 'PLN', 'SEK'];
const countryName = (code: string) => allCountries.find((c) => c.code === code)?.name ?? code;

const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 transition ${on ? 'bg-ink-950 text-white ring-ink-950' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-400'}`;
const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-ink-100 py-3.5 first:border-t-0 first:pt-0">
      <legend className="float-left w-full text-[13px] font-bold text-ink-950">
        {title}
        {hint && <span className="ml-2 font-normal text-ink-500">{hint}</span>}
      </legend>
      <div className="clear-both pt-2">{children}</div>
    </fieldset>
  );
}

type Props = {
  prefs: ApplyPrefs;
  profile: ApplyProfile;
  status: ApplyStatus;
  /** What the matches offer to choose from. */
  roles: string[];
  countries: string[];
  first: boolean;
  onClose: () => void;
  onSaved: () => void;
};

/** "Set your application preferences" — one compact screen, sensible values already filled in. */
export function ApplicationPreferences({ prefs: saved, profile: savedProfile, status, roles, countries, first, onClose, onSaved }: Props) {
  const [p, setP] = useState<ApplyPrefs>(saved);
  const [profile, setProfile] = useState<ApplyProfile>(savedProfile);
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ApplyPrefs>) => setP((x) => ({ ...x, ...patch }));
  const roleChoices = useMemo(() => [...new Set([...roles, ...saved.roles])], [roles, saved.roles]);
  const countryChoices = useMemo(() => [...new Set([...countries, ...saved.countries])], [countries, saved.countries]);

  const save = async () => {
    setBusy(true);
    setError(null);
    const a = await savePrefs(p);
    const b = a.ok && profile !== savedProfile ? await saveProfile(profile) : a;
    setBusy(false);
    if (!b.ok) return setError(b.error ?? 'That didn’t save. Try again.');
    onSaved();
  };

  return (
    <Sheet
      id="apply-prefs"
      title="Set your application preferences"
      sub={first ? 'Filled in from your CV and your matches. Change what you like — you can come back to this any time.' : 'MadeVisa follows these when it chooses what to apply to.'}
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {error ? <p className="text-[13px] text-rose-700">{error}</p> : <span />}
          <button onClick={save} disabled={busy} className={BTN.primary}>
            <Check className="h-4 w-4" /> {busy ? 'Saving…' : first ? 'Save and continue' : 'Save'}
          </button>
        </div>
      }
    >
      <Group title="Minimum match score" hint={`Apply at ${p.minScore}% or more; up to 10 points under goes to “Review”.`}>
        <div className="flex items-center gap-3">
          <input type="range" min={60} max={90} step={5} value={p.minScore} onChange={(e) => set({ minScore: Number(e.target.value) })} aria-label="Minimum match score" className="h-2 w-full cursor-pointer accent-brand-600" />
          <span className="w-12 shrink-0 text-right text-[16px] font-bold tabular-nums text-ink-950">{p.minScore}%</span>
        </div>
      </Group>

      {roleChoices.length > 0 && (
        <Group title="Target roles" hint={p.roles.length ? '' : 'Any role your CV matches'}>
          <div className="flex flex-wrap gap-1.5">
            {roleChoices.map((r) => (
              <button key={r} type="button" aria-pressed={p.roles.includes(r)} onClick={() => set({ roles: toggle(p.roles, r) })} className={pill(p.roles.includes(r))}>
                {r}
              </button>
            ))}
          </div>
        </Group>
      )}

      {countryChoices.length > 0 && (
        <Group title="Preferred countries" hint={p.countries.length ? '' : 'Any country'}>
          <div className="flex flex-wrap gap-1.5">
            {countryChoices.map((c) => (
              <button key={c} type="button" aria-pressed={p.countries.includes(c)} onClick={() => set({ countries: toggle(p.countries, c) })} className={pill(p.countries.includes(c))}>
                {countryName(c)}
              </button>
            ))}
          </div>
        </Group>
      )}

      <Group title="Where you work" hint={p.arrangements.length ? '' : 'Any'}>
        <div className="flex flex-wrap gap-1.5">
          {ARRANGEMENTS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={p.arrangements.includes(k)} onClick={() => set({ arrangements: toggle(p.arrangements, k) })} className={pill(p.arrangements.includes(k))}>
              {label}
            </button>
          ))}
        </div>
      </Group>

      <div className="grid gap-x-6 sm:grid-cols-2">
        <Group title="Lowest yearly pay" hint="If the ad shows pay">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <input type="number" min={0} step={1000} inputMode="numeric" value={p.salaryMin ?? ''} onChange={(e) => set({ salaryMin: e.target.value ? Math.max(0, Number(e.target.value)) : null })} placeholder="No minimum" aria-label="Lowest yearly pay" className={FIELD} />
            </div>
            <div className="w-24 shrink-0">
              <select value={p.salaryCurrency} onChange={(e) => set({ salaryCurrency: e.target.value })} aria-label="Currency" className={FIELD}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </Group>
        <Group title="Most applications a day" hint={`Up to ${status.dailyMax}`}>
          <input type="number" min={1} max={status.dailyMax} value={p.maxPerDay} onChange={(e) => set({ maxPerDay: Math.min(status.dailyMax, Math.max(1, Number(e.target.value) || 1)) })} aria-label="Most applications a day" className={FIELD} />
        </Group>
      </div>

      <div className="grid gap-x-6 sm:grid-cols-2">
        <Group title="Visa sponsorship" hint="From your passport, unless you say">
          <select value={p.sponsorship} onChange={(e) => set({ sponsorship: e.target.value as ApplyPrefs['sponsorship'] })} aria-label="Visa sponsorship" className={FIELD}>
            <option value="auto">Depends on the job’s country</option>
            <option value="need">I need sponsorship</option>
            <option value="no_need">I don’t need sponsorship</option>
          </select>
        </Group>
        <Group title="Relocation">
          <select value={p.relocate ? 'yes' : 'no'} onChange={(e) => set({ relocate: e.target.value === 'yes' })} aria-label="Relocation" className={FIELD}>
            <option value="yes">Open to moving for a job</option>
            <option value="no">Where I live, or remote</option>
          </select>
        </Group>
      </div>

      <Group title="Questions that always need your approval" hint="MadeVisa stops and asks, even if you saved an answer">
        <div className="flex flex-wrap gap-1.5">
          {ASKABLE.map((k) => (
            <button key={k} type="button" aria-pressed={p.alwaysAsk.includes(k)} onClick={() => set({ alwaysAsk: toggle(p.alwaysAsk, k) })} className={pill(p.alwaysAsk.includes(k))}>
              {ASK_LABEL[k] ?? QUESTION_LABEL[k]}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Your saved answers" hint="Used on every application. MadeVisa never adds to them.">
        {details ? (
          <>
            <ApplicationProfileFields value={profile} onChange={setProfile} />
            <SavedCustomAnswers value={profile} onChange={setProfile} />
          </>
        ) : (
          <button type="button" onClick={() => setDetails(true)} className={BTN.small}>
            Review {Object.values(profile.answers).filter((a) => a?.value).length + Object.keys(profile.custom).length} saved answers
          </button>
        )}
      </Group>
    </Sheet>
  );
}
