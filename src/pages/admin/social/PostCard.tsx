import { type ChangeEvent, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, CheckCircle2, ChevronDown, Copy, Download, ExternalLink, Loader2, MessageCircle, PencilLine, Play, RefreshCw, Save, Shuffle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FORMATS, FORMAT_BY_KEY, PILLARS, PILLAR_ORDER, PillarTag, PlatformBadge, STATUS_LABEL, STATUS_STYLE, btn, btnPrimary, formatName, input, pillarOf, untilText, when, type Campaign, type Post } from './shared';

// One post in the queue or the history: what goes out, where, when — and
// everything that can still be changed before it does.

// ---------------------------------------------------------------------------
// Image texts. Every text on a generated image is a URL parameter, so editing
// a text = rewriting the image URL; the preview redraws from the new URL.
//   /api/og/social — job lists, cards and company images
//   /api/og/post   — everything else (api/_post.ts)
// ---------------------------------------------------------------------------

const isJobImage = (u: string) => u.includes('/api/og/social');
const isPostImage = (u: string) => u.includes('/api/og/post');

type Field = { key: string; label: string; hint?: string; wide?: boolean; max?: number };
const JOB_FIELDS: Record<string, Field[]> = {
  list: [
    { key: 'h', label: 'Headline', hint: 'e.g. 3 new jobs' },
    { key: 'tag', label: 'Tag on each job' },
    { key: 'd', label: 'Date label' },
    { key: 'cta', label: 'Button', max: 30 },
    { key: 'link', label: 'Footer link', hint: 'Default: madevisa.com/jobs', max: 40 },
  ],
  cards: [
    { key: 'h', label: 'Label, top right' },
    { key: 'cta', label: 'Button', max: 30 },
    { key: 'link', label: 'Footer link', hint: 'Default: madevisa.com/jobs', max: 40 },
  ],
  company: [
    { key: 'hire', label: 'Under the company name' },
    { key: 'sub', label: 'Small line' },
    { key: 'tag', label: 'Tag' },
    { key: 'd', label: 'Date label' },
    { key: 'cta', label: 'Button', max: 30 },
    { key: 'link', label: 'Footer link', max: 40 },
  ],
  single: [
    { key: 'tag', label: 'Tag' },
    { key: 'd', label: 'Date label' },
    { key: 'cta', label: 'Button', max: 30 },
    { key: 'link', label: 'Footer link', max: 40 },
  ],
};
const JOB_DEFAULT: Record<string, string> = { tag: 'Be an early applicant', cta: 'Apply on MadeVisa', hire: 'is hiring', sub: 'Role & how to apply in the caption', link: '' };

const BASE: Field[] = [
  { key: 'k', label: 'Label, top right', max: 40 },
  { key: 'h', label: 'Headline', wide: true, max: 220 },
  { key: 's', label: 'Line under the headline', wide: true, max: 320 },
];
const TAIL: Field[] = [
  { key: 'src', label: 'Footnote / source', wide: true, max: 140 },
  { key: 'cta', label: 'Button', max: 30 },
  { key: 'link', label: 'Footer link', max: 44 },
];
const POST_FIELDS: Record<string, Field[]> = {
  hero: [...BASE, ...TAIL],
  news: [...BASE, ...TAIL],
  rank: [...BASE, ...TAIL],
  card: [...BASE, ...TAIL],
  steps: [...BASE, ...TAIL],
  grid: [...BASE, ...TAIL],
  stat: [BASE[0], { key: 'h', label: 'Line above the number', wide: true }, { key: 'n', label: 'The number', max: 40 }, { key: 'u', label: 'Its label', max: 90 }, BASE[2], ...TAIL],
  myth: [BASE[0], { key: 'm', label: 'Myth', wide: true, max: 260 }, { key: 'f', label: 'Fact', wide: true, max: 320 }, TAIL[0], TAIL[2]],
  text: [...BASE, { key: 'hl', label: 'Words to mark (yellow)', hint: 'e.g. the plan instead' }, ...TAIL],
  cta: [...BASE, { key: 'hl', label: 'Words to mark (yellow)' }, ...TAIL],
  versus: [BASE[0], BASE[1], { key: 'n', label: 'Left name' }, { key: 'u', label: 'Right name' }, BASE[2], TAIL[0], TAIL[2]],
};
const ROWS_HELP: Record<string, string> = {
  hero: 'Up to 3 facts. One per line: value | label',
  rank: 'Rows. One per line: name | value | bar (0–100)',
  card: 'Rows. One per line: label | text (start with | for a tick-list row)',
  steps: 'Steps. One per line: title | detail | small tag',
  grid: 'Four numbers. One per line: number | label',
  versus: 'Comparison rows. One per line: label | left | right',
  news: 'Up to 3 points, one per line',
  cta: 'Up to 3 lines, one per line',
};

const rowsToText = (raw: string) => raw.split('~').map((r) => r.split('|').join(' | ')).join('\n');
const textToRows = (text: string) =>
  text
    .split('\n')
    .map((l) => l.split('|').map((c) => c.replace(/[~]/g, ' ').trim()).join('|'))
    .filter((l) => l.replace(/\|/g, '').trim())
    .join('~');

function ImageTextEditor({ post, onSave, busy }: { post: Post; onSave: (patch: Partial<Post>) => void; busy: boolean }) {
  const [slide, setSlide] = useState(0);
  const [urls, setUrls] = useState(() => post.images.map((im) => im.url));
  const [notes, setNotes] = useState<string[] | null>(null);
  const url = urls[slide];
  if (!url || (!isJobImage(url) && !isPostImage(url))) return null;
  const u = new URL(url, window.location.origin);
  const q = u.searchParams;
  const job = isJobImage(url);
  const layout = job ? q.get('layout') ?? 'list' : q.get('t') ?? 'hero';
  const fields = job ? JOB_FIELDS[layout] ?? JOB_FIELDS.list : POST_FIELDS[layout] ?? BASE;

  const setParam = (key: string, value: string, all = false) => {
    setNotes(null);
    setUrls((list) =>
      list.map((x, i) => {
        if (i !== slide && !all) return x;
        const nu = new URL(x, window.location.origin);
        // Job images: an empty value hides the text (the parameter stays, empty). Post images: empty = not drawn.
        if (!value && !job) nu.searchParams.delete(key);
        else nu.searchParams.set(key, value);
        return nu.toString();
      })
    );
  };
  const value = (f: Field) => (q.has(f.key) ? q.get(f.key) ?? '' : job ? JOB_DEFAULT[f.key] ?? (f.key === 'h' ? post.headline : '') : '');

  const check = async () => {
    try {
      const out: string[] = [];
      for (const [i, x] of urls.entries()) {
        const r = await (await fetch(`${x}&check=1`)).json();
        for (const it of (r.issues ?? []) as { level: string; message: string }[]) out.push(`${urls.length > 1 ? `Image ${i + 1}: ` : ''}${it.level === 'error' ? 'ERROR: ' : ''}${it.message}`);
      }
      setNotes(out);
      return out;
    } catch {
      setNotes(['The check couldn’t run — look at the preview before saving.']);
      return [];
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50/60 p-3">
      {urls.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-ink-600">Image</span>
          {urls.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)} className={`h-6 w-6 rounded-full text-[11px] font-semibold ${i === slide ? 'bg-ink-950 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200'}`}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid content-start gap-2 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className={`text-xs font-medium text-ink-700 ${f.wide ? 'sm:col-span-2' : ''}`}>
              {f.label}
              <input className={`${input} mt-1`} value={value(f)} maxLength={f.max} placeholder={f.hint ?? 'Empty = hidden'} onChange={(e: ChangeEvent<HTMLInputElement>) => setParam(f.key, e.target.value, job && urls.length > 1 && f.key !== 'h')} />
            </label>
          ))}
          {!job && ROWS_HELP[layout] && (
            <label className="text-xs font-medium text-ink-700 sm:col-span-2">
              {ROWS_HELP[layout]}
              <textarea className={`${input} mt-1 font-mono text-[12px] leading-5`} rows={Math.min(7, Math.max(3, (q.get('rows') ?? '').split('~').length))} value={rowsToText(q.get('rows') ?? '')} onChange={(e) => setParam('rows', textToRows(e.target.value))} />
            </label>
          )}
          {!job && (
            <label className="text-xs font-medium text-ink-700">
              Background
              <select className={`${input} mt-1`} value={q.get('th') ?? 'blue'} onChange={(e) => setParam('th', e.target.value === 'blue' ? '' : e.target.value)}>
                <option value="blue">MadeVisa blue</option>
                <option value="ink">Night blue</option>
                <option value="light">Light blue</option>
              </select>
            </label>
          )}
        </div>
        <img key={url} src={url} alt="Preview" loading="lazy" className="h-auto w-full rounded-md border border-ink-200 bg-white" />
      </div>
      {notes && (notes.length ? <ul className="mt-2 space-y-0.5 text-xs text-amber-800">{notes.map((n) => <li key={n}>• {n}</li>)}</ul> : <p className="mt-2 text-xs font-medium text-emerald-700">Everything fits.</p>)}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={async () => {
            const out = await check();
            if (out.some((n) => n.includes('ERROR'))) return;
            onSave({ images: post.images.map((im, i) => ({ ...im, url: urls[i] })), headline: new URL(urls[0], window.location.origin).searchParams.get('h') || post.headline, validation: { ...(post.validation ?? {}), issues: out } });
          }}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" /> Save image texts
        </button>
        <button onClick={() => void check()} className={btn}>
          Check the fit
        </button>
        <span className="text-[11px] text-ink-500">The preview redraws as you type. A text that doesn’t fit is shortened with “…” — the check tells you.</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PostCard({ post, campaign, now, onChange, defaultOpen = true, tz }: { post: Post; campaign?: Campaign; now: number; onChange: () => void; defaultOpen?: boolean; /** Time zone the times are shown in (the program's). */ tz?: string }) {
  const [caption, setCaption] = useState(post.caption);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editTexts, setEditTexts] = useState(false);
  const [swap, setSwap] = useState(false);
  const [move, setMove] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const dirty = caption !== post.caption;
  const program = post.origin === 'program';
  const waiting = ['awaiting_approval', 'approved', 'manual', 'failed'].includes(post.status);
  const until = untilText(post.scheduled_at, now);
  const def = post.kind ? FORMAT_BY_KEY[post.kind] : undefined;

  const update = async (patch: Partial<Post>, label: string) => {
    setBusy(label);
    setErr(null);
    const { error } = await supabase.from('social_posts').update(patch).eq('id', post.id);
    setBusy(null);
    if (error) setErr(error.message);
    else onChange();
  };
  const rewrite = async (kind?: string) => {
    setBusy('rewrite');
    setErr(null);
    const { data, error } = await supabase.rpc('social_slot_rewrite', { p_id: post.id, p_kind: kind ?? null });
    setBusy(null);
    setSwap(false);
    if (error) return setErr(error.message);
    if (typeof data === 'string' && data.startsWith('not changed')) return setErr('This post can’t be rewritten any more (already published, or its time has passed).');
    onChange();
    window.setTimeout(onChange, 40_000);
  };
  const download = async () => {
    for (const [i, im] of post.images.entries()) {
      const blob = await (await fetch(im.url)).blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `madevisa-${post.platform}-${post.id.slice(0, 6)}-${i + 1}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };
  const issues = post.validation?.issues ?? [];

  const swapPicker = swap && (
    <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50/60 p-3">
      <p className="text-xs font-semibold text-ink-800">Use this slot for a different kind of post</p>
      <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
        {PILLAR_ORDER.map((pl) => {
          const list = FORMATS.filter((f) => f.pillar === pl && f.platforms.includes(post.platform));
          if (!list.length) return null;
          return (
            <div key={pl}>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: PILLARS[pl].color }}>
                {PILLARS[pl].name}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {list.map((f) => (
                  <button key={f.key} title={f.idea} disabled={busy !== null} onClick={() => void rewrite(f.key)} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${f.key === post.kind ? 'bg-ink-950 text-white ring-ink-950' : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-100'}`}>
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // --- A slot that hasn't been written yet --------------------------------------
  if (post.status === 'planned') {
    const writeIn = post.write_at ? untilText(post.write_at, now) : null;
    return (
      <div className="rounded-xl border border-dashed border-ink-300 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="w-28 shrink-0 text-sm font-semibold tabular-nums text-ink-950">{until.text}</span>
          <PlatformBadge platform={post.platform} small />
          <PillarTag pillar={pillarOf(post)} />
          <span className="text-sm font-medium text-ink-900">{formatName(post)}</span>
          <span className="text-xs text-ink-500">
            {new Date(post.scheduled_at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz })}
            {busy === 'rewrite' || post.meta?.force ? ' · being written now…' : writeIn && !writeIn.late ? ` · written ${writeIn.text}${def?.fresh ? ' (jobs are picked fresh)' : ''}` : ' · being written…'}
          </span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            <button onClick={() => void rewrite()} disabled={busy !== null} className={btn} title="Write this post now, so you can read it">
              {busy === 'rewrite' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PencilLine className="h-3.5 w-3.5" />} Write now
            </button>
            <button onClick={() => setSwap((v) => !v)} className={btn} title="Use this slot for a different kind of post">
              <Shuffle className="h-3.5 w-3.5" /> Change
            </button>
            <button onClick={() => void update({ status: 'rejected' }, 'skip')} disabled={busy !== null} className={btn} title="Nothing goes out at this time">
              <X className="h-3.5 w-3.5" /> Skip
            </button>
          </span>
        </div>
        {def && <p className="mt-1.5 text-xs leading-5 text-ink-500">{def.idea}</p>}
        {swapPicker}
        {err && <p className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">{err}</p>}
      </div>
    );
  }

  // --- A written post ---------------------------------------------------------------
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex cursor-pointer flex-wrap items-center gap-2 text-xs" onClick={() => setOpen((v) => !v)}>
        {waiting && post.status !== 'manual' && <span className={`text-sm font-semibold tabular-nums ${until.late ? 'text-amber-700' : until.soon ? 'text-brand-700' : 'text-ink-950'}`}>{until.text}</span>}
        <PlatformBadge platform={post.platform} />
        <span className={`rounded-full px-2.5 py-0.5 font-semibold ${STATUS_STYLE[post.status]}`}>{STATUS_LABEL[post.status]}</span>
        {program ? <PillarTag pillar={pillarOf(post)} /> : null}
        <span className="text-ink-500">
          {program ? formatName(post) : `${campaign?.name ?? 'Campaign'} · ${formatName(post)}`}
          {post.images.length > 1 ? ` · ${post.images.length} images` : ''} · {post.status === 'published' ? `published ${when(post.published_at)}` : new Date(post.scheduled_at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz })}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {post.external_url && (
            <a href={post.external_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
              View post <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <ChevronDown className={`h-4 w-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </div>
      {!open && (
        <button onClick={() => setOpen(true)} className="mt-2 flex w-full items-center gap-3 text-left">
          {post.images[0] && <img src={post.images[0].url} alt="" loading="lazy" className="h-14 w-11 shrink-0 rounded border border-ink-200 object-cover" />}
          <span className="line-clamp-2 text-[13px] leading-5 text-ink-700">{post.caption.split('\n').filter(Boolean).slice(0, 2).join(' — ')}</span>
        </button>
      )}

      {open && (
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
          <div className={`grid content-start gap-2 ${post.images.length > 1 ? 'grid-cols-3 lg:grid-cols-2' : ''}`}>
            {post.images.map((im, i) => (
              <a key={im.url} href={im.url} target="_blank" rel="noreferrer" className={`block overflow-hidden rounded-lg border border-ink-200 bg-ink-50 ${post.images.length > 1 && i === 0 ? 'lg:col-span-2' : ''}`}>
                <img src={im.url} alt={post.headline} loading="lazy" width={im.width} height={im.height} className="h-auto w-full" />
              </a>
            ))}
          </div>

          <div className="min-w-0">
            {waiting ? (
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={Math.min(16, Math.max(8, caption.split('\n').length + 1))} className={`${input} font-[inherit] text-[13px] leading-5`} />
            ) : (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-ink-50 p-3 font-[inherit] text-[13px] leading-5 text-ink-800">{post.caption}</pre>
            )}
            <p className="mt-1 text-xs text-ink-400">{caption.length.toLocaleString()} characters</p>

            {post.links.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {post.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    {l.company ? `${l.title} — ${l.company}` : l.title}
                  </a>
                ))}
              </div>
            )}

            {post.meta?.reply && (
              <p className="mt-2 flex gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs leading-5 text-amber-900">
                <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  People who comment “{post.meta.reply.keyword}” are promised a reply: <span className="font-medium">{post.meta.reply.text}</span>
                  {post.platform === 'instagram' ? ' Instagram replies are sent automatically if your token allows it — otherwise answer by hand.' : ' On this network, answer by hand.'}
                </span>
              </p>
            )}
            {issues.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
                {issues.map((i) => (
                  <li key={i} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {i}
                  </li>
                ))}
              </ul>
            )}
            {waiting && editTexts && <ImageTextEditor post={post} busy={busy !== null} onSave={(patch) => void update(patch, 'texts').then(() => setEditTexts(false))} />}
            {swapPicker}
            {move && (
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-ink-200 bg-ink-50/60 p-3">
                <label className="text-xs font-medium text-ink-700">
                  New time
                  <input
                    type="datetime-local"
                    className={`${input} mt-1`}
                    defaultValue={new Date(Date.parse(post.scheduled_at) - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)}
                    onChange={(e) => {
                      const t = new Date(e.target.value);
                      if (!Number.isNaN(t.getTime()) && t.getTime() > Date.now()) void update({ scheduled_at: t.toISOString() }, 'move').then(() => setMove(false));
                    }}
                  />
                </label>
                <span className="pb-2 text-[11px] text-ink-500">Your local time. The post goes out on the first run after it.</span>
              </div>
            )}
            {post.error && <p className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">{post.error}</p>}
            {err && <p className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">{err}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {dirty && (
                <button onClick={() => void update({ caption }, 'save')} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md bg-ink-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  <Save className="h-3.5 w-3.5" /> Save caption
                </button>
              )}
              {(post.status === 'awaiting_approval' || post.status === 'failed' || (post.status === 'manual' && post.platform === 'telegram')) && (
                <button
                  // A program post keeps its planned time; a campaign post (or a retry) goes out on the next run.
                  onClick={() => void update({ status: 'approved', caption, error: null, ...(program && post.status === 'awaiting_approval' ? {} : { scheduled_at: new Date().toISOString() }), ...(post.platform === 'telegram' ? ({ attempts: 0 } as Partial<Post>) : {}) }, 'approve')}
                  disabled={busy !== null}
                  className={btnPrimary}
                >
                  {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {post.status === 'awaiting_approval' ? 'Approve' : 'Retry'}
                </button>
              )}
              {['awaiting_approval', 'approved', 'failed'].includes(post.status) && (
                <button
                  onClick={async () => {
                    setBusy('now');
                    setErr(null);
                    const { error } = await supabase
                      .from('social_posts')
                      .update({ status: 'approved', caption, scheduled_at: new Date().toISOString(), error: null, validation: { ...(post.validation ?? {}), publish_now: true }, ...(post.platform === 'telegram' ? { attempts: 0 } : {}) })
                      .eq('id', post.id);
                    if (!error) await supabase.rpc('social_run_now');
                    setBusy(null);
                    if (error) setErr(error.message);
                    else window.setTimeout(onChange, 45_000);
                    onChange();
                  }}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy === 'now' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Publish now
                </button>
              )}
              {post.status === 'manual' && (
                <button
                  onClick={() => {
                    const url = window.prompt('Link to the post (optional):') ?? '';
                    void update({ status: 'published', published_at: new Date().toISOString(), external_url: url || null, error: null }, 'posted');
                  }}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark as posted
                </button>
              )}
              {waiting && post.images.some((im) => isJobImage(im.url) || isPostImage(im.url)) && (
                <button onClick={() => setEditTexts((v) => !v)} className={btn}>
                  <PencilLine className="h-3.5 w-3.5" /> {editTexts ? 'Close image texts' : 'Edit image texts'}
                </button>
              )}
              {program && ['awaiting_approval', 'approved', 'failed'].includes(post.status) && (
                <>
                  <button onClick={() => void rewrite()} disabled={busy !== null} className={btn} title="Same kind of post, a different topic and wording">
                    {busy === 'rewrite' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Write another
                  </button>
                  <button onClick={() => setSwap((v) => !v)} className={btn} title="Use this slot for a different kind of post">
                    <Shuffle className="h-3.5 w-3.5" /> Change
                  </button>
                </>
              )}
              {['awaiting_approval', 'approved'].includes(post.status) && (
                <button onClick={() => setMove((v) => !v)} className={btn}>
                  <CalendarClock className="h-3.5 w-3.5" /> Move
                </button>
              )}
              {waiting && (
                <button onClick={() => void update({ status: 'rejected' }, 'reject')} disabled={busy !== null} className={btn}>
                  <X className="h-3.5 w-3.5" /> {program ? 'Skip' : 'Reject'}
                </button>
              )}
              <button onClick={() => void download()} className={btn}>
                <Download className="h-3.5 w-3.5" /> Images
              </button>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(caption);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
                className={btn}
              >
                <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Caption'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
