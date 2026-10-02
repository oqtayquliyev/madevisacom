import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Play, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { VacancyImageGenerator } from '@/pages/admin/VacancyImageGenerator';
import { FORMATS, PLATFORMS, PLATFORM_LABEL, QUEUE_STATUSES, card, input, isFormatOn, reelsAlive, useNow, when, type Campaign, type NewsItem, type Platform, type PlatformRow, type Post, type ProgramRow } from './social/shared';
import { ProgramPanel } from './social/ProgramPanel';
import { UpNext } from './social/UpNext';
import { StrategyPanel } from './social/StrategyPanel';
import { IdeasPanel } from './social/IdeasPanel';
import { NewsDesk } from './social/NewsDesk';
import { CampaignsPanel } from './social/CampaignsPanel';
import { PostCard } from './social/PostCard';

// Admin → Social media.
//
//   Program (top)   one switch: Start plans every network for the next days.
//   Up next         everything about to go out, with the time left.
//   Strategy        the mix of themes, posts a day, timing, the rules.
//   Content ideas   every kind of post the program can make; try one.
//   News desk       "X announced Y" — items you add, posted with their source.
//   Published       what went out, and the run log.
//   Campaigns       job feeds set up by hand (pause while the program runs).
//   Platforms       networks: on/off, image size, limits, connection.
//   Manual image    draw a vacancy image yourself.
//
// Tables: migrations 20261103090000_social_publishing.sql … and
// 20261123090000_social_program.sql. Planned and published by the
// auto-pipeline function (social.ts, program.ts).

const SECRETS: Record<Platform, string> = {
  facebook: 'FB_PAGE_ID and FB_PAGE_TOKEN (a Page access token with pages_manage_posts)',
  instagram: 'IG_USER_ID (Instagram professional account linked to your Facebook Page) and FB_PAGE_TOKEN with instagram_content_publish — or IG_ACCESS_TOKEN alone (Instagram login). Add instagram_manage_comments to answer “+” comments automatically',
  linkedin: 'LINKEDIN_TOKEN (w_organization_social) and LINKEDIN_AUTHOR, e.g. urn:li:organization:12345',
  tiktok: 'TIKTOK_TOKEN (Content Posting API, video.publish scope); verify madevisa.com in the TikTok developer portal',
  telegram: 'TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID (your channel, e.g. @madevisacom). Add the bot as an admin of every channel it posts to',
};

type Tab = 'next' | 'strategy' | 'ideas' | 'news' | 'published' | 'campaigns' | 'platforms' | 'manual';

export function SocialSection() {
  const [tab, setTab] = useState<Tab>('next');
  const [platforms, setPlatforms] = useState<PlatformRow[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [programMissing, setProgramMissing] = useState(false);
  const [newsReady, setNewsReady] = useState(0);
  const [missing, setMissing] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<{ at: string; ok: boolean; summary: string }[]>([]);
  const now = useNow();

  const load = useCallback(async () => {
    const [p, c, queue, done, prog, news] = await Promise.all([
      supabase.from('social_platforms').select('*'),
      supabase.from('social_campaigns').select('*').order('created_at'),
      // The queue (soonest first) and the history (newest first) are loaded separately, so a long plan never hides either.
      supabase.from('social_posts').select('*').in('status', QUEUE_STATUSES).order('scheduled_at').limit(300),
      supabase.from('social_posts').select('*').in('status', ['published', 'rejected', 'expired']).order('updated_at', { ascending: false }).limit(60),
      supabase.from('social_program').select('*').eq('id', true).maybeSingle(),
      supabase.from('social_news').select('id, status, expires_at').eq('status', 'ready'),
    ]);
    if (p.error) return setMissing(true);
    setPlatforms(PLATFORMS.map((k) => (p.data as PlatformRow[]).find((r) => r.platform === k)).filter(Boolean) as PlatformRow[]);
    setCampaigns((c.data ?? []) as Campaign[]);
    setPosts([...((queue.data ?? []) as Post[]), ...((done.data ?? []) as Post[])]);
    setProgramMissing(Boolean(prog.error) || !prog.data);
    setProgram((prog.data as ProgramRow | null) ?? null);
    setNewsReady(((news.data ?? []) as Pick<NewsItem, 'id'>[]).length);
    const st = await supabase.rpc('auto_release_status');
    const entries = ((st.data as { log?: { at: string; kind: string; ok: boolean; summary: string }[] } | null)?.log ?? []).filter((l) => l.kind === 'social' || l.kind === 'sponsors');
    setLog(entries);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  // While something is being written, rendered or published, look again every 45 seconds.
  const pending = posts.some((p) => p.status === 'publishing' || p.status === 'rendering' || (p.status === 'planned' && (p.meta?.force || (p.write_at && Date.parse(p.write_at) < now))));
  useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(() => void load(), 45_000);
    return () => window.clearInterval(t);
  }, [pending, load]);

  const byCampaign = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const queue = posts.filter((p) => QUEUE_STATUSES.includes(p.status));
  const published = posts.filter((p) => ['published', 'rejected', 'expired'].includes(p.status));

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
    ['next', 'Up next', queue.length],
    ['strategy', 'Strategy'],
    ['ideas', 'Content ideas', program ? FORMATS.filter((f) => isFormatOn(f, { formats: program.formats ?? {}, reels: reelsAlive(program) })).length : FORMATS.length],
    ['news', 'News desk', newsReady],
    ['published', 'Published', published.filter((p) => p.status === 'published').length],
    ['campaigns', 'Campaigns', campaigns.filter((c) => c.enabled).length],
    ['platforms', 'Platforms'],
    ['manual', 'Manual image'],
  ];
  const needsProgram = (
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
      Run the migration <span className="font-mono text-[13px]">20261123090000_social_program.sql</span> in the Supabase SQL Editor, then deploy the function (<span className="font-mono text-[13px]">supabase functions deploy auto-pipeline --no-verify-jwt</span>) to turn on the content program. Campaigns keep working as before.
    </p>
  );

  return (
    <div className="mt-6 space-y-5">
      {programMissing ? needsProgram : program && platforms && <ProgramPanel key={String(program.running)} program={program} platforms={platforms} posts={queue} now={now} onChange={() => void load()} onOpenStrategy={() => setTab('strategy')} />}

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
          {!program?.running && (
            <button onClick={() => void runNow()} disabled={running} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50" title="Plan due campaigns and publish what is ready">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
            </button>
          )}
        </div>
      </div>
      {msg && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{msg}</p>}

      {tab === 'next' && <UpNext posts={queue} campaigns={campaigns} program={program} now={now} onChange={() => void load()} />}

      {tab === 'strategy' && (programMissing || !program || !platforms ? needsProgram : <StrategyPanel key={`${program.running}:${JSON.stringify(program.per_day)}:${JSON.stringify(program.mix)}`} program={program} platforms={platforms} onChange={() => void load()} />)}

      {tab === 'ideas' &&
        (programMissing || !program || !platforms ? (
          needsProgram
        ) : (
          <IdeasPanel
            program={program}
            platforms={platforms}
            onChange={() => void load()}
            onTried={() => {
              void load();
              window.setTimeout(() => void load(), 40_000);
            }}
          />
        ))}

      {tab === 'news' && (programMissing || !program ? needsProgram : <NewsDesk program={program} posts={posts} onChange={() => void load()} />)}

      {tab === 'published' && (
        <div className="space-y-4">
          {log.length > 0 && (
            <details className={`${card} p-4`}>
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
          {!published.length && <p className="text-sm text-ink-500">No published posts yet.</p>}
          {published.map((p) => (
            <PostCard key={p.id} post={p} now={now} campaign={p.campaign_id ? byCampaign.get(p.campaign_id) : undefined} onChange={() => void load()} defaultOpen={false} tz={program?.timezone} />
          ))}
          {published.length > 0 && <p className="text-xs text-ink-500">The last 40 finished posts are kept; older ones are removed (what was posted is still remembered, so nothing repeats).</p>}
        </div>
      )}

      {tab === 'campaigns' && platforms && <CampaignsPanel campaigns={campaigns} platforms={platforms} program={program} onChange={() => void load()} />}

      {tab === 'platforms' && platforms && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={async () => {
                const { error } = await supabase.rpc('sponsors_run_now');
                setMsg(error ? `UK sponsor list: ${error.message}` : 'UK sponsor list update started — takes 1–3 minutes. The result appears in the run log under Published.');
              }}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
              title="Download today's UK Home Office register of licensed sponsors (runs automatically every day)"
            >
              Update UK sponsor list
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {platforms.map((p) => (
              <div key={p.platform} className={`${card} p-4`}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-ink-950">{PLATFORM_LABEL[p.platform]}</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={p.enabled} onChange={(e) => void setPlatform(p.platform, { enabled: e.target.checked })} /> On
                  </label>
                </div>
                <p className={`mt-1 text-xs font-semibold ${p.connected ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {p.connected ? 'Connected — posts publish automatically' : 'Not connected — posts wait as “post by hand”'}
                  {p.last_check_at ? <span className="font-normal text-ink-400"> · checked {when(p.last_check_at)}</span> : null}
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
                {!p.connected && <p className="mt-3 text-[11px] leading-4 text-ink-500">To connect, add these Supabase secrets (Edge Functions → Secrets): {SECRETS[p.platform]}. The status here updates on the next run after the function is deployed.</p>}
              </div>
            ))}
          </div>
          <p className="text-xs leading-5 text-ink-500">Posts a day for the program are set under Strategy. “Min. gap” and “Max a day” are safety limits that apply to everything — the program and campaigns.</p>
        </div>
      )}

      {tab === 'manual' && <VacancyImageGenerator />}
    </div>
  );
}
