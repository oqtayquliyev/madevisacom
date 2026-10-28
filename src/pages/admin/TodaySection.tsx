import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Admin → Today: the one screen to read every morning. Does MadeVisa work?
//   North Star: employer replies per paying member (last N days). Everything else feeds it:
//   are the jobs real and fresh, do people tell us what happened, does the paywall convert.
// From admin_north_star() (migration 20261231130000_trust_layer.sql).

type NorthStar = {
  days: number;
  members: { paying: number; new: number; ended: number };
  outcomes: { applications: number; replies: number; interviews: number; offers: number; member_replies: number; checkins_due: number; still_applied: number };
  jobs: { live: number; imported: number; checked_24h: number; stale_72h: number; median_hours_since_check: number | null; no_apply_link: number };
  funnel: { people_saw_popup: number; people_pressed: number; people_opened_payment: number; free_applies: number };
};

const nf = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '—');

export function TodaySection() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<NorthStar | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_north_star', { p_days: days });
    setBusy(false);
    if (error) return setErr(/admin_north_star|schema cache|does not exist/i.test(error.message) ? 'Run migration 20261231130000_trust_layer.sql first.' : error.message);
    setErr(null);
    setD(data as NorthStar);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const star = d && d.members.paying > 0 ? (d.outcomes.member_replies / d.members.paying).toFixed(2) : null;
  const fresh = d && d.jobs.imported ? Math.round((100 * d.jobs.checked_24h) / d.jobs.imported) : null;
  const answered = d ? d.outcomes.applications - d.outcomes.still_applied : 0;

  // What to do today: the weakest link first.
  const todo: string[] = [];
  if (d) {
    if (fresh != null && fresh < 80) todo.push(`Only ${fresh}% of imported jobs were re-checked in the last 24 h. Look at Import & sync: stale jobs are how a job site loses trust.`);
    if (d.jobs.no_apply_link > 0) todo.push(`${nf(d.jobs.no_apply_link)} live jobs have no apply address. Members pay for that link: fix or close them (Listings).`);
    if (d.outcomes.applications >= 20 && d.outcomes.replies / Math.max(1, d.outcomes.applications) < 0.1) todo.push('Fewer than 1 in 10 tracked applications got a reply. Push Visa Plans and recruiter emails over cold applying.');
    if (d.outcomes.still_applied > 10) todo.push(`${nf(d.outcomes.still_applied)} applications are 14+ days old with no answer. The check-in card asks people; also send the check-in email.`);
    if (d.funnel.people_saw_popup >= 100 && d.funnel.people_pressed / d.funnel.people_saw_popup < 0.04) todo.push('Under 4% press the popup button. Test a different headline or the $0.99 offer (Admin → Paywall).');
    if (d.funnel.people_opened_payment > 0 && d.members.new / d.funnel.people_opened_payment < 0.2) todo.push('Most people who open the payment form don’t pay. Try a Gumroad test purchase on your phone to see what they see.');
    if (!todo.length) todo.push('Nothing urgent. Share one real reply story (with permission) on social today.');
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-950">Today</h2>
          <p className="text-sm text-ink-500">Does MadeVisa work? Real replies for paying members, real and fresh jobs, a paywall that converts.</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((n) => (
            <button key={n} type="button" onClick={() => setDays(n)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${days === n ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'}`}>
              {n} days
            </button>
          ))}
          <button type="button" onClick={() => void load()} disabled={busy} className="rounded-md p-1.5 text-ink-500 ring-1 ring-ink-200 hover:bg-ink-50" aria-label="Reload">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {err && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>}
      {d && (
        <>
          <div className="rounded-2xl bg-ink-950 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-wider text-white/60">North Star · last {d.days} days</p>
            <p className="mt-1 text-4xl font-bold tabular-nums">{star ?? '—'}</p>
            <p className="text-sm text-white/80">employer replies per paying member ({nf(d.outcomes.member_replies)} replies, {nf(d.members.paying)} paying members)</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-ink-900">Do this today</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-ink-700">
              {todo.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </div>

          <Group title="Outcomes (tracked applications)">
            <Tile label="Applications tracked" value={nf(d.outcomes.applications)} />
            <Tile label="Employer replies" value={nf(d.outcomes.replies)} sub={`${pct(d.outcomes.replies, d.outcomes.applications)} of applications`} />
            <Tile label="Interviews" value={nf(d.outcomes.interviews)} />
            <Tile label="Offers" value={nf(d.outcomes.offers)} />
            <Tile label="Answered by the applicant" value={pct(answered, d.outcomes.applications)} sub={`${nf(d.outcomes.checkins_due)} check-ins due`} />
          </Group>
          <Group title="Jobs: real and fresh">
            <Tile label="Live jobs" value={nf(d.jobs.live)} />
            <Tile label="Re-checked in 24 h" value={fresh == null ? '—' : `${fresh}%`} sub={`${nf(d.jobs.checked_24h)} of ${nf(d.jobs.imported)} imported`} />
            <Tile label="Not checked for 72 h+" value={nf(d.jobs.stale_72h)} />
            <Tile label="Median time since check" value={d.jobs.median_hours_since_check == null ? '—' : `${d.jobs.median_hours_since_check} h`} />
            <Tile label="No apply address" value={nf(d.jobs.no_apply_link)} />
          </Group>
          <Group title="Members and paywall">
            <Tile label="Paying members now" value={nf(d.members.paying)} />
            <Tile label="New members" value={nf(d.members.new)} sub={`${nf(d.members.ended)} ended`} />
            <Tile label="People who saw the popup" value={nf(d.funnel.people_saw_popup)} />
            <Tile label="Pressed the button" value={nf(d.funnel.people_pressed)} sub={pct(d.funnel.people_pressed, d.funnel.people_saw_popup)} />
            <Tile label="Opened the payment form" value={nf(d.funnel.people_opened_payment)} sub={`${nf(d.funnel.free_applies)} used their free application`} />
          </Group>
        </>
      )}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-ink-900">{title}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{children}</div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3">
      <p className="text-xs font-semibold text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink-950">{value}</p>
      {sub && <p className="text-[11px] text-ink-400">{sub}</p>}
    </div>
  );
}
