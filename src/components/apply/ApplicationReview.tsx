import { useMemo, useState } from 'react';
import { Send, ShieldCheck } from 'lucide-react';
import { timeSaved, type Plan, type Planned } from '@/lib/apply/decision';
import { BASIC_KEYS } from '@/lib/apply/profile';
import { saveProfile, type ApplyStatus } from '@/lib/apply/store';
import type { ApplyProfile, QuestionKey } from '@/lib/apply/types';
import { MatchRing } from '@/components/cv/MatchBits';
import { ApplicationCredits } from '@/components/apply/ApplicationCredits';
import { ApplicationProfileFields } from '@/components/apply/ApplicationProfile';
import { DecisionChip, PriorityChip, SponsorChip } from '@/components/apply/ApplicationStatus';
import { Sheet } from '@/components/apply/Sheet';
import { BTN } from '@/components/apply/ui';

/** Skipped for a reason no tick can change: already applied, the same role, closed, or not a match at all. */
const FIXED = new Set(['already_applied', 'same_role', 'duplicate_listing', 'closed', 'too_low']);
const canPick = (p: Planned) => !p.a.codes.some((c) => FIXED.has(c));

function Row({ p, checked, onToggle }: { p: Planned; checked: boolean; onToggle: () => void }) {
  const pickable = canPick(p);
  return (
    <li>
      <label className={`flex items-start gap-3 rounded-2xl p-3 ring-1 transition ${checked ? 'bg-brand-50/50 ring-brand-200' : 'bg-white ring-ink-200'} ${pickable ? 'cursor-pointer hover:ring-brand-300' : 'opacity-70'}`}>
        <input type="checkbox" checked={checked} disabled={!pickable} onChange={onToggle} className="mt-3 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-200" aria-label={`Apply to ${p.job.title} at ${p.job.company}`} />
        <MatchRing score={p.job.score} size={42} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words text-[14px] font-bold leading-snug text-ink-950 [overflow-wrap:anywhere]">{p.job.title}</span>
            <DecisionChip decision={p.a.decision} />
          </span>
          <span className="block truncate text-[12.5px] text-ink-500">
            {p.job.company}
            {p.job.country ? ` · ${p.job.country}` : ''}
          </span>
          <span className="mt-1 block text-[12.5px] leading-5 text-ink-700">{p.a.reason}</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <SponsorChip state={p.a.sponsorship.state} why={p.a.sponsorship.why} />
            {p.a.decision !== 'skip' && <PriorityChip priority={p.a.priority} />}
          </span>
        </span>
      </label>
    </li>
  );
}

/** "Review matches": every job with its recommendation and the reason — tick what should be applied to. */
export function ApplicationReview({ plan, picked, setPicked, onClose, onApply }: { plan: Plan; picked: Set<string>; setPicked: (s: Set<string>) => void; onClose: () => void; onApply: () => void }) {
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const groups: [string, string, Planned[]][] = [
    ['Recommended', 'At or above your minimum, with nothing that needs a look.', plan.auto],
    ['Worth reviewing', 'Close, or with something you should check first.', plan.review],
    ['Skipped', 'Left out — and why.', plan.skip],
  ];
  const n = picked.size;
  return (
    <Sheet
      id="apply-review"
      title="Review matches"
      sub="MadeVisa’s recommendation for each job. Tick or untick anything."
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink-600">
            <strong className="font-bold tabular-nums text-ink-950">{n}</strong> selected
          </p>
          <button onClick={onApply} disabled={n === 0} className={BTN.primary}>
            <Send className="h-4 w-4" /> Apply to {n} {n === 1 ? 'job' : 'jobs'}
          </button>
        </div>
      }
    >
      {groups
        .filter(([, , list]) => list.length > 0)
        .map(([title, sub, list]) => (
          <section key={title} className="mt-4 first:mt-1">
            <h3 className="text-[14px] font-bold text-ink-950">
              {title} <span className="tabular-nums text-ink-400">{list.length}</span>
            </h3>
            <p className="text-[12.5px] text-ink-500">{sub}</p>
            <ul className="mt-2 space-y-2">
              {list.map((p) => (
                <Row key={p.job.id} p={p} checked={picked.has(p.job.id)} onToggle={() => toggle(p.job.id)} />
              ))}
            </ul>
          </section>
        ))}
    </Sheet>
  );
}

type ConfirmProps = {
  selected: Planned[];
  status: ApplyStatus;
  profile: ApplyProfile;
  onClose: () => void;
  onReview: () => void;
  onStart: () => Promise<{ ok: boolean; error?: string }>;
};

/** The last look before anything starts: what is selected, how each will be sent, and what it uses. */
export function ApplicationConfirm({ selected, status, profile: saved, onClose, onReview, onStart }: ConfirmProps) {
  const [profile, setProfile] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = selected.length;
  const strong = selected.filter((p) => p.job.score >= 80).length;
  const byUs = selected.filter((p) => p.a.channel === 'madevisa').length;
  const abroad = selected.filter((p) => p.a.sponsorship.state !== 'not_needed').length;
  const saving = timeSaved(byUs, n - byUs);

  // What every application needs, and isn't saved yet: asked here once, instead of stopping each application.
  const missing = useMemo(() => {
    const keys: QuestionKey[] = BASIC_KEYS.filter((k) => !saved.answers[k]?.value.trim());
    const s = saved.answers.sponsorship;
    if (abroad > 0 && !s?.value.trim() && !s?.askEachTime) keys.push('sponsorship');
    return keys;
  }, [saved, abroad]);
  const stillMissing = BASIC_KEYS.filter((k) => !profile.answers[k]?.value.trim());
  const askSponsor = abroad > 0 && Boolean(profile.answers.sponsorship?.askEachTime);

  const start = async () => {
    setBusy(true);
    setError(null);
    if (profile !== saved) {
      const s = await saveProfile(profile);
      if (!s.ok) {
        setBusy(false);
        return setError(s.error ?? 'Your details didn’t save. Try again.');
      }
    }
    const r = await onStart();
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'That didn’t start. Try again.');
  };

  return (
    <Sheet
      id="apply-confirm"
      title={`Apply to ${n} ${n === 1 ? 'job' : 'jobs'}`}
      onClose={onClose}
      footer={
        <div>
          {error && <p className="mb-2 text-[13px] text-rose-700">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={start} disabled={busy || stillMissing.length > 0 || status.left < 1} className={`${BTN.primary} flex-1`}>
              <Send className="h-4 w-4" /> {busy ? 'Starting…' : 'Start applying'}
            </button>
            <button onClick={onReview} disabled={busy} className={BTN.secondary}>
              Review first
            </button>
          </div>
        </div>
      }
    >
      <dl className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            [n, 'selected'],
            [strong, strong === 1 ? 'strong match' : 'strong matches'],
            [n - strong, n - strong === 1 ? 'good match' : 'good matches'],
          ] as [number, string][]
        ).map(([value, label]) => (
          <div key={label} className="rounded-2xl bg-ink-50 px-2 py-3">
            <dd className="text-[24px] font-bold leading-none tabular-nums text-ink-950">{value}</dd>
            <dt className="mt-1 text-[12px] text-ink-600">{label}</dt>
          </div>
        ))}
      </dl>

      <ul className="mt-4 space-y-2 text-[13.5px] leading-5 text-ink-800">
        {byUs > 0 && (
          <li>
            <strong className="font-semibold text-ink-950">MadeVisa sends {byUs}.</strong> {byUs === 1 ? 'This employer takes' : 'These employers take'} applications through MadeVisa: your tailored CV and details are emailed to {byUs === 1 ? 'it' : 'them'}, and replies come to you.
          </li>
        )}
        {n - byUs > 0 && (
          <li>
            <strong className="font-semibold text-ink-950">
              You send {n - byUs}
              {byUs === 0 ? '' : ' more'}.
            </strong>{' '}
            {n - byUs === 1 ? 'This employer only takes' : 'These employers only take'} applications on {n - byUs === 1 ? 'its' : 'their'} own site. MadeVisa prepares the CV, the letter where one helps, and your answers — you open the form and send.
          </li>
        )}
        {askSponsor && <li className="text-ink-600">{abroad} of these are abroad: MadeVisa will ask you about visa sponsorship before each one, as you chose.</li>}
        <li>
          <strong className="font-semibold text-ink-950">Estimated time saved: {saving.text}.</strong> <span className="text-ink-500">Against 15 to 20 minutes an application by hand.</span>
        </li>
      </ul>

      {missing.length > 0 && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-3.5 ring-1 ring-amber-200">
          <p className="text-[13.5px] font-bold text-amber-950">Check your details first</p>
          <p className="mb-3 text-[12.5px] leading-5 text-amber-900">Every application needs these. MadeVisa uses exactly what you put here.</p>
          <ApplicationProfileFields value={profile} onChange={setProfile} only={missing} />
        </div>
      )}

      <ApplicationCredits status={status} asking={n} className="mt-4" />

      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-ink-50 p-3.5 text-[13px] leading-5 text-ink-700">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>
          <strong className="font-semibold text-ink-950">You stay in control.</strong> MadeVisa never invents information or submits answers it cannot verify. You can pause or stop at any time, and see exactly what was sent.
        </span>
      </p>
    </Sheet>
  );
}
