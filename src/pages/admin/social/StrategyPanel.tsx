import { useState } from 'react';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DAY_PARTS, FORMATS, PILLARS, PILLAR_ORDER, PLATFORM_LABEL, PlatformBadge, RHYTHM, btn, btnPrimary, card, input, isFormatOn, mixFor, num, perDayFor, timeZones, type Pillar, type Platform, type PlatformRow, type ProgramRow, type ProgramSettings } from './shared';
import { PillarLegend, WeekPreview, settingsOf } from './ProgramPanel';

// The strategy, written down and adjustable: what the account talks about
// (the mix), how often and when (the rhythm), and the rules that keep the
// feed from repeating itself. Saving changes what gets planned next;
// "Plan again" replaces the slots that aren't written yet.

const RULES: [string, string][] = [
  ['Never the same kind of post twice in a row', 'And never twice on one network in one day. Each format rests for its own cooldown before it comes back.'],
  ['A different time every day', 'Each network has favourite windows (morning, lunch, evening…). Every day uses a different set of windows than the day before, at a different minute.'],
  ['No two networks at the same moment', 'Posts are at least about 12 minutes apart across networks, so it never looks like one button was pressed.'],
  ['A topic rests before it returns', 'A country, a visa route, a tip or a question isn’t used again on that network for weeks, and not on two networks on the same day.'],
  ['No caption opens like a recent one', 'Each post has several ways to start. If the opening matches one of the network’s last 40 posts, it is written again.'],
  ['Jobs are picked at the last moment', 'Job posts are written 2 hours before they go out and checked again at publish time: a role that closed is never posted.'],
  ['Only what the site can back up', 'Numbers come from live data when the post is written. Visa facts carry their official source. Outcome posts use totals only, and name a company only when 3+ people reported.'],
  ['Every post has somewhere to go', 'Each one links to the page on madevisa.com that holds the full answer: the country, the route, the company scores, the Visa Plan.'],
];

export function StrategyPanel({ program, platforms, onChange }: { program: ProgramRow; platforms: PlatformRow[]; onChange: () => void }) {
  const [s, setS] = useState<ProgramSettings>(() => settingsOf(program));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(settingsOf(program));
  const mix = mixFor(s);
  const sum = PILLAR_ORDER.reduce((n, k) => n + mix[k], 0) || 1;

  const save = async (replan: boolean) => {
    setBusy(replan ? 'replan' : 'save');
    setMsg(null);
    const { error } = await supabase
      .from('social_program')
      .update({ timezone: s.timezone, autopilot: s.autopilot, per_day: s.per_day, formats: s.formats, mix: s.mix, handles: s.handles, focus: s.focus, updated_at: new Date().toISOString() })
      .eq('id', true);
    let note = error ? error.message : 'Saved. New slots follow these settings.';
    if (!error && replan) {
      const r = await supabase.rpc('social_program_replan');
      note = r.error ? r.error.message : 'Saved. The slots that weren’t written yet are being planned again — give it a minute.';
    }
    setBusy(null);
    setMsg(note);
    onChange();
    if (replan) window.setTimeout(onChange, 50_000);
  };

  return (
    <div className="space-y-5">
      {/* The mix */}
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-ink-950">What the account talks about</h3>
          <p className="text-xs text-ink-500">Seven themes. The one furthest behind its share goes next.</p>
        </div>
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-ink-100">
          {PILLAR_ORDER.map((k) => (
            <div key={k} style={{ width: `${(100 * mix[k]) / sum}%`, backgroundColor: PILLARS[k].color }} className="border-r border-white last:border-0" />
          ))}
        </div>
        <div className="mt-4 grid gap-x-6 gap-y-3 md:grid-cols-2">
          {PILLAR_ORDER.map((k: Pillar) => {
            const on = FORMATS.filter((f) => f.pillar === k && isFormatOn(f, s)).length;
            return (
              <div key={k} className="flex items-start gap-3">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PILLARS[k].color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-950">
                    {PILLARS[k].name} <span className="font-normal text-ink-400">· {on} {on === 1 ? 'format' : 'formats'}</span>
                  </p>
                  <p className="text-xs leading-5 text-ink-600">{PILLARS[k].why}</p>
                </div>
                <label className="flex shrink-0 items-center gap-1 text-xs text-ink-500">
                  <input type="number" min={0} max={100} value={mix[k]} onChange={(e) => setS((x) => ({ ...x, mix: { ...x.mix, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } }))} className={num} />
                  <span className="w-9 tabular-nums">{Math.round((100 * mix[k]) / sum)}%</span>
                </label>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-4 text-ink-500">
          The numbers are weights (they don’t have to add up to 100). Each network leans its own way on top: Telegram gets more jobs, LinkedIn more numbers and outcomes, Instagram and TikTok more visa posts and questions.{' '}
          <button className="font-semibold text-brand-700 hover:underline" onClick={() => setS((x) => ({ ...x, mix: {} }))}>
            Back to the default mix
          </button>
        </p>
      </div>

      {/* The rhythm */}
      <div className={`${card} p-5`}>
        <h3 className="text-base font-semibold text-ink-950">How often, and when</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-1.5">
            {platforms.map((p) => {
              const n = perDayFor(p.platform, s, false);
              const windows = RHYTHM[p.platform].parts.slice(0, Math.min(RHYTHM[p.platform].parts.length, Math.max(n, 1) + 2)).map((x) => DAY_PARTS[x].label.toLowerCase());
              return (
                <div key={p.platform} className={`rounded-lg border border-ink-200 px-3 py-2 ${p.enabled ? '' : 'opacity-50'}`}>
                  <div className="flex items-center gap-3">
                    <PlatformBadge platform={p.platform} small />
                    <span className="min-w-0 flex-1 text-xs text-ink-600">
                      {n ? `${n} a day · ${perDayFor(p.platform, s, true)} at weekends` : 'Not in the program'}
                      {!p.enabled ? ' · off under Platforms' : ''}
                    </span>
                    <input type="number" min={0} max={RHYTHM[p.platform].max} value={n} onChange={(e) => setS((x) => ({ ...x, per_day: { ...x.per_day, [p.platform]: Math.max(0, Math.min(RHYTHM[p.platform].max, Number(e.target.value) || 0)) } }))} className={num} />
                  </div>
                  {n > 0 && <p className="mt-1 text-[11px] leading-4 text-ink-500">Picks from: {windows.join(', ')}. {RHYTHM[p.platform].note}</p>}
                </div>
              );
            })}
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-ink-700">
              Your audience’s clock
              <select className={`${input} mt-1`} value={s.timezone} onChange={(e) => setS((x) => ({ ...x, timezone: e.target.value }))}>
                {[...new Set([s.timezone, ...timeZones()])].map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-ink-200 p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={s.autopilot} onChange={(e) => setS((x) => ({ ...x, autopilot: e.target.checked }))} />
              <span>
                <span className="font-semibold text-ink-950">Autopilot</span>
                <span className="block text-xs leading-5 text-ink-600">On: posts go out at their time (you can still edit, swap or skip each one in the queue). Off: every post waits for Approve.</span>
              </span>
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Countries to feature first (ISO codes, empty = follow the data)
              <input className={`${input} mt-1`} value={s.focus.join(', ')} onChange={(e) => setS((x) => ({ ...x, focus: e.target.value.toUpperCase().split(/[\s,]+/).map((v) => v.trim()).filter((v) => /^[A-Z]{2}$/.test(v)) }))} placeholder="DE, GB, NL" />
            </label>
            <div>
              <p className="text-xs font-medium text-ink-700">Your @handles (used in “Follow …” posts)</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(['instagram', 'tiktok', 'facebook', 'linkedin'] as Platform[]).map((p) => (
                  <input key={p} className={input} value={s.handles[p] ?? ''} onChange={(e) => setS((x) => ({ ...x, handles: { ...x.handles, [p]: e.target.value.trim() } }))} placeholder={`${PLATFORM_LABEL[p]}: @madevisa`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-ink-950">A week with these settings</h3>
          <PillarLegend />
        </div>
        <WeekPreview settings={s} platforms={platforms} />
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white/95 px-4 py-3 shadow-soft backdrop-blur">
        <button onClick={() => void save(false)} disabled={busy !== null || !dirty} className={btnPrimary}>
          {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
        </button>
        {program.running && (
          <button onClick={() => void save(true)} disabled={busy !== null} className={btn} title="Replace the slots that haven’t been written yet with a new plan">
            {busy === 'replan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Save and plan again
          </button>
        )}
        <span className="text-xs text-ink-500">{msg ?? (dirty ? 'Unsaved changes.' : program.running ? 'Saved settings apply to the days that aren’t planned yet.' : 'These settings are used when you press Start.')}</span>
      </div>

      {/* The rules */}
      <div className={`${card} p-5`}>
        <h3 className="text-base font-semibold text-ink-950">The rules it follows</h3>
        <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
          {RULES.map(([title, text], i) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">{i + 1}</span>
              <div>
                <p className="text-sm font-semibold text-ink-950">{title}</p>
                <p className="text-xs leading-5 text-ink-600">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
