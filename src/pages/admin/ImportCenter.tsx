// Import center — every job-import tool in one place:
//   - one row per company: logo, name (both editable), the exact source
//     link(s) used to fetch (Greenhouse board / careers page, clickable),
//     job counts, last sync result, schedule, auto-publish
//   - filters, sorting, multi-select, one-click sync (selected / due / all)
//   - expandable per-company job list with publish / unpublish / delete
//   - bulk "add many companies" from a pasted list
//   - scheduled syncs that run while this panel is open
//   - a progress bar with percent for everything long-running

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, ExternalLink, ImageIcon, Link2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ProgressBar } from '@/components/common/ProgressBar';
import { ImageUploadField } from '@/components/common/ImageUploadField';
import {
  bulkDeleteJobs,
  bulkSetJobStatus,
  deleteAllCompanyJobs,
  deleteCompany,
  deleteSponsoredJob,
  findOrCreateImportedPublisher,
  setPublisherLogoForAllJobs,
  setSponsoredJobStatus,
  updatePublisherName,
  type AdminSponsoredJob,
  type ImportCountryLookup,
  type PendingPublisher,
} from '@/lib/admin';
import {
  deleteImportSource,
  describeSyncSummary,
  isSourceDue,
  linkOlderJobs,
  nextSyncAt,
  parseSourceList,
  registerImportSource,
  sourcePublicUrl,
  syncImportSource,
  updateImportSource,
  type ImportSource,
} from '@/lib/importSync';

type Props = {
  sources: ImportSource[];
  allJobs: AdminSponsoredJob[];
  publishers: PendingPublisher[];
  countries: ImportCountryLookup[];
  userId: string;
  onChange: () => void;
};

type CompanyRow = {
  id: string;
  name: string;
  logo: string | null;
  sources: ImportSource[];
  live: number;
  pending: number;
  other: number;
  total: number;
  unlinked: number;
  lastSync: string | null;
  status: 'ok' | 'partial' | 'error' | 'never' | 'none';
  due: boolean;
};

const SCHEDULES: { hours: number; label: string }[] = [
  { hours: 0, label: 'Manual' },
  { hours: 6, label: 'Every 6h' },
  { hours: 12, label: 'Every 12h' },
  { hours: 24, label: 'Daily' },
  { hours: 72, label: 'Every 3 days' },
  { hours: 168, label: 'Weekly' },
];

const AUTO_SYNC_KEY = 'mv_admin_autosync';

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function timeUntil(d: Date | null): string {
  if (!d) return '';
  const mins = Math.round((d.getTime() - Date.now()) / 60_000);
  if (mins <= 0) return 'due now';
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `in ${hrs}h` : `in ${Math.round(hrs / 24)}d`;
}

export function ImportCenter({ sources, allJobs, publishers, countries, userId, onChange }: Props) {
  // ---- filters ----
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState<'all' | 'greenhouse' | 'careers' | 'none'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'never' | 'ok' | 'error' | 'due' | 'pending' | 'unlinked'>('all');
  const [sort, setSort] = useState<'name' | 'jobs' | 'pending' | 'lastSync'>('name');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  // Logos applied in this session show instantly, before the data reload finishes.
  const [logoOverrides, setLogoOverrides] = useState<Record<string, string>>({});

  // ---- sync options ----
  const [removal, setRemoval] = useState<'delete' | 'expire'>('delete');
  const [refreshContent, setRefreshContent] = useState(false);
  const [allowLarge, setAllowLarge] = useState(false);

  // ---- progress ----
  const [run, setRun] = useState<{ label: string; value: number | null; detail?: string } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const stop = useRef(false);
  const busy = run !== null;
  const say = (m: string) => setLog((prev) => [...prev.slice(-11), m]);

  // ---- schedule ----
  const [autoSync, setAutoSync] = useState(() => {
    try {
      return localStorage.getItem(AUTO_SYNC_KEY) === '1';
    } catch {
      return false;
    }
  });

  // ---- company rows (counts by company, not just by linked source) ----
  const rows = useMemo<CompanyRow[]>(() => {
    const pubById = new Map(publishers.map((p) => [p.id, p]));
    const map = new Map<string, CompanyRow>();
    const ensure = (id: string, name: string, logo: string | null): CompanyRow => {
      let r = map.get(id);
      if (!r) {
        const p = pubById.get(id);
        r = { id, name: p?.name ?? name, logo: p?.logo_url ?? logo, sources: [], live: 0, pending: 0, other: 0, total: 0, unlinked: 0, lastSync: null, status: 'none', due: false };
        map.set(id, r);
      }
      return r;
    };
    const jobImages = new Map<string, Map<string, number>>();
    for (const s of sources) ensure(s.publisher_id, s.publisher?.name ?? 'Unknown company', s.publisher?.logo_url ?? null).sources.push(s);
    for (const j of allJobs) {
      if (j.publisher_id && j.image_url) {
        const m = jobImages.get(j.publisher_id) ?? new Map<string, number>();
        m.set(j.image_url, (m.get(j.image_url) ?? 0) + 1);
        jobImages.set(j.publisher_id, m);
      }
      if (!j.publisher_id) continue;
      // Companies show up here if they have a source or any imported jobs.
      if (!map.has(j.publisher_id) && j.origin !== 'imported') continue;
      const r = ensure(j.publisher_id, j.publisher?.name ?? 'Unknown company', j.publisher?.logo_url ?? null);
      if (!r.logo && j.publisher?.logo_url) r.logo = j.publisher.logo_url;
      r.total++;
      if (j.status === 'published') r.live++;
      else if (j.status === 'pending') r.pending++;
      else r.other++;
      if (j.origin === 'imported' && !j.import_source_id) r.unlinked++;
    }
    for (const r of map.values()) {
      // Same logo the job board shows: the company's logo, else the one its jobs use most.
      if (!r.logo) {
        const imgs = jobImages.get(r.id);
        if (imgs) r.logo = [...imgs.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
      if (r.sources.length) {
        const synced = r.sources.map((s) => s.last_synced_at).filter(Boolean) as string[];
        r.lastSync = synced.sort().pop() ?? null;
        const statuses = r.sources.map((s) => s.last_sync_status);
        r.status = statuses.includes('error') ? 'error' : statuses.includes('partial') ? 'partial' : r.lastSync ? 'ok' : 'never';
        r.due = r.sources.some((s) => isSourceDue(s));
      }
    }
    return [...map.values()];
  }, [sources, allJobs, publishers]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.sources.some((s) => s.source_url.toLowerCase().includes(q))) return false;
      if (platform === 'greenhouse' && !r.sources.some((s) => s.kind === 'greenhouse')) return false;
      if (platform === 'careers' && !r.sources.some((s) => s.kind === 'careers_url')) return false;
      if (platform === 'none' && r.sources.length) return false;
      if (statusFilter === 'never' && r.status !== 'never') return false;
      if (statusFilter === 'ok' && r.status !== 'ok') return false;
      if (statusFilter === 'error' && r.status !== 'error' && r.status !== 'partial') return false;
      if (statusFilter === 'due' && !r.due) return false;
      if (statusFilter === 'pending' && r.pending === 0) return false;
      if (statusFilter === 'unlinked' && r.unlinked === 0) return false;
      return true;
    });
    list.sort((a, b) =>
      sort === 'jobs' ? b.total - a.total : sort === 'pending' ? b.pending - a.pending : sort === 'lastSync' ? (b.lastSync ?? '').localeCompare(a.lastSync ?? '') : a.name.localeCompare(b.name)
    );
    return list;
  }, [rows, search, platform, statusFilter, sort]);

  const totals = useMemo(
    () => ({
      companies: rows.length,
      sources: sources.length,
      live: rows.reduce((n, r) => n + r.live, 0),
      pending: rows.reduce((n, r) => n + r.pending, 0),
      unlinked: rows.reduce((n, r) => n + (r.sources.length === 1 ? r.unlinked : 0), 0),
      due: sources.filter((s) => isSourceDue(s)).length,
      errors: rows.filter((r) => r.status === 'error' || r.status === 'partial').length,
    }),
    [rows, sources]
  );

  // ---- actions ----
  const syncMany = async (list: ImportSource[], label: string) => {
    if (!list.length || busy) return;
    stop.current = false;
    setLog([]);
    setLastResult(null);
    let added = 0;
    let removed = 0;
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      if (stop.current) {
        say('Stopped.');
        break;
      }
      const src = list[i];
      const name = src.publisher?.name ?? 'Source';
      const res = await syncImportSource(src, {
        countries,
        removal,
        refreshContent,
        allowLargeRemoval: allowLarge,
        onProgress: (m) => {
          say(m);
          setRun((r) => (r ? { ...r, detail: m } : r));
        },
        onPercent: (f) => setRun({ label: `${label} — ${name} (${i + 1} of ${list.length})`, value: (i + f) / list.length }),
        shouldStop: () => stop.current,
      });
      added += res.summary.added;
      removed += res.summary.removed + res.summary.duplicatesRemoved;
      if (res.summary.error) {
        failed++;
        say(`${name}: ${res.summary.error}`);
      }
    }
    setRun(null);
    setLastResult(`${label}: ${list.length} source${list.length === 1 ? '' : 's'} · +${added} new · −${removed} removed${failed ? ` · ${failed} with problems (see Last sync)` : ''}.`);
    onChange();
  };

  const selectedSources = sources.filter((s) => selected.has(s.publisher_id));
  const visibleSources = visible.flatMap((r) => r.sources);

  // Scheduled syncs while this panel is open.
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    try {
      localStorage.setItem(AUTO_SYNC_KEY, autoSync ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!autoSync) return;
    const tick = () => {
      if (busyRef.current) return;
      const due = sourcesRef.current.filter((s) => isSourceDue(s));
      if (due.length) syncMany(due, 'Scheduled sync');
    };
    const first = window.setTimeout(tick, 3_000);
    const id = window.setInterval(tick, 5 * 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync]);

  const setSchedule = async (companyId: string, hours: number) => {
    const list = sources.filter((s) => s.publisher_id === companyId);
    for (const s of list) {
      const r = await updateImportSource(s.id, { sync_interval_hours: hours || null });
      if (!r.ok) {
        window.alert(
          /column|schema cache/i.test(r.error ?? '')
            ? 'Run the 20260926090000_import_source_schedule.sql migration first to enable schedules.'
            : r.error
        );
        return;
      }
    }
    onChange();
  };

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Import center — companies &amp; their sources</h2>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {totals.companies} companies · {totals.sources} sources · {totals.live.toLocaleString()} live · {totals.pending.toLocaleString()} pending
            {totals.errors ? ` · ${totals.errors} with sync problems` : ''}
          </p>
        </div>
      </div>

      <div className="mt-3 border border-ink-200 bg-white p-4">
        {/* Progress */}
        {run && (
          <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
            <ProgressBar value={run.value} label={run.label} detail={run.detail} />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => (stop.current = true)} className="rounded-lg border border-ink-200 bg-white px-3 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50">
                Stop after current step
              </button>
              <span className="text-[11px] text-ink-400">Keep this tab open until it finishes.</span>
            </div>
          </div>
        )}
        {!run && lastResult && <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{lastResult}</p>}
        {log.length > 0 && (
          <div className="mb-4 max-h-32 overflow-y-auto rounded-md bg-ink-950 px-3 py-2 font-mono text-[11px] leading-5 text-ink-100">
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}

        {/* Older jobs not linked to a source */}
        {totals.unlinked > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <span className="min-w-0 flex-1">
              <strong>{totals.unlinked.toLocaleString()}</strong> older imported jobs aren't linked to their company's source yet, so sync can't
              keep them up to date. Linking takes a few seconds and changes nothing else.
            </span>
            <button
              disabled={busy}
              onClick={async () => {
                setRun({ label: 'Linking older jobs to their sources', value: 0 });
                const r = await linkOlderJobs(sources, (f) => setRun({ label: 'Linking older jobs to their sources', value: f }));
                setRun(null);
                setLastResult(`Linked ${r.linked.toLocaleString()} jobs across ${r.companies} companies.${r.error ? ` Some failed: ${r.error}` : ''}`);
                onChange();
              }}
              className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <Link2 className="mr-1 inline h-3.5 w-3.5" />
              Link them now
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or source URL…"
            className="h-8 w-56 rounded-md border border-ink-200 px-2 text-xs outline-none focus:border-brand-500"
          />
          <select value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)} className="h-8 rounded-md border border-ink-200 px-1.5 text-xs">
            <option value="all">All sources</option>
            <option value="greenhouse">Greenhouse</option>
            <option value="careers">Careers pages</option>
            <option value="none">No source yet</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-8 rounded-md border border-ink-200 px-1.5 text-xs">
            <option value="all">Any status</option>
            <option value="never">Never synced</option>
            <option value="ok">Synced OK</option>
            <option value="error">Sync problems</option>
            <option value="due">Due for sync ({totals.due})</option>
            <option value="pending">Has pending jobs</option>
            <option value="unlinked">Has unlinked older jobs</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-8 rounded-md border border-ink-200 px-1.5 text-xs">
            <option value="name">Sort: name</option>
            <option value="jobs">Sort: most jobs</option>
            <option value="pending">Sort: most pending</option>
            <option value="lastSync">Sort: recently synced</option>
          </select>
          <span className="ml-auto text-[11px] text-ink-400">
            Showing {visible.length} of {rows.length}
          </span>
        </div>

        {/* Bulk actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-ink-50 px-3 py-2">
          <button
            disabled={busy || !visibleSources.length}
            onClick={() => syncMany(visibleSources, search || platform !== 'all' || statusFilter !== 'all' ? 'Sync filtered' : 'Sync all')}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync {search || platform !== 'all' || statusFilter !== 'all' ? 'filtered' : 'all'} ({visibleSources.length})
          </button>
          <button
            disabled={busy || !selectedSources.length}
            onClick={() => syncMany(selectedSources, 'Sync selected')}
            className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
          >
            Sync selected ({selectedSources.length})
          </button>
          <button
            disabled={busy || !totals.due}
            onClick={() => syncMany(sources.filter((s) => isSourceDue(s)), 'Sync due')}
            className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
          >
            Sync due ({totals.due})
          </button>
          <button
            disabled={busy || selected.size === 0}
            onClick={async () => {
              const ids = allJobs.filter((j) => j.publisher_id && selected.has(j.publisher_id) && j.status === 'pending').map((j) => j.id);
              if (!ids.length) return window.alert('No pending jobs for the selected companies.');
              if (!window.confirm(`Publish ${ids.length} pending jobs from ${selected.size} companies?`)) return;
              setRun({ label: `Publishing ${ids.length} jobs`, value: null });
              const r = await bulkSetJobStatus(ids, 'published');
              setRun(null);
              setLastResult(r.ok ? `Published ${ids.length} jobs.` : `Publish failed: ${r.error}`);
              onChange();
            }}
            className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
          >
            Publish pending of selected
          </button>

          <span className="mx-1 h-5 w-px bg-ink-200" />
          <label className="flex items-center gap-1 text-[11px] text-ink-600">
            Gone from source:
            <select value={removal} onChange={(e) => setRemoval(e.target.value as 'delete' | 'expire')} className="h-7 rounded border border-ink-200 px-1">
              <option value="delete">Delete</option>
              <option value="expire">Mark expired</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-[11px] text-ink-600" title="Overwrites manual edits to titles/descriptions">
            <input type="checkbox" checked={refreshContent} onChange={(e) => setRefreshContent(e.target.checked)} /> Refresh text
          </label>
          <label className="flex items-center gap-1 text-[11px] text-ink-600" title="Allow a sync to remove more than 60% of a company's jobs">
            <input type="checkbox" checked={allowLarge} onChange={(e) => setAllowLarge(e.target.checked)} /> Allow large removals
          </label>
          <label className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-ink-700" title="Runs due scheduled syncs every 5 minutes while this admin tab is open">
            <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
            <Clock className="h-3.5 w-3.5" /> Run schedules while open
          </label>
        </div>

        {/* Table */}
        <div className="mt-3 max-h-[640px] overflow-auto rounded-lg border border-ink-100">
          <table className="w-full min-w-[980px] text-xs">
            <thead className="sticky top-0 z-[1] bg-ink-50 text-left text-[10px] uppercase tracking-wide text-ink-500 shadow-[0_1px_0_0_rgb(0_0_0/0.06)]">
              <tr>
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((r) => r.id)))}
                    aria-label="Select all shown"
                  />
                </th>
                <th className="px-2 py-2">Company</th>
                <th className="px-2 py-2">Fetched from</th>
                <th className="px-2 py-2">Jobs</th>
                <th className="px-2 py-2">Last sync</th>
                <th className="px-2 py-2">Schedule</th>
                <th className="px-2 py-2" title="New jobs found by sync go live immediately instead of to pending">Auto-publish</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-ink-400">
                    Nothing matches these filters.
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <CompanyTableRow
                  key={r.id}
                  row={logoOverrides[r.id] ? { ...r, logo: logoOverrides[r.id] } : r}
                  onLogoApplied={(url) => setLogoOverrides((prev) => ({ ...prev, [r.id]: url }))}
                  allJobs={allJobs}
                  selected={selected.has(r.id)}
                  onToggle={() => toggleSel(r.id)}
                  expanded={expanded === r.id}
                  onExpand={() => setExpanded(expanded === r.id ? null : r.id)}
                  busy={busy}
                  userId={userId}
                  onSync={() => syncMany(r.sources, `Sync ${r.name}`)}
                  onSchedule={(h) => setSchedule(r.id, h)}
                  onChange={onChange}
                  setRun={setRun}
                  setLastResult={setLastResult}
                />
              ))}
            </tbody>
          </table>
        </div>

        <BulkAddCompanies
          busy={busy}
          onRun={async (lines, importNow) => {
            setLog([]);
            const created: ImportSource[] = [];
            let failed = 0;
            for (let i = 0; i < lines.length; i++) {
              const l = lines[i];
              setRun({ label: `Adding companies (${i + 1} of ${lines.length})`, value: i / lines.length, detail: l.company });
              const pub = await findOrCreateImportedPublisher(l.company);
              if (!pub.ok || !pub.id) {
                failed++;
                say(`${l.company}: ${pub.error ?? 'could not create company'}`);
                continue;
              }
              const reg = await registerImportSource({
                publisherId: pub.id,
                kind: l.kind,
                sourceUrl: l.kind === 'greenhouse' ? l.token : l.url,
                platform: l.kind === 'greenhouse' ? 'Greenhouse' : null,
              });
              if (!reg.ok || !reg.id) {
                failed++;
                say(`${l.company}: ${reg.error ?? 'could not save source'}`);
                continue;
              }
              created.push({
                id: reg.id,
                publisher_id: pub.id,
                kind: l.kind,
                source_url: l.kind === 'greenhouse' ? l.token : l.url,
                resolved_url: null,
                strategy: null,
                detected_platform: null,
                auto_publish: false,
                last_synced_at: null,
                last_sync_status: null,
                last_sync_summary: null,
                created_at: new Date().toISOString(),
                publisher: { id: pub.id, name: l.company, logo_url: null },
              });
            }
            setRun(null);
            if (importNow && created.length) await syncMany(created, 'Import new companies');
            else {
              setLastResult(`Added ${created.length} compan${created.length === 1 ? 'y' : 'ies'}${failed ? `, ${failed} failed (see log)` : ''}. Use Sync to import their jobs.`);
              onChange();
            }
          }}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function CompanyTableRow({
  row,
  onLogoApplied,
  allJobs,
  selected,
  onToggle,
  expanded,
  onExpand,
  busy,
  userId,
  onSync,
  onSchedule,
  onChange,
  setRun,
  setLastResult,
}: {
  row: CompanyRow;
  onLogoApplied: (url: string) => void;
  allJobs: AdminSponsoredJob[];
  selected: boolean;
  onToggle: () => void;
  expanded: boolean;
  onExpand: () => void;
  busy: boolean;
  userId: string;
  onSync: () => void;
  onSchedule: (hours: number) => void;
  onChange: () => void;
  setRun: (r: { label: string; value: number | null; detail?: string } | null) => void;
  setLastResult: (s: string | null) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(row.name);
  const [logoOpen, setLogoOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMsg, setLogoMsg] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [editSourceId, setEditSourceId] = useState<string | null>(null);
  const [editSourceUrl, setEditSourceUrl] = useState('');

  const schedule = row.sources[0]?.sync_interval_hours ?? 0;
  const next = row.sources.map(nextSyncAt).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
  const statusColor = row.status === 'ok' ? 'text-emerald-700' : row.status === 'error' ? 'text-rose-600' : row.status === 'partial' ? 'text-amber-700' : 'text-ink-400';

  const saveSource = async (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    const isUrl = /^https?:\/\//i.test(v);
    const isGh = !isUrl || /greenhouse\.io/i.test(v);
    let token = v;
    if (isUrl && isGh) {
      const u = new URL(v);
      token = u.searchParams.get('for') ?? u.pathname.split('/').filter((x) => x && x !== 'embed' && x !== 'job_board')[0] ?? v;
    }
    const r = await registerImportSource({ publisherId: row.id, kind: isGh ? 'greenhouse' : 'careers_url', sourceUrl: isGh ? token : v });
    if (!r.ok) return window.alert(r.error);
    setAddingSource(false);
    setNewSource('');
    onChange();
  };

  return (
    <>
      <tr className={`align-top ${selected ? 'bg-brand-50/40' : ''}`}>
        <td className="px-2 py-2.5">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${row.name}`} />
        </td>
        <td className="px-2 py-2.5">
          <div className="flex items-start gap-2">
            <button
              onClick={() => {
                setLogoOpen((v) => !v);
                setLogoMsg(null);
              }}
              title="Change logo"
              className="shrink-0"
            >
              {row.logo ? (
                <img src={row.logo} alt="" className="h-9 w-9 rounded border border-ink-100 bg-white object-contain p-0.5" />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded border border-dashed border-ink-200 text-ink-300">
                  <ImageIcon className="h-4 w-4" />
                </span>
              )}
            </button>
            <div className="min-w-0">
              {editingName ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await updatePublisherName(row.id, name.trim());
                    if (!r.ok) return window.alert(r.error);
                    setEditingName(false);
                    onChange();
                  }}
                  className="flex gap-1"
                >
                  <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-7 w-40 rounded border border-ink-200 px-1.5 text-xs" />
                  <button className="rounded bg-brand-600 px-2 text-[11px] font-semibold text-white">Save</button>
                </form>
              ) : (
                <button onClick={() => setEditingName(true)} className="group flex items-center gap-1 text-left font-semibold text-ink-900" title="Rename">
                  {row.name}
                  <Pencil className="h-3 w-3 text-ink-300 opacity-0 group-hover:opacity-100" />
                </button>
              )}
              <button onClick={onExpand} className="mt-0.5 flex items-center gap-0.5 text-[11px] font-semibold text-brand-700 hover:text-brand-800">
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {expanded ? 'Hide jobs' : `Manage ${row.total} jobs`}
              </button>
            </div>
          </div>
          {logoOpen && (
            <div className="mt-2 w-64 rounded-md border border-ink-200 bg-white p-2 shadow-sm">
              <ImageUploadField userId={userId} value={logoUrl} onChange={setLogoUrl} label="Logo (applies to the company and all its jobs)" />
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value.trim())}
                placeholder="…or paste an image URL (https://…)"
                className="mt-1 h-7 w-full rounded border border-ink-200 px-1.5 text-[11px]"
              />
              {logoUrl && /^https?:\/\//i.test(logoUrl) && (
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-ink-400">
                  <img src={logoUrl} alt="" className="h-9 w-9 rounded border border-ink-100 object-contain p-0.5" />
                  Preview
                </div>
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  disabled={!/^https?:\/\//i.test(logoUrl) || logoBusy}
                  onClick={async () => {
                    setLogoBusy(true);
                    setLogoMsg(null);
                    const r = await setPublisherLogoForAllJobs(row.id, logoUrl);
                    setLogoBusy(false);
                    if (!r.ok) return setLogoMsg(r.error ?? 'Could not apply the logo.');
                    onLogoApplied(logoUrl);
                    setLogoMsg(`Applied to ${row.name} and ${r.jobsUpdated ?? 0} jobs.`);
                    setLogoUrl('');
                    onChange();
                  }}
                  className="rounded bg-brand-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  {logoBusy ? 'Applying…' : 'Apply logo'}
                </button>
                <button onClick={() => setLogoOpen(false)} className="text-[11px] text-ink-400 hover:text-ink-700">
                  Close
                </button>
              </div>
              {logoMsg && <p className={`mt-1 text-[11px] ${/Applied/.test(logoMsg) ? 'text-emerald-700' : 'text-rose-600'}`}>{logoMsg}</p>}
            </div>
          )}
        </td>
        <td className="max-w-[260px] px-2 py-2.5">
          {row.sources.map((s) => (
            <div key={s.id} className="mb-1.5 last:mb-0">
              <div className="flex items-center gap-1">
                <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600">
                  {s.detected_platform ?? (s.kind === 'greenhouse' ? 'Greenhouse' : 'Careers page')}
                </span>
                <button
                  onClick={() => {
                    setEditSourceId(s.id);
                    setEditSourceUrl(s.source_url);
                  }}
                  className="text-ink-300 hover:text-ink-600"
                  title="Edit source"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={async () => {
                    const alsoJobs = window.confirm(`Remove this source?\n\nOK = also delete its jobs\nCancel = keep the jobs (they just stop syncing)`);
                    if (!alsoJobs && !window.confirm('Remove the source and keep its jobs?')) return;
                    const r = await deleteImportSource(s.id, alsoJobs);
                    if (!r.ok) window.alert(r.error);
                    onChange();
                  }}
                  className="text-ink-300 hover:text-rose-600"
                  title="Remove source"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {editSourceId === s.id ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await updateImportSource(s.id, { source_url: editSourceUrl.trim(), strategy: null, resolved_url: null });
                    if (!r.ok) return window.alert(r.error);
                    setEditSourceId(null);
                    onChange();
                  }}
                  className="mt-1 flex gap-1"
                >
                  <input value={editSourceUrl} onChange={(e) => setEditSourceUrl(e.target.value)} className="h-7 min-w-0 flex-1 rounded border border-ink-200 px-1.5 text-[11px]" />
                  <button className="rounded bg-brand-600 px-2 text-[11px] font-semibold text-white">Save</button>
                </form>
              ) : (
                <a
                  href={sourcePublicUrl(s)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-700"
                  title={sourcePublicUrl(s)}
                >
                  <span className="truncate">{sourcePublicUrl(s).replace(/^https?:\/\//, '')}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              )}
              {s.resolved_url && s.resolved_url !== s.source_url && (
                <a href={s.resolved_url} target="_blank" rel="noopener noreferrer" className="block truncate text-[10px] text-ink-400 hover:text-ink-600" title={`Jobs actually come from ${s.resolved_url}`}>
                  → {s.resolved_url.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          ))}
          {addingSource || row.sources.length === 0 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveSource(newSource);
              }}
              className="mt-1 flex gap-1"
            >
              <input
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                placeholder="Careers URL or Greenhouse token"
                className="h-7 min-w-0 flex-1 rounded border border-ink-200 px-1.5 text-[11px]"
              />
              <button className="rounded bg-brand-600 px-2 text-[11px] font-semibold text-white">Add</button>
            </form>
          ) : (
            <button onClick={() => setAddingSource(true)} className="mt-1 flex items-center gap-0.5 text-[10px] font-semibold text-ink-400 hover:text-ink-700">
              <Plus className="h-3 w-3" /> another source
            </button>
          )}
        </td>
        <td className="whitespace-nowrap px-2 py-2.5 text-ink-600">
          <span className="font-semibold text-emerald-700">{row.live.toLocaleString()}</span> live ·{' '}
          <span className={row.pending ? 'font-semibold text-amber-700' : ''}>{row.pending.toLocaleString()}</span> pending
          {row.other ? <span className="text-ink-400"> · {row.other} other</span> : null}
          {row.unlinked > 0 && <p className="text-[10px] text-amber-700">{row.unlinked} not linked yet</p>}
        </td>
        <td className="max-w-[220px] px-2 py-2.5">
          <span className={`font-semibold ${statusColor}`}>{row.sources.length ? timeAgo(row.lastSync) : '—'}</span>
          {row.sources.map((s) =>
            s.last_sync_summary ? (
              <p key={s.id} className="text-[11px] text-ink-500">
                {describeSyncSummary(s.last_sync_summary)}
              </p>
            ) : null
          )}
          {row.sources.map((s) =>
            s.last_sync_summary?.error ? (
              <p key={`e-${s.id}`} className="line-clamp-2 text-[11px] text-rose-600" title={s.last_sync_summary.error}>
                {s.last_sync_summary.error}
              </p>
            ) : null
          )}
        </td>
        <td className="px-2 py-2.5">
          {row.sources.length ? (
            <>
              <select value={schedule} onChange={(e) => onSchedule(Number(e.target.value))} className="h-7 rounded border border-ink-200 px-1 text-[11px]">
                {SCHEDULES.map((o) => (
                  <option key={o.hours} value={o.hours}>
                    {o.label}
                  </option>
                ))}
              </select>
              {schedule > 0 && <p className={`text-[10px] ${row.due ? 'font-semibold text-amber-700' : 'text-ink-400'}`}>next {timeUntil(next)}</p>}
            </>
          ) : (
            <span className="text-ink-300">—</span>
          )}
        </td>
        <td className="px-2 py-2.5">
          {row.sources.map((s) => (
            <input
              key={s.id}
              type="checkbox"
              className="block"
              checked={s.auto_publish}
              onChange={async (e) => {
                const r = await updateImportSource(s.id, { auto_publish: e.target.checked });
                if (!r.ok) window.alert(r.error);
                onChange();
              }}
            />
          ))}
        </td>
        <td className="whitespace-nowrap px-2 py-2.5 text-right">
          <button
            onClick={onSync}
            disabled={busy || !row.sources.length}
            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40"
          >
            <RefreshCw className="h-3 w-3" /> Sync
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-ink-50/60 px-3 py-3">
            <CompanyJobsPanel
              companyId={row.id}
              companyName={row.name}
              jobs={allJobs.filter((j) => j.publisher_id === row.id)}
              onChange={onChange}
              setRun={setRun}
              setLastResult={setLastResult}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function CompanyJobsPanel({
  companyId,
  companyName,
  jobs,
  onChange,
  setRun,
  setLastResult,
}: {
  companyId: string;
  companyName: string;
  jobs: AdminSponsoredJob[];
  onChange: () => void;
  setRun: (r: { label: string; value: number | null; detail?: string } | null) => void;
  setLastResult: (s: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'published' | 'pending' | 'other'>('all');
  const [limit, setLimit] = useState(100);
  const shown = jobs.filter((j) => {
    if (q && !j.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (status === 'published') return j.status === 'published';
    if (status === 'pending') return j.status === 'pending';
    if (status === 'other') return j.status !== 'published' && j.status !== 'pending';
    return true;
  });

  const bulk = async (label: string, ids: string[], fn: (ids: string[]) => Promise<{ ok: boolean; error?: string }>) => {
    if (!ids.length) return;
    if (!window.confirm(`${label} ${ids.length} ${companyName} job${ids.length === 1 ? '' : 's'}?`)) return;
    setRun({ label: `${label} ${ids.length} jobs`, value: null });
    const r = await fn(ids);
    setRun(null);
    setLastResult(r.ok ? `${label}: ${ids.length} ${companyName} jobs done.` : `${label} failed: ${r.error}`);
    onChange();
  };

  const deleteAll = async () => {
    const typed = window.prompt(`Delete ALL ${jobs.length.toLocaleString()} jobs of ${companyName}? The company and its sources stay, so you can re-import.\n\nType DELETE to confirm.`);
    if (typed !== 'DELETE') return;
    setRun({ label: `Deleting all ${companyName} jobs`, value: 0 });
    const r = await deleteAllCompanyJobs(companyId, (d, t) => setRun({ label: `Deleting all ${companyName} jobs`, value: t ? d / t : null, detail: `${d.toLocaleString()} of ${t.toLocaleString()} deleted` }));
    setRun(null);
    setLastResult(r.ok ? `Deleted all ${r.deleted.toLocaleString()} ${companyName} jobs. Click Sync to import them again.` : `Stopped after ${r.deleted} — ${r.error}`);
    onChange();
  };

  const removeCompany = async () => {
    const typed = window.prompt(
      `Delete the company "${companyName}" completely — its ${jobs.length.toLocaleString()} jobs, programs, import sources and manager access?\n\nYou can add it again later (Add many companies / import tools).\n\nType DELETE to confirm.`
    );
    if (typed !== 'DELETE') return;
    setRun({ label: `Deleting ${companyName}`, value: 0 });
    const r = await deleteCompany(companyId, (d, t) => setRun({ label: `Deleting ${companyName}`, value: t ? d / t : null, detail: `${d.toLocaleString()} of ${t.toLocaleString()} jobs deleted` }));
    setRun(null);
    setLastResult(r.ok ? `Deleted ${companyName} and its ${r.jobsDeleted.toLocaleString()} jobs.` : r.error ?? 'Delete failed.');
    onChange();
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2 border-b border-ink-100 pb-2">
        <span className="mr-auto text-[11px] text-ink-500">
          {jobs.length.toLocaleString()} jobs for {companyName}
        </span>
        <button
          onClick={deleteAll}
          disabled={jobs.length === 0}
          className="rounded border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
        >
          Delete all {jobs.length.toLocaleString()} jobs
        </button>
        <button onClick={removeCompany} className="rounded bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700">
          Delete company
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${companyName} jobs…`} className="h-7 w-52 rounded border border-ink-200 bg-white px-1.5 text-[11px]" />
        {(['all', 'published', 'pending', 'other'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status === s ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600'}`}
          >
            {s === 'all' ? 'All' : s === 'published' ? 'Live' : s === 'pending' ? 'Pending' : 'Other'}
          </button>
        ))}
        <span className="ml-auto flex flex-wrap gap-1.5">
          <button
            onClick={() => bulk('Publish', shown.filter((j) => j.status !== 'published').map((j) => j.id), (ids) => bulkSetJobStatus(ids, 'published'))}
            className="rounded border border-ink-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Publish shown
          </button>
          <button
            onClick={() => bulk('Unpublish', shown.filter((j) => j.status === 'published').map((j) => j.id), (ids) => bulkSetJobStatus(ids, 'draft'))}
            className="rounded border border-ink-200 bg-white px-2 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            Unpublish shown
          </button>
          <button
            onClick={() => bulk('Delete', shown.map((j) => j.id), bulkDeleteJobs)}
            className="rounded border border-ink-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
          >
            Delete shown
          </button>
        </span>
      </div>
      <div className="mt-2 max-h-80 overflow-y-auto rounded border border-ink-100 bg-white">
        {shown.length === 0 && <p className="px-3 py-4 text-center text-[11px] text-ink-400">No jobs here.</p>}
        {shown.slice(0, limit).map((j) => (
          <div key={j.id} className="flex items-center gap-2 border-b border-ink-50 px-3 py-1.5 last:border-0">
            <a href={`/admin/jobs/${j.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-900 hover:text-brand-700" title="Open editor">
              {j.title}
            </a>
            <span className="shrink-0 text-[10px] text-ink-400">{j.country?.name ?? ''}</span>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                j.status === 'published' ? 'bg-emerald-50 text-emerald-700' : j.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-500'
              }`}
            >
              {j.status}
            </span>
            {j.official_url && (
              <a href={j.official_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-ink-300 hover:text-ink-600" title="Original posting">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              onClick={async () => {
                const r = await setSponsoredJobStatus(j.id, j.status === 'published' ? 'draft' : 'published');
                if (!r.ok) window.alert(r.error);
                onChange();
              }}
              className="shrink-0 rounded border border-ink-200 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600 hover:bg-ink-50"
            >
              {j.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
            <button
              onClick={async () => {
                if (!window.confirm(`Delete "${j.title}"?`)) return;
                const r = await deleteSponsoredJob(j.id);
                if (!r.ok) window.alert(r.error);
                onChange();
              }}
              className="shrink-0 text-ink-300 hover:text-rose-600"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {shown.length > limit && (
          <button onClick={() => setLimit((l) => l + 200)} className="w-full py-2 text-[11px] font-semibold text-brand-700 hover:bg-ink-50">
            Show more ({shown.length - limit} more)
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BulkAddCompanies({ busy, onRun }: { busy: boolean; onRun: (lines: ReturnType<typeof parseSourceList>['ok'], importNow: boolean) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [importNow, setImportNow] = useState(true);
  const parsed = useMemo(() => parseSourceList(text), [text]);

  return (
    <div className="mt-4 rounded-lg border border-ink-200">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-xs font-bold text-ink-800">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Add many companies at once
        <span className="font-normal text-ink-400">— paste a list, one per line</span>
      </button>
      {open && (
        <div className="border-t border-ink-100 p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={'Netflix, Inc. | https://jobs.netflix.com/\nNVIDIA Corporation | https://www.nvidia.com/en-us/about-nvidia/careers/\nStripe, Inc. | stripe\nFigma | https://boards.greenhouse.io/figma'}
            className="w-full rounded-md border border-ink-200 p-2 font-mono text-[11px] outline-none focus:border-brand-500"
          />
          <p className="mt-1 text-[11px] text-ink-500">
            Format: <code>Company name | careers URL</code> or <code>Company name | greenhouse-token</code>. Separators <code>|</code>, tab, or comma all work.
            {text.trim() && (
              <>
                {' '}
                <strong className="text-ink-800">{parsed.ok.length} ready</strong>
                {parsed.ok.filter((l) => l.kind === 'greenhouse').length ? ` (${parsed.ok.filter((l) => l.kind === 'greenhouse').length} Greenhouse)` : ''}
                {parsed.bad.length ? <span className="text-rose-600"> · {parsed.bad.length} lines not understood</span> : ''}
              </>
            )}
          </p>
          {parsed.bad.length > 0 && <p className="mt-1 line-clamp-3 text-[11px] text-rose-600">Couldn't read: {parsed.bad.join(' · ')}</p>}
          <div className="mt-2 flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-ink-600">
              <input type="checkbox" checked={importNow} onChange={(e) => setImportNow(e.target.checked)} />
              Import their jobs right away (to pending)
            </label>
            <button
              disabled={busy || parsed.ok.length === 0}
              onClick={async () => {
                await onRun(parsed.ok, importNow);
                setText('');
              }}
              className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Add {parsed.ok.length || ''} {parsed.ok.length === 1 ? 'company' : 'companies'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
