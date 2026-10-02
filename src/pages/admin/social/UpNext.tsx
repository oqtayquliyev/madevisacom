import { useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PLATFORM_LABEL, QUEUE_STATUSES, btnPrimary, localTime, reelsAlive, untilText, type Campaign, type Platform, type Post, type ProgramRow } from './shared';
import { PostCard } from './PostCard';

// Everything that is about to go out, soonest first, with the time left —
// planned slots (not written yet) and written posts, on every network.

const DAY = 86_400_000;

export function UpNext({ posts, campaigns, program, now, onChange }: { posts: Post[]; campaigns: Campaign[]; program: ProgramRow | null; now: number; onChange: () => void }) {
  const [only, setOnly] = useState<Platform | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const byCampaign = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const tz = program?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const queue = posts.filter((p) => QUEUE_STATUSES.includes(p.status));
  const networks = [...new Set(queue.map((p) => p.platform))];
  const shown = queue.filter((p) => only === 'all' || p.platform === only).sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));

  const needApproval = queue.filter((p) => p.status === 'awaiting_approval');
  const byHand = queue.filter((p) => p.status === 'manual');
  const failed = queue.filter((p) => p.status === 'failed');
  const next24 = queue.filter((p) => ['planned', 'rendering', 'awaiting_approval', 'approved'].includes(p.status) && Date.parse(p.scheduled_at) - now < DAY && Date.parse(p.scheduled_at) > now - 3_600_000);

  // Needs-attention posts first (by hand, failed), then the timeline by day.
  const attention = shown.filter((p) => p.status === 'manual' || p.status === 'failed').sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at));
  const timeline = shown.filter((p) => p.status !== 'manual' && p.status !== 'failed');
  const today = localTime(now, tz).key;
  const tomorrow = localTime(now + DAY, tz).key;
  const groups = new Map<string, Post[]>();
  for (const p of timeline) {
    const key = localTime(Date.parse(p.scheduled_at), tz).key;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const dayLabel = (key: string) => (key < today ? 'Overdue' : key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }));

  const approveAll = async () => {
    setBusy(true);
    // Program posts keep their planned time; campaign posts go out on the next run.
    const program = needApproval.filter((p) => p.origin === 'program').map((p) => p.id);
    const other = needApproval.filter((p) => p.origin !== 'program').map((p) => p.id);
    if (program.length) await supabase.from('social_posts').update({ status: 'approved', error: null }).in('id', program);
    if (other.length) await supabase.from('social_posts').update({ status: 'approved', error: null, scheduled_at: new Date().toISOString() }).in('id', other);
    setBusy(false);
    onChange();
  };

  if (!queue.length) {
    return (
      <p className="rounded-xl border border-dashed border-ink-300 bg-white p-8 text-center text-sm text-ink-500">
        {program?.running ? 'The first posts are being planned — they appear here in about a minute. Press the refresh arrow if they don’t.' : 'Nothing is planned. Start the program above, or switch on a campaign and press Run now.'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setOnly('all')} className={`rounded-full px-3 py-1 text-xs font-semibold ${only === 'all' ? 'bg-ink-950 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'}`}>
          All networks <span className="ml-1 tabular-nums opacity-70">{queue.length}</span>
        </button>
        {networks.map((p) => (
          <button key={p} onClick={() => setOnly(p)} className={`rounded-full px-3 py-1 text-xs font-semibold ${only === p ? 'bg-ink-950 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'}`}>
            {PLATFORM_LABEL[p]} <span className="ml-1 tabular-nums opacity-70">{queue.filter((x) => x.platform === p).length}</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-500">
          Next 24 hours: <span className="font-semibold text-ink-800">{next24.length} posts</span>
          {next24[0] ? ` · the first ${untilText(next24.sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0].scheduled_at, now).text}` : ''}
        </span>
      </div>

      {(needApproval.length > 0 || byHand.length > 0 || failed.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {needApproval.length > 0 && (
            <span className="inline-flex items-center gap-2">
              <span className="font-semibold">{needApproval.length}</span> waiting for your approval
              <button onClick={() => void approveAll()} disabled={busy} className={btnPrimary}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve all
              </button>
            </span>
          )}
          {byHand.length > 0 && (
            <span>
              <span className="font-semibold">{byHand.length}</span> to post by hand (network not connected)
            </span>
          )}
          {failed.length > 0 && (
            <span>
              <span className="font-semibold">{failed.length}</span> failed — open it to see why
            </span>
          )}
        </div>
      )}

      {attention.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Needs you</h3>
          {attention.slice(0, showAll ? 100 : 3).map((p) => (
            <PostCard key={p.id} post={p} now={now} campaign={p.campaign_id ? byCampaign.get(p.campaign_id) : undefined} onChange={onChange} defaultOpen={attention.length === 1} tz={tz} rendererAlive={reelsAlive(program)} />
          ))}
          {attention.length > 3 && (
            <button onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-brand-700 hover:underline">
              {showAll ? 'Show fewer' : `Show ${attention.length - 3} more`}
            </button>
          )}
          <p className="text-[11px] leading-4 text-ink-500">A post waiting to be posted by hand is dropped after 36 hours. To stop them piling up, connect the network (Platforms) or set its posts a day to 0 (Strategy).</p>
        </section>
      )}

      {[...groups.entries()].map(([key, list]) => (
        <section key={key} className="space-y-2">
          <h3 className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            {dayLabel(key)}
            <span className="font-medium normal-case tracking-normal text-ink-400">
              {list.length} {list.length === 1 ? 'post' : 'posts'}
            </span>
          </h3>
          {list.map((p) => (
            <PostCard key={`${p.id}:${p.status}:${p.caption.length}`} post={p} now={now} campaign={p.campaign_id ? byCampaign.get(p.campaign_id) : undefined} onChange={onChange} defaultOpen={p.status === 'awaiting_approval' && needApproval.length <= 3} tz={tz} rendererAlive={reelsAlive(program)} />
          ))}
        </section>
      ))}
      <p className="text-xs leading-5 text-ink-500">
        Dashed rows are planned and not written yet: job posts are written about 2 hours before they go out (so the jobs are fresh), everything else about 20 hours before (so you have time to read it). “Write now” shows you the post straight away. Times are in {tz.replace(/_/g, ' ')}; posts go out on the first run after their time (runs are every 5 minutes).
      </p>
    </div>
  );
}
