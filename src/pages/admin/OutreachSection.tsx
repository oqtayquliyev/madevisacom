import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, AtSign, BarChart3, FlaskConical, RotateCcw, Bot, Briefcase, Check, ChevronLeft, ChevronRight, Eye, FileUp, Globe, Loader2, Mail, Pause, Play, Plus, RefreshCw, Rocket, ScanSearch, Search, Send, Settings2, Square, Tag, Trash2, Upload, UserRound, Users, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Admin → Outreach: emails to many people at once.
//
//   Autopilot   every day by itself: job seekers get emails written for their role (live jobs for
//               "product designer", CV match, visa-sponsored roles), employers get "find talent
//               faster". Rotates sender addresses, keeps every limit, tells you (bell) when it needs
//               more contacts or more senders. Migration 20261221090000_outreach_autopilot.sql.
//
//   Campaigns   pick a template + an audience → see how many → send yourself a test → Start.
//               Sent a few per minute, never above the daily cap (Sending & limits).
//   Contacts    import addresses (paste or CSV; email alone is enough), tag them, unsubscribe,
//               delete. Unsubscribed and bounced addresses are never emailed by a campaign.
//   Find emails one button: business addresses that are already public — recruiter addresses in
//               live job ads, company profile addresses, and those published on company websites
//               (edge function email-finder). Added with tags found-online + employer.
//   Templates   the six emails (3 CV Match / Auto Apply promos, 3 Auto Apply series) — edit,
//               preview, test.
//   Limits      daily cap, reserve for site emails, speed, sender.
// Server side: migrations 20261216090000_outreach_campaigns.sql … 20261218090000_email_finder_and_names.sql.

type Audience = { source: 'contacts' | 'accounts' | 'both'; accounts?: AccountSeg; tags?: string[]; country?: string; skip_days?: number; limit?: number };
type Settings = { enabled: boolean; daily_cap: number; reserve: number; per_minute: number; nurture_enabled: boolean; nurture_gap_days: number; nurture_per_day: number };
type Campaign = {
  id: string;
  name: string;
  template_key: string;
  template_name: string | null;
  sender_id?: string | null;
  sender_name?: string | null;
  audience: Audience;
  status: 'draft' | 'sending' | 'paused' | 'done' | 'cancelled';
  total: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  unsubscribed: number;
  opened_dashboard: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};
type Sender = { id: string; from_name: string; from_email: string; reply_to: string | null; daily_limit: number; active: boolean; for_campaigns: boolean; for_series: boolean; for_audience?: 'any' | 'seeker' | 'employer'; note: string | null; sent_today: number; sent_7d: number; failed_7d: number };
type Overview = {
  settings: Settings;
  resend?: boolean;
  senders_on?: number;
  budget_today: number;
  sent_today: number;
  sender: string | null;
  separate_key: boolean;
  series: { in_series: number; finished: number; sent_7d: number };
  campaigns: Campaign[];
};
type Template = { key: string; name: string; audience: 'anyone' | 'accounts' | 'series' | 'autopilot'; subject: string; preheader: string | null; eyebrow: string | null; headline: string; body: string; cta_label: string; cta_url: string; show_stats: boolean; updated_at: string };
type Contact = { id: string; email: string; name: string | null; country: string | null; tags: string[]; source: string; status: 'subscribed' | 'unsubscribed' | 'bounced' | 'complained'; account: boolean; sent_count: number; last_sent_at: string | null; created_at: string; audience?: 'seeker' | 'employer' | null; role?: string | null; company?: string | null; auto_step?: number };
type ContactList = { counts: { all: number; subscribed: number; unsubscribed: number; bounced: number; accounts: number; seekers?: number; employers?: number; with_role?: number }; tags: { tag: string; n: number }[]; roles?: { role: string; label: string; n: number }[]; countries?: { country: string; n: number }[]; total: number; rows: Contact[] };

type AccountSeg = 'all' | 'no_cv' | 'cv' | 'free' | 'pro' | 'free_no_cv' | 'cv_not_viewed' | 'preview_free' | 'starter_pro_intent' | 'saved_no_apply';
/** Which accounts a campaign goes to. The last five are the lifecycle segments (each has its own template). */
const ACCOUNT_SEGS: { v: AccountSeg; t: string; hint?: string }[] = [
  { v: 'all', t: 'All accounts' },
  { v: 'no_cv', t: 'No CV yet' },
  { v: 'cv', t: 'Have a CV' },
  { v: 'free', t: 'Free plan' },
  { v: 'pro', t: 'Pro' },
  { v: 'free_no_cv', t: 'Lifecycle · Free, no CV', hint: 'Template: life_no_cv' },
  { v: 'cv_not_viewed', t: 'Lifecycle · CV uploaded, matches not opened', hint: 'Template: life_cv_ready' },
  { v: 'preview_free', t: 'Lifecycle · Free, saw the 3-match preview', hint: 'Template: life_starter_upgrade' },
  { v: 'starter_pro_intent', t: 'Lifecycle · Starter showing interest in Pro', hint: 'Template: life_pro_upgrade' },
  { v: 'saved_no_apply', t: 'Lifecycle · Saved jobs, no application in 14 days', hint: 'Template: life_saved_jobs' },
];
type Sub = 'autopilot' | 'campaigns' | 'results' | 'contacts' | 'finder' | 'templates' | 'senders' | 'limits';
const SUBS: { key: Sub; label: string; icon: typeof Mail }[] = [
  { key: 'autopilot', label: 'Autopilot', icon: Bot },
  { key: 'campaigns', label: 'Campaigns', icon: Rocket },
  { key: 'results', label: 'Results', icon: BarChart3 },
  { key: 'contacts', label: 'Contacts', icon: Users },
  { key: 'finder', label: 'Find emails', icon: ScanSearch },
  { key: 'templates', label: 'Templates', icon: Mail },
  { key: 'senders', label: 'Senders', icon: AtSign },
  { key: 'limits', label: 'Sending & limits', icon: Settings2 },
];
const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const friendly = (m: string) => (/admin_|outreach|schema cache|does not exist/i.test(m) && /function|relation|schema/i.test(m) ? 'Run migration 20261216090000_outreach_campaigns.sql first.' : m);
const input = 'h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-[13px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const STATUS: Record<Campaign['status'], string> = {
  draft: 'bg-ink-100 text-ink-600',
  sending: 'bg-brand-50 text-brand-700',
  paused: 'bg-amber-50 text-amber-700',
  done: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-ink-100 text-ink-500',
};

/** Icons in public/icons (t-*.png), usable in template list lines as “- [name] …”. */
const EMAIL_ICONS = ['target', 'zap', 'globe', 'plane', 'mail', 'pause', 'file', 'bell', 'sparkles', 'chart', 'clock', 'check', 'trending', 'briefcase', 'dashboard', 'search', 'send', 'puzzle', 'user', 'rocket', 'badge', 'list', 'calendar', 'shield', 'new', 'star', 'heart', 'inbox', 'award', 'map'];

export function OutreachSection() {
  const [sub, setSub] = useState<Sub>('autopilot');
  const [ov, setOv] = useState<Overview | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([supabase.rpc('admin_campaigns'), supabase.rpc('admin_templates'), supabase.rpc('admin_senders')]);
    if (!c.error) setSenders((c.data ?? []) as Sender[]);
    if (a.error) {
      setErr(friendly(a.error.message));
      setOv(null);
      return;
    }
    setErr(null);
    setOv(a.data as Overview);
    if (!b.error) setTemplates((b.data ?? []) as Template[]);
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (ov === undefined) return <Spin />;
  if (!ov) return <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</p>;
  const cap = ov.settings.daily_cap;

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-950">Outreach</h2>
          <p className="text-sm text-ink-500">Campaigns to your contacts and accounts, and the Auto Apply email series. Every email has an unsubscribe link.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sent today (all emails)" value={`${nf(ov.sent_today)} / ${nf(cap)}`} sub="Daily cap in Sending & limits" />
        <Stat label="Left today for campaigns" value={nf(ov.budget_today)} sub={`${nf(ov.settings.reserve)} kept for site emails`} />
        <Stat label="Speed" value={`${nf(ov.settings.per_minute)}/min`} sub={ov.settings.enabled ? 'Sending is on' : 'Sending is paused'} tone={ov.settings.enabled ? 'ink' : 'amber'} />
        <Stat label="Sender" value={ov.sender?.replace(/<.*>/, '').trim() || 'Not set'} sub={ov.sender?.match(/<(.*)>/)?.[1] ?? '—'} small />
      </div>

      {ov.resend === false && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Resend isn’t connected</strong>, so tests and campaigns can’t send. Add <code>resend_api_key</code> and <code>email_from</code> to <code>app_secrets</code> (EMAIL-SETUP.md).
        </p>
      )}

      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-ink-200">
        {SUBS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSub(s.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold ${sub === s.key ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50'}`}
          >
            <s.icon className="h-4 w-4" /> {s.label}
          </button>
        ))}
      </nav>

      {sub === 'autopilot' && <Autopilot senders={senders} onContacts={() => setSub('contacts')} onSenders={() => setSub('senders')} onTemplates={() => setSub('templates')} />}
      {sub === 'campaigns' && <Campaigns ov={ov} templates={templates} senders={senders} onChange={load} />}
      {sub === 'results' && <Results />}
      {sub === 'contacts' && <Contacts onFind={() => setSub('finder')} />}
      {sub === 'finder' && <EmailFinder onContacts={() => setSub('contacts')} />}
      {sub === 'templates' && <Templates templates={templates} senders={senders} onSaved={load} />}
      {sub === 'senders' && <Senders senders={senders} onChange={load} />}
      {sub === 'limits' && <Limits ov={ov} onChange={load} />}
    </div>
  );
}

/* --------------------------------------------------------------- Autopilot */

type AutoSettings = { enabled: boolean; max_mode?: boolean; seeker_per_day: number; employer_per_day: number; seeker_steps: number; employer_steps: number; gap_days: number; hour_from: number; hour_to: number; paused_reason: string | null; last_run_at: string | null; last_note: string | null };
type AudienceStats = { contacts: number; new: number; in_progress: number; done: number; unsubscribed: number; bounced: number };
type AutoOverview = {
  settings: AutoSettings;
  budget_today: number;
  capacity?: { total: number; left: number; seeker: number; employer: number; hours_left: number; next_part: number };
  today: { seeker: number; employer: number; failed: number };
  days: { d: string; seeker: number; employer: number }[];
  audiences: { seeker?: AudienceStats; employer?: AudienceStats } | null;
  roles: { role: string; label: string; contacts: number; emailed: number; waiting: number; jobs: number | null }[];
  senders: { id: string; name: string; email: string; audience: 'any' | 'seeker' | 'employer'; limit: number; today: number; active: boolean }[];
  alerts: { title: string; body: string; at: string }[];
  recent: { at: string; to: string; kind: string; subject: string; status: string; error: string | null; from: string | null }[];
};
const AUTO_KEYS: { key: string; label: string; aud: 'seeker' | 'employer' }[] = [
  { key: 'auto_seeker_1', label: 'Seekers 1 · jobs for their role', aud: 'seeker' },
  { key: 'auto_seeker_2', label: 'Seekers 2 · CV match', aud: 'seeker' },
  { key: 'auto_seeker_3', label: 'Seekers 3 · visa sponsorship', aud: 'seeker' },
  { key: 'auto_employer_1', label: 'Employers 1 · find talent faster', aud: 'employer' },
  { key: 'auto_employer_2', label: 'Employers 2 · sponsored listing', aud: 'employer' },
];

function Autopilot({ senders, onContacts, onSenders, onTemplates }: { senders: Sender[]; onContacts: () => void; onSenders: () => void; onTemplates: () => void }) {
  const [ov, setOv] = useState<AutoOverview | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pv, setPv] = useState<{ key: string; role: string; name: string; company: string }>({ key: 'auto_seeker_1', role: 'Senior Product Designer', name: 'Anna Lee', company: '' });
  const [html, setHtml] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [testTo, setTestTo] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_autopilot');
    if (error) {
      setErr(/admin_autopilot|schema cache|does not exist/i.test(error.message) ? 'Run migration 20261221090000_outreach_autopilot.sql first.' : error.message);
      setOv(null);
      return;
    }
    setErr(null);
    setOv(data as AutoOverview);
  }, []);
  useEffect(() => {
    void load();
    void supabase.auth.getUser().then(({ data }) => setTestTo(data.user?.email ?? ''));
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => {
    const t = window.setTimeout(async () => {
      const { data } = await supabase.rpc('admin_autopilot_preview', { p: { key: pv.key, role: pv.role, name: pv.name, company: pv.company, email: pv.key.startsWith('auto_employer') ? `jobs@${(pv.company || 'bosch').toLowerCase().replace(/[^a-z0-9]+/g, '')}.com` : 'anna.lee@example.com' } });
      const d = data as { html: string; subject: string } | null;
      setHtml(d?.html ?? null);
      setSubject(d?.subject ?? '');
    }, 350);
    return () => window.clearTimeout(t);
  }, [pv]);

  const save = async (p: Partial<AutoSettings>, key: string) => {
    setBusy(key);
    const { error } = await supabase.rpc('admin_autopilot_set', { p });
    setBusy(null);
    if (error) setErr(error.message);
    void load();
  };
  const runNow = async () => {
    setBusy('run');
    setMsg(null);
    const { data, error } = await supabase.rpc('admin_autopilot_run');
    setBusy(null);
    if (error) return setMsg(error.message);
    const d = data as { sent?: { seeker?: number; employer?: number }; skipped?: string; senders_full?: boolean; unused?: number; cap_reached?: boolean };
    setMsg(
      d.skipped
        ? `Not sent: ${d.skipped}.`
        : `Sent ${nf(d.sent?.seeker)} to job seekers and ${nf(d.sent?.employer)} to employers${d.senders_full ? ' — every address is at its limit for today' : ''}${d.cap_reached ? ' — the daily cap is reached' : ''}${d.unused ? ` · ${nf(d.unused)} slots unused: no contacts due, import more` : ''}. They leave the outbox over the next minutes.`,
    );
    void load();
  };
  const test = async () => {
    setBusy('test');
    const { error } = await supabase.rpc('admin_autopilot_test', { p: { key: pv.key, to: testTo, role: pv.role, name: pv.name, company: pv.company } });
    setBusy(null);
    setMsg(error ? error.message : `Test sent to ${testTo}.`);
  };

  if (ov === undefined) return <Spin />;
  if (!ov) return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</p>;
  const s = ov.settings;
  const sk = ov.audiences?.seeker;
  const em = ov.audiences?.employer;
  const capacity = ov.senders.filter((x) => x.active).reduce((a, x) => a + x.limit, 0);
  const usedToday = ov.senders.filter((x) => x.active).reduce((a, x) => a + x.today, 0);
  const daysLeft = (n: number | undefined, perDay: number) => (perDay > 0 && n != null ? Math.floor(n / perDay) : null);
  const maxDay = Math.max(1, ...ov.days.map((d) => d.seeker + d.employer));
  const maxMode = s.max_mode !== false;
  const cap = ov.capacity;
  // A day's need: the fixed number, or in max mode what the addresses for that audience can send.
  const perDay = (aud: 'seeker' | 'employer') => (maxMode ? (cap?.[aud] ?? 0) : aud === 'seeker' ? s.seeker_per_day : s.employer_per_day);
  const seekerDays = daysLeft(sk?.new, perDay('seeker'));
  const employerDays = daysLeft(em?.new, perDay('employer'));
  const sendersFor = (aud: 'seeker' | 'employer') => senders.filter((x) => x.active && x.for_campaigns && (x.for_audience ?? 'any') !== (aud === 'seeker' ? 'employer' : 'seeker'));

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className={`flex flex-wrap items-center gap-3 rounded-xl p-4 ring-1 ${s.enabled ? 'bg-emerald-50 ring-emerald-200' : 'bg-amber-50 ring-amber-200'}`}>
        <span className={`grid h-10 w-10 place-items-center rounded-full ${s.enabled ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink-950">{s.enabled ? 'Autopilot is on — sending every day by itself' : 'Autopilot is paused'}</p>
          <p className="text-[13px] text-ink-600">
            {s.paused_reason ??
              (maxMode
                ? `Max: every hour (${s.hour_from}:00–${s.hour_to}:00 UTC) each address sends its share of what it has left, so all ${ov.senders.filter((x) => x.active).length} addresses reach their daily limit.${cap && cap.hours_left > 0 ? ` Next hour: ~${nf(cap.next_part)} emails.` : ''}`
                : `Fixed numbers, every hour between ${s.hour_from}:00 and ${s.hour_to}:00 UTC, within every limit.`)}
            {s.last_note ? ` Last round: ${s.last_note}.` : ''}
            {s.last_run_at ? ` Last round ${when(s.last_run_at)}.` : ''}
          </p>
        </div>
        <Btn onClick={() => void runNow()} busy={busy === 'run'} icon={Send}>Send a round now</Btn>
        <Btn onClick={() => void save({ enabled: !s.enabled }, 'on')} busy={busy === 'on'} icon={s.enabled ? Pause : Play} tone={s.enabled ? 'ink' : 'green'}>
          {s.enabled ? 'Pause' : 'Switch on'}
        </Btn>
      </div>
      {msg && <p className="rounded-lg bg-brand-50 px-3 py-2 text-[13px] text-brand-900">{msg}</p>}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{err}</p>}

      {/* Alerts */}
      {ov.alerts.length > 0 && (
        <ul className="space-y-2">
          {ov.alerts.slice(0, 3).map((a) => (
            <li key={a.at + a.title} className="flex gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-950 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <b>{a.title}</b> · {a.body} <span className="text-amber-700">({when(a.at)})</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Job seekers emailed today" value={`${nf(ov.today.seeker)} / ${nf(perDay('seeker'))}`} sub={`${nf(sk?.new)} new left${seekerDays != null ? ` · ~${seekerDays} days` : ''}`} tone={seekerDays != null && seekerDays < 3 ? 'amber' : 'ink'} />
        <Stat label="Employers emailed today" value={`${nf(ov.today.employer)} / ${nf(perDay('employer'))}`} sub={`${nf(em?.new)} new left${employerDays != null ? ` · ~${employerDays} days` : ''}`} tone={employerDays != null && employerDays < 3 ? 'amber' : 'ink'} />
        <Stat label="Sender capacity today" value={`${nf(usedToday)} / ${nf(capacity)}`} sub={`${ov.senders.filter((x) => x.active).length} addresses`} tone={capacity && usedToday >= capacity ? 'amber' : 'ink'} />
        <Stat label="Left under the daily cap" value={nf(ov.budget_today)} sub={`${nf(ov.today.failed)} refused today`} tone={ov.today.failed ? 'amber' : 'ink'} />
      </div>

      {/* Sending mode */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-ink-200">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-950">How much to send</p>
          <p className="text-[12.5px] text-ink-600">
            {maxMode
              ? 'Max — every address sends its full daily limit, split into equal parts every hour. Raise an address’s limit in Senders and the autopilot uses it.'
              : 'Fixed — the numbers a day you set for job seekers and employers below.'}
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-ink-100 p-0.5">
          {([
            [true, 'Max (fill every address)'],
            [false, 'Fixed numbers'],
          ] as const).map(([v, label]) => (
            <button
              key={label}
              onClick={() => void save({ max_mode: v }, 'mode')}
              disabled={busy === 'mode'}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${maxMode === v ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Last 14 days */}
      <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink-950">Sent by the autopilot, last 14 days</p>
          <p className="flex gap-3 text-[11.5px] text-ink-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500" /> Job seekers</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Employers</span>
          </p>
        </div>
        <div className="mt-3 flex h-28 items-end gap-1.5">
          {ov.days.map((d) => (
            <div key={d.d} className="flex flex-1 flex-col justify-end" title={`${d.d}: ${d.seeker} seekers, ${d.employer} employers`}>
              <div className="w-full rounded-t bg-amber-400" style={{ height: `${(100 * d.employer) / maxDay}%` }} />
              <div className="w-full bg-brand-500" style={{ height: `${(100 * d.seeker) / maxDay}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10.5px] text-ink-400">
          <span>{ov.days[0]?.d.slice(5)}</span>
          <span>today</span>
        </div>
      </div>

      {/* Audiences */}
      <div className="grid gap-3 md:grid-cols-2">
        {([
          ['seeker', 'Job seekers', UserRound, sk, s.seeker_steps, 'seeker_per_day', 'seeker_steps', 3] as const,
          ['employer', 'Employers', Briefcase, em, s.employer_steps, 'employer_per_day', 'employer_steps', 2] as const,
        ]).map(([aud, title, Icon, st, steps, perKey, stepKey, maxSteps]) => (
          <div key={aud} className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
            <p className="flex items-center gap-2 text-sm font-bold text-ink-950">
              <Icon className="h-4 w-4 text-brand-600" /> {title}
            </p>
            <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
              {[
                ['Contacts', st?.contacts],
                ['New', st?.new],
                ['In series', st?.in_progress],
                ['Finished', st?.done],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-lg bg-ink-50 py-2">
                  <dd className="text-lg font-bold tabular-nums text-ink-950">{nf(v as number | undefined)}</dd>
                  <dt className="text-[11px] text-ink-500">{k}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[12px] text-ink-500">
              {nf(st?.unsubscribed)} unsubscribed · {nf(st?.bounced)} bounced · senders: {sendersFor(aud).map((x) => x.from_email.split('@')[0] + '@').join(', ') || 'none'}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {maxMode ? (
                <L label="Emails a day">
                  <p className="rounded-lg bg-ink-50 px-3 py-2 text-[13px] text-ink-700">
                    Max · {nf(cap?.[aud])} <span className="text-ink-500">(its addresses’ limits)</span>
                  </p>
                </L>
              ) : (
                <NumberSetting label="Emails a day" value={aud === 'seeker' ? s.seeker_per_day : s.employer_per_day} min={0} max={100000} onSave={(v) => save({ [perKey]: v } as Partial<AutoSettings>, perKey)} />
              )}
              <NumberSetting label={`Emails each (1–${maxSteps})`} value={steps} min={1} max={maxSteps} onSave={(v) => save({ [stepKey]: v } as Partial<AutoSettings>, stepKey)} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <NumberSetting label="Days between emails to one person" value={s.gap_days} min={2} max={60} onSave={(v) => save({ gap_days: v }, 'gap')} />
        <NumberSetting label="Send from (hour, UTC)" value={s.hour_from} min={0} max={23} onSave={(v) => save({ hour_from: v }, 'hf')} />
        <NumberSetting label="Send until (hour, UTC)" value={s.hour_to} min={1} max={24} onSave={(v) => save({ hour_to: v }, 'ht')} />
      </div>

      {/* Senders */}
      <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-ink-950">Sender addresses</p>
          <Btn onClick={onSenders} icon={AtSign}>Manage senders</Btn>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ov.senders.map((x) => (
            <div key={x.id} className={`rounded-lg p-3 ring-1 ring-ink-200 ${x.active ? '' : 'opacity-50'}`}>
              <p className="truncate text-[13px] font-semibold text-ink-900">{x.email}</p>
              <p className="text-[11.5px] text-ink-500">{x.audience === 'any' ? 'Seekers and employers' : x.audience === 'seeker' ? 'Job seekers' : 'Employers'}</p>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-ink-100">
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${x.limit ? Math.min(100, (100 * x.today) / x.limit) : 0}%` }} />
              </span>
              <p className="mt-1 text-[11.5px] tabular-nums text-ink-600">{nf(x.today)} / {nf(x.limit)} today</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-5 text-ink-500">
          Raise limits slowly (+10–20 a day per address). New addresses on a domain start low; many emails from a new address on day one is the quickest way into spam. Every email carries the sender’s name, why it was sent, a one-click unsubscribe, and MadeVisa’s address and phone.
        </p>
      </div>

      {/* Roles */}
      <div className="rounded-xl bg-white ring-1 ring-ink-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 p-4">
          <div>
            <p className="text-sm font-bold text-ink-950">Job seekers by role</p>
            <p className="text-[12px] text-ink-500">Each role gets its own email: its live jobs, its numbers, its link.</p>
          </div>
          <Btn onClick={onContacts} icon={Users}>All contacts</Btn>
        </div>
        {ov.roles.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-500">No roles yet. Import a list with a title / role column (Contacts → Import).</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-ink-500">
                <tr className="border-b border-ink-100">
                  <th className="px-4 py-2">Role</th>
                  <th className="px-2 py-2 text-right">Contacts</th>
                  <th className="px-2 py-2 text-right">Emailed</th>
                  <th className="px-2 py-2 text-right">Waiting</th>
                  <th className="px-2 py-2 text-right">Live jobs</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {ov.roles.map((r) => (
                  <tr key={r.role} className="hover:bg-ink-50/50">
                    <td className="px-4 py-2 font-semibold text-ink-900">{r.label}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{nf(r.contacts)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{nf(r.emailed)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{nf(r.waiting)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.jobs == null ? '—' : nf(r.jobs)}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => setPv({ ...pv, key: 'auto_seeker_1', role: r.label })} className="text-[12px] font-semibold text-brand-700 hover:underline">
                        Preview
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-ink-950">See an email as one person gets it</p>
          <Btn onClick={onTemplates} icon={Mail}>Edit the templates</Btn>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <L label="Email">
            <select value={pv.key} onChange={(e) => setPv({ ...pv, key: e.target.value })} className={input}>
              {AUTO_KEYS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </L>
          <L label="Name">
            <input value={pv.name} onChange={(e) => setPv({ ...pv, name: e.target.value })} className={input} />
          </L>
          {pv.key.startsWith('auto_seeker') ? (
            <L label="Role">
              <input value={pv.role} onChange={(e) => setPv({ ...pv, role: e.target.value })} placeholder="e.g. Accountant" className={input} />
            </L>
          ) : (
            <L label="Company">
              <input value={pv.company} onChange={(e) => setPv({ ...pv, company: e.target.value })} placeholder="e.g. Bosch" className={input} />
            </L>
          )}
          <L label="Send a test to">
            <span className="flex gap-1.5">
              <input value={testTo} onChange={(e) => setTestTo(e.target.value)} className={input} />
              <Btn onClick={() => void test()} busy={busy === 'test'} icon={Send}>Send</Btn>
            </span>
          </L>
        </div>
        {subject && (
          <p className="mt-3 text-[13px] text-ink-700">
            <span className="text-ink-500">Subject:</span> <b>{subject}</b>
          </p>
        )}
        {html ? <iframe title="Autopilot email" srcDoc={html} sandbox="" className="mt-2 h-[560px] w-full rounded-lg bg-[#f1f4f9] ring-1 ring-ink-200" /> : <Spin />}
      </div>

      {/* Recent */}
      <div className="rounded-xl bg-white ring-1 ring-ink-200">
        <p className="border-b border-ink-100 p-4 text-sm font-bold text-ink-950">Latest autopilot emails</p>
        {ov.recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-500">Nothing sent yet.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-ink-100 overflow-auto">
            {ov.recent.map((r) => (
              <li key={r.at + r.to} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                <span className="w-28 shrink-0 text-ink-500">{when(r.at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-900">{r.subject}</span>
                  <span className="block truncate text-[12px] text-ink-500">
                    {r.to} · {r.kind === 'auto_employer' ? 'employer' : 'job seeker'}{r.from ? ` · from ${r.from}` : ''}
                  </span>
                  {r.error && <span className="block truncate text-[12px] text-rose-700">{r.error}</span>}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${r.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : r.status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-ink-100 text-ink-600'}`}>{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Campaigns */

function Campaigns({ ov, templates, senders, onChange }: { ov: Overview; templates: Template[]; senders: Sender[]; onChange: () => void }) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = async (id: string, status: string) => {
    if (status === 'cancelled' && !window.confirm('Cancel this campaign? Emails not sent yet won’t be sent.')) return;
    setBusy(id + status);
    const { error } = await supabase.rpc('admin_campaign_set', { p_id: id, p_status: status });
    setBusy(null);
    if (error) setErr(friendly(error.message));
    onChange();
  };
  return (
    <div className="space-y-4">
      {creating ? (
        <NewCampaign templates={templates} senders={senders} ov={ov} onClose={() => setCreating(false)} onDone={() => (setCreating(false), onChange())} />
      ) : (
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-700">
          <Plus className="h-4 w-4" /> New campaign
        </button>
      )}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{err}</p>}
      <div className="rounded-xl bg-white ring-1 ring-ink-200">
        {ov.campaigns.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-500">No campaigns yet. Import contacts, then create your first campaign.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {ov.campaigns.map((c) => {
              const done = c.sent + c.failed + c.skipped;
              const pct = c.total ? Math.round((100 * done) / c.total) : 0;
              const mins = Math.ceil(c.queued / Math.max(1, ov.settings.per_minute));
              return (
                <li key={c.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-950">
                        {c.name}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${STATUS[c.status]}`}>{c.status}</span>
                      </p>
                      <p className="text-xs text-ink-500">
                        {c.template_name ?? c.template_key} · {audienceLabel(c.audience)} · from {c.sender_name ?? 'rotating senders'} · {c.started_at ? `started ${when(c.started_at)}` : `created ${when(c.created_at)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.status === 'sending' && <Btn onClick={() => void set(c.id, 'paused')} busy={busy === c.id + 'paused'} icon={Pause}>Pause</Btn>}
                      {c.status === 'paused' && <Btn onClick={() => void set(c.id, 'sending')} busy={busy === c.id + 'sending'} icon={Play}>Resume</Btn>}
                      {(c.status === 'sending' || c.status === 'paused') && <Btn onClick={() => void set(c.id, 'cancelled')} busy={busy === c.id + 'cancelled'} icon={X} tone="rose">Cancel</Btn>}
                      {c.status === 'draft' && <StartDraft id={c.id} onDone={onChange} />}
                      {(c.status === 'draft' || c.status === 'done' || c.status === 'cancelled') && <Btn onClick={() => void set(c.id, 'delete')} busy={busy === c.id + 'delete'} icon={Trash2}>Delete</Btn>}
                    </div>
                  </div>
                  {c.status !== 'draft' && (
                    <>
                      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-ink-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(1, pct)}%` }} />
                      </div>
                      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
                        <span><b className="text-ink-900">{nf(c.sent)}</b> sent of {nf(c.total)}</span>
                        {c.queued > 0 && <span>{nf(c.queued)} waiting{c.status === 'sending' ? ` · about ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`} at this speed (if the daily cap allows)` : ''}</span>}
                        {c.failed > 0 && <span className="text-rose-700">{nf(c.failed)} refused</span>}
                        {c.skipped > 0 && <span>{nf(c.skipped)} skipped</span>}
                        <span>{nf(c.opened_dashboard)} opened their dashboard</span>
                        <span>{nf(c.unsubscribed)} unsubscribed</span>
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StartDraft({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Btn
        onClick={async () => {
          if (!window.confirm('Start sending this campaign now?')) return;
          setBusy(true);
          const { error } = await supabase.rpc('admin_campaign_start', { p_id: id });
          setBusy(false);
          if (error) return setErr(friendly(error.message));
          onDone();
        }}
        busy={busy}
        icon={Rocket}
        tone="green"
      >
        Start
      </Btn>
      {err && <span className="text-xs text-rose-700">{err}</span>}
    </span>
  );
}

function audienceLabel(a: Audience): string {
  const who = a.source === 'contacts' ? 'Imported contacts' : a.source === 'accounts' ? 'Accounts' : 'Contacts + accounts';
  const acc = a.source !== 'contacts' && a.accounts && a.accounts !== 'all' ? ` (${ACCOUNT_SEGS.find((x) => x.v === a.accounts)?.t ?? a.accounts})` : '';
  return [who + acc, a.tags?.length ? `tags: ${a.tags.join(', ')}` : '', a.country ? a.country : '', a.skip_days ? `skip emailed in ${a.skip_days} d` : '', a.limit ? `max ${nf(a.limit)}` : ''].filter(Boolean).join(' · ');
}

function NewCampaign({ templates, senders, ov, onClose, onDone }: { templates: Template[]; senders: Sender[]; ov: Overview; onClose: () => void; onDone: () => void }) {
  const [sender, setSender] = useState<string>('');
  const live = senders.filter((x) => x.active && x.for_campaigns);
  const promos = templates.filter((t) => t.audience !== 'series' && t.audience !== 'autopilot');
  const [name, setName] = useState('');
  const [tpl, setTpl] = useState(promos[0]?.key ?? '');
  const [aud, setAud] = useState<Audience>({ source: 'contacts', accounts: 'all', tags: [], country: '', skip_days: 14 });
  const [count, setCount] = useState<{ total: number; accounts: number; contacts: number; sample: string[] } | null>(null);
  const [counting, setCounting] = useState(false);
  const [tags, setTags] = useState<{ tag: string; n: number }[]>([]);
  const [testTo, setTestTo] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc('admin_contacts_list', { p_limit: 1 }).then(({ data }) => setTags(((data as ContactList | null)?.tags ?? []) as { tag: string; n: number }[]));
    void supabase.auth.getUser().then(({ data }) => setTestTo(data.user?.email ?? ''));
  }, []);
  const audKey = JSON.stringify(aud);
  useEffect(() => {
    setCounting(true);
    const t = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc('admin_audience_count', { p: clean(aud) });
      setCounting(false);
      if (!error) setCount(data as typeof count);
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audKey]);

  const senderCap = live.length ? (sender ? live.filter((x) => x.id === sender) : live).reduce((a, x) => a + x.daily_limit, 0) : Infinity;
  const perDay = Math.max(1, Math.min(ov.settings.daily_cap - ov.settings.reserve, senderCap));
  const days = count ? Math.ceil(count.total / perDay) : 0;

  const save = async (start: boolean) => {
    setBusy(start ? 'start' : 'save');
    setMsg(null);
    const { data, error } = await supabase.rpc('admin_campaign_save', { p_id: null, p_name: name || `${templates.find((t) => t.key === tpl)?.name ?? 'Campaign'} · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, p_template: tpl, p_audience: clean(aud), p_sender: sender || null });
    if (error) {
      setBusy(null);
      return setMsg({ ok: false, text: friendly(error.message) });
    }
    if (start) {
      const r = await supabase.rpc('admin_campaign_start', { p_id: (data as { id: string }).id });
      if (r.error) {
        setBusy(null);
        return setMsg({ ok: false, text: friendly(r.error.message) });
      }
    }
    setBusy(null);
    onDone();
  };
  const test = async () => {
    setBusy('test');
    setMsg(null);
    const { error } = await supabase.rpc('admin_template_test', { p_key: tpl, p_email: testTo, p_sender: sender || null });
    setBusy(null);
    setMsg(error ? { ok: false, text: friendly(error.message) } : { ok: true, text: `Test sent to ${testTo}.` });
  };
  const showPreview = async () => {
    const { data, error } = await supabase.rpc('admin_template_preview', { p_key: tpl });
    if (error) return setMsg({ ok: false, text: friendly(error.message) });
    setPreview((data as { html: string }).html);
  };

  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-ink-200">
      <div className="flex items-center justify-between">
        <p className="text-base font-bold text-ink-950">New campaign</p>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-700" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <L label="Name (only you see it)">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. October — upload your CV" className={input} />
          </L>
          <L label="Email">
            <div className="flex gap-2">
              <select value={tpl} onChange={(e) => setTpl(e.target.value)} className={input}>
                {promos.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Btn onClick={() => void showPreview()} icon={Eye}>Preview</Btn>
            </div>
            <span className="mt-1 block text-[12px] text-ink-500">Subject: {templates.find((t) => t.key === tpl)?.subject}</span>
          </L>
          <L label="Send from">
            <select value={sender} onChange={(e) => setSender(e.target.value)} className={input}>
              <option value="">{live.length ? `Rotate between ${live.length} switched-on senders` : 'Default sender (no sender switched on yet)'}</option>
              {senders.map((x) => (
                <option key={x.id} value={x.id} disabled={!x.active}>
                  {x.from_name} &lt;{x.from_email}&gt;{x.active ? ` · ${x.sent_today}/${x.daily_limit} today` : ' · off'}
                </option>
              ))}
            </select>
          </L>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-ink-700">Send to</p>
            <Seg value={aud.source} onChange={(v) => setAud({ ...aud, source: v })} options={[{ v: 'contacts', t: 'Imported contacts' }, { v: 'accounts', t: 'MadeVisa accounts' }, { v: 'both', t: 'Both' }]} />
          </div>
          {aud.source !== 'contacts' && (
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-ink-700">Which accounts</p>
              <select value={aud.accounts ?? 'all'} onChange={(e) => setAud({ ...aud, accounts: e.target.value as AccountSeg })} className={input} aria-label="Which accounts">
                {ACCOUNT_SEGS.map((x) => (
                  <option key={x.v} value={x.v}>
                    {x.t}
                    {x.hint ? ` (${x.hint})` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11.5px] text-ink-500">Everyone a campaign, the series or the autopilot emailed in the last 3 days is left out automatically.</p>
            </div>
          )}
          {aud.source !== 'accounts' && tags.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-ink-700">Only contacts with these tags (any)</p>
              <p className="mb-1.5 text-[11.5px] text-ink-500">Addresses from Find emails are only included when you pick one of their tags (<b>employer</b>, <b>found-online</b>…).</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const on = aud.tags?.includes(t.tag);
                  return (
                    <button
                      key={t.tag}
                      onClick={() => setAud({ ...aud, tags: on ? aud.tags!.filter((x) => x !== t.tag) : [...(aud.tags ?? []), t.tag] })}
                      className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${on ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}
                    >
                      {t.tag} <span className="opacity-70">{nf(t.n)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {aud.source !== 'accounts' && aud.tags?.some((x) => ['employer', 'found-online', 'job-ad', 'website', 'company-profile'].includes(x)) && tpl !== 'promo_employers' && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
              These are company and recruiter addresses. The job-seeker emails will look odd to them — pick <b>For employers: hire from abroad</b> above.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <L label="Country (optional)">
              <input value={aud.country ?? ''} onChange={(e) => setAud({ ...aud, country: e.target.value })} placeholder="e.g. Azerbaijan" className={input} />
            </L>
            <L label="Skip if emailed in (days)">
              <input type="number" min={0} value={aud.skip_days ?? 0} onChange={(e) => setAud({ ...aud, skip_days: Number(e.target.value) || 0 })} className={input} />
            </L>
            <L label="At most (optional)">
              <input type="number" min={0} value={aud.limit ?? ''} onChange={(e) => setAud({ ...aud, limit: Number(e.target.value) || undefined })} placeholder="All" className={input} />
            </L>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-ink-50 p-4">
            <p className="text-xs font-medium text-ink-500">People in this audience</p>
            <p className="mt-1 flex items-center gap-2 text-3xl font-bold tabular-nums text-ink-950">
              {count ? nf(count.total) : '—'} {counting && <Loader2 className="h-4 w-4 animate-spin text-ink-400" />}
            </p>
            {count && (
              <p className="mt-1 text-xs text-ink-600">
                {nf(count.accounts)} accounts · {nf(count.contacts)} imported · unsubscribed, bounced and people who turned off news are left out
              </p>
            )}
            {count && count.total > 0 && (
              <p className="mt-2 text-xs text-ink-600">
                At your daily cap ({nf(perDay)} a day for campaigns{live.length ? `, senders allow ${nf((sender ? live.filter((x) => x.id === sender) : live).reduce((a, x) => a + x.daily_limit, 0))}` : ''}) this takes about <b>{days} {days === 1 ? 'day' : 'days'}</b>.
                {days > 3 && ' Raise the cap in Sending & limits after upgrading Resend.'}
              </p>
            )}
            {count?.sample?.length ? <p className="mt-2 truncate text-[11px] text-ink-400">e.g. {count.sample.join(', ')}</p> : null}
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-ink-700">Send yourself a test first</p>
            <div className="flex gap-2">
              <input value={testTo} onChange={(e) => setTestTo(e.target.value)} className={input} />
              <Btn onClick={() => void test()} busy={busy === 'test'} icon={Send}>Test</Btn>
            </div>
          </div>
          {msg && <p className={`rounded-lg px-3 py-2 text-[13px] ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{msg.text}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => void save(true)} disabled={!tpl || !count?.total || busy !== null} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Start sending to {count ? nf(count.total) : '…'}
            </button>
            <button onClick={() => void save(false)} disabled={!tpl || busy !== null} className="rounded-full px-4 py-2.5 text-[13px] font-bold text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50 disabled:opacity-50">
              Save as draft
            </button>
          </div>
        </div>
      </div>
      {preview && <PreviewModal html={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function clean(a: Audience): Audience {
  return {
    source: a.source,
    accounts: a.source === 'contacts' ? undefined : a.accounts,
    tags: a.source === 'accounts' ? [] : a.tags ?? [],
    country: a.country?.trim() || undefined,
    skip_days: a.skip_days || undefined,
    limit: a.limit || undefined,
  };
}

/* ---------------------------------------------------------------- Contacts */

type ImportRow = { email: string; name?: string; country?: string; role?: string; company?: string };

/** One CSV line → cells, with "quoted, values" kept together. */
function csvCells(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === delim && !q) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Paste or CSV → contacts. Finds the columns from a header (email, name or first + last name,
 * title / role / position, company, country / location — a Consulti or Apollo export works as it is),
 * or takes the first address on each line.
 */
function parseContacts(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = [',', ';', '\t'].find((d) => lines[0].includes(d)) ?? ',';
  const head = csvCells(lines[0], delim).map((h) => h.toLowerCase().replace(/[^a-z ]/g, '').trim());
  const hasHeader = head.some((h) => /e ?mail/.test(h)) && !lines[0].includes('@');
  const col = (re: RegExp, not?: RegExp) => (hasHeader ? head.findIndex((h) => re.test(h) && !(not && not.test(h))) : -1);
  const ei = col(/^(work |business |personal )?e ?mail( address)?$/) >= 0 ? col(/^(work |business |personal )?e ?mail( address)?$/) : col(/e ?mail/, /status|verified|type/);
  const ni = col(/^(full )?name$|^contact name$|^person$/);
  const fi = col(/^first ?name$/);
  const li = col(/^last ?name$|^surname$/);
  const ri = col(/^(job )?title$|^role$|^position$|^job ?role$|^occupation$|^headline$/);
  const oi = col(/^company( name)?$|^organi[sz]ation( name)?$|^employer$|^account name$/);
  const ci = col(/^country$/) >= 0 ? col(/^country$/) : col(/^location$|^city$|^person location$/);
  const out: ImportRow[] = [];
  for (const l of hasHeader ? lines.slice(1) : lines) {
    if (ei >= 0) {
      const cells = csvCells(l, delim);
      const email = (cells[ei] ?? '').replace(/^mailto:/i, '');
      if (!/@/.test(email)) continue;
      const name = ni >= 0 ? cells[ni] : [fi >= 0 ? cells[fi] : '', li >= 0 ? cells[li] : ''].filter(Boolean).join(' ');
      // "Montclair, New Jersey, United States" → "United States"
      const place = ci >= 0 ? (cells[ci] ?? '').split(',').map((x) => x.trim()).filter(Boolean).pop() : undefined;
      out.push({ email, name: name || undefined, role: ri >= 0 ? cells[ri] || undefined : undefined, company: oi >= 0 ? cells[oi] || undefined : undefined, country: place || undefined });
      continue;
    }
    for (const m of l.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) out.push({ email: m });
  }
  return out;
}

function Contacts({ onFind }: { onFind: () => void }) {
  const [data, setData] = useState<ContactList | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [aud, setAud] = useState('');
  const [role, setRole] = useState('');
  const [country, setCountry] = useState('');
  const [step, setStep] = useState('');
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const PAGE = 50;

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_contacts_find', { p: { search: q, status, tag, audience: aud, role, country, step, limit: PAGE, offset: page * PAGE } });
    if (error) {
      setErr(/admin_contacts_find/.test(error.message) ? 'Run migration 20261221090000_outreach_autopilot.sql first.' : friendly(error.message));
      setData(null);
    } else {
      setErr(null);
      setData(data as ContactList);
    }
  }, [q, status, tag, aud, role, country, step, page]);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  const setAudience = async (audience: 'seeker' | 'employer') => {
    if (!picked.size) return;
    const { error } = await supabase.rpc('admin_contacts_set', { p_ids: [...picked], p: { audience } });
    if (error) setErr(friendly(error.message));
    setPicked(new Set());
    void load();
  };
  const bulk = async (action: string) => {
    if (!picked.size) return;
    if (action === 'delete' && !window.confirm(`Delete ${picked.size} contacts?`)) return;
    const { error } = await supabase.rpc('admin_contacts_update', { p_ids: [...picked], p_action: action, p_tag: bulkTag || null });
    if (error) setErr(friendly(error.message));
    setPicked(new Set());
    void load();
  };

  if (data === undefined) return <Spin />;
  if (!data) return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</p>;
  const pages = Math.max(1, Math.ceil(data.total / PAGE));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Contacts" value={nf(data.counts.all)} sub={`${nf(data.counts.seekers)} job seekers · ${nf(data.counts.employers)} employers`} />
        <Stat label="Subscribed" value={nf(data.counts.subscribed)} sub={`${nf(data.counts.with_role)} with a role`} />
        <Stat label="Unsubscribed" value={nf(data.counts.unsubscribed)} />
        <Stat label="Bounced" value={nf(data.counts.bounced)} tone={data.counts.bounced ? 'amber' : 'ink'} />
      </div>

      <AddContact onAdded={() => void load()} />

      {importing ? (
        <Import onClose={() => setImporting(false)} onDone={() => (setImporting(false), void load())} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setImporting(true)} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-bold text-ink-800 ring-1 ring-ink-200 hover:bg-ink-50">
            <Upload className="h-4 w-4" /> Import many (paste or CSV)
          </button>
          <button onClick={onFind} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-700">
            <ScanSearch className="h-4 w-4" /> Find emails online
          </button>
        </div>
      )}

      <div className="rounded-xl bg-white ring-1 ring-ink-200">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-3">
          <label className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Email, name, role, company or country" className={`${input} pl-8`} />
          </label>
          <select value={aud} onChange={(e) => (setAud(e.target.value), setPage(0))} className={`${input} w-auto`}>
            <option value="">Seekers and employers</option>
            <option value="seeker">Job seekers ({nf(data.counts.seekers)})</option>
            <option value="employer">Employers ({nf(data.counts.employers)})</option>
          </select>
          <input list="mv-roles" value={role} onChange={(e) => (setRole(e.target.value), setPage(0))} placeholder="Any role" className={`${input} w-44`} />
          <datalist id="mv-roles">
            {(data.roles ?? []).map((r) => (
              <option key={r.role} value={r.role}>
                {r.label} ({nf(r.n)})
              </option>
            ))}
          </datalist>
          <select value={country} onChange={(e) => (setCountry(e.target.value), setPage(0))} className={`${input} w-auto`}>
            <option value="">Any country</option>
            {(data.countries ?? []).map((c) => (
              <option key={c.country} value={c.country}>
                {c.country} ({nf(c.n)})
              </option>
            ))}
          </select>
          <select value={step} onChange={(e) => (setStep(e.target.value), setPage(0))} className={`${input} w-auto`}>
            <option value="">Any autopilot step</option>
            <option value="new">Not emailed yet</option>
            <option value="1">Got email 1</option>
            <option value="2">Got email 2</option>
            <option value="3">Got email 3</option>
          </select>
          <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(0))} className={`${input} w-auto`}>
            <option value="">Any status</option>
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounced">Bounced</option>
          </select>
          <select value={tag} onChange={(e) => (setTag(e.target.value), setPage(0))} className={`${input} w-auto`}>
            <option value="">Any tag</option>
            {data.tags.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.tag} ({nf(t.n)})
              </option>
            ))}
          </select>
        </div>
        {picked.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-brand-50/50 px-3 py-2 text-[13px]">
            <b>{picked.size} selected</b>
            <input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="tag" className={`${input} h-8 w-28`} />
            <Btn onClick={() => void bulk('add_tag')} icon={Tag}>Add tag</Btn>
            <Btn onClick={() => void bulk('remove_tag')} icon={Tag}>Remove tag</Btn>
            <Btn onClick={() => void bulk('unsubscribe')} icon={X}>Unsubscribe</Btn>
            <Btn onClick={() => void bulk('resubscribe')} icon={Check}>Resubscribe</Btn>
            <Btn onClick={() => void setAudience('seeker')} icon={UserRound}>Job seekers</Btn>
            <Btn onClick={() => void setAudience('employer')} icon={Briefcase}>Employers</Btn>
            <Btn onClick={() => void bulk('delete')} icon={Trash2} tone="rose">Delete</Btn>
          </div>
        )}
        {data.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-500">No contacts{q || status || tag || aud || role || country || step ? ' match' : ' yet — import a list to start'}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-ink-500">
                <tr className="border-b border-ink-100">
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={data.rows.every((r) => picked.has(r.id))}
                      onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...data.rows.map((r) => r.id)]) : new Set([...picked].filter((id) => !data.rows.some((r) => r.id === id))))}
                    />
                  </th>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Tags</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Emailed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50/50">
                    <td className="px-3 py-2">
                      <input type="checkbox" aria-label={`Select ${r.email}`} checked={picked.has(r.id)} onChange={(e) => setPicked((s) => (e.target.checked ? new Set([...s, r.id]) : new Set([...s].filter((x) => x !== r.id))))} />
                    </td>
                    <td className="px-2 py-2">
                      <span className="block font-semibold text-ink-900">{r.email}</span>
                      <span className="block text-[11.5px] text-ink-500">{[r.name, r.role, r.company, r.country, r.source, r.account ? 'has account' : ''].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex flex-wrap gap-1">
                        {r.audience && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.audience === 'employer' ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-700'}`}>{r.audience === 'employer' ? 'employer' : 'job seeker'}</span>}
                        {(r.auto_step ?? 0) > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">autopilot {r.auto_step}</span>}
                        {r.tags.map((t) => (
                          <span key={t} className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                            {t}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.status === 'subscribed' ? 'bg-emerald-50 text-emerald-700' : r.status === 'unsubscribed' ? 'bg-ink-100 text-ink-600' : 'bg-rose-50 text-rose-700'}`}>{r.status}</span>
                    </td>
                    <td className="px-2 py-2 text-right text-ink-600">
                      {r.sent_count ? `${r.sent_count}× · ${when(r.last_sent_at)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-ink-100 px-3 py-2 text-xs text-ink-500">
          <span>
            {nf(data.total)} {data.total === 1 ? 'contact' : 'contacts'} · page {page + 1} of {pages}
          </span>
          <span className="flex gap-1">
            <Btn onClick={() => setPage((p) => Math.max(0, p - 1))} icon={ChevronLeft}>Back</Btn>
            <Btn onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} icon={ChevronRight}>Next</Btn>
          </span>
        </div>
      </div>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{err}</p>}
    </div>
  );
}

function Import({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const [source, setSource] = useState('');
  const [consent, setConsent] = useState(false);
  const [audience, setAudience] = useState<'auto' | 'seeker' | 'employer'>('auto');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => parseContacts(text), [text]);

  const run = async () => {
    setBusy(true);
    setResult(null);
    const t = tags.split(',').map((x) => x.trim()).filter(Boolean);
    const sum = { added: 0, already: 0, invalid: 0, unsubscribed: 0 };
    for (let i = 0; i < rows.length; i += 5000) {
      setProgress(`Importing ${nf(Math.min(i + 5000, rows.length))} of ${nf(rows.length)}…`);
      const { data, error } = await supabase.rpc('admin_contacts_import', { p_rows: rows.slice(i, i + 5000), p_tags: t, p_source: source || 'import', p_consent: source || null, p_audience: audience });
      if (error) {
        setBusy(false);
        setProgress(null);
        return setResult(friendly(error.message));
      }
      const d = data as typeof sum;
      sum.added += d.added;
      sum.already += d.already;
      sum.invalid += d.invalid;
      sum.unsubscribed += d.unsubscribed;
    }
    setBusy(false);
    setProgress(null);
    setResult(`${nf(sum.added)} added · ${nf(sum.already)} were already here · ${nf(sum.invalid)} not valid · ${nf(sum.unsubscribed)} stay unsubscribed`);
    if (sum.added + sum.already > 0) window.setTimeout(onDone, 2500);
  };

  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-ink-200">
      <div className="flex items-center justify-between">
        <p className="text-base font-bold text-ink-950">Import contacts</p>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-700" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-1 text-[13px] text-ink-500">Paste addresses (one per line, or any text with addresses in it), or a CSV with an <code>email</code> column. <code>name</code> (or first + last name), <code>title</code> / <code>role</code>, <code>company</code> and <code>country</code> / <code>location</code> are used when present — a Consulti or Apollo export works as it is. The role decides which email a job seeker gets.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={'email,name,country\nann@gmail.com,Ann Lee,Germany\nbob@yahoo.com'} className="mt-3 w-full rounded-lg border border-ink-200 p-3 font-mono text-[12.5px] outline-none focus:border-brand-500" />
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText(await f.text());
            e.target.value = '';
          }}
        />
        <Btn onClick={() => fileRef.current?.click()} icon={FileUp}>Choose a CSV file</Btn>
        <span className="text-ink-600">
          <b>{nf(rows.length)}</b> addresses found{rows.length ? ` · ${nf(rows.filter((r) => r.role).length)} with a role · ${nf(rows.filter((r) => r.company).length)} with a company` : ''}
        </span>
      </div>
      <div className="mt-4">
        <L label="Who are they?">
          <Seg
            value={audience}
            onChange={setAudience}
            options={[
              { v: 'auto', t: 'Work it out (team inboxes and recruiters → employers)' },
              { v: 'seeker', t: 'Job seekers' },
              { v: 'employer', t: 'Employers' },
            ]}
          />
        </L>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <L label="Tags (comma separated)">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. webinar-oct, nurses" className={input} />
        </L>
        <L label="Where these addresses come from">
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Signed up at our Baku job fair" className={input} />
        </L>
      </div>
      <label className="mt-4 flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 text-[13px] leading-5 text-amber-950">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>I may email these addresses: they agreed to hear from MadeVisa, or they are business contacts the law in their country lets MadeVisa write to with a clear way to unsubscribe. In the EU and UK, private people generally have to agree first. Lists with many dead addresses get the sending account suspended and hurt delivery for every MadeVisa email — remove unverified addresses first.</span>
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={() => void run()} disabled={!rows.length || !consent || busy} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import {nf(rows.length)}
        </button>
        {progress && <span className="text-[13px] text-ink-600">{progress}</span>}
        {result && <span className="text-[13px] text-ink-800">{result}</span>}
      </div>
    </div>
  );
}

/** One address at a time: email (required), name, country, tags. */
function AddContact({ onAdded }: { onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ok = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim());
  const add = async () => {
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc('admin_contacts_import', {
      p_rows: [{ email: email.trim(), name: name.trim() || undefined, country: country.trim() || undefined }],
      p_tags: tags.split(',').map((x) => x.trim()).filter(Boolean),
      p_source: 'added by admin',
      p_consent: null,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: friendly(error.message) });
    const d = data as { added: number; already: number; unsubscribed: number };
    setMsg(
      d.added
        ? { ok: true, text: `${email.trim()} added.` }
        : d.unsubscribed
          ? { ok: false, text: `${email.trim()} is already here and unsubscribed — select it below and choose Resubscribe only if they asked.` }
          : { ok: true, text: `${email.trim()} was already here${tags ? ' — tags added' : ''}.` },
    );
    if (d.added || d.already) {
      setEmail('');
      setName('');
      setCountry('');
      onAdded();
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok && !busy) void add();
      }}
      className="rounded-xl bg-white p-4 ring-1 ring-ink-200"
    >
      <p className="text-sm font-bold text-ink-950">Add a contact</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto]">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" type="email" className={input} aria-label="Email" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className={input} aria-label="Name" />
        <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country (optional)" className={input} aria-label="Country" />
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma separated" className={input} aria-label="Tags" />
        <button type="submit" disabled={!ok || busy} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 text-[13px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add contact
        </button>
      </div>
      {msg && <p className={`mt-2 text-[12.5px] ${msg.ok ? 'text-emerald-700' : 'text-amber-800'}`}>{msg.text}</p>}
    </form>
  );
}

/* ------------------------------------------------------------- Find emails */

type FinderSite = { domain: string; url: string; name: string | null; country: string | null; status: 'waiting' | 'scanning' | 'done' | 'failed' | 'blocked'; pages: number; found: number; added: number; error: string | null; scanned_at: string | null };
type FinderOverview = { sites_total: number; sites_scanned: number; sites_left: number; from_ads: number; from_profiles: number; found_total: number; found_subscribed: number; found_named: number; recent: FinderSite[] };
type ScanResult = { url: string; domain: string; pages: number; emails: { email: string; page: string }[]; error?: string; blocked?: boolean };
type LogLine = { domain: string; text: string; tone: 'ok' | 'none' | 'bad' };

/** The email-finder edge function: reads up to 10 websites per call. */
async function scanWebsites(urls: string[]): Promise<ScanResult[]> {
  const { data, error } = await supabase.functions.invoke('email-finder', { body: { action: 'scan', urls } });
  if (error) {
    if (/Failed to send a request/i.test(error.message)) throw new Error('The email-finder function isn’t deployed yet: run “supabase functions deploy email-finder”.');
    const res = (error as { context?: Response }).context;
    let detail: string | null = null;
    try {
      const j = res && typeof res.json === 'function' ? await res.clone().json() : null;
      detail = j?.error ?? null;
    } catch {
      /* not JSON */
    }
    if (detail) throw new Error(detail);
    if (res?.status === 404) throw new Error('The email-finder function isn’t deployed yet: run “supabase functions deploy email-finder”.');
    throw new Error(res?.status ? `email-finder answered ${res.status}. Try again in a minute.` : error.message);
  }
  if (!data?.ok) throw new Error(data?.error ?? 'email-finder failed');
  return data.sites as ScanResult[];
}

const SITE_STATUS: Record<FinderSite['status'], string> = {
  done: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-ink-100 text-ink-600',
  blocked: 'bg-amber-50 text-amber-700',
  scanning: 'bg-brand-50 text-brand-700',
  waiting: 'bg-ink-100 text-ink-600',
};

function EmailFinder({ onContacts }: { onContacts: () => void }) {
  const [ov, setOv] = useState<FinderOverview | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState<'all' | 'paste' | null>(null);
  const [perClick, setPerClick] = useState(40);
  const [progress, setProgress] = useState<{ step: string; sites: number; found: number; added: number; fromAds: number; fromProfiles: number } | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [paste, setPaste] = useState('');
  const stop = useRef(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_finder_overview');
    if (error) {
      setErr(/admin_finder|schema cache|does not exist/i.test(error.message) ? 'Run migration 20261218090000_email_finder_and_names.sql first.' : error.message);
      setOv(null);
      return;
    }
    setOv(data as FinderOverview);
  }, []);
  useEffect(() => void load(), [load]);

  const pushLog = (rows: ScanResult[], saved: boolean) =>
    setLog((l) =>
      [
        ...rows.map((r): LogLine => ({
          domain: r.domain || r.url,
          text: r.emails.length ? `${r.emails.length} found · ${r.emails.slice(0, 3).map((e) => e.email).join(', ')}${r.emails.length > 3 ? '…' : ''}` : (r.error ?? 'nothing found'),
          tone: r.emails.length ? 'ok' : r.blocked || !saved ? 'bad' : 'none',
        })),
        ...l,
      ].slice(0, 60),
    );

  /** Read websites in batches of 8 and save what they publish. */
  const readSites = async (batch: { url: string; domain?: string; name?: string | null; country?: string | null }[], acc: { sites: number; found: number; added: number }) => {
    const res = await scanWebsites(batch.map((b) => b.url));
    const merged = res.map((r, i) => ({ ...r, domain: batch[i].domain ?? r.domain, name: batch[i].name ?? null, country: batch[i].country ?? null }));
    const { data, error } = await supabase.rpc('admin_finder_save', { p: merged });
    if (error) throw new Error(error.message);
    const d = data as { sites: number; found: number; added: number };
    acc.sites += d.sites;
    acc.found += d.found;
    acc.added += d.added;
    pushLog(merged, true);
  };

  const findAll = async () => {
    stop.current = false;
    setRunning('all');
    setErr(null);
    setLog([]);
    const acc = { sites: 0, found: 0, added: 0 };
    try {
      setProgress({ step: 'Collecting addresses from job ads and company profiles…', ...acc, fromAds: 0, fromProfiles: 0 });
      const { data, error } = await supabase.rpc('admin_finder_collect');
      if (error) throw new Error(error.message);
      const c = data as { from_ads: number; from_profiles: number };
      let p = { ...acc, fromAds: c.from_ads, fromProfiles: c.from_profiles };
      while (!stop.current && acc.sites < perClick) {
        setProgress({ step: `Reading company websites… ${acc.sites} of up to ${perClick}`, ...p });
        const q = await supabase.rpc('admin_finder_queue', { p_limit: Math.min(8, perClick - acc.sites) });
        if (q.error) throw new Error(q.error.message);
        const batch = (q.data ?? []) as { domain: string; url: string; name: string | null; country: string | null }[];
        if (!batch.length) break;
        await readSites(batch, acc);
        p = { ...acc, fromAds: c.from_ads, fromProfiles: c.from_profiles };
      }
      setProgress({ step: stop.current ? 'Stopped.' : 'Done.', ...p });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setProgress((x) => (x ? { ...x, step: 'Stopped by an error.' } : x));
    }
    setRunning(null);
    void load();
  };

  const pasted = useMemo(
    () => [...new Set(paste.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(x)))].slice(0, 200),
    [paste],
  );
  const readPasted = async () => {
    stop.current = false;
    setRunning('paste');
    setErr(null);
    setLog([]);
    const acc = { sites: 0, found: 0, added: 0 };
    try {
      for (let i = 0; i < pasted.length && !stop.current; i += 8) {
        setProgress({ step: `Reading ${Math.min(i + 8, pasted.length)} of ${pasted.length} websites…`, ...acc, fromAds: 0, fromProfiles: 0 });
        await readSites(pasted.slice(i, i + 8).map((url) => ({ url })), acc);
      }
      setProgress({ step: stop.current ? 'Stopped.' : 'Done.', ...acc, fromAds: 0, fromProfiles: 0 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setRunning(null);
    void load();
  };

  if (ov === undefined) return <Spin />;
  if (!ov) return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</p>;
  const waiting = ov.from_ads + ov.from_profiles;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Found so far" value={nf(ov.found_total)} sub={`${nf(ov.found_named)} with a name · ${nf(ov.found_subscribed)} subscribed`} />
        <Stat label="Ready to add now" value={nf(waiting)} sub={`${nf(ov.from_ads)} from job ads · ${nf(ov.from_profiles)} from profiles`} />
        <Stat label="Company websites to read" value={nf(ov.sites_left)} sub={`of ${nf(ov.sites_total)} with a website`} />
        <Stat label="Websites read" value={nf(ov.sites_scanned)} sub="Read again after 60 days" />
      </div>

      <div className="rounded-xl bg-white p-5 ring-1 ring-ink-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-base font-bold text-ink-950">Find emails</p>
            <p className="mt-1 text-[13.5px] leading-6 text-ink-600">
              One click collects business addresses that are already public: recruiter and HR addresses written in live job ads, the contact address on company profiles, and the addresses companies publish on their own website (contact, imprint, about and careers pages). New ones are added to Contacts with the tags <b>found-online</b> and <b>employer</b> and the page they came from.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {running ? (
              <button onClick={() => (stop.current = true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-bold text-white hover:bg-ink-800">
                <Square className="h-4 w-4" /> Stop
              </button>
            ) : (
              <button onClick={() => void findAll()} className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700">
                <ScanSearch className="h-4 w-4" /> Find emails
              </button>
            )}
            <label className="flex items-center gap-2 text-[12px] text-ink-600">
              Websites per click
              <select value={perClick} onChange={(e) => setPerClick(Number(e.target.value))} disabled={running !== null} className="h-8 rounded-lg border border-ink-200 bg-white px-2 text-[12px]">
                {[16, 40, 100, 250, 1000].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {progress && (
          <div className="mt-4 rounded-xl bg-ink-50 p-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
              {running && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />} {progress.step}
            </p>
            <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-600">
              {running !== 'paste' && (
                <>
                  <span><b className="text-ink-900">{nf(progress.fromAds)}</b> added from job ads</span>
                  <span><b className="text-ink-900">{nf(progress.fromProfiles)}</b> from company profiles</span>
                </>
              )}
              <span><b className="text-ink-900">{nf(progress.sites)}</b> websites read</span>
              <span><b className="text-ink-900">{nf(progress.found)}</b> addresses on them</span>
              <span><b className="text-emerald-700">{nf(progress.added)}</b> new contacts</span>
            </p>
            {!running && (progress.added + progress.fromAds + progress.fromProfiles > 0) && (
              <button onClick={onContacts} className="mt-2 text-[12.5px] font-semibold text-brand-700 hover:underline">
                See them in Contacts →
              </button>
            )}
          </div>
        )}
        {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{err}</p>}
        {log.length > 0 && (
          <ul className="mt-3 max-h-64 divide-y divide-ink-100 overflow-y-auto rounded-lg ring-1 ring-ink-100">
            {log.map((l, i) => (
              <li key={i} className="flex gap-3 px-3 py-1.5 text-[12.5px]">
                <span className="w-44 shrink-0 truncate font-semibold text-ink-800">{l.domain}</span>
                <span className={`min-w-0 truncate ${l.tone === 'ok' ? 'text-emerald-700' : l.tone === 'bad' ? 'text-amber-700' : 'text-ink-500'}`}>{l.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 ring-1 ring-ink-200">
        <p className="flex items-center gap-2 text-sm font-bold text-ink-950">
          <Globe className="h-4 w-4 text-ink-500" /> Read other websites
        </p>
        <p className="mt-1 text-[13px] text-ink-500">Paste company websites — one per line or separated by commas (e.g. a list of hospitals, agencies or employers you want to reach). Up to 200 at a time.</p>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder={'acme.de\nhttps://www.example-hospital.co.uk\nbeta-logistics.com'} className="mt-3 w-full rounded-lg border border-ink-200 p-3 font-mono text-[12.5px] outline-none focus:border-brand-500" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button onClick={() => void readPasted()} disabled={!pasted.length || running !== null} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold text-ink-800 ring-1 ring-ink-200 hover:bg-ink-50 disabled:opacity-50">
            {running === 'paste' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Read {nf(pasted.length)} {pasted.length === 1 ? 'website' : 'websites'}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-amber-50 p-4 text-[13px] leading-6 text-amber-950">
        <p className="font-bold">How these addresses are used</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>They are company and recruiter inboxes, not job seekers. A campaign only includes them when you pick one of their tags, so the job-seeker emails never reach them by accident. Use the <b>For employers: hire from abroad</b> template.</li>
          <li>Their emails say where the address was published and have a one-click unsubscribe; anyone who unsubscribed or bounced is never added back.</li>
          <li>Only addresses that are published on purpose are collected — no-reply, privacy and legal inboxes are skipped, and sites that ask robots not to read them (robots.txt) are left alone.</li>
          <li>Unsolicited business email is allowed in some countries and needs prior consent in others (e.g. Germany). Start small, send from a separate sender, and stop for any country where you’re unsure.</li>
        </ul>
      </div>

      {ov.recent.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-ink-200">
          <p className="border-b border-ink-100 px-4 py-2.5 text-[13px] font-bold text-ink-900">Recently read websites</p>
          <table className="w-full min-w-[620px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-500">
              <tr className="border-b border-ink-100">
                <th className="px-4 py-2">Website</th>
                <th className="px-2 py-2">Result</th>
                <th className="px-2 py-2 text-right">Pages</th>
                <th className="px-2 py-2 text-right">Found</th>
                <th className="px-2 py-2 text-right">New</th>
                <th className="px-4 py-2 text-right">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {ov.recent.map((r) => (
                <tr key={r.domain}>
                  <td className="px-4 py-2">
                    <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold text-ink-900 hover:underline">
                      {r.domain}
                    </a>
                    {r.name && <span className="block text-[11.5px] text-ink-500">{[r.name, r.country].filter(Boolean).join(' · ')}</span>}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SITE_STATUS[r.status]}`}>{r.status === 'done' ? 'read' : r.status}</span>
                    {r.error && r.status !== 'done' && <span className="ml-2 text-[11.5px] text-ink-500">{r.error}</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink-600">{r.pages}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink-600">{r.found}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-emerald-700">{r.added || '—'}</td>
                  <td className="px-4 py-2 text-right text-ink-500">{when(r.scanned_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Senders */

function Senders({ senders, onChange }: { senders: Sender[]; onChange: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const domains = [...new Set(senders.map((x) => x.from_email.split('@')[1]))];
  const save = async (p: Partial<Sender> & { id?: string }, key: string) => {
    setBusy(key);
    const { error } = await supabase.rpc('admin_sender_save', { p });
    setBusy(null);
    if (error) return setErr(friendly(error.message));
    setErr(null);
    onChange();
  };
  const domain = async (d: string, on: boolean) => {
    setBusy('d' + d);
    const { error } = await supabase.rpc('admin_senders_domain', { p_domain: d, p_active: on });
    setBusy(null);
    if (error) return setErr(friendly(error.message));
    onChange();
  };
  const total = senders.filter((x) => x.active).reduce((a, x) => a + x.daily_limit, 0);
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-5 text-[13.5px] leading-6 text-ink-700 ring-1 ring-ink-200">
        <p className="text-base font-bold text-ink-950">Sender addresses</p>
        <p className="mt-1">
          Each campaign can come from one of these, or rotate between all that are switched on. Each sender stops at its own daily limit; the overall cap in Sending &amp; limits applies on top. Today the switched-on senders allow <b>{nf(total)}</b> a day.
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-950">
          <b>Before switching them on:</b> verify the domain in Resend → Domains (for <code>news.madevisa.com</code>: add it, copy the DNS records into Cloudflare, press Verify). Any address on a verified domain can send — no mailbox needed. Replies go to each sender’s reply-to. All senders on one domain share that domain’s reputation, so more addresses don’t mean more inbox placement — the warm-up still matters.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {domains.map((d) => {
            const on = senders.filter((x) => x.from_email.endsWith('@' + d)).every((x) => x.active);
            return (
              <Btn key={d} onClick={() => void domain(d, !on)} busy={busy === 'd' + d} icon={on ? Pause : Play} tone={on ? 'ink' : 'green'}>
                {on ? `Switch off all @${d}` : `${d} is verified — switch all on`}
              </Btn>
            );
          })}
        </div>
      </div>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{err}</p>}
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-ink-200">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-500">
            <tr className="border-b border-ink-100">
              <th className="px-3 py-2">On</th>
              <th className="px-2 py-2">Sender</th>
              <th className="px-2 py-2">Daily limit</th>
              <th className="px-2 py-2">Today</th>
              <th className="px-2 py-2">Campaigns</th>
              <th className="px-2 py-2">Series</th>
              <th className="px-2 py-2">Autopilot</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {senders.map((x) => (
              <SenderRow key={x.id} s={x} busy={busy} onSave={save} onDelete={async () => {
                if (!window.confirm(`Delete ${x.from_email}?`)) return;
                await supabase.rpc('admin_sender_delete', { p_id: x.id });
                onChange();
              }} />
            ))}
          </tbody>
        </table>
      </div>
      {adding ? <NewSender onClose={() => setAdding(false)} onSaved={() => (setAdding(false), onChange())} /> : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-bold text-ink-800 ring-1 ring-ink-200 hover:bg-ink-50">
          <Plus className="h-4 w-4" /> Add a sender
        </button>
      )}
    </div>
  );
}

function SenderRow({ s, busy, onSave, onDelete }: { s: Sender; busy: string | null; onSave: (p: Partial<Sender> & { id?: string }, key: string) => Promise<void>; onDelete: () => void }) {
  const [limit, setLimit] = useState(String(s.daily_limit));
  const [name, setName] = useState(s.from_name);
  useEffect(() => {
    setLimit(String(s.daily_limit));
    setName(s.from_name);
  }, [s.daily_limit, s.from_name]);
  const pct = s.daily_limit ? Math.min(100, Math.round((100 * s.sent_today) / s.daily_limit)) : 0;
  const dirty = name !== s.from_name || Number(limit) !== s.daily_limit;
  return (
    <tr className={s.active ? '' : 'opacity-70'}>
      <td className="px-3 py-2">
        <input type="checkbox" checked={s.active} disabled={busy === s.id + 'a'} onChange={(e) => void onSave({ id: s.id, active: e.target.checked }, s.id + 'a')} aria-label={`Use ${s.from_email}`} />
      </td>
      <td className="px-2 py-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-full rounded-md border border-transparent px-1.5 font-semibold text-ink-900 hover:border-ink-200 focus:border-brand-500 focus:outline-none" aria-label="Display name" />
        <span className="block px-1.5 text-[12px] text-ink-500">{s.from_email}{s.note ? ` · ${s.note}` : ''}</span>
      </td>
      <td className="px-2 py-2">
        <input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} className="h-8 w-20 rounded-md border border-ink-200 px-2" aria-label="Daily limit" />
      </td>
      <td className="px-2 py-2">
        <span className="block tabular-nums text-ink-800">{nf(s.sent_today)} / {nf(s.daily_limit)}</span>
        <span className="mt-1 block h-1.5 w-20 overflow-hidden rounded-full bg-ink-100"><span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></span>
        {s.failed_7d > 0 && <span className="text-[11px] text-rose-700">{s.failed_7d} refused in 7 d</span>}
      </td>
      <td className="px-2 py-2">
        <input type="checkbox" checked={s.for_campaigns} onChange={(e) => void onSave({ id: s.id, for_campaigns: e.target.checked }, s.id + 'c')} aria-label="Use for campaigns" />
      </td>
      <td className="px-2 py-2">
        <input type="checkbox" checked={s.for_series} onChange={(e) => void onSave({ id: s.id, for_series: e.target.checked }, s.id + 's')} aria-label="Use for the Auto Apply series" />
      </td>
      <td className="px-2 py-2">
        <select
          value={s.for_audience ?? 'any'}
          onChange={async (e) => {
            await supabase.rpc('admin_sender_audience', { p_id: s.id, p_audience: e.target.value });
            await onSave({ id: s.id }, s.id + 'x');
          }}
          className="h-8 rounded-md border border-ink-200 px-1.5 text-[12px]"
          aria-label="Autopilot audience"
        >
          <option value="any">Both</option>
          <option value="seeker">Job seekers</option>
          <option value="employer">Employers</option>
        </select>
      </td>
      <td className="px-2 py-2 text-right">
        <span className="inline-flex gap-1">
          {dirty && <Btn onClick={() => void onSave({ id: s.id, from_name: name, daily_limit: Number(limit) || 0 }, s.id + 'v')} busy={busy === s.id + 'v'} icon={Check} tone="green">Save</Btn>}
          <Btn onClick={onDelete} icon={Trash2}>Delete</Btn>
        </span>
      </td>
    </tr>
  );
}

function NewSender({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reply, setReply] = useState('hello@madevisa.com');
  const [limit, setLimit] = useState('50');
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const { error } = await supabase.rpc('admin_sender_save', { p: { from_name: name, from_email: email, reply_to: reply, daily_limit: Number(limit) || 50, active: false, for_campaigns: true } });
    if (error) return setErr(friendly(error.message));
    onSaved();
  };
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
      <p className="text-sm font-bold text-ink-950">Add a sender</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name, e.g. Aysel from MadeVisa" className={input} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="aysel@news.madevisa.com" className={input} />
        <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply-to" className={input} />
        <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Daily limit" className={input} />
      </div>
      <p className="mt-2 text-[12px] text-ink-500">The domain after @ must be verified in Resend. Use a real person’s name only if that person writes and answers these emails.</p>
      <div className="mt-3 flex items-center gap-2">
        <Btn onClick={() => void save()} icon={Plus} tone="green">Add</Btn>
        <Btn onClick={onClose} icon={X}>Cancel</Btn>
        {err && <span className="text-[12.5px] text-rose-700">{err}</span>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Templates */

function Templates({ templates, senders, onSaved }: { templates: Template[]; senders: Sender[]; onSaved: () => void }) {
  const [testFrom, setTestFrom] = useState('');
  const [key, setKey] = useState(templates[0]?.key ?? '');
  const t = templates.find((x) => x.key === key);
  const [draft, setDraft] = useState<Template | null>(t ?? null);
  const [html, setHtml] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [as, setAs] = useState<'named' | 'unknown'>('named');
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setTestTo(data.user?.email ?? ''));
  }, []);
  useEffect(() => {
    setDraft(templates.find((x) => x.key === key) ?? null);
    setMsg(null);
  }, [key, templates]);
  useEffect(() => {
    setHtml(null);
    // Autopilot templates are written for a role: preview them as a product designer (or an employer).
    const auto = key.startsWith('auto_');
    const call = auto
      ? supabase.rpc('admin_autopilot_preview', { p: { key, name: as === 'unknown' ? '' : 'Anna Lee', role: key.startsWith('auto_seeker') ? 'Senior Product Designer' : '', email: key.startsWith('auto_employer') ? 'jobs@bosch.com' : 'anna.lee@example.com' } })
      : supabase.rpc('admin_template_preview', { p_key: key, p_as: as });
    void call.then(({ data }) => {
      const d = data as { html: string; subject: string } | null;
      setHtml(d?.html ?? null);
      setSubject(d?.subject ?? '');
    });
  }, [key, templates, as]);
  if (!draft) return <p className="text-sm text-ink-500">No templates.</p>;
  const set = <K extends keyof Template>(k: K, v: Template[K]) => setDraft({ ...draft, [k]: v });
  const dirty = JSON.stringify(draft) !== JSON.stringify(t);

  const save = async () => {
    setBusy('save');
    const { error } = await supabase.rpc('admin_template_save', { p: draft });
    setBusy(null);
    if (error) return setMsg({ ok: false, text: friendly(error.message) });
    setMsg({ ok: true, text: 'Saved.' });
    onSaved();
  };
  const test = async () => {
    if (dirty) await save();
    setBusy('test');
    const { error } = key.startsWith('auto_')
      ? await supabase.rpc('admin_autopilot_test', { p: { key, to: testTo, name: 'Anna Lee', role: key.startsWith('auto_seeker') ? 'Senior Product Designer' : '' } })
      : await supabase.rpc('admin_template_test', { p_key: key, p_email: testTo, p_sender: testFrom || null });
    setBusy(null);
    setMsg(error ? { ok: false, text: friendly(error.message) } : { ok: true, text: `Test sent to ${testTo}.` });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <ul className="space-y-1">
        {templates.map((x) => (
          <li key={x.key}>
            <button onClick={() => setKey(x.key)} className={`w-full rounded-lg px-3 py-2 text-left text-[13px] ${x.key === key ? 'bg-brand-50 font-semibold text-brand-800' : 'text-ink-700 hover:bg-white'}`}>
              <span className="block">{x.name}</span>
              <span className="block text-[11px] text-ink-500">{x.audience === 'series' ? 'Series (retired)' : x.audience === 'autopilot' ? 'Autopilot' : 'Campaign'}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="grid min-w-0 gap-4">
        <TemplateExtras k={key} onChanged={onSaved} />
        <div className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-ink-200">
          <L label="Subject">
            <input value={draft.subject} onChange={(e) => set('subject', e.target.value)} className={input} />
          </L>
          <L label="Preview text (shown after the subject in the inbox)">
            <input value={draft.preheader ?? ''} onChange={(e) => set('preheader', e.target.value)} className={input} />
          </L>
          <div className="grid gap-3 sm:grid-cols-2">
            <L label="Label (top right)">
              <input value={draft.eyebrow ?? ''} onChange={(e) => set('eyebrow', e.target.value)} className={input} />
            </L>
            <label className="flex items-end gap-2 pb-2 text-[13px] text-ink-700">
              <input type="checkbox" checked={draft.show_stats} onChange={(e) => set('show_stats', e.target.checked)} /> Show live job numbers
            </label>
          </div>
          <L label="Headline">
            <input value={draft.headline} onChange={(e) => set('headline', e.target.value)} className={input} />
          </L>
          <L label="Body">
            <textarea value={draft.body} onChange={(e) => set('body', e.target.value)} rows={12} className="w-full rounded-lg border border-ink-200 p-2.5 text-[13px] leading-5 outline-none focus:border-brand-500" />
          </L>
          <div>
            <p className="mb-1.5 text-[11.5px] font-semibold text-ink-600">Add a list line with an icon</p>
            <div className="flex flex-wrap gap-1.5">
              {EMAIL_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  title={`- [${ic}] …`}
                  onClick={() => set('body', `${draft.body.replace(/\s+$/, '')}\n- [${ic}] `)}
                  className="rounded-lg border border-ink-200 bg-white p-1 hover:border-brand-400"
                >
                  <img src={`/icons/t-${ic}.png`} alt={ic} width={24} height={24} className="h-6 w-6" />
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <L label="Button">
              <input value={draft.cta_label} onChange={(e) => set('cta_label', e.target.value)} className={input} />
            </L>
            <L label="Button link">
              <input value={draft.cta_url} onChange={(e) => set('cta_url', e.target.value)} className={input} />
            </L>
          </div>
          <p className="rounded-lg bg-ink-50 p-2.5 text-[11.5px] leading-5 text-ink-600">
            <b>Placeholders:</b> {'{{first_name}} {{jobs_live}} {{jobs_today}} {{jobs_visa}} {{matches}} {{cv_line}} {{country}}'}, and {'[[saved_jobs]]'} on its own line for up to 3 of the person’s saved jobs. Autopilot templates also have {'{{role}} {{role_title}} {{role_a}} {{role_jobs}} {{role_visa}} {{company}}'} and {'[[jobs]]'}. <b>When the name isn’t known</b> (or is “info”, “HR Team”, a company…), {'{{first_name}}'} is taken out of the sentence and the “Hi …,” line is left out — “{'{{first_name}}'}, 12 new jobs” becomes “12 new jobs”, “Thanks, {'{{first_name}}'}!” becomes “Thanks!”. Check both with the preview switch. <b>Body:</b> blank line = new paragraph, a line starting with “- ” = list item, **bold**. List lines: “- [target] text” shows an icon, “- 1. text” a numbered step, “- text” a check. Emojis are removed when sending — use icons instead.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Btn onClick={() => void save()} busy={busy === 'save'} icon={Check} tone="green">Save</Btn>
          </div>
          <div className="rounded-lg border border-ink-100 p-3">
            <p className="mb-2 text-[12px] font-semibold text-ink-700">Send a test of this email (it doesn’t add the address to your contacts)</p>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input value={testTo} onChange={(e) => setTestTo(e.target.value)} className={input} aria-label="Send a test to" placeholder="you@example.com" />
              <select value={testFrom} onChange={(e) => setTestFrom(e.target.value)} className={input} aria-label="Send the test from">
                <option value="">From: default sender</option>
                {senders.filter((x) => x.active).map((x) => (
                  <option key={x.id} value={x.id}>
                    From: {x.from_name}
                  </option>
                ))}
              </select>
              <Btn onClick={() => void test()} busy={busy === 'test'} icon={Send}>Send test</Btn>
            </div>
            {msg && <p className={`mt-2 text-[12.5px] ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</p>}
          </div>
        </div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-ink-200">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
            <p className="text-[12px] text-ink-500">
              Preview {dirty && <b className="text-amber-700">· save to update</b>}
            </p>
            <Seg value={as} onChange={setAs} options={[{ v: 'named', t: 'Name known' }, { v: 'unknown', t: 'Name unknown' }]} />
          </div>
          <p className="px-1 pb-2 text-[13px] font-semibold text-ink-900">{subject}</p>
          {html ? <iframe title="Email preview" srcDoc={html} sandbox="" className="h-[720px] w-full rounded-lg border border-ink-100 bg-[#f1f4f9]" /> : <Spin />}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------- MadeVisa version, A/B variant */

type LibraryItem = {
  key: string;
  version: number;
  state: 'current' | 'customized' | 'missing';
  has_backup: boolean;
  meta: { goal?: string; audience?: string; conversion?: string; exclusions?: string; ab_test?: string };
  library: { subject: string; preheader: string | null; headline: string; body: string; cta_label: string; cta_url: string };
};
type Variant = {
  key: string;
  subject: string | null;
  preheader: string | null;
  eyebrow: string | null;
  headline: string | null;
  body: string | null;
  cta_label: string | null;
  active: boolean;
  share: number;
  hypothesis: string | null;
  primary_metric: string | null;
  guardrails: string | null;
  started_at: string | null;
};

function TemplateExtras({ k, onChanged }: { k: string; onChanged: () => void }) {
  const [lib, setLib] = useState<LibraryItem[] | null>(null);
  const [vars, setVars] = useState<Variant[]>([]);
  const [draft, setDraft] = useState<Variant | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.rpc('admin_template_library'), supabase.rpc('admin_template_variants')]);
    setLib(a.error ? [] : ((a.data ?? []) as LibraryItem[]));
    setVars(b.error ? [] : ((b.data ?? []) as Variant[]));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setDraft(vars.find((v) => v.key === k) ?? null);
    setMsg(null);
  }, [k, vars]);

  const item = lib?.find((x) => x.key === k);
  const act = async (name: 'admin_template_use_library' | 'admin_template_restore', label: string) => {
    if (name === 'admin_template_use_library' && !window.confirm('Replace this template with the MadeVisa version? Your current text is kept as a backup you can restore.')) return;
    setBusy(name);
    const { error } = await supabase.rpc(name, { p_key: k });
    setBusy(null);
    setMsg(error ? friendly(error.message) : label);
    await load();
    onChanged();
  };
  const saveVariant = async (p: Partial<Variant>) => {
    setBusy('variant');
    const { error } = await supabase.rpc('admin_template_variant_save', { p: { key: k, ...p } });
    setBusy(null);
    setMsg(error ? friendly(error.message) : p.active === true ? 'Test started: variant B is now sent to its share of recipients.' : p.active === false ? 'Test stopped: everyone gets A.' : 'Variant saved.');
    await load();
  };
  if (!lib) return null;
  const v = draft ?? { key: k, subject: null, preheader: null, eyebrow: null, headline: null, body: null, cta_label: null, active: false, share: 50, hypothesis: null, primary_metric: null, guardrails: null, started_at: null };
  const setV = <K extends keyof Variant>(f: K, val: Variant[K]) => setDraft({ ...v, [f]: val });

  return (
    <div className="space-y-3">
      {item && (
        <div className="rounded-xl bg-white p-4 text-[12.5px] leading-5 text-ink-700 ring-1 ring-ink-200">
          <p className="text-[13px] font-bold text-ink-950">What this email is for</p>
          <dl className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-[110px_minmax(0,1fr)]">
            {([
              ['Goal', item.meta.goal],
              ['Audience', item.meta.audience],
              ['Counts as success', item.meta.conversion],
              ['Left out', item.meta.exclusions],
              ['A/B idea', item.meta.ab_test],
            ] as const)
              .filter(([, x]) => x)
              .map(([a, b]) => (
                <div key={a} className="contents">
                  <dt className="font-semibold text-ink-500">{a}</dt>
                  <dd>{b}</dd>
                </div>
              ))}
          </dl>
          {item.state === 'customized' && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-950 ring-1 ring-amber-200">
              <p>
                <b>A newer MadeVisa version is available.</b> This template was edited here, so it was not replaced automatically.
              </p>
              <details className="mt-1.5">
                <summary className="cursor-pointer font-semibold">Show the MadeVisa version</summary>
                <p className="mt-1.5">
                  <b>Subject:</b> {item.library.subject}
                </p>
                <p>
                  <b>Headline:</b> {item.library.headline}
                </p>
                <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 font-sans text-[12px] text-ink-800">{item.library.body}</pre>
                <p>
                  <b>Button:</b> {item.library.cta_label} → {item.library.cta_url}
                </p>
              </details>
              <div className="mt-2">
                <Btn onClick={() => void act('admin_template_use_library', 'Now using the MadeVisa version. Your text is kept as a backup.')} busy={busy === 'admin_template_use_library'} icon={Check} tone="green">
                  Use the MadeVisa version
                </Btn>
              </div>
            </div>
          )}
          {item.has_backup && (
            <div className="mt-2">
              <Btn onClick={() => void act('admin_template_restore', 'Previous version restored.')} busy={busy === 'admin_template_restore'} icon={RotateCcw}>
                Restore the previous version
              </Btn>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
        <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left">
          <span className="flex items-center gap-2 text-[13px] font-bold text-ink-950">
            <FlaskConical className="h-4 w-4 text-brand-600" /> A/B test
            {v.active ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Running · {v.share}% get B</span> : <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">Off</span>}
          </span>
          <span className="text-[12px] text-brand-700">{open ? 'Hide' : draft ? 'Edit variant B' : 'Write a variant B'}</span>
        </button>
        {open && (
          <div className="mt-3 space-y-3">
            <p className="text-[12px] leading-5 text-ink-600">
              Variant B only replaces the fields you fill in. Each person always gets the same variant. Change one thing at a time, and judge it in <b>Results</b> on clicks, sign-ups, CV uploads and purchases — never on opens alone — with unsubscribes and complaints as the guardrail.
            </p>
            {v.hypothesis && (
              <p className="rounded-lg bg-ink-50 p-2.5 text-[12px] text-ink-700">
                <b>Hypothesis:</b> {v.hypothesis} {v.primary_metric && <><b> Measure:</b> {v.primary_metric}.</>} {v.guardrails && <><b> Guardrail:</b> {v.guardrails}.</>}
              </p>
            )}
            <L label="B · Subject">
              <input value={v.subject ?? ''} onChange={(e) => setV('subject', e.target.value)} className={input} placeholder="Same as A" />
            </L>
            <L label="B · Preview text">
              <input value={v.preheader ?? ''} onChange={(e) => setV('preheader', e.target.value)} className={input} placeholder="Same as A" />
            </L>
            <L label="B · Headline">
              <input value={v.headline ?? ''} onChange={(e) => setV('headline', e.target.value)} className={input} placeholder="Same as A" />
            </L>
            <L label="B · Body">
              <textarea value={v.body ?? ''} onChange={(e) => setV('body', e.target.value)} rows={6} placeholder="Same as A" className="w-full rounded-lg border border-ink-200 p-2.5 text-[13px] leading-5 outline-none focus:border-brand-500" />
            </L>
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="B · Button">
                <input value={v.cta_label ?? ''} onChange={(e) => setV('cta_label', e.target.value)} className={input} placeholder="Same as A" />
              </L>
              <NumberSetting label="Share that gets B (%)" value={v.share} min={1} max={99} onSave={(n) => setV('share', n)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => void saveVariant({ subject: v.subject ?? '', preheader: v.preheader ?? '', headline: v.headline ?? '', body: v.body ?? '', cta_label: v.cta_label ?? '', share: v.share })} busy={busy === 'variant'} icon={Check}>
                Save variant B
              </Btn>
              <Btn onClick={() => void saveVariant({ active: !v.active })} busy={busy === 'variant'} icon={v.active ? Pause : Play} tone={v.active ? 'rose' : 'green'}>
                {v.active ? 'Stop the test' : 'Start the test'}
              </Btn>
            </div>
            {v.started_at && <p className="text-[11.5px] text-ink-500">Started {when(v.started_at)}.</p>}
          </div>
        )}
        {msg && <p className="mt-2 text-[12.5px] text-ink-700">{msg}</p>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Results */

type ReportRow = {
  template: string;
  variant: string;
  segment: 'cold' | 'lifecycle';
  sent: number;
  accepted: number;
  delivered: number;
  bounced: number;
  complained: number;
  clicked: number;
  landed: number;
  unsubscribed: number;
  listings: number;
  plan_requests: number;
  registered: number;
  cv_uploaded: number;
  cv_viewed: number;
  checkout_started: number;
  starter_purchases: number;
  pro_purchases: number;
  revenue_cents: number;
  still_active: number;
  revenue_per_delivered_cents: number | null;
  low_sample: boolean;
};

const pct = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(a / b < 0.1 ? 1 : 0)}%` : '—');
const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Results() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [data, setData] = useState<{ rows: ReportRow[]; note: string; provider_events: number } | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setData(undefined);
    void supabase.rpc('admin_email_report', { p_days: Number(days) }).then(({ data: d, error }) => {
      if (error) {
        setErr(/admin_email_report|does not exist|schema cache/i.test(error.message) ? 'Run migration 20261223090000_email_growth_system.sql first.' : error.message);
        setData(null);
      } else setData(d as { rows: ReportRow[]; note: string; provider_events: number });
    });
  }, [days]);

  if (data === undefined) return <Spin />;
  if (!data) return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</p>;
  const groups: ['cold' | 'lifecycle', string][] = [
    ['cold', 'Cold outreach (people without an account)'],
    ['lifecycle', 'Lifecycle (MadeVisa accounts)'],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-[12.5px] leading-5 text-ink-600">
          Emails sent in the period, and what the people who clicked did within 30 days. Each sign-up, CV upload and purchase is credited once, to the last email clicked before it. Purchases are Gumroad payments Gumroad confirmed. This shows what came after an email, not what the email caused.
          {data.provider_events === 0 && <> <b>Delivered, bounces and complaints stay at 0 until the Resend webhook is set up</b> (supabase/functions/resend-webhook).</>}
        </p>
        <Seg value={days} onChange={setDays} options={[{ v: '7', t: '7 days' }, { v: '30', t: '30 days' }, { v: '90', t: '90 days' }]} />
      </div>
      {groups.map(([seg, title]) => {
        const rows = data.rows.filter((r) => r.segment === seg);
        return (
          <div key={seg} className="overflow-x-auto rounded-xl bg-white ring-1 ring-ink-200">
            <p className="px-4 pt-3 text-sm font-bold text-ink-950">{title}</p>
            {rows.length === 0 ? (
              <p className="px-4 pb-4 pt-1 text-[13px] text-ink-500">No tracked emails in this period yet.</p>
            ) : (
              <table className="mt-2 w-full min-w-[980px] text-[12.5px]">
                <thead className="text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <tr className="border-b border-ink-100">
                    {['Template', 'Sent', 'Bounced', 'Complaints', 'Unsub.', 'Clicked', seg === 'cold' ? 'Sign-ups' : 'CV viewed', 'CV uploads', 'Checkouts', 'Starter', 'Pro', 'Revenue', 'Per delivered', seg === 'cold' ? 'Listings' : 'Active now'].map((h) => (
                      <th key={h} className="px-3 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const base = Math.max(r.delivered, r.accepted, 1);
                    return (
                      <tr key={r.template + r.variant} className="border-b border-ink-50 tabular-nums">
                        <td className="px-3 py-2 font-semibold text-ink-900">
                          {r.template} <span className="rounded bg-ink-100 px-1 text-[10.5px] font-semibold uppercase text-ink-600">{r.variant}</span>
                          {r.low_sample && <span className="ml-1 text-[10.5px] font-normal text-amber-700" title="Fewer than 200 sent or 20 clicks: differences are likely chance.">small sample</span>}
                        </td>
                        <td className="px-3 py-2">{nf(r.sent)}</td>
                        <td className={`px-3 py-2 ${r.bounced / base > 0.03 ? 'font-semibold text-rose-700' : ''}`}>{nf(r.bounced)} · {pct(r.bounced, r.sent)}</td>
                        <td className={`px-3 py-2 ${r.complained / base > 0.001 ? 'font-semibold text-rose-700' : ''}`}>{nf(r.complained)}</td>
                        <td className="px-3 py-2">{nf(r.unsubscribed)} · {pct(r.unsubscribed, base)}</td>
                        <td className="px-3 py-2">{nf(r.clicked)} · {pct(r.clicked, base)}</td>
                        <td className="px-3 py-2">{nf(seg === 'cold' ? r.registered : r.cv_viewed)}</td>
                        <td className="px-3 py-2">{nf(r.cv_uploaded)}</td>
                        <td className="px-3 py-2">{nf(r.checkout_started)}</td>
                        <td className="px-3 py-2">{nf(r.starter_purchases)}</td>
                        <td className="px-3 py-2">{nf(r.pro_purchases)}</td>
                        <td className="px-3 py-2">{usd(r.revenue_cents)}</td>
                        <td className="px-3 py-2">{r.revenue_per_delivered_cents == null ? '—' : usd(r.revenue_per_delivered_cents)}</td>
                        <td className="px-3 py-2">{nf(seg === 'cold' ? r.listings : r.still_active)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Limits({ ov, onChange }: { ov: Overview; onChange: () => void }) {
  const s = ov.settings;
  const save = async (p: Partial<Settings>) => {
    await supabase.rpc('admin_outreach_settings', { p });
    onChange();
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-5 ring-1 ring-ink-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base font-bold text-ink-950">Sending</p>
          <Btn onClick={() => void save({ enabled: !s.enabled })} icon={s.enabled ? Pause : Play} tone={s.enabled ? 'ink' : 'green'}>
            {s.enabled ? 'Pause all campaigns and the series' : 'Turn sending on'}
          </Btn>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <NumberSetting label="Daily cap (all emails)" value={s.daily_cap} min={0} max={1000000} onSave={(v) => save({ daily_cap: v })} hint="Resend free: 100. Pro: no daily cap, 50,000 a month." />
          <NumberSetting label="Kept for site emails" value={s.reserve} min={0} max={100000} onSave={(v) => save({ reserve: v })} hint="Sign-in codes, job alerts, applications." />
          <NumberSetting label="Emails per minute" value={s.per_minute} min={1} max={2000} onSave={(v) => save({ per_minute: v })} hint="Start slowly on a new domain: 20–50." />
        </div>
      </div>
      <div className="rounded-xl bg-white p-5 text-[13.5px] leading-6 text-ink-700 ring-1 ring-ink-200">
        <p className="text-base font-bold text-ink-950">Sending thousands: what to change</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            <b>Upgrade Resend</b> (Pro: 50,000 a month, no daily cap; Scale for more). Then set the daily cap above, e.g. 3,000.
          </li>
          <li>
            <b>Send campaigns from their own addresses.</b> In Resend add a second domain, <code>news.madevisa.com</code> (same DNS steps as before), press Verify, then switch the senders on in the <b>Senders</b> tab. Ten are ready (oqtay@, jobs@, careers@, autoapply@ …), each with its own name and daily limit. Sign-in codes and job alerts keep coming from the main address, so a bad campaign can’t hurt them.
          </li>
          <li>
            <b>Warm up.</b> On a new sending domain go 50 → 200 → 500 → 1,000+ a day over two to three weeks. Keep bounces under 2% and spam complaints under 0.1%.
          </li>
          <li>
            <b>Only people who agreed.</b> Resend (and every email service) suspends accounts that send to bought, scraped or cold lists. For cold outreach to employers use a separate domain and a cold-email tool (see EMAIL-SETUP.md).
          </li>
        </ol>
        <p className="mt-3 text-[12.5px] text-ink-500">
          Now: {ov.separate_key ? 'a separate Resend key is set for campaigns' : 'campaigns use the main Resend key'} · sender {ov.sender ?? 'not set'}.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Bits */

function NumberSetting({ label, value, min, max, onSave, hint }: { label: string; value: number; min: number; max: number; onSave: (v: number) => void | Promise<void>; hint?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const n = Number(v);
  const ok = Number.isFinite(n) && n >= min && n <= max;
  return (
    <L label={label}>
      <div className="flex gap-2">
        <input type="number" min={min} max={max} value={v} onChange={(e) => setV(e.target.value)} className={input} />
        <Btn onClick={() => ok && void onSave(Math.round(n))} icon={Check}>Save</Btn>
      </div>
      {hint && <span className="mt-1 block text-[11.5px] text-ink-500">{hint}</span>}
    </L>
  );
}

function PreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
          <p className="text-sm font-semibold">Preview</p>
          <button onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-ink-500" />
          </button>
        </div>
        <iframe title="Email preview" srcDoc={html} sandbox="" className="min-h-0 flex-1 bg-[#f1f4f9]" />
      </div>
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; t: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-ink-100 p-1">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={`rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold ${value === o.v ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-ink-700">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, sub, tone = 'ink', small = false }: { label: string; value: string; sub?: string; tone?: 'ink' | 'amber'; small?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-white p-4 ring-1 ring-ink-200">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={`mt-1 truncate font-bold tabular-nums tracking-tight ${small ? 'text-lg' : 'text-2xl'} ${tone === 'amber' ? 'text-amber-700' : 'text-ink-950'}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

function Btn({ onClick, busy = false, icon: Icon, children, tone = 'ink' }: { onClick: () => void; busy?: boolean; icon: typeof Check; children: React.ReactNode; tone?: 'ink' | 'green' | 'rose' }) {
  const cls = tone === 'green' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : tone === 'rose' ? 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50';
  return (
    <button onClick={onClick} disabled={busy} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60 ${cls}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

function Spin() {
  return (
    <div className="mt-8 flex justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
    </div>
  );
}
