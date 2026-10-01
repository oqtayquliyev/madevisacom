import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, Download, ExternalLink, Loader2, PencilLine, Play, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { VacancyImageGenerator } from '@/pages/admin/VacancyImageGenerator';

// Social publishing — tables from migration 20261103090000_social_publishing.sql,
// planned and published by the auto-pipeline function (social.ts).

type Platform = 'linkedin' | 'instagram' | 'facebook' | 'tiktok';
const PLATFORMS: Platform[] = ['linkedin', 'instagram', 'facebook', 'tiktok'];
const PLATFORM_LABEL: Record<Platform, string> = { linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };
const SECRETS: Record<Platform, string> = {
  facebook: 'FB_PAGE_ID and FB_PAGE_TOKEN (a Page access token with pages_manage_posts)',
  instagram: 'IG_USER_ID (Instagram professional account linked to your Facebook Page) and FB_PAGE_TOKEN with instagram_content_publish',
  linkedin: 'LINKEDIN_TOKEN (w_organization_social) and LINKEDIN_AUTHOR, e.g. urn:li:organization:12345',
  tiktok: 'TIKTOK_TOKEN (Content Posting API, video.publish scope); verify madevisa.com in the TikTok developer portal',
};

type PlatformRow = { platform: Platform; enabled: boolean; size: 'portrait' | 'square' | 'story'; min_gap_minutes: number; max_per_day: number; connected: boolean; last_check_at: string | null };
type Campaign = {
  id: string;
  name: string;
  kind: 'fresh' | 'student' | 'category' | 'company' | 'sponsor' | 'visa' | 'remote' | 'offer';
  platforms: Platform[];
  every_minutes: number;
  format: 'list' | 'carousel' | 'single' | 'company' | 'cards' | 'mix';
  jobs_count: number;
  min_jobs: number;
  categories: string[];
  countries: string[];
  salary_only: boolean;
  require_approval: boolean;
  enabled: boolean;
  next_at: string;
  last_run_at: string | null;
  last_result: string | null;
};
type Post = {
  id: string;
  campaign_id: string | null;
  platform: Platform;
  status: 'awaiting_approval' | 'approved' | 'publishing' | 'published' | 'manual' | 'failed' | 'rejected' | 'expired';
  format: string;
  headline: string;
  caption: string;
  images: { url: string; width: number; height: number }[];
  links: { job_id: string; title: string; company: string; url: string }[];
  validation: { ok?: boolean; issues?: string[] };
  scheduled_at: string;
  published_at: string | null;
  external_url: string | null;
  error: string | null;
  created_at: string;
};

const input = 'w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const FREQ = [
  [30, 'Every 30 min'],
  [60, 'Hourly'],
  [120, 'Every 2 hours'],
  [240, 'Every 4 hours'],
  [480, 'Every 8 hours'],
  [720, 'Twice a day'],
  [1440, 'Daily'],
] as const;

const STATUS_STYLE: Record<Post['status'], string> = {
  awaiting_approval: 'bg-amber-100 text-amber-900',
  approved: 'bg-brand-100 text-brand-800',
  publishing: 'bg-brand-100 text-brand-800',
  published: 'bg-emerald-100 text-emerald-800',
  manual: 'bg-violet-100 text-violet-800',
  failed: 'bg-rose-100 text-rose-800',
  rejected: 'bg-ink-100 text-ink-600',
  expired: 'bg-ink-100 text-ink-600',
};
const STATUS_LABEL: Record<Post['status'], string> = {
  awaiting_approval: 'Needs approval',
  approved: 'Approved — publishing next run',
  publishing: 'Publishing…',
  published: 'Published',
  manual: 'Ready to post by hand',
  failed: 'Failed',
  rejected: 'Rejected',
  expired: 'Expired',
};

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Image texts — every text on a generated image is a URL parameter of
// /api/og/social, so editing = rewriting the image URLs. Empty hides a text.
// ---------------------------------------------------------------------------

type ImageTexts = { h: string; hi: string; d: string; tag: string; cta: string; link: string; hire: string; sub: string; ht: string };
const TEXT_DEFAULTS: Omit<ImageTexts, 'h'> = { hi: 'zap', d: '', tag: 'Be an early applicant', cta: 'Apply on MadeVisa', link: '', hire: 'is hiring', sub: 'Role & how to apply in the caption', ht: '1' };
const isOg = (u: string) => u.includes('/api/og/social');

function readTexts(url: string, headline: string): ImageTexts {
  const q = new URL(url, window.location.origin).searchParams;
  const get = (k: keyof ImageTexts, d: string) => (q.has(k) ? (q.get(k) ?? '') : d);
  return {
    h: get('h', headline),
    hi: get('hi', TEXT_DEFAULTS.hi),
    d: get('d', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
    tag: get('tag', TEXT_DEFAULTS.tag),
    cta: get('cta', TEXT_DEFAULTS.cta),
    link: get('link', TEXT_DEFAULTS.link),
    hire: get('hire', TEXT_DEFAULTS.hire),
    sub: get('sub', TEXT_DEFAULTS.sub),
    ht: get('ht', TEXT_DEFAULTS.ht),
  };
}

/** Same URL with the texts applied. Single-job images keep their own headline unless `allHeadlines`. */
function withTexts(url: string, t: ImageTexts, setHeadline: boolean): string {
  const u = new URL(url, window.location.origin);
  for (const [k, v] of Object.entries(t) as [keyof ImageTexts, string][]) {
    if (k === 'h' && !setHeadline) continue;
    if (k === 'link' && !v) u.searchParams.delete('link');
    else u.searchParams.set(k, v);
  }
  return u.toString();
}

function ImageTextEditor({ post, onSave, busy }: { post: Post; onSave: (patch: Partial<Post>) => void; busy: boolean }) {
  const first = post.images.find((im) => isOg(im.url));
  const [t, setT] = useState<ImageTexts>(() => (first ? readTexts(first.url, post.headline) : { h: post.headline, ...TEXT_DEFAULTS }));
  if (!first) return null;
  const layout = new URL(first.url, window.location.origin).searchParams.get('layout') ?? 'list';
  // Carousel of single-job images: each has its own headline, so only change it when edited.
  const headlineEdited = t.h !== readTexts(first.url, post.headline).h;
  const setHeadline = layout !== 'single' || post.images.length === 1 || headlineEdited;
  const images = post.images.map((im) => (isOg(im.url) ? { ...im, url: withTexts(im.url, t, setHeadline) } : im));
  const set = (k: keyof ImageTexts) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setT((x) => ({ ...x, [k]: e.target.value }));
  const field = (k: keyof ImageTexts, label: string, hint?: string) => (
    <label className="text-xs font-medium text-ink-700">
      {label}
      <input className={`${input} mt-1`} value={t[k]} onChange={set(k)} placeholder={hint ?? 'Empty = hidden'} />
    </label>
  );
  return (
    <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50/60 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {layout === 'list' && field('h', 'Headline', 'e.g. 3 new jobs')}
        {layout === 'list' && (
          <label className="text-xs font-medium text-ink-700">
            Headline icon
            <select className={`${input} mt-1`} value={t.hi} onChange={set('hi')}>
              <option value="zap">⚡ Lightning</option>
              <option value="party">🎉 Party</option>
              <option value="none">None</option>
            </select>
          </label>
        )}
        {field('tag', 'Tag on each job')}
        {field('d', 'Date pill')}
        {field('cta', 'Button text')}
        {field('link', 'Footer link (globe icon)', 'Default: madevisa.com/jobs')}
        {layout === 'company' && field('hire', 'Under company name')}
        {layout === 'company' && field('sub', 'Small line')}
        {layout === 'list' && (
          <label className="text-xs font-medium text-ink-700">
            Role hashtags on image
            <select className={`${input} mt-1`} value={t.ht} onChange={set('ht')}>
              <option value="1">Show</option>
              <option value="0">Hide</option>
            </select>
          </label>
        )}
      </div>
      <div className={`mt-3 grid gap-2 ${images.length > 1 ? 'grid-cols-3' : 'max-w-[260px]'}`}>
        {images.map((im) => (
          <img key={im.url} src={im.url} alt="Preview" loading="lazy" width={im.width} height={im.height} className="h-auto w-full rounded-md border border-ink-200 bg-white" />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-500">The preview redraws from the texts above. Save before approving.</p>
      <button
        onClick={() => onSave({ images, headline: setHeadline ? t.h : post.headline })}
        disabled={busy}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-ink-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" /> Save image texts
      </button>
    </div>
  );
}

function PostCard({ post, campaign, onChange }: { post: Post; campaign?: Campaign; onChange: () => void }) {
  const [caption, setCaption] = useState(post.caption);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editTexts, setEditTexts] = useState(false);
  const dirty = caption !== post.caption;
  const editable = ['awaiting_approval', 'approved', 'manual', 'failed'].includes(post.status);

  const update = async (patch: Partial<Post>, label: string) => {
    setBusy(label);
    setErr(null);
    const { error } = await supabase.from('social_posts').update(patch).eq('id', post.id);
    setBusy(null);
    if (error) setErr(error.message);
    else onChange();
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

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-ink-950 px-2.5 py-0.5 font-semibold text-white">{PLATFORM_LABEL[post.platform]}</span>
        <span className={`rounded-full px-2.5 py-0.5 font-semibold ${STATUS_STYLE[post.status]}`}>{STATUS_LABEL[post.status]}</span>
        <span className="text-ink-500">
          {campaign?.name ?? 'Campaign'} · {post.format === 'cards' ? 'Cards image' : post.format === 'list' ? 'List image' : post.format === 'carousel' ? `${post.images.length} images` : post.format === 'company' ? `Company · ${post.images.length} ${post.images.length === 1 ? 'image' : 'images'}` : 'Single job'} · {when(post.published_at ?? post.created_at)}
        </span>
        {post.external_url && (
          <a href={post.external_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
            View post <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,300px)_1fr]">
        <div className={`grid gap-2 ${post.images.length > 1 ? 'grid-cols-3 lg:grid-cols-1' : ''}`}>
          {post.images.map((im) => (
            <a key={im.url} href={im.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
              <img src={im.url} alt={post.headline} loading="lazy" width={im.width} height={im.height} className="h-auto w-full" />
            </a>
          ))}
        </div>

        <div className="min-w-0">
          {editable ? (
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={12} className={`${input} font-[inherit] text-[13px] leading-5`} />
          ) : (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-ink-50 p-3 text-[13px] leading-5 text-ink-800">{post.caption}</pre>
          )}
          <p className="mt-1 text-xs text-ink-400">{caption.length.toLocaleString()} characters</p>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {post.links.map((l) => (
              <a key={l.job_id} href={l.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                {l.title} — {l.company}
              </a>
            ))}
          </div>

          {issues.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
              {issues.map((i) => (
                <li key={i} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {i}
                </li>
              ))}
            </ul>
          )}
          {editable && editTexts && <ImageTextEditor post={post} busy={busy !== null} onSave={(patch) => void update(patch, 'texts').then(() => setEditTexts(false))} />}
          {post.error && <p className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">{post.error}</p>}
          {err && <p className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">{err}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {dirty && (
              <button onClick={() => void update({ caption }, 'save')} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md bg-ink-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> Save caption
              </button>
            )}
            {(post.status === 'awaiting_approval' || post.status === 'failed') && (
              <button
                onClick={() => void update({ status: 'approved', caption, scheduled_at: new Date().toISOString(), error: null }, 'approve')}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {post.status === 'failed' ? 'Retry' : 'Approve'}
              </button>
            )}
            {['awaiting_approval', 'approved', 'failed'].includes(post.status) && (
              <button
                onClick={async () => {
                  setBusy('now');
                  setErr(null);
                  const { error } = await supabase
                    .from('social_posts')
                    .update({ status: 'approved', caption, scheduled_at: new Date().toISOString(), error: null, validation: { ...(post.validation ?? {}), publish_now: true } })
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
            {post.status === 'approved' && (
              <span className="text-xs text-ink-500">
                {new Date(post.scheduled_at).getTime() > Date.now() ? `Scheduled ${when(post.scheduled_at)}` : 'Goes out on the next run (every few minutes, after the platform’s min. gap)'}
              </span>
            )}
            {['awaiting_approval', 'approved', 'manual', 'failed'].includes(post.status) && (
              <button onClick={() => void update({ status: 'rejected' }, 'reject')} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50">
                <X className="h-3.5 w-3.5" /> Reject
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
            {editable && post.images.some((im) => isOg(im.url)) && (
              <button onClick={() => setEditTexts((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
                <PencilLine className="h-3.5 w-3.5" /> {editTexts ? 'Close image texts' : 'Edit image texts'}
              </button>
            )}
            <button onClick={() => void download()} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
              <Download className="h-3.5 w-3.5" /> Images
            </button>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(caption);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
            >
              <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Caption'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignForm({ c, onDone }: { c: Partial<Campaign>; onDone: () => void }) {
  const [v, setV] = useState<Partial<Campaign>>(c);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<Campaign>) => setV((x) => ({ ...x, ...p }));

  const save = async () => {
    if (!v.name?.trim()) return setErr('Give the campaign a name.');
    if (!v.platforms?.length) return setErr('Pick at least one platform.');
    setBusy(true);
    const row = {
      name: v.name.trim(),
      kind: v.kind ?? 'fresh',
      platforms: v.platforms,
      every_minutes: v.every_minutes ?? 60,
      format: v.format ?? 'list',
      jobs_count: v.jobs_count ?? 5,
      min_jobs: Math.min(v.min_jobs ?? 3, v.jobs_count ?? 5),
      categories: v.categories ?? [],
      countries: v.countries ?? [],
      salary_only: v.salary_only ?? false,
      require_approval: v.require_approval ?? true,
      enabled: v.enabled ?? false,
      updated_at: new Date().toISOString(),
    };
    const { error } = v.id ? await supabase.from('social_campaigns').update(row).eq('id', v.id) : await supabase.from('social_campaigns').insert(row);
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
  };

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-ink-700 sm:col-span-2">
          Name
          <input className={`${input} mt-1`} value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Accountant roles" />
        </label>
        <label className="text-xs font-medium text-ink-700">
          Jobs
          <select className={`${input} mt-1`} value={v.kind ?? 'fresh'} onChange={(e) => set({ kind: e.target.value as Campaign['kind'] })}>
            <option value="fresh">All fresh jobs</option>
            <option value="student">Students & internships</option>
            <option value="category">A role / category</option>
            <option value="sponsor">UK companies licensed to sponsor</option>
            <option value="visa">Ads that offer visa sponsorship</option>
            <option value="remote">Remote & hybrid</option>
            <option value="offer">No visa line → pitch the sponsorship offer</option>
          </select>
        </label>
        <label className="text-xs font-medium text-ink-700">
          How often
          <select className={`${input} mt-1`} value={v.every_minutes ?? 60} onChange={(e) => set({ every_minutes: Number(e.target.value) })}>
            {FREQ.map(([m, l]) => (
              <option key={m} value={m}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-700">
          Format
          <select className={`${input} mt-1`} value={v.format ?? 'list'} onChange={(e) => set({ format: e.target.value as Campaign['format'] })}>
            <option value="mix">Mix — a different design each post (recommended)</option>
            <option value="cards">Cards — one card per job, salary on the right (up to 4)</option>
            <option value="list">One image, up to 5 jobs</option>
            <option value="carousel">Up to 3 images, one caption</option>
            <option value="single">One job</option>
            <option value="company">Company only — logo, name, “is hiring” (details in caption)</option>
          </select>
        </label>
        <label className="text-xs font-medium text-ink-700">
          Jobs per post (min – max)
          <div className="mt-1 flex items-center gap-2">
            <input type="number" min={1} max={5} className={input} value={v.min_jobs ?? 3} onChange={(e) => set({ min_jobs: Number(e.target.value) })} />
            <span className="text-ink-400">–</span>
            <input type="number" min={1} max={5} className={input} value={v.jobs_count ?? 5} onChange={(e) => set({ jobs_count: Number(e.target.value) })} />
          </div>
        </label>
        <label className="text-xs font-medium text-ink-700 sm:col-span-2">
          Roles / keywords (comma-separated — matches job category or title)
          <input className={`${input} mt-1`} value={(v.categories ?? []).join(', ')} onChange={(e) => set({ categories: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="accountant, finance" />
        </label>
        <label className="text-xs font-medium text-ink-700">
          Countries (ISO codes, empty = all)
          <input className={`${input} mt-1`} value={(v.countries ?? []).join(', ')} onChange={(e) => set({ countries: e.target.value.toUpperCase().split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="DE, NL, GB" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {PLATFORMS.map((p) => (
          <label key={p} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={(v.platforms ?? []).includes(p)}
              onChange={(e) => set({ platforms: e.target.checked ? [...(v.platforms ?? []), p] : (v.platforms ?? []).filter((x) => x !== p) })}
            />
            {PLATFORM_LABEL[p]}
          </label>
        ))}
        <span className="text-ink-300">|</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={v.salary_only ?? false} onChange={(e) => set({ salary_only: e.target.checked })} /> Only jobs with salary
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={v.require_approval ?? true} onChange={(e) => set({ require_approval: e.target.checked })} /> I approve each post
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={v.enabled ?? false} onChange={(e) => set({ enabled: e.target.checked })} /> On
        </label>
      </div>
      {err && <p className="mt-2 text-xs text-rose-700">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </button>
        <button onClick={onDone} className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Tab = 'queue' | 'history' | 'campaigns' | 'platforms' | 'manual';

export function SocialSection() {
  const [tab, setTab] = useState<Tab>('queue');
  const [platforms, setPlatforms] = useState<PlatformRow[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<{ at: string; ok: boolean; summary: string }[]>([]);

  const load = useCallback(async () => {
    const [p, c, q] = await Promise.all([
      supabase.from('social_platforms').select('*'),
      supabase.from('social_campaigns').select('*').order('created_at'),
      supabase.from('social_posts').select('*').order('created_at', { ascending: false }).limit(120),
    ]);
    if (p.error) return setMissing(true);
    setPlatforms(PLATFORMS.map((k) => (p.data as PlatformRow[]).find((r) => r.platform === k)).filter(Boolean) as PlatformRow[]);
    setCampaigns((c.data ?? []) as Campaign[]);
    setPosts((q.data ?? []) as Post[]);
    const st = await supabase.rpc('auto_release_status');
    const entries = ((st.data as { log?: { at: string; kind: string; ok: boolean; summary: string }[] } | null)?.log ?? []).filter((l) => l.kind === 'social' || l.kind === 'sponsors');
    setLog(entries);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byCampaign = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const queue = posts.filter((p) => ['awaiting_approval', 'approved', 'publishing', 'manual', 'failed'].includes(p.status));
  const history = posts.filter((p) => ['published', 'rejected', 'expired', 'failed'].includes(p.status));

  const runNow = async () => {
    setRunning(true);
    setMsg(null);
    const { error } = await supabase.rpc('social_run_now');
    setRunning(false);
    setMsg(error ? error.message : 'Planning and publishing on the server — new posts appear here in a minute or two.');
    if (!error) window.setTimeout(() => void load(), 60_000);
  };

  const setPlatform = async (p: Platform, patch: Partial<PlatformRow>) => {
    await supabase.from('social_platforms').update({ ...patch, updated_at: new Date().toISOString() }).eq('platform', p);
    void load();
  };

  if (missing) {
    return (
      <div className="mt-6 space-y-6">
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Run the migration 20261103090000_social_publishing.sql to turn on automated social posts.</p>
        <VacancyImageGenerator />
      </div>
    );
  }

  const tabs: [Tab, string, number?][] = [
    ['queue', 'Queue', queue.length],
    ['history', 'History', history.length],
    ['campaigns', 'Campaigns', campaigns.filter((c) => c.enabled).length],
    ['platforms', 'Platforms'],
    ['manual', 'Manual image'],
  ];

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(([k, label, n]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === k ? 'bg-ink-950 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'}`}>
              {label}
              {n ? <span className="ml-1.5 tabular-nums opacity-70">{n}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} className="rounded-md p-2 text-ink-500 hover:bg-ink-100" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={async () => {
              const { error } = await supabase.rpc('sponsors_run_now');
              setMsg(error ? `UK sponsor list: ${error.message}` : 'UK sponsor list update started — takes 1–3 minutes. The result appears in the pipeline log below.');
            }}
            className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
            title="Download today's UK Home Office register of licensed sponsors (runs automatically every day)"
          >
            Update UK sponsor list
          </button>
          <button onClick={() => void runNow()} disabled={running} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
          </button>
        </div>
      </div>
      {msg && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{msg}</p>}

      {tab === 'queue' && (
        <div className="space-y-4">
          {!queue.length && <p className="rounded-xl border border-dashed border-ink-300 bg-white p-8 text-center text-sm text-ink-500">Nothing in the queue. Turn on a campaign and a platform, then press Run now.</p>}
          {queue.map((p) => (
            <PostCard key={p.id} post={p} campaign={p.campaign_id ? byCampaign.get(p.campaign_id) : undefined} onChange={() => void load()} />
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          {log.length > 0 && (
            <details className="rounded-xl border border-ink-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink-900">Run log</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {log.map((l, i) => (
                  <li key={i} className={l.ok ? 'text-ink-700' : 'text-rose-700'}>
                    <span className="text-ink-400">{when(l.at)}</span> — {l.summary}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!history.length && <p className="text-sm text-ink-500">No published posts yet.</p>}
          {history.map((p) => (
            <PostCard key={p.id} post={p} campaign={p.campaign_id ? byCampaign.get(p.campaign_id) : undefined} onChange={() => void load()} />
          ))}
        </div>
      )}

      {tab === 'campaigns' && (
        <div className="space-y-3">
          {campaigns.map((c) =>
            editing?.id === c.id ? (
              <CampaignForm key={c.id} c={editing} onDone={() => { setEditing(null); void load(); }} />
            ) : (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink-950">
                    {c.name}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-100 text-ink-500'}`}>{c.enabled ? 'On' : 'Off'}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {FREQ.find(([m]) => m === c.every_minutes)?.[1] ?? `Every ${c.every_minutes} min`} · {c.format === 'mix' ? 'mixed designs' : c.format === 'cards' ? `cards, up to ${Math.min(4, c.jobs_count)}` : c.format === 'list' ? `list of up to ${c.jobs_count}` : c.format === 'carousel' ? 'up to 3 images' : c.format === 'company' ? 'company images' : 'one job'} ·{' '}
                    {c.platforms.map((p) => PLATFORM_LABEL[p]).join(', ')}
                    {c.categories.length ? ` · ${c.categories.join(', ')}` : ''}
                    {c.require_approval ? ' · needs approval' : ' · automatic'}
                  </p>
                  {c.last_result && <p className="mt-1 line-clamp-2 text-xs text-ink-400">Last run {when(c.last_run_at)}: {c.last_result}</p>}
                </div>
                <button
                  onClick={async () => {
                    await supabase.from('social_campaigns').update({ enabled: !c.enabled, next_at: new Date().toISOString() }).eq('id', c.id);
                    void load();
                  }}
                  className="rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                >
                  {c.enabled ? 'Turn off' : 'Turn on'}
                </button>
                <button onClick={() => setEditing(c)} className="rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
                  Edit
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Delete “${c.name}”? Its posts stay in the history.`)) return;
                    await supabase.from('social_campaigns').delete().eq('id', c.id);
                    void load();
                  }}
                  className="rounded-md p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          )}
          {editing && !editing.id ? (
            <CampaignForm c={editing} onDone={() => { setEditing(null); void load(); }} />
          ) : (
            <button
              onClick={() => setEditing({ kind: 'category', platforms: ['linkedin', 'instagram', 'facebook'], every_minutes: 1440, format: 'list', jobs_count: 5, min_jobs: 3, require_approval: true, enabled: false })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-ink-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-white"
            >
              <Plus className="h-4 w-4" /> New campaign
            </button>
          )}
          <p className="text-xs leading-5 text-ink-500">
            Each job is posted at most once per network, and is reserved as soon as a post is planned — two campaigns never share a job. Posts on the same network are always at least its minimum gap apart.
          </p>
        </div>
      )}

      {tab === 'platforms' && platforms && (
        <div className="grid gap-4 md:grid-cols-2">
          {platforms.map((p) => (
            <div key={p.platform} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink-950">{PLATFORM_LABEL[p.platform]}</p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={p.enabled} onChange={(e) => void setPlatform(p.platform, { enabled: e.target.checked })} /> On
                </label>
              </div>
              <p className={`mt-1 text-xs font-semibold ${p.connected ? 'text-emerald-700' : 'text-amber-700'}`}>
                {p.connected ? 'Connected — posts publish automatically' : 'Not connected — posts wait as “ready to post by hand”'}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-ink-600">
                <label>
                  Image size
                  <select className={`${input} mt-1`} value={p.size} onChange={(e) => void setPlatform(p.platform, { size: e.target.value as PlatformRow['size'] })}>
                    <option value="portrait">Portrait 4:5</option>
                    <option value="square">Square 1:1</option>
                    <option value="story">Tall 9:16</option>
                  </select>
                </label>
                <label>
                  Min. gap (min)
                  <input type="number" min={5} className={`${input} mt-1`} defaultValue={p.min_gap_minutes} onBlur={(e) => void setPlatform(p.platform, { min_gap_minutes: Number(e.target.value) })} />
                </label>
                <label>
                  Max a day
                  <input type="number" min={1} className={`${input} mt-1`} defaultValue={p.max_per_day} onBlur={(e) => void setPlatform(p.platform, { max_per_day: Number(e.target.value) })} />
                </label>
              </div>
              {!p.connected && <p className="mt-3 text-[11px] leading-4 text-ink-500">To connect, add these Supabase secrets: {SECRETS[p.platform]}.</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'manual' && <VacancyImageGenerator />}
    </div>
  );
}
