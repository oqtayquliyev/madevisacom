import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Eye, FileUp, Loader2, Mail, Pause, Play, Plus, RefreshCw, Rocket, Search, Send, Settings2, Sparkles, Tag, Trash2, Upload, Users, X, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Admin → Outreach: emails to many people at once.
//
//   Campaigns   pick a template + an audience → see how many → send yourself a test → Start.
//               Sent a few per minute, never above the daily cap (Sending & limits).
//   Contacts    import addresses (paste or CSV; email alone is enough), tag them, unsubscribe,
//               delete. Unsubscribed and bounced addresses are never emailed by a campaign.
//   Templates   the six emails (3 CV Match / Auto Apply promos, 3 Auto Apply series) — edit,
//               preview, test.
//   Series      the Auto Apply emails free accounts get automatically, 12 days apart.
//   Limits      daily cap, reserve for site emails, speed, sender.
// Server side: migration 20261216090000_outreach_campaigns.sql.

type Audience = { source: 'contacts' | 'accounts' | 'both'; accounts?: 'all' | 'no_cv' | 'cv' | 'free' | 'pro'; tags?: string[]; country?: string; skip_days?: number; limit?: number };
type Settings = { enabled: boolean; daily_cap: number; reserve: number; per_minute: number; nurture_enabled: boolean; nurture_gap_days: number; nurture_per_day: number };
type Campaign = {
  id: string;
  name: string;
  template_key: string;
  template_name: string | null;
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
type Overview = {
  settings: Settings;
  budget_today: number;
  sent_today: number;
  sender: string | null;
  separate_key: boolean;
  series: { in_series: number; finished: number; sent_7d: number };
  campaigns: Campaign[];
};
type Template = { key: string; name: string; audience: 'anyone' | 'accounts' | 'series'; subject: string; preheader: string | null; eyebrow: string | null; headline: string; body: string; cta_label: string; cta_url: string; show_stats: boolean; updated_at: string };
type Contact = { id: string; email: string; name: string | null; country: string | null; tags: string[]; source: string; status: 'subscribed' | 'unsubscribed' | 'bounced' | 'complained'; account: boolean; sent_count: number; last_sent_at: string | null; created_at: string };
type ContactList = { counts: { all: number; subscribed: number; unsubscribed: number; bounced: number; accounts: number }; tags: { tag: string; n: number }[]; total: number; rows: Contact[] };

type Sub = 'campaigns' | 'contacts' | 'templates' | 'series' | 'limits';
const SUBS: { key: Sub; label: string; icon: typeof Mail }[] = [
  { key: 'campaigns', label: 'Campaigns', icon: Rocket },
  { key: 'contacts', label: 'Contacts', icon: Users },
  { key: 'templates', label: 'Templates', icon: Mail },
  { key: 'series', label: 'Auto Apply series', icon: Zap },
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

export function OutreachSection() {
  const [sub, setSub] = useState<Sub>('campaigns');
  const [ov, setOv] = useState<Overview | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.rpc('admin_campaigns'), supabase.rpc('admin_templates')]);
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

      {sub === 'campaigns' && <Campaigns ov={ov} templates={templates} onChange={load} />}
      {sub === 'contacts' && <Contacts />}
      {sub === 'templates' && <Templates templates={templates} onSaved={load} />}
      {sub === 'series' && <Series ov={ov} templates={templates} onChange={load} onEdit={() => setSub('templates')} />}
      {sub === 'limits' && <Limits ov={ov} onChange={load} />}
    </div>
  );
}

/* --------------------------------------------------------------- Campaigns */

function Campaigns({ ov, templates, onChange }: { ov: Overview; templates: Template[]; onChange: () => void }) {
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
        <NewCampaign templates={templates} ov={ov} onClose={() => setCreating(false)} onDone={() => (setCreating(false), onChange())} />
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
                        {c.template_name ?? c.template_key} · {audienceLabel(c.audience)} · {c.started_at ? `started ${when(c.started_at)}` : `created ${when(c.created_at)}`}
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
  const acc = a.source !== 'contacts' && a.accounts && a.accounts !== 'all' ? ` (${{ no_cv: 'no CV', cv: 'with CV', free: 'free', pro: 'Pro', all: '' }[a.accounts]})` : '';
  return [who + acc, a.tags?.length ? `tags: ${a.tags.join(', ')}` : '', a.country ? a.country : '', a.skip_days ? `skip emailed in ${a.skip_days} d` : '', a.limit ? `max ${nf(a.limit)}` : ''].filter(Boolean).join(' · ');
}

function NewCampaign({ templates, ov, onClose, onDone }: { templates: Template[]; ov: Overview; onClose: () => void; onDone: () => void }) {
  const promos = templates.filter((t) => t.audience !== 'series');
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

  const perDay = Math.max(1, ov.settings.daily_cap - ov.settings.reserve);
  const days = count ? Math.ceil(count.total / perDay) : 0;

  const save = async (start: boolean) => {
    setBusy(start ? 'start' : 'save');
    setMsg(null);
    const { data, error } = await supabase.rpc('admin_campaign_save', { p_id: null, p_name: name || `${templates.find((t) => t.key === tpl)?.name ?? 'Campaign'} · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, p_template: tpl, p_audience: clean(aud) });
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
    const { error } = await supabase.rpc('admin_template_test', { p_key: tpl, p_email: testTo });
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
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-ink-700">Send to</p>
            <Seg value={aud.source} onChange={(v) => setAud({ ...aud, source: v })} options={[{ v: 'contacts', t: 'Imported contacts' }, { v: 'accounts', t: 'MadeVisa accounts' }, { v: 'both', t: 'Both' }]} />
          </div>
          {aud.source !== 'contacts' && (
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-ink-700">Which accounts</p>
              <Seg value={aud.accounts ?? 'all'} onChange={(v) => setAud({ ...aud, accounts: v })} options={[{ v: 'all', t: 'All' }, { v: 'no_cv', t: 'No CV yet' }, { v: 'cv', t: 'Have a CV' }, { v: 'free', t: 'Free' }, { v: 'pro', t: 'Pro' }]} />
            </div>
          )}
          {aud.source !== 'accounts' && tags.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-ink-700">Only contacts with these tags (any)</p>
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
                At your daily cap ({nf(perDay)} a day for campaigns) this takes about <b>{days} {days === 1 ? 'day' : 'days'}</b>.
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

/** Paste or CSV → [{email, name, country}]. Finds the email column from a header, or the first address on each line. */
function parseContacts(text: string): { email: string; name?: string; country?: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = [',', ';', '\t'].find((d) => lines[0].includes(d)) ?? ',';
  const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = head.some((h) => /e-?mail/.test(h)) && !head.some((h) => /@/.test(h));
  const ei = hasHeader ? head.findIndex((h) => /e-?mail/.test(h)) : -1;
  const ni = hasHeader ? head.findIndex((h) => /^(full ?)?name|first ?name/.test(h)) : -1;
  const ci = hasHeader ? head.findIndex((h) => /country/.test(h)) : -1;
  const out: { email: string; name?: string; country?: string }[] = [];
  for (const l of hasHeader ? lines.slice(1) : lines) {
    const cells = split(l);
    if (ei >= 0) {
      const email = cells[ei];
      if (email) out.push({ email, name: ni >= 0 ? cells[ni] : undefined, country: ci >= 0 ? cells[ci] : undefined });
      continue;
    }
    for (const m of l.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) out.push({ email: m });
  }
  return out;
}

function Contacts() {
  const [data, setData] = useState<ContactList | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const PAGE = 50;

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_contacts_list', { p_search: q || null, p_status: status || null, p_tag: tag || null, p_limit: PAGE, p_offset: page * PAGE });
    if (error) {
      setErr(friendly(error.message));
      setData(null);
    } else {
      setErr(null);
      setData(data as ContactList);
    }
  }, [q, status, tag, page]);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

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
        <Stat label="Contacts" value={nf(data.counts.all)} sub={`${nf(data.counts.accounts)} have an account`} />
        <Stat label="Subscribed" value={nf(data.counts.subscribed)} />
        <Stat label="Unsubscribed" value={nf(data.counts.unsubscribed)} />
        <Stat label="Bounced" value={nf(data.counts.bounced)} tone={data.counts.bounced ? 'amber' : 'ink'} />
      </div>

      {importing ? (
        <Import onClose={() => setImporting(false)} onDone={() => (setImporting(false), void load())} />
      ) : (
        <button onClick={() => setImporting(true)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-700">
          <Upload className="h-4 w-4" /> Import contacts
        </button>
      )}

      <div className="rounded-xl bg-white ring-1 ring-ink-200">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-3">
          <label className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Email, name or country" className={`${input} pl-8`} />
          </label>
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
            <Btn onClick={() => void bulk('delete')} icon={Trash2} tone="rose">Delete</Btn>
          </div>
        )}
        {data.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-500">No contacts{q || status || tag ? ' match' : ' yet — import a list to start'}.</p>
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
                      <span className="block text-[11.5px] text-ink-500">{[r.name, r.country, r.source, r.account ? 'has account' : ''].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex flex-wrap gap-1">
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
      const { data, error } = await supabase.rpc('admin_contacts_import', { p_rows: rows.slice(i, i + 5000), p_tags: t, p_source: source || 'import', p_consent: source || null });
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
      <p className="mt-1 text-[13px] text-ink-500">Paste addresses (one per line, or any text with addresses in it), or a CSV with an <code>email</code> column — <code>name</code> and <code>country</code> are used when present.</p>
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
          <b>{nf(rows.length)}</b> addresses found
        </span>
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
        <span>These people gave me their address and agreed to hear from MadeVisa (sign-up form, event, a past conversation). It is not a bought or scraped list. Sending to bought or scraped lists gets the sending account suspended and hurts delivery for every MadeVisa email.</span>
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

/* --------------------------------------------------------------- Templates */

function Templates({ templates, onSaved }: { templates: Template[]; onSaved: () => void }) {
  const [key, setKey] = useState(templates[0]?.key ?? '');
  const t = templates.find((x) => x.key === key);
  const [draft, setDraft] = useState<Template | null>(t ?? null);
  const [html, setHtml] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setTestTo(data.user?.email ?? ''));
  }, []);
  useEffect(() => {
    setDraft(templates.find((x) => x.key === key) ?? null);
    setMsg(null);
    void supabase.rpc('admin_template_preview', { p_key: key }).then(({ data }) => {
      const d = data as { html: string; subject: string } | null;
      setHtml(d?.html ?? null);
      setSubject(d?.subject ?? '');
    });
  }, [key, templates]);
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
    const { error } = await supabase.rpc('admin_template_test', { p_key: key, p_email: testTo });
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
              <span className="block text-[11px] text-ink-500">{x.audience === 'series' ? 'Auto Apply series' : 'Campaign'}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="grid min-w-0 gap-4">
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
          <div className="grid gap-3 sm:grid-cols-2">
            <L label="Button">
              <input value={draft.cta_label} onChange={(e) => set('cta_label', e.target.value)} className={input} />
            </L>
            <L label="Button link">
              <input value={draft.cta_url} onChange={(e) => set('cta_url', e.target.value)} className={input} />
            </L>
          </div>
          <p className="rounded-lg bg-ink-50 p-2.5 text-[11.5px] leading-5 text-ink-600">
            <b>Placeholders:</b> {'{{first_name}} {{jobs_live}} {{jobs_today}} {{jobs_visa}} {{matches}} {{cv_line}} {{country}}'}. <b>Body:</b> blank line = new paragraph, a line starting with “- ” = list item, **bold**. Emojis welcome ✨
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Btn onClick={() => void save()} busy={busy === 'save'} icon={Check} tone="green">Save</Btn>
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} className={`${input} w-52`} aria-label="Send a test to" />
            <Btn onClick={() => void test()} busy={busy === 'test'} icon={Send}>Send test</Btn>
            {msg && <span className={`text-[12.5px] ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</span>}
          </div>
        </div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-ink-200">
          <p className="px-1 text-[12px] text-ink-500">
            Preview for you {dirty && <b className="text-amber-700">· save to update</b>}
          </p>
          <p className="px-1 pb-2 text-[13px] font-semibold text-ink-900">{subject}</p>
          {html ? <iframe title="Email preview" srcDoc={html} sandbox="" className="h-[720px] w-full rounded-lg border border-ink-100 bg-[#f1f4f9]" /> : <Spin />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Series */

function Series({ ov, templates, onChange, onEdit }: { ov: Overview; templates: Template[]; onChange: () => void; onEdit: () => void }) {
  const s = ov.settings;
  const [busy, setBusy] = useState(false);
  const save = async (p: Partial<Settings>) => {
    setBusy(true);
    await supabase.rpc('admin_outreach_settings', { p });
    setBusy(false);
    onChange();
  };
  const series = templates.filter((t) => t.audience === 'series');
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-5 ring-1 ring-ink-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 text-base font-bold text-ink-950">
              <Sparkles className="h-4 w-4 text-brand-600" /> Auto Apply email series
            </p>
            <p className="mt-1 text-[13px] leading-5 text-ink-600">
              Free accounts (email confirmed, at least 2 days old) get three emails about Auto Apply, {s.nurture_gap_days} days apart, every day at 13:20 Baku time. It stops for anyone who goes Pro, turns on Auto Apply, unsubscribes or turns off “News and tips”, and never lands within 3 days of a campaign email.
            </p>
          </div>
          <Btn onClick={() => void save({ nurture_enabled: !s.nurture_enabled })} busy={busy} icon={s.nurture_enabled ? Pause : Play} tone={s.nurture_enabled ? 'ink' : 'green'}>
            {s.nurture_enabled ? 'Pause the series' : 'Turn the series on'}
          </Btn>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Status" value={s.nurture_enabled ? 'On' : 'Paused'} tone={s.nurture_enabled ? 'ink' : 'amber'} />
          <Stat label="In the series now" value={nf(ov.series.in_series)} />
          <Stat label="Got all 3" value={nf(ov.series.finished)} />
          <Stat label="Sent in 7 days" value={nf(ov.series.sent_7d)} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <NumberSetting label="Days between emails" value={s.nurture_gap_days} min={3} max={60} onSave={(v) => save({ nurture_gap_days: v })} />
          <NumberSetting label="At most a day" value={s.nurture_per_day} min={0} max={100000} onSave={(v) => save({ nurture_per_day: v })} />
        </div>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {series.map((t, i) => (
          <li key={t.key} className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Email {i + 1} · day {i * s.nurture_gap_days}</p>
            <p className="mt-1 text-[14px] font-semibold text-ink-950">{t.subject}</p>
            <p className="mt-1 line-clamp-3 text-[12.5px] text-ink-600">{t.headline}</p>
            <button onClick={onEdit} className="mt-2 text-[12.5px] font-semibold text-brand-700 hover:underline">
              Edit in Templates
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ Limits */

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
            <b>Send campaigns from their own address.</b> In Resend add a second domain, e.g. <code>news.madevisa.com</code> (same DNS steps as before). In Supabase → SQL:
            <pre className="mt-1 overflow-x-auto rounded-lg bg-ink-50 p-2 text-[12px]">{`insert into public.app_secrets (name, value) values
  ('email_from_outreach', 'Oqtay from MadeVisa <oqtay@news.madevisa.com>')
on conflict (name) do update set value = excluded.value;`}</pre>
            Campaigns and the series then come from that address; sign-in codes and alerts keep coming from the main one, so a bad campaign can’t hurt them. Optional: <code>resend_api_key_outreach</code> for a separate Resend key.
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
