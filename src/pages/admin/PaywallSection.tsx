import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { fetchPaywallStats, type PaywallDay, type PaywallSource } from '@/lib/paywallStats';

// Admin → Paywall: the membership popup, day by day. How many times it opened,
// how many people saw it, how many pressed "Subscribe now", and how many new
// paying members Gumroad confirmed that day.

const SOURCE_NAME: Record<string, string> = {
  job_page: 'Job page',
  jobs_list: 'Jobs list (outside listings)',
  landing: 'Landing page search',
  cv_match: 'CV match',
};
const nf = (n: number) => n.toLocaleString('en-US');
const rate = (part: number, whole: number) => (whole > 0 ? `${((100 * part) / whole).toFixed(1)}%` : '—');
// en-GB on purpose: some browser languages print months as "M10".
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function PaywallSection() {
  const [range, setRange] = useState(14);
  const [days, setDays] = useState<PaywallDay[] | null>(null);
  const [sources, setSources] = useState<PaywallSource[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    const r = await fetchPaywallStats(range);
    setBusy(false);
    if ('error' in r) return setErr(r.error);
    setErr(null);
    setDays(r.days);
    setSources(r.by_source);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const sum = (k: keyof Omit<PaywallDay, 'day'>) => (days ?? []).reduce((n, d) => n + (d[k] ?? 0), 0);
  const max = Math.max(1, ...(days ?? []).map((d) => d.shown));

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-950">Paywall</h2>
          <p className="text-sm text-ink-500">The membership popup ($12.50 once): how often it opened, and how often “Subscribe now” was pressed. Days are UTC.</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30, 90].map((n) => (
            <button key={n} type="button" onClick={() => setRange(n)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${range === n ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'}`}>
              {n} days
            </button>
          ))}
          <button type="button" onClick={() => void load()} disabled={busy} className="rounded-md p-1.5 text-ink-500 ring-1 ring-ink-200 hover:bg-ink-50" aria-label="Reload">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {err && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>}

      {days && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Tile label="Popup opened" value={nf(sum('shown'))} />
            <Tile label="People who saw it" value={nf(sum('people'))} sub="per day, added up" />
            <Tile label="Subscribe now pressed" value={nf(sum('clicks'))} sub={`${rate(sum('clicks'), sum('shown'))} of opens`} />
            <Tile label="People who pressed it" value={nf(sum('clickers'))} />
            <Tile label="New paying members" value={nf(sum('paid'))} sub={`${rate(sum('paid'), sum('clickers'))} of people who pressed`} />
          </div>
          {/* Added with the on-page checkout and the offer (migration 20261231120000). */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Payment form opened" value={nf(sum('checkouts'))} sub="people; on the page, not on Gumroad" />
            <Tile label="Free applications used" value={nf(sum('free_applies'))} sub="the one free Apply per browser" />
            <Tile label="“First month” offer shown" value={nf(sum('downsell_shown'))} sub="needs VITE_GUMROAD_DOWNSELL_CODE" />
            <Tile label="Offer taken" value={nf(sum('downsell_clicks'))} sub={`${rate(sum('downsell_clicks'), sum('downsell_shown'))} of people shown`} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-xs font-semibold text-ink-500">
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Popup opened</th>
                  <th className="px-3 py-2 text-right">People</th>
                  <th className="px-3 py-2 text-right">Subscribe now</th>
                  <th className="px-3 py-2 text-right">People pressed</th>
                  <th className="px-3 py-2 text-right">Click rate</th>
                  <th className="px-3 py-2 text-right">New members</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {days.map((d) => (
                  <tr key={d.day}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-ink-800">{dayLabel(d.day)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.max(2, (d.shown / max) * 140)}px` }} aria-hidden />
                        <span className="tabular-nums text-ink-900">{nf(d.shown)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-600">{nf(d.people)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink-900">{nf(d.clicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-600">{nf(d.clickers)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-600">{rate(d.clicks, d.shown)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700">{d.paid ? nf(d.paid) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sources.length > 0 && (
            <div className="rounded-xl border border-ink-200 bg-white p-4">
              <p className="text-sm font-bold text-ink-950">Where it opened ({range} days)</p>
              <table className="mt-2 w-full text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-ink-500">
                    <th className="py-1">Screen</th>
                    <th className="py-1 text-right">Opened</th>
                    <th className="py-1 text-right">People</th>
                    <th className="py-1 text-right">Subscribe now</th>
                    <th className="py-1 text-right">Click rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {sources.map((s) => (
                    <tr key={s.source}>
                      <td className="py-1.5 text-ink-800">{SOURCE_NAME[s.source] ?? s.source.replace(/_/g, ' ')}</td>
                      <td className="py-1.5 text-right tabular-nums">{nf(s.shown)}</td>
                      <td className="py-1.5 text-right tabular-nums text-ink-600">{nf(s.people)}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{nf(s.clicks)}</td>
                      <td className="py-1.5 text-right tabular-nums text-ink-600">{rate(s.clicks, s.shown)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-ink-400">“New members” = first payments Gumroad confirmed that day (test purchases left out). Members and admins never see the popup, so they aren’t counted.</p>
        </>
      )}
    </section>
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
