import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Mail, RefreshCw, Search, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Admin → Emails: every email the site sent today (in your time zone), by type
// and by hour, the last 14 days, and the latest emails with Resend's answer.
// Server side: admin_email_stats / email_log (migration 20261215090000).
// Sign-in codes are sent by Supabase Auth itself and are not counted here.

type Stats = {
  tz: string;
  configured: boolean;
  sender: string | null;
  today: { total: number; sent: number; queued: number; failed: number; skipped: number; people: number };
  yesterday: number;
  by_kind: { kind: string; n: number; failed: number }[];
  by_hour: number[];
  days: { d: string; n: number }[];
  recent: { at: string; to: string; kind: string; subject: string; status: 'queued' | 'sent' | 'failed' | 'skipped'; code: number | null; error: string | null; name: string | null }[];
};

const KIND: Record<string, string> = {
  for_you: 'Jobs that match your skills',
  job_alert: 'Job alerts',
  application: 'Applications sent',
  auto_apply: 'Auto Apply started',
  admin: 'To you (admin)',
  campaign: 'Campaigns',
  series: 'Auto Apply series',
  test: 'Tests',
  news: 'News',
  account: 'Account',
};
const kindName = (k: string) => KIND[k] ?? k;
const nf = (n: number) => n.toLocaleString('en-US');
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const dayTime = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? time(iso) : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
/** Resend's free plan: 100 emails a day. */
const DAILY_FREE = 100;

function Tile({ icon: Icon, label, value, sub, tone = 'ink' }: { icon: typeof Mail; label: string; value: string; sub?: string; tone?: 'ink' | 'rose' }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className={`mt-1.5 block text-3xl font-bold tabular-nums tracking-tight ${tone === 'rose' ? 'text-rose-700' : 'text-ink-950'}`}>{value}</span>
      {sub && <span className="mt-0.5 block text-xs text-ink-500">{sub}</span>}
    </div>
  );
}

/** Single-series columns with a hover value on each. */
function Columns({ values, labels, every, height = 120 }: { values: number[]; labels: string[]; every: number; height?: number }) {
  const max = Math.max(1, ...values);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="relative flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div
              className={`w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-brand-700' : 'bg-brand-500'} ${v === 0 ? 'opacity-25' : ''}`}
              style={{ height: `${v === 0 ? 2 : Math.max(4, (v / max) * height)}px` }}
            />
            {hover === i && (
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-950 px-2 py-1 text-[11px] font-semibold text-white shadow">
                {labels[i]}: {nf(v)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[10px] text-ink-400">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 truncate text-center">
            {i % every === 0 ? l : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export function EmailsSection() {
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);
  const [s, setS] = useState<Stats | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [onlyToday, setOnlyToday] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_email_stats', { p_tz: tz });
    setBusy(false);
    if (error) {
      setErr(/admin_email_stats|schema cache/i.test(error.message) ? 'Run migration 20261215090000_emails_and_auto_apply_service.sql to see emails here.' : error.message);
      setS(null);
      return;
    }
    setErr(null);
    setS(data as Stats);
  }, [tz]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (s === undefined) {
    return (
      <div className="mt-8 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
      </div>
    );
  }
  if (!s) return <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</p>;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const needle = q.trim().toLowerCase();
  const rows = s.recent.filter(
    (r) =>
      (!onlyToday || Date.parse(r.at) >= startOfToday.getTime()) &&
      (!needle || r.to.toLowerCase().includes(needle) || r.subject.toLowerCase().includes(needle) || (r.name ?? '').toLowerCase().includes(needle)),
  );
  const diff = s.today.total - s.yesterday;
  const usedShare = Math.min(100, Math.round((100 * s.today.total) / DAILY_FREE));
  const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-950">Emails sent today</h2>
          <p className="text-sm text-ink-500">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · {s.tz} · from {s.sender ?? 'not set'}
          </p>
        </div>
        <button onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {!s.configured && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Resend isn’t connected</strong>, so no email goes out. Add <code>resend_api_key</code> and <code>email_from</code> to <code>app_secrets</code> (EMAIL-SETUP.md, step 3).
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Mail} label="Sent today" value={nf(s.today.total)} sub={diff === 0 ? 'same as yesterday' : `${diff > 0 ? '+' : ''}${nf(diff)} vs yesterday (${nf(s.yesterday)})`} />
        <Tile icon={Users} label="People emailed" value={nf(s.today.people)} sub="different addresses" />
        <Tile icon={CheckCircle2} label="Accepted by Resend" value={nf(s.today.sent)} sub={s.today.queued ? `${nf(s.today.queued)} waiting for an answer` : 'all answered'} />
        <Tile icon={AlertTriangle} label="Refused" value={nf(s.today.failed)} sub={s.today.skipped ? `${nf(s.today.skipped)} not sent: turned off by the person` : 'bad address, limit reached…'} tone={s.today.failed ? 'rose' : 'ink'} />
      </div>

      <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
        <div className="flex items-center justify-between text-xs text-ink-500">
          <span>Resend free plan: {DAILY_FREE} a day</span>
          <span className="font-semibold text-ink-700">
            {nf(s.today.total)} / {DAILY_FREE}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
          <div className={`h-full rounded-full ${usedShare >= 90 ? 'bg-rose-500' : usedShare >= 70 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${Math.max(1, usedShare)}%` }} />
        </div>
        {usedShare >= 90 && <p className="mt-2 text-xs text-rose-700">Close to the daily cap — move Resend to the paid plan so emails aren’t refused.</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
          <p className="text-sm font-bold text-ink-950">Today, by hour</p>
          <div className="mt-4">
            <Columns values={s.by_hour} labels={hours} every={3} />
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
          <p className="text-sm font-bold text-ink-950">Today, by type</p>
          {s.by_kind.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">Nothing sent yet today.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {s.by_kind.map((k) => (
                <li key={k.kind}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate text-ink-700">{kindName(k.kind)}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink-950">
                      {nf(k.n)}
                      {k.failed > 0 && <span className="ml-1 text-xs font-medium text-rose-700">({k.failed} refused)</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(3, (100 * k.n) / Math.max(1, s.today.total))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
        <p className="text-sm font-bold text-ink-950">Last 14 days</p>
        <div className="mt-4">
          <Columns
            values={s.days.map((d) => d.n)}
            labels={s.days.map((d) => new Date(`${d.d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}
            every={2}
            height={100}
          />
        </div>
      </div>

      <div className="rounded-xl bg-white ring-1 ring-ink-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
          <p className="text-sm font-bold text-ink-950">{onlyToday ? 'Sent today' : 'Latest 150'}</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-ink-100 p-0.5 text-xs font-semibold">
              {[
                { v: true, t: 'Today' },
                { v: false, t: 'Latest 150' },
              ].map((o) => (
                <button key={o.t} onClick={() => setOnlyToday(o.v)} className={`rounded-md px-2.5 py-1 ${onlyToday === o.v ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600'}`}>
                  {o.t}
                </button>
              ))}
            </div>
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email, name or subject" className="h-8 w-52 rounded-lg border border-ink-200 pl-8 pr-2 text-xs outline-none focus:border-brand-500" />
            </label>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-500">No emails{onlyToday ? ' today' : ''}{needle ? ' match' : ''}.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((r, i) => (
              <li key={`${r.at}-${i}`} className="grid gap-1 px-4 py-2.5 text-[13px] sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                <span className="text-xs tabular-nums text-ink-500">{dayTime(r.at)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink-900">{r.subject}</span>
                  <span className="block truncate text-xs text-ink-500">
                    {r.name ? `${r.name} · ` : ''}
                    {r.to} · {kindName(r.kind)}
                  </span>
                  {r.error && r.status !== 'sent' && <span className="block truncate text-xs text-rose-700">{r.error}</span>}
                </span>
                <span className="justify-self-start sm:justify-self-end">
                  {r.status === 'sent' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Sent
                    </span>
                  ) : r.status === 'failed' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                      <AlertTriangle className="h-3 w-3" /> Refused{r.code ? ` ${r.code}` : ''}
                    </span>
                  ) : r.status === 'skipped' ? (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">Turned off</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                      <Clock className="h-3 w-3" /> Sending
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-ink-400">Sign-in and confirmation codes are sent by Supabase Auth through Resend SMTP and don’t appear here — see them in Resend → Logs.</p>
    </div>
  );
}
