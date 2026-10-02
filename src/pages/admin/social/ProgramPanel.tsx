import { useMemo, useState } from 'react';
import { Loader2, Pause, Play, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_SETTINGS, FORMATS, FORMAT_BY_KEY, PILLARS, PILLAR_ORDER, PLATFORM_LABEL, PlatformBadge, RHYTHM, addDays, atLocal, btn, card, formatName, input, isFormatOn, localTime, mixFor, num, perDayFor, planRange, timeZones, untilText, when, type PlatformRow, type Post, type ProgramRow, type ProgramSettings } from './shared';

// The top of the Social media tab: the program's switch and its state.
//  - Stopped: what the program does, a preview of the first week, and Start.
//  - Running: one line of status, the next post, Run now and Stop.

export const settingsOf = (p: ProgramRow | null): ProgramSettings => ({
  ...DEFAULT_SETTINGS,
  timezone: p?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  autopilot: p?.autopilot ?? true,
  per_day: p?.per_day ?? {},
  formats: p?.formats ?? {},
  mix: p?.mix ?? {},
  handles: p?.handles ?? {},
  focus: p?.focus ?? [],
});

/** A week planned in the browser with the server's own rules — what Start would produce. */
export function WeekPreview({ settings, platforms, days = 7 }: { settings: ProgramSettings; platforms: PlatformRow[]; days?: number }) {
  const active = platforms.filter((p) => p.enabled && perDayFor(p.platform, settings, false) > 0).map((p) => p.platform);
  // Planned from tomorrow morning, so every day in the preview is a full day.
  const slots = useMemo(() => {
    if (!active.length) return [];
    const tz = settings.timezone || 'UTC';
    const start = atLocal(addDays(localTime(Date.now(), tz).key, 1), 0, tz); // tomorrow 00:00 on the audience's clock
    // News, articles and programs appear only when there is one to post.
    return planRange({ platforms: active, settings, now: start, days, unavailable: new Set(['news', 'article', 'program']), notBefore: start });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(settings), active.join(','), days]);

  if (!active.length) return <p className="rounded-lg border border-dashed border-ink-300 p-4 text-sm text-ink-500">Switch on at least one network under Platforms to see a week.</p>;

  const byDay = new Map<string, typeof slots>();
  for (const s of slots) {
    const key = localTime(s.at, settings.timezone).key;
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  const hm = (ms: number) => {
    const m = localTime(ms, settings.timezone).minutes;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="grid min-w-[980px] grid-cols-7 gap-2">
        {[...byDay.entries()].map(([key, list]) => (
          <div key={key} className="rounded-lg border border-ink-200 bg-white p-2">
            <p className="px-1 pb-1.5 text-xs font-semibold text-ink-900">{new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</p>
            <div className="space-y-1">
              {list.map((s) => (
                <div key={`${s.platform}${s.at}`} title={FORMAT_BY_KEY[s.kind].idea} className="rounded-md border-l-[3px] bg-ink-50 px-1.5 py-1" style={{ borderLeftColor: PILLARS[s.pillar].color }}>
                  <p className="flex items-center justify-between text-[10px] font-semibold text-ink-500">
                    <span className="tabular-nums">{hm(s.at)}</span>
                    <span>{PLATFORM_LABEL[s.platform]}</span>
                  </p>
                  <p className="text-[11px] font-medium leading-4 text-ink-900">{FORMAT_BY_KEY[s.kind].name}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PillarLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-ink-600">
      {PILLAR_ORDER.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PILLARS[k].color }} /> {PILLARS[k].name}
        </span>
      ))}
    </div>
  );
}

export function ProgramPanel({ program, platforms, posts, now, onChange, onOpenStrategy }: { program: ProgramRow; platforms: PlatformRow[]; posts: Post[]; now: number; onChange: () => void; onOpenStrategy: () => void }) {
  // A network that isn't connected would only pile up "post by hand" jobs: it starts at 0 until you choose otherwise.
  const [draft, setDraft] = useState<ProgramSettings>(() => {
    const s = settingsOf(program);
    const per_day = { ...s.per_day };
    for (const p of platforms) if (p.enabled && !p.connected && per_day[p.platform] === undefined) per_day[p.platform] = 0;
    return { ...s, per_day };
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const settings = program.running ? settingsOf(program) : draft;
  const enabled = platforms.filter((p) => p.enabled);
  const active = enabled.filter((p) => perDayFor(p.platform, settings, false) > 0);
  const perDay = active.reduce((n, p) => n + perDayFor(p.platform, settings, false), 0);
  const formatsOn = FORMATS.filter((f) => isFormatOn(f, settings)).length;

  const call = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null; data?: unknown }>, done: string) => {
    setBusy(label);
    setMsg(null);
    const { error } = await fn();
    setBusy(null);
    setMsg(error ? error.message : done);
    onChange();
    if (!error) window.setTimeout(onChange, 50_000);
  };

  if (program.running) {
    const next = posts
      .filter((p) => ['planned', 'approved', 'awaiting_approval'].includes(p.status) && Date.parse(p.scheduled_at) > now - 10 * 60_000)
      .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
    const waiting = posts.filter((p) => p.status === 'awaiting_approval').length;
    return (
      <div className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-5 py-4 text-white">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              The program is running · {perDay} posts a day on {active.length} {active.length === 1 ? 'network' : 'networks'} · {settings.autopilot ? 'autopilot' : 'you approve each post'}
            </p>
            <p className="mt-0.5 text-xs text-brand-100">
              {next ? (
                <>
                  Next: <span className="font-semibold text-white">{formatName(next)}</span> on {PLATFORM_LABEL[next.platform]} {untilText(next.scheduled_at, now).text}
                  {waiting ? ` · ${waiting} waiting for your approval` : ''}
                </>
              ) : (
                'Planning the first posts — they appear below in about a minute.'
              )}
            </p>
          </div>
          <button onClick={() => void call('run', () => supabase.rpc('social_run_now'), 'Planning and publishing on the server — give it a minute.')} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/25 disabled:opacity-60">
            {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
          </button>
          <button
            onClick={() => {
              if (!window.confirm('Stop the program?\n\nPlanned slots are removed and posts that haven’t gone out yet are withdrawn. Published posts stay. Your campaigns start again.')) return;
              void call('stop', () => supabase.rpc('social_program_stop'), 'Stopped. Nothing more goes out from the program.');
            }}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
          >
            {busy === 'stop' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} Stop
          </button>
        </div>
        {(msg || program.last_result || program.replies_note) && (
          <div className="space-y-1 px-5 py-2.5 text-xs text-ink-600">
            {msg && <p className="font-medium text-emerald-700">{msg}</p>}
            {program.last_result && (
              <p>
                <span className="text-ink-400">Last run {when(program.last_run_at)}:</span> {program.last_result}
              </p>
            )}
            {program.replies_note && <p className={program.replies_ok === false ? 'text-amber-800' : ''}>{program.replies_note}</p>}
          </div>
        )}
      </div>
    );
  }

  // --- Stopped: explain, preview, start -------------------------------------------
  const mix = mixFor(draft);
  const sum = PILLAR_ORDER.reduce((n, k) => n + mix[k], 0) || 1;
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="bg-gradient-to-br from-brand-800 via-brand-600 to-brand-500 px-6 py-6 text-white">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-white/25">
          <Sparkles className="h-3 w-3" /> Content program
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight">One click. Every network. A different post every time.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-brand-50">
          Press Start and MadeVisa plans the next days on every network that is switched on: {formatsOn} kinds of post across seven themes, at different times each day, never the same kind twice in a row. Every post is written from live site data and links back to the page that has the full answer.
        </p>
        <div className="mt-5 flex max-w-3xl flex-wrap gap-1.5">
          {PILLAR_ORDER.map((k) => (
            <span key={k} title={PILLARS[k].why} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-900">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PILLARS[k].color }} /> {PILLARS[k].name} <span className="tabular-nums text-ink-500">{Math.round((100 * mix[k]) / sum)}%</span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Who decides what goes out</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {[
              { on: true, icon: Rocket, title: 'Autopilot', text: 'Posts go out at their time. You see each one in the queue beforehand and can edit, swap or skip it.' },
              { on: false, icon: ShieldCheck, title: 'I approve each post', text: 'Nothing goes out until you press Approve. A post still waiting 8 hours after its time is dropped, not sent late.' },
            ].map((o) => (
              <button key={o.title} onClick={() => setDraft((d) => ({ ...d, autopilot: o.on }))} className={`rounded-lg border p-3 text-left transition ${draft.autopilot === o.on ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-ink-200 hover:bg-ink-50'}`}>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-950">
                  <o.icon className="h-4 w-4 text-brand-600" /> {o.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-600">{o.text}</p>
              </button>
            ))}
          </div>
          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Your audience’s clock
            <select className={`${input} mt-2 normal-case tracking-normal`} value={draft.timezone} onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}>
              {timeZones().map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-[11px] leading-4 text-ink-500">Posting times (morning, lunch, evening…) follow this time zone. Pick where most of your followers live.</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Posts a day</p>
          <div className="mt-2 space-y-1.5">
            {platforms.map((p) => {
              const n = perDayFor(p.platform, draft, false);
              return (
                <div key={p.platform} className={`flex items-center gap-3 rounded-lg border border-ink-200 px-3 py-2 ${p.enabled ? '' : 'opacity-50'}`}>
                  <PlatformBadge platform={p.platform} small />
                  <span className={`min-w-0 flex-1 text-xs leading-4 ${p.enabled && !p.connected ? 'text-amber-700' : 'text-ink-500'}`}>{!p.enabled ? 'Off — switch it on under Platforms' : p.connected ? RHYTHM[p.platform].note : 'Not connected: every post would wait for you to post it by hand'}</span>
                  <input type="number" min={0} max={RHYTHM[p.platform].max} disabled={!p.enabled} value={n} onChange={(e) => setDraft((d) => ({ ...d, per_day: { ...d.per_day, [p.platform]: Math.max(0, Math.min(RHYTHM[p.platform].max, Number(e.target.value) || 0)) } }))} className={num} />
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-ink-500">0 leaves a network out of the program (its campaigns keep running). Weekends get fewer posts.</p>
        </div>
      </div>

      <div className="border-t border-ink-100 px-5 py-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-950">What the first week would look like</p>
          <PillarLegend />
        </div>
        <WeekPreview settings={draft} platforms={platforms} />
        <p className="mt-2 text-[11px] leading-4 text-ink-500">Hover a post to see what it is. News, blog and program posts are added when there is one to post. The mix, the formats and the @handles are under Strategy and Content ideas.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 bg-ink-50/60 px-5 py-4">
        <button
          onClick={() => void call('start', () => supabase.rpc('social_program_start', { p_settings: { timezone: draft.timezone, autopilot: draft.autopilot, per_day: draft.per_day } }), 'Started. The first posts are being planned — they appear below in about a minute.')}
          disabled={busy !== null || !active.length}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-glow hover:bg-brand-700 disabled:opacity-50"
        >
          {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start the program
        </button>
        <button onClick={onOpenStrategy} className={btn}>
          Adjust the strategy first
        </button>
        <span className="text-xs text-ink-500">
          {active.length ? `${perDay} posts a day on ${active.map((p) => PLATFORM_LABEL[p.platform]).join(', ')}. While it runs, campaigns pause on these networks.` : 'Switch on a network under Platforms first.'}
        </span>
        {msg && <span className="w-full text-xs font-medium text-emerald-700">{msg}</span>}
      </div>
    </div>
  );
}
