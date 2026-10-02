// Types and small pieces shared by the Social media admin panels.
// The format catalogue and the scheduling rules are the pipeline's own files
// (supabase/functions/auto-pipeline/program*.ts) — imported here, so the
// panel always shows exactly what the server will do.

import { useEffect, useState } from 'react';
import { FORMAT_BY_KEY, PILLARS, type Pillar, type Platform } from '../../../../supabase/functions/auto-pipeline/programCatalog.ts';

export * from '../../../../supabase/functions/auto-pipeline/programCatalog.ts';
export { addDays, atLocal, localTime, planRange, type Slot } from '../../../../supabase/functions/auto-pipeline/programSchedule.ts';

export const PLATFORMS: Platform[] = ['instagram', 'facebook', 'linkedin', 'tiktok', 'telegram'];
export const PLATFORM_LABEL: Record<Platform, string> = { linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', telegram: 'Telegram' };
export const PLATFORM_COLOR: Record<Platform, string> = { instagram: '#C13584', facebook: '#1877F2', linkedin: '#0A66C2', tiktok: '#111827', telegram: '#229ED9' };

export type PlatformRow = { platform: Platform; enabled: boolean; size: 'portrait' | 'square' | 'story'; min_gap_minutes: number; max_per_day: number; connected: boolean; last_check_at: string | null };

export type Campaign = {
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
  telegram_chat?: string | null;
  salary_only: boolean;
  require_approval: boolean;
  enabled: boolean;
  next_at: string;
  last_run_at: string | null;
  last_result: string | null;
};

export type PostStatus = 'planned' | 'awaiting_approval' | 'approved' | 'publishing' | 'published' | 'manual' | 'failed' | 'rejected' | 'expired';
export type Post = {
  id: string;
  campaign_id: string | null;
  platform: Platform;
  status: PostStatus;
  format: string;
  headline: string;
  caption: string;
  images: { url: string; width: number; height: number }[];
  links: { job_id?: string; title: string; company?: string; url: string }[];
  validation: { ok?: boolean; issues?: string[]; publish_now?: boolean };
  scheduled_at: string;
  published_at: string | null;
  external_url: string | null;
  error: string | null;
  created_at: string;
  // Program posts (migration 20261120090000):
  origin?: 'campaign' | 'program';
  kind?: string | null;
  pillar?: Pillar | null;
  topic_key?: string | null;
  write_at?: string | null;
  meta?: { part?: string; reply?: { keyword: string; text: string; url: string }; planned_kind?: string; force?: boolean } | null;
};

export type ProgramRow = {
  running: boolean;
  timezone: string;
  autopilot: boolean;
  per_day: Partial<Record<Platform, number>>;
  formats: Record<string, boolean>;
  mix: Partial<Record<Pillar, number>>;
  handles: Partial<Record<Platform, string>>;
  focus: string[];
  started_at: string | null;
  stopped_at: string | null;
  planned_at: string | null;
  last_run_at: string | null;
  last_result: string | null;
  replies_ok: boolean | null;
  replies_note: string | null;
};

export type NewsItem = {
  id: string;
  headline: string;
  summary: string | null;
  points: string[];
  country_code: string | null;
  kicker: string | null;
  source_name: string | null;
  source_url: string;
  link_path: string | null;
  status: 'ready' | 'archived';
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
};

const field = 'rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';
export const input = `w-full ${field}`;
/** A small number box (no full width). */
export const num = `w-16 shrink-0 text-center tabular-nums ${field}`;
/** A field that sizes itself. */
export const inputAuto = field;
export const btn = 'inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50';
export const btnPrimary = 'inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50';
export const card = 'rounded-xl border border-ink-200 bg-white';

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export const STATUS_STYLE: Record<PostStatus, string> = {
  planned: 'bg-ink-100 text-ink-700',
  awaiting_approval: 'bg-amber-100 text-amber-900',
  approved: 'bg-brand-100 text-brand-800',
  publishing: 'bg-brand-100 text-brand-800',
  published: 'bg-emerald-100 text-emerald-800',
  manual: 'bg-violet-100 text-violet-800',
  failed: 'bg-rose-100 text-rose-800',
  rejected: 'bg-ink-100 text-ink-600',
  expired: 'bg-ink-100 text-ink-600',
};
export const STATUS_LABEL: Record<PostStatus, string> = {
  planned: 'Planned',
  awaiting_approval: 'Needs approval',
  approved: 'Ready',
  publishing: 'Publishing…',
  published: 'Published',
  manual: 'Post by hand',
  failed: 'Failed',
  rejected: 'Skipped',
  expired: 'Expired',
};

/** A clock that ticks every 20 seconds — enough for "in 14 min" to stay honest. */
export function useNow(everyMs = 20_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(t);
  }, [everyMs]);
  return now;
}

/** "in 2 h 14 min", "in 3 days", "now", "12 min late". */
export function untilText(iso: string, now: number): { text: string; late: boolean; soon: boolean } {
  const diff = Date.parse(iso) - now;
  const min = Math.round(Math.abs(diff) / 60_000);
  const span = min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${Math.round(min / 1440)} days`;
  if (Math.abs(diff) < 60_000) return { text: 'now', late: false, soon: true };
  return diff > 0 ? { text: `in ${span}`, late: false, soon: diff < 60 * 60_000 } : { text: `${span} late`, late: true, soon: false };
}

export const formatName = (p: Pick<Post, 'kind' | 'format' | 'origin'>) => (p.kind && FORMAT_BY_KEY[p.kind] ? FORMAT_BY_KEY[p.kind].name : p.format === 'cards' ? 'Job cards' : p.format === 'list' ? 'Job list' : p.format === 'company' ? 'Company image' : p.format === 'carousel' ? 'Carousel' : 'Job post');
export const pillarOf = (p: Pick<Post, 'kind' | 'pillar'>): Pillar | null => (p.kind && FORMAT_BY_KEY[p.kind] ? FORMAT_BY_KEY[p.kind].pillar : p.pillar ?? null);

export function PlatformBadge({ platform, small }: { platform: Platform; small?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink-950 font-semibold text-white ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[platform] === '#111827' ? '#FFFFFF' : PLATFORM_COLOR[platform] }} />
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

export function PillarTag({ pillar }: { pillar: Pillar | null }) {
  if (!pillar) return <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">Campaign</span>;
  const p = PILLARS[pillar];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${p.color}18`, color: p.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
      {p.name}
    </span>
  );
}

/** Time zones offered in the picker, with the browser's own first. */
export function timeZones(): string[] {
  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const common = ['Europe/London', 'Europe/Berlin', 'Europe/Istanbul', 'Asia/Baku', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Manila', 'Africa/Lagos', 'Africa/Cairo', 'Africa/Nairobi', 'America/New_York', 'America/Sao_Paulo', 'UTC'];
  return [...new Set([mine, ...common].filter(Boolean))];
}
