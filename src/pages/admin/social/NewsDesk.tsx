import { useCallback, useEffect, useState } from 'react';
import { Archive, ExternalLink, Loader2, Newspaper, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { visaGuides } from '@/data/visa';
import { CircleFlag } from '@/components/common/CircleFlag';
import { PLATFORM_LABEL, btn, btnPrimary, card, input, when, type NewsItem, type Post, type ProgramRow } from './shared';

// The News desk: "X announced Y". The program never invents news — it posts
// what is added here, always with the source. An item goes out once on each
// network (it takes the next post being written there), then leaves the desk
// when it expires.

const KICKERS = ['News', 'New program', 'Rule change', 'Deadline', 'Applications open', 'Announcement'];

type Draft = { headline: string; summary: string; p1: string; p2: string; p3: string; country_code: string; kicker: string; source_name: string; source_url: string; link_path: string; days: number };
const EMPTY: Draft = { headline: '', summary: '', p1: '', p2: '', p3: '', country_code: '', kicker: 'News', source_name: '', source_url: '', link_path: '', days: 10 };

export function NewsDesk({ program, posts, onChange }: { program: ProgramRow; posts: Post[]; onChange: () => void }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const load = useCallback(async () => {
    const { data } = await supabase.from('social_news').select('*').order('created_at', { ascending: false }).limit(60);
    setItems((data ?? []) as NewsItem[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const guide = visaGuides.find((g) => g.code === d.country_code.toUpperCase());

  const add = async () => {
    setErr(null);
    setMsg(null);
    if (d.headline.trim().length < 8) return setErr('Write the headline (at least a few words).');
    if (!/^https:\/\/\S+\.\S+/.test(d.source_url.trim())) return setErr('Add the link to the official source (https://…). News is only posted with its source.');
    if (d.country_code && !/^[A-Za-z]{2}$/.test(d.country_code.trim())) return setErr('The country is a 2-letter code, e.g. PT.');
    const path = d.link_path.trim() || (guide ? `/destinations/${guide.slug}` : '');
    if (path && !path.startsWith('/')) return setErr('The MadeVisa page starts with “/”, e.g. /destinations/portugal.');
    setBusy('add');
    let host = '';
    try {
      host = new URL(d.source_url.trim()).hostname.replace(/^www\./, '');
    } catch {
      /* checked above */
    }
    const { error } = await supabase.from('social_news').insert({
      headline: d.headline.trim(),
      summary: d.summary.trim() || null,
      points: [d.p1, d.p2, d.p3].map((x) => x.trim()).filter(Boolean),
      country_code: d.country_code.trim().toUpperCase() || null,
      kicker: d.kicker || 'News',
      source_name: d.source_name.trim() || host,
      source_url: d.source_url.trim(),
      link_path: path || null,
      expires_at: new Date(Date.now() + Math.max(1, d.days) * 86_400_000).toISOString(),
    });
    setBusy(null);
    if (error) return setErr(error.message);
    setD(EMPTY);
    setMsg('Added. It goes out with the next post written on each network — or press “Send on the next slot” to move it up.');
    void load();
  };

  /** Turn the next slot on every network into this news post. */
  const sendNext = async (item: NewsItem) => {
    setBusy(item.id);
    setMsg(null);
    setErr(null);
    const soon = Date.now() + 10 * 60_000;
    const already = new Set(posts.filter((p) => p.topic_key === `news:${item.id}`).map((p) => p.platform));
    const byNetwork = new Map<string, Post>();
    for (const p of [...posts].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))) {
      if (p.origin !== 'program' || !['planned', 'awaiting_approval', 'approved'].includes(p.status) || Date.parse(p.scheduled_at) < soon) continue;
      if (already.has(p.platform) || byNetwork.has(p.platform) || p.kind === 'news') continue;
      byNetwork.set(p.platform, p);
    }
    let n = 0;
    for (const p of byNetwork.values()) {
      const { data, error } = await supabase.rpc('social_slot_rewrite', { p_id: p.id, p_kind: 'news', p_want: item.id });
      if (!error && data === 'writing') n++;
    }
    setBusy(null);
    setMsg(n ? `Moved up on ${n} ${n === 1 ? 'network' : 'networks'}: ${[...byNetwork.keys()].map((k) => PLATFORM_LABEL[k as keyof typeof PLATFORM_LABEL]).join(', ')}. The posts are being written.` : 'No free slot found — is the program running? It will still go out with the next post written.');
    onChange();
    window.setTimeout(onChange, 45_000);
  };

  const ready = (items ?? []).filter((i) => i.status === 'ready');
  const past = (items ?? []).filter((i) => i.status !== 'ready');
  const where = (i: NewsItem) => posts.filter((p) => p.topic_key === `news:${i.id}` && !['rejected', 'expired'].includes(p.status)).map((p) => `${PLATFORM_LABEL[p.platform]}${p.status === 'published' ? ' ✓' : ''}`);

  return (
    <div className="space-y-5">
      <div className={`${card} p-5`}>
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink-950">
          <Newspaper className="h-4 w-4 text-brand-600" /> Add a news item
        </h3>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-600">
          A country announced a program, changed a rule, opened applications, set a deadline. Write it as you read it at the source — the post shows the source, and nothing is added to what you write here.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-6">
          <label className="text-xs font-medium text-ink-700 sm:col-span-4">
            Headline
            <input className={`${input} mt-1`} value={d.headline} maxLength={160} onChange={(e) => set({ headline: e.target.value })} placeholder="Portugal opens applications for its skilled job-seeker visa" />
          </label>
          <label className="text-xs font-medium text-ink-700">
            Country (ISO)
            <input className={`${input} mt-1`} value={d.country_code} maxLength={2} onChange={(e) => set({ country_code: e.target.value.toUpperCase() })} placeholder="PT" />
          </label>
          <label className="text-xs font-medium text-ink-700">
            Label
            <select className={`${input} mt-1`} value={d.kicker} onChange={(e) => set({ kicker: e.target.value })}>
              {KICKERS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-700 sm:col-span-6">
            In one or two sentences
            <textarea className={`${input} mt-1`} rows={2} maxLength={320} value={d.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="What changed, for whom, from when." />
          </label>
          {(['p1', 'p2', 'p3'] as const).map((k, i) => (
            <label key={k} className="text-xs font-medium text-ink-700 sm:col-span-2">
              Key fact {i + 1} (optional)
              <input className={`${input} mt-1`} value={d[k]} maxLength={110} onChange={(e) => set({ [k]: e.target.value } as Partial<Draft>)} placeholder={['120 days to look for work', 'No job offer needed', 'Applications open 1 November'][i]} />
            </label>
          ))}
          <label className="text-xs font-medium text-ink-700 sm:col-span-3">
            Official source (link) — required
            <input className={`${input} mt-1`} value={d.source_url} onChange={(e) => set({ source_url: e.target.value })} placeholder="https://…" />
          </label>
          <label className="text-xs font-medium text-ink-700 sm:col-span-1">
            Source name
            <input className={`${input} mt-1`} value={d.source_name} maxLength={50} onChange={(e) => set({ source_name: e.target.value })} placeholder="gov.pt" />
          </label>
          <label className="text-xs font-medium text-ink-700 sm:col-span-1">
            Page on MadeVisa
            <input className={`${input} mt-1`} value={d.link_path} onChange={(e) => set({ link_path: e.target.value })} placeholder={guide ? `/destinations/${guide.slug}` : '/destinations/…'} />
          </label>
          <label className="text-xs font-medium text-ink-700 sm:col-span-1">
            Keep for (days)
            <input type="number" min={1} max={60} className={`${input} mt-1`} value={d.days} onChange={(e) => set({ days: Number(e.target.value) || 10 })} />
          </label>
        </div>
        {err && <p className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">{err}</p>}
        {msg && <p className="mt-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800">{msg}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={() => void add()} disabled={busy !== null} className={btnPrimary}>
            {busy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Add to the desk
          </button>
          <span className="text-[11px] text-ink-500">{program.running ? 'It is posted once on each network in the program.' : 'It will be posted once the program is running.'}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">On the desk</h3>
        {items === null ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : !ready.length ? (
          <p className="rounded-xl border border-dashed border-ink-300 bg-white p-6 text-center text-sm text-ink-500">Nothing on the desk. New blog articles and newly listed programs are posted by themselves — this is for news you bring.</p>
        ) : (
          ready.map((i) => {
            const on = where(i);
            return (
              <div key={i.id} className={`${card} flex flex-wrap items-start gap-3 p-4`}>
                {i.country_code && <CircleFlag countryCode={i.country_code} size={28} />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-950">{i.headline}</p>
                  {i.summary && <p className="mt-0.5 text-xs leading-5 text-ink-600">{i.summary}</p>}
                  {i.points.length > 0 && <p className="mt-0.5 text-xs text-ink-500">{i.points.join(' · ')}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
                    <a href={i.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                      {i.source_name || 'Source'} <ExternalLink className="h-3 w-3" />
                    </a>
                    <span>Added {when(i.created_at)}</span>
                    {i.expires_at && <span>on the desk until {new Date(i.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}
                    <span className={on.length ? 'font-semibold text-emerald-700' : ''}>{on.length ? `Queued or posted: ${on.join(', ')}` : 'Not posted yet'}</span>
                  </p>
                </div>
                <button onClick={() => void sendNext(i)} disabled={busy !== null || !program.running} className={btn} title="Use the next slot on every network for this item">
                  {busy === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send on the next slot
                </button>
                <button
                  onClick={async () => {
                    await supabase.from('social_news').update({ status: 'archived' }).eq('id', i.id);
                    void load();
                  }}
                  className={btn}
                  title="Take it off the desk (posts already queued stay)"
                >
                  <Archive className="h-3.5 w-3.5" /> Archive
                </button>
              </div>
            );
          })
        )}
      </div>

      {past.length > 0 && (
        <details className={`${card} p-4`}>
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">Archive ({past.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-ink-600">
            {past.map((i) => (
              <li key={i.id}>
                <span className="text-ink-400">{when(i.created_at)}</span> — {i.headline}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
