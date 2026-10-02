import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PLATFORMS, PLATFORM_LABEL, input, perDayFor, when, type Campaign, type PlatformRow, type ProgramRow } from './shared';
import { settingsOf } from './ProgramPanel';

// Campaigns: job feeds you set up by hand ("Accountant roles, daily").
// While the program runs they pause on the networks it covers; a Telegram
// campaign with its own channel keeps running (one channel per country).

const FREQ = [
  [30, 'Every 30 min'],
  [60, 'Hourly'],
  [120, 'Every 2 hours'],
  [240, 'Every 4 hours'],
  [480, 'Every 8 hours'],
  [720, 'Twice a day'],
  [1440, 'Daily'],
] as const;

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
      // "madevisa_de", "t.me/madevisa_de" or "@madevisa_de" → "@madevisa_de"; numeric ids (-100…) unchanged.
      telegram_chat: v.platforms?.includes('telegram') && v.telegram_chat?.trim()
        ? ((c) => (/^-100\d+$/.test(c) ? c : `@${c.replace(/^(https?:\/\/)?(t\.me\/)?@?/i, '')}`))(v.telegram_chat.trim())
        : null,
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
            <option value="offer">No visa line → pitch the Visa Plan</option>
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
        {v.platforms?.includes('telegram') && (
          <label className="text-xs font-medium text-ink-700">
            Telegram channel (empty = default)
            <input className={`${input} mt-1`} value={v.telegram_chat ?? ''} onChange={(e) => set({ telegram_chat: e.target.value })} placeholder="@madevisa_germany" />
          </label>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {PLATFORMS.map((p) => (
          <label key={p} className="flex items-center gap-1.5">
            <input type="checkbox" checked={(v.platforms ?? []).includes(p)} onChange={(e) => set({ platforms: e.target.checked ? [...(v.platforms ?? []), p] : (v.platforms ?? []).filter((x) => x !== p) })} />
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

export function CampaignsPanel({ campaigns, platforms, program, onChange }: { campaigns: Campaign[]; platforms: PlatformRow[]; program: ProgramRow | null; onChange: () => void }) {
  const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
  // Networks the running program plans (campaigns pause there).
  const covered = new Set(program?.running ? platforms.filter((p) => p.enabled && perDayFor(p.platform, settingsOf(program), false) > 0).map((p) => p.platform) : []);
  const paused = (c: Campaign) => c.enabled && c.platforms.length > 0 && c.platforms.every((p) => covered.has(p) && !(p === 'telegram' && c.telegram_chat));
  const done = () => {
    setEditing(null);
    onChange();
  };

  return (
    <div className="space-y-3">
      {covered.size > 0 && (
        <p className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs leading-5 text-brand-900">
          The program is running on {[...covered].map((p) => PLATFORM_LABEL[p]).join(', ')}, so campaigns pause there — the program already posts fresh jobs in its mix. A Telegram campaign with its own channel (one per country) keeps running. Stop the program and campaigns start again.
        </p>
      )}
      {campaigns.map((c) =>
        editing?.id === c.id ? (
          <CampaignForm key={c.id} c={editing} onDone={done} />
        ) : (
          <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-950">
                {c.name}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${paused(c) ? 'bg-amber-100 text-amber-900' : c.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-100 text-ink-500'}`}>{paused(c) ? 'Paused by the program' : c.enabled ? 'On' : 'Off'}</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {FREQ.find(([m]) => m === c.every_minutes)?.[1] ?? `Every ${c.every_minutes} min`} · {c.format === 'mix' ? 'mixed designs' : c.format === 'cards' ? `cards, up to ${Math.min(4, c.jobs_count)}` : c.format === 'list' ? `list of up to ${c.jobs_count}` : c.format === 'carousel' ? 'up to 3 images' : c.format === 'company' ? 'company images' : 'one job'} ·{' '}
                {c.platforms.map((p) => PLATFORM_LABEL[p]).join(', ')}
                {c.telegram_chat ? ` → ${c.telegram_chat}` : ''}
                {c.categories.length ? ` · ${c.categories.join(', ')}` : ''}
                {c.countries?.length ? ` · ${c.countries.join(', ')}` : ''}
                {c.require_approval ? ' · needs approval' : ' · automatic'}
              </p>
              {c.last_result && <p className="mt-1 line-clamp-2 text-xs text-ink-400">Last run {when(c.last_run_at)}: {c.last_result}</p>}
            </div>
            <button
              onClick={async () => {
                await supabase.from('social_campaigns').update({ enabled: !c.enabled, next_at: new Date().toISOString() }).eq('id', c.id);
                onChange();
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
                onChange();
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
        <CampaignForm c={editing} onDone={done} />
      ) : (
        <button onClick={() => setEditing({ kind: 'category', platforms: ['linkedin', 'instagram', 'facebook'], every_minutes: 1440, format: 'list', jobs_count: 5, min_jobs: 3, require_approval: true, enabled: false })} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-ink-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-white">
          <Plus className="h-4 w-4" /> New campaign
        </button>
      )}
      <p className="text-xs leading-5 text-ink-500">Each job is posted at most once per network, and is reserved as soon as a post is planned — two campaigns (or a campaign and the program) never share a job. Posts on the same network are always at least its minimum gap apart.</p>
    </div>
  );
}
