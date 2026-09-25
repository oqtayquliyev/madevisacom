import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Globe, Loader2, Search, Sparkles, Square, X } from 'lucide-react';
import type { PendingPublisher, ImportCountryLookup } from '@/lib/admin';
import { syncImportSource, type ImportSource } from '@/lib/importSync';
import {
  addFoundCompany,
  companyDetails,
  coreName,
  hostOf,
  listCountryCompanies,
  lookupCompanies,
  makeCompanyLogo,
  probeCompany,
  proveCareerSource,
  WAVES,
  type CareerCandidate,
  type FoundCompany,
  type ProvenSource,
  type RankedCompany,
} from '@/lib/companyFinder';

/**
 * Admin → Import & sync → "Find new companies".
 *  1. Get companies: the largest in a country (Wikidata), or look up names
 *     you paste (e.g. from a visa sponsor register or a stock index).
 *  2. For each new company, find its career page and prove it with the
 *     real importer — only pages that return jobs count.
 *  3. Review, edit names, tick, and add. Logos become 128×128 squares.
 * Companies already on MadeVisa are shown but never changed.
 */

type RowState = 'existing' | 'queued' | 'searching' | 'found' | 'notfound' | 'error' | 'added' | 'failed';
type Row = {
  key: string;
  company: FoundCompany;
  name: string;
  state: RowState;
  note?: string;
  /** Why nothing was found: the site had no career page with jobs, or it didn't let us in. */
  reason?: 'nopage' | 'blocked';
  deepTried?: boolean;
  icons: string[];
  proven: ProvenSource | null;
  selected: boolean;
};

const CONCURRENCY = 3;
const PROGRESS_KEY = 'madevisa:companyFinder:progress';

type Filter = 'all' | 'found' | 'nopage' | 'blocked' | 'existing' | 'added';

/** How far down each country's list you've checked, remembered on this device. */
function readProgress(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function saveProgress(country: string, upTo: number) {
  try {
    const p = readProgress();
    p[country] = Math.max(p[country] ?? 0, upTo);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* optional */
  }
}
const COUNTRY_NAME = Object.fromEntries(WAVES.flatMap((w) => w.countries.map((c) => [c.code, c])));

function fmtEmployees(n: number | null) {
  if (!n) return null;
  return n >= 1000 ? `${Math.round(n / 1000).toLocaleString()}k employees` : `${n} employees`;
}

export function FindCompaniesPanel({
  publishers,
  sources,
  countries,
  onChange,
}: {
  publishers: PendingPublisher[];
  sources: ImportSource[];
  countries: ImportCountryLookup[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<'country' | 'names'>('country');
  const [country, setCountry] = useState('DE');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [names, setNames] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'searching' | 'adding' | 'importing'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importNow, setImportNow] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  // Each country's full ranked list (ids only), so paging is exact and the total is known.
  const [ranked, setRanked] = useState<Record<string, RankedCompany[]>>({});
  const [loadedCountry, setLoadedCountry] = useState<string | null>(null);
  const [progress, setProgressState] = useState<Record<string, number>>(() => readProgress());
  const stop = useRef(false);
  const busy = phase !== 'idle';

  // What's already on MadeVisa: names, websites and source hosts.
  const existing = useMemo(() => {
    const namesSet = new Set(publishers.map((p) => coreName(p.name)).filter(Boolean));
    const hosts = new Set(publishers.map((p) => hostOf(p.website)).filter(Boolean));
    for (const s of sources) {
      const h = hostOf(s.source_url);
      if (h && !/greenhouse|lever|ashby|smartrecruiters|myworkday/.test(h)) hosts.add(h);
    }
    return { namesSet, hosts };
  }, [publishers, sources]);

  const isExisting = (c: FoundCompany) => existing.namesSet.has(coreName(c.name)) || (c.domain && existing.hosts.has(c.domain));

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const loadCompanies = async (start = 0) => {
    setError(null);
    setMessage(null);
    setFilter('all');
    stop.current = false;
    setPhase('loading');
    let found: FoundCompany[] = [];
    const missing: string[] = [];
    try {
      if (mode === 'country') {
        let list = ranked[country];
        if (!list) {
          setMessage(`Getting ${COUNTRY_NAME[country]?.name}’s companies from Wikidata…`);
          list = await listCountryCompanies(country);
          setRanked((r) => ({ ...r, [country]: list! }));
        }
        const from = Math.min(Math.max(start, 0), Math.max(list.length - 1, 0));
        const slice = list.slice(from, from + limit);
        setMessage(`Loading companies #${from + 1}–${from + slice.length} of ${list.length.toLocaleString()}…`);
        found = slice.length ? await companyDetails(slice.map((c) => c.qid)) : [];
        setOffset(from);
        setLoadedCountry(country);
        if (slice.length) {
          saveProgress(country, from + slice.length);
          setProgressState(readProgress());
        }
      } else {
        const list = [...new Set(names.split(/\r?\n/).map((n) => n.trim()).filter(Boolean))].slice(0, 200);
        for (let i = 0; i < list.length; i += 25) {
          if (stop.current) break;
          setMessage(`Looking up ${Math.min(i + 25, list.length)} of ${list.length} names…`);
          const res = await lookupCompanies(list.slice(i, i + 25));
          for (const r of res) {
            if (r.match) found.push(r.match);
            else missing.push(r.query);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load companies.');
      setMessage(null);
      setPhase('idle');
      return;
    }
    const seen = new Set<string>();
    const newRows: Row[] = found
      .filter((c) => (seen.has(c.qid) ? false : (seen.add(c.qid), true)))
      .map((c) => ({ key: c.qid, company: c, name: c.name, state: isExisting(c) ? 'existing' : 'queued', icons: [], proven: null, selected: false }));
    setRows(newRows);
    if (!newRows.length) {
      setMessage(mode === 'country' ? 'None of these companies has a website on Wikidata — go to the next ones.' : 'No companies found.');
      setPhase('idle');
      return;
    }
    const fresh = newRows.filter((r) => r.state === 'queued').length;
    setMessage(
      `${newRows.length} companies · ${fresh} new · ${newRows.length - fresh} already on MadeVisa${missing.length ? ` · not found on Wikidata: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}` : ''}`
    );
    await searchCareerPages(newRows.filter((r) => r.state === 'queued'));
  };

  const searchCareerPages = async (queue: Row[], deep = false) => {
    if (!queue.length) {
      setPhase('idle');
      return;
    }
    stop.current = false;
    setPhase('searching');
    if (deep) for (const r of queue) patch(r.key, { state: 'queued', note: 'Waiting for a deeper search…' });
    let next = 0;
    await Promise.all(
      Array.from({ length: deep ? 2 : CONCURRENCY }, async () => {
        while (next < queue.length && !stop.current) {
          const r = queue[next++];
          patch(r.key, { state: 'searching', note: deep ? 'Searching deeper: other addresses, Workday…' : 'Reading website…' });
          try {
            const p = await probeCompany(r.company.name, r.company.website, deep);
            patch(r.key, {
              icons: p.icons.length && !(deep && r.icons.length > p.icons.length) ? p.icons : r.icons,
              note: p.candidates.length ? `Checking ${p.candidates.length} possible career page${p.candidates.length === 1 ? '' : 's'}…` : undefined,
            });
            const proven = p.candidates.length
              ? await proveCareerSource(p.candidates, (c: CareerCandidate) => patch(r.key, { note: `Trying ${c.platform ?? hostOf(c.url)}…` }))
              : null;
            const reason = proven ? undefined : p.websiteReachable ? 'nopage' : 'blocked';
            patch(r.key, {
              state: proven ? 'found' : 'notfound',
              proven,
              reason,
              deepTried: r.deepTried || deep,
              // Pre-select only pages linked from the company's site or matching its name.
              selected: Boolean(proven && proven.confidence !== 'low'),
              note: proven
                ? undefined
                : reason === 'nopage'
                  ? deep ? 'Still no career page with jobs' : 'No career page with jobs found'
                  : deep ? 'Website still blocks us' : 'Website didn’t load',
            });
          } catch (e) {
            patch(r.key, { state: 'error', reason: 'nopage', note: e instanceof Error ? e.message : 'Search failed' });
          }
        }
      })
    );
    setPhase('idle');
  };

  const addSelected = async () => {
    const chosen = rows.filter((r) => r.selected && r.proven && r.state === 'found');
    if (!chosen.length) return;
    setError(null);
    setPhase('adding');
    const created: ImportSource[] = [];
    const rowOf = new Map<string, string>(); // source id → row key
    let failed = 0;
    for (let i = 0; i < chosen.length; i++) {
      if (stop.current) break;
      const r = chosen[i];
      setMessage(`Adding ${i + 1} of ${chosen.length}: ${r.name}`);
      const logoUrl = r.icons.length ? await makeCompanyLogo(r.icons, r.name).catch(() => null) : null;
      const countryId = countries.find((c) => c.iso_code === (r.company.country ?? (mode === 'country' ? country : '')))?.id ?? null;
      const res = await addFoundCompany({ name: r.name, website: r.company.website, countryId, logoUrl }, r.proven!);
      if (res.ok) {
        created.push(res.source);
        rowOf.set(res.source.id, r.key);
        patch(r.key, { state: 'added', selected: false, note: logoUrl ? 'Added with logo' : 'Added — no square logo found' });
      } else {
        failed++;
        patch(r.key, { state: 'failed', note: res.error });
      }
    }
    if (importNow && created.length && !stop.current) {
      setPhase('importing');
      let next = 0;
      let done = 0;
      // What each running import is doing — big companies (1,000+ jobs) take several minutes.
      const live = new Map<string, string>();
      const show = () =>
        setMessage(`Importing jobs: ${done} of ${created.length} companies done${live.size ? ` — ${[...live.values()].join(' · ')}` : ''}`);
      show();
      await Promise.all(
        Array.from({ length: 2 }, async () => {
          while (next < created.length && !stop.current) {
            const src = created[next++];
            const key = rowOf.get(src.id);
            const name = src.publisher?.name ?? 'Company';
            live.set(src.id, `${name}: starting…`);
            show();
            if (key) patch(key, { note: 'Importing jobs…' });
            const res = await syncImportSource(src, {
              countries,
              removal: 'expire',
              refreshContent: false,
              shouldStop: () => stop.current,
              onProgress: (m) => {
                live.set(src.id, m.replace(/…$/, ''));
                show();
              },
            });
            live.delete(src.id);
            done++;
            if (key) patch(key, { note: res.summary.added ? `Added with ${res.summary.added.toLocaleString()} jobs (pending)` : res.summary.error ? `Added — import: ${res.summary.error}` : 'Added — no new jobs imported' });
            show();
          }
        })
      );
    }
    setMessage(`Added ${created.length} compan${created.length === 1 ? 'y' : 'ies'}${failed ? ` · ${failed} failed` : ''}${importNow && created.length ? ' · jobs imported to pending' : ''}.`);
    setPhase('idle');
    onChange();
  };

  const matches = (r: Row, f: Filter) =>
    f === 'all'
      ? r.state !== 'existing'
      : f === 'found'
        ? r.state === 'found'
        : f === 'nopage'
          ? (r.state === 'notfound' || r.state === 'error') && r.reason !== 'blocked'
          : f === 'blocked'
            ? r.state === 'notfound' && r.reason === 'blocked'
            : f === 'existing'
              ? r.state === 'existing'
              : r.state === 'added' || r.state === 'failed';
  const visible = rows.filter((r) => matches(r, filter));
  const counts = {
    existing: rows.filter((r) => r.state === 'existing').length,
    searching: rows.filter((r) => r.state === 'queued' || r.state === 'searching').length,
    found: rows.filter((r) => r.state === 'found').length,
    nopage: rows.filter((r) => matches(r, 'nopage')).length,
    blocked: rows.filter((r) => matches(r, 'blocked')).length,
    added: rows.filter((r) => r.state === 'added').length,
    selected: rows.filter((r) => r.selected && r.state === 'found').length,
  };
  const totalNew = rows.length - counts.existing;
  const doneShare = totalNew ? (totalNew - counts.searching) / totalNew : 0;
  const notFoundRows = rows.filter((r) => (r.state === 'notfound' || r.state === 'error') && !r.deepTried);

  // Paging through the country's list.
  const list = ranked[country];
  const total = list?.length ?? null;
  const onThisCountry = mode === 'country' && loadedCountry === country;
  const checkedUpTo = progress[country] ?? 0;
  const nextStart = onThisCountry ? offset + limit : checkedUpTo;
  const atEnd = total != null && nextStart >= total;
  const range = (from: number) => `#${(from + 1).toLocaleString()}–${(total != null ? Math.min(from + limit, total) : from + limit).toLocaleString()}`;
  const cname = COUNTRY_NAME[country]?.name ?? country;

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-ink-200 bg-white">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink-950">Find new companies</h2>
          <p className="text-xs text-ink-500">Legal names, square logos and proven career pages — country by country. Existing companies are never changed.</p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-ink-400" /> : <ChevronRight className="h-4 w-4 text-ink-400" />}
      </button>

      {open && (
        <div className="border-t border-ink-100 px-5 pb-5 pt-4">
          {/* Mode */}
          <div className="inline-flex rounded-lg bg-ink-100 p-0.5 text-xs font-semibold">
            {(['country', 'names'] as const).map((m) => (
              <button
                key={m}
                disabled={busy}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 ${mode === m ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}
              >
                {m === 'country' ? 'Largest companies by country' : 'Paste company names'}
              </button>
            ))}
          </div>

          {mode === 'country' ? (
            <div className="mt-4 space-y-3">
              {WAVES.map((w) => (
                <div key={w.label} className="flex flex-wrap items-center gap-1.5">
                  <span className={`w-16 shrink-0 text-[10px] font-bold uppercase tracking-wider ${w.label === 'Wave 1' ? 'text-brand-700' : 'text-ink-400'}`}>{w.label}</span>
                  {w.countries.map((c) => (
                    <button
                      key={c.code}
                      disabled={busy}
                      onClick={() => {
                        setCountry(c.code);
                        setRows([]);
                        setMessage(null);
                        setError(null);
                      }}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                        country === c.code ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300'
                      }`}
                    >
                      {c.flag} {c.name}
                    </button>
                  ))}
                </div>
              ))}
              <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select value={limit} disabled={busy} onChange={(e) => setLimit(Number(e.target.value))} className="h-10 rounded-md border border-ink-200 bg-white px-2 text-sm">
                    {[25, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n} at a time
                      </option>
                    ))}
                  </select>
                  {onThisCountry && offset > 0 && (
                    <button
                      disabled={busy}
                      onClick={() => loadCompanies(Math.max(offset - limit, 0))}
                      className="flex h-10 items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" /> {range(Math.max(offset - limit, 0))}
                    </button>
                  )}
                  <button
                    disabled={busy || atEnd}
                    onClick={() => loadCompanies(nextStart)}
                    className="flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Search className="h-4 w-4" />
                    {atEnd
                      ? `End of ${cname}’s list`
                      : onThisCountry
                        ? `Next in ${cname}: ${range(nextStart)}`
                        : checkedUpTo > 0
                          ? `Continue in ${cname}: ${range(checkedUpTo)}`
                          : `Find in ${cname}: ${range(0)}`}
                    {!atEnd && <ArrowRight className="h-4 w-4" />}
                  </button>
                  {!onThisCountry && checkedUpTo > 0 && (
                    <button disabled={busy} onClick={() => loadCompanies(0)} className="text-xs font-semibold text-ink-500 underline decoration-ink-300 underline-offset-2 hover:text-ink-800">
                      or start again from #1
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-ink-500">
                  {total != null ? (
                    <>
                      <strong className="text-ink-800">{total.toLocaleString()}</strong> companies in {cname} have a website on Wikidata, biggest first.{' '}
                      {onThisCountry && (
                        <>
                          Showing <strong className="text-ink-800">{range(offset)}</strong>.{' '}
                        </>
                      )}
                      {checkedUpTo > 0 && (
                        <>
                          Checked so far: #1–{Math.min(checkedUpTo, total).toLocaleString()} · <strong className="text-ink-800">{Math.max(total - checkedUpTo, 0).toLocaleString()}</strong> left.
                        </>
                      )}
                    </>
                  ) : checkedUpTo > 0 ? (
                    <>You’ve checked {cname}’s companies #1–{checkedUpTo.toLocaleString()} on this device. The total shows after the first search.</>
                  ) : (
                    <>Companies come from Wikidata, biggest first. The total for {cname} shows after the first search.</>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <textarea
                value={names}
                disabled={busy}
                onChange={(e) => setNames(e.target.value.slice(0, 20000))}
                rows={5}
                placeholder={'One company per line, e.g.\nBayer\nASML\nPhilips\nUnilever'}
                className="w-full rounded-md border border-ink-200 p-2.5 text-sm outline-none focus:border-brand-500"
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  disabled={busy || !names.trim()}
                  onClick={() => loadCompanies(0)}
                  className="flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Search className="h-4 w-4" /> Look up
                </button>
                <span className="text-xs text-ink-400">Up to 200 names; each is matched on Wikidata to get its legal name and website.</span>
              </div>
            </div>
          )}

          {error && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}

          {/* Status */}
          {(rows.length > 0 || phase === 'loading' || message) && (
            <div className="mt-5 rounded-lg border border-ink-200 bg-ink-50/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                {busy && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />}
                <span className="font-semibold text-ink-900">{message ?? (phase === 'loading' ? 'Loading companies…' : '')}</span>
                {busy && (
                  <button onClick={() => (stop.current = true)} className="ml-auto flex items-center gap-1 font-semibold text-ink-500 hover:text-ink-900">
                    <Square className="h-3 w-3 fill-current" /> Stop
                  </button>
                )}
              </div>
              {rows.length > 0 && (
                <>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-200">
                    <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${doneShare * 100}%` }} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        ['all', 'All new', totalNew],
                        ['found', 'Career page found', counts.found],
                        ['nopage', 'No career page with jobs', counts.nopage],
                        ['blocked', 'Website didn’t load', counts.blocked],
                        ['added', 'Added', counts.added],
                        ['existing', 'Already on MadeVisa', counts.existing],
                      ] as [Filter, string, number][]
                    )
                      .filter(([f, , n]) => f === 'all' || n > 0)
                      .map(([f, label, n]) => (
                        <button
                          key={f}
                          onClick={() => setFilter(f)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            filter === f ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
                          }`}
                        >
                          {label} <span className={filter === f ? 'text-white/70' : 'text-ink-400'}>{n}</span>
                        </button>
                      ))}
                    {counts.searching > 0 && <span className="ml-1 text-[11px] text-ink-500">{counts.searching} still searching</span>}
                  </div>
                  {!busy && notFoundRows.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-200 pt-3">
                      <button
                        onClick={() => {
                          const pick = filter === 'nopage' || filter === 'blocked' ? notFoundRows.filter((r) => matches(r, filter)) : notFoundRows;
                          void searchCareerPages(pick, true);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100"
                      >
                        <Search className="h-3.5 w-3.5" /> Search deeper for{' '}
                        {filter === 'nopage' || filter === 'blocked' ? notFoundRows.filter((r) => matches(r, filter)).length : notFoundRows.length} not found
                      </button>
                      <span className="text-[11px] text-ink-500">
                        Tries the site with and without www, more careers addresses, careers sites like tesco-careers.com, and Workday boards named after the company. Slower — about 20–40 seconds each.
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Results */}
          {visible.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-ink-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="w-8 px-3 py-2" />
                    <th className="px-2 py-2">Company</th>
                    <th className="px-2 py-2">Career page</th>
                    <th className="w-24 px-2 py-2">Jobs</th>
                    <th className="w-28 px-3 py-2">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {visible.map((r) => (
                    <ResultRow key={r.key} row={r} busy={busy} onPatch={(p) => patch(r.key, p)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add */}
          {rows.some((r) => r.state === 'found') && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                disabled={busy || counts.selected === 0}
                onClick={addSelected}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {phase === 'adding' || phase === 'importing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Add {counts.selected} selected
              </button>
              <label className="flex items-center gap-1.5 text-xs text-ink-600">
                <input type="checkbox" checked={importNow} onChange={(e) => setImportNow(e.target.checked)} /> Import their jobs now (to pending)
              </label>
              <span className="text-[11px] text-ink-400">Low-confidence matches (found by guessing the name) aren’t ticked — check them first.</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ResultRow({ row: r, busy, onPatch }: { row: Row; busy: boolean; onPatch: (p: Partial<Row>) => void }) {
  const canSelect = r.state === 'found' && !busy;
  const muted = r.state === 'existing' || r.state === 'added';
  const conf = r.proven?.confidence;
  return (
    <tr className={muted ? 'bg-ink-50/60 text-ink-400' : ''}>
      <td className="px-3 py-2.5 align-top">
        <input type="checkbox" disabled={!canSelect} checked={r.selected && r.state === 'found'} onChange={(e) => onPatch({ selected: e.target.checked })} className="mt-1.5" />
      </td>
      <td className="px-2 py-2.5 align-top">
        <div className="flex items-start gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded border border-ink-100 bg-white">
            {r.icons[0] ? (
              <img src={r.icons[0]} alt="" className="h-full w-full object-contain p-0.5" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
            ) : (
              <Building2 className="h-4 w-4 text-ink-300" />
            )}
          </span>
          <div className="min-w-0">
            {r.state === 'found' || r.state === 'notfound' || r.state === 'error' ? (
              <input
                value={r.name}
                maxLength={120}
                disabled={busy}
                onChange={(e) => onPatch({ name: e.target.value })}
                className="w-56 rounded border border-transparent px-1 py-0.5 font-semibold text-ink-950 hover:border-ink-200 focus:border-brand-500 focus:outline-none"
              />
            ) : (
              <p className="px-1 py-0.5 font-semibold">{r.name}</p>
            )}
            <p className="flex flex-wrap items-center gap-x-2 px-1 text-[11px] text-ink-400">
              <a href={r.company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 hover:text-brand-700">
                <Globe className="h-3 w-3" /> {r.company.domain}
              </a>
              {r.company.wikiTitle && (
                <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(r.company.wikiTitle.replace(/ /g, '_'))}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-700">
                  Wikipedia
                </a>
              )}
              {fmtEmployees(r.company.employees) && <span>{fmtEmployees(r.company.employees)}</span>}
              {r.company.industry && <span className="truncate">{r.company.industry}</span>}
            </p>
          </div>
        </div>
      </td>
      <td className="max-w-[260px] px-2 py-2.5 align-top text-xs">
        {r.state === 'existing' ? (
          <span>Already on MadeVisa</span>
        ) : r.proven ? (
          <a href={r.proven.kind === 'greenhouse' ? `https://boards.greenhouse.io/${r.proven.token}` : r.proven.url} target="_blank" rel="noopener noreferrer" className="group block">
            <span className="font-semibold text-ink-800">{r.proven.platform ?? 'Careers site'}</span>
            <span className="flex items-center gap-1 truncate text-ink-500 group-hover:text-brand-700">
              {hostOf(r.proven.url)}
              {new URL(r.proven.url).pathname.length > 1 ? new URL(r.proven.url).pathname.slice(0, 40) : ''}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </span>
          </a>
        ) : r.state === 'queued' || r.state === 'searching' ? (
          <span className="flex items-center gap-1.5 text-ink-500">
            {r.state === 'searching' && <Loader2 className="h-3 w-3 animate-spin" />}
            {r.note ?? 'Waiting…'}
          </span>
        ) : (
          <span className={r.state === 'failed' || r.state === 'error' ? 'text-rose-600' : 'text-ink-400'}>{r.note ?? '—'}</span>
        )}
        {(r.state === 'added' || r.state === 'failed') && r.note && <p className={r.state === 'failed' ? 'text-rose-600' : 'text-emerald-700'}>{r.note}</p>}
      </td>
      <td className="px-2 py-2.5 align-top font-slab text-base font-bold tabular-nums text-ink-950">
        {r.proven ? (
          <>
            {r.proven.jobs.toLocaleString()}
            {r.proven.more ? '+' : ''}
          </>
        ) : (
          <span className="text-ink-300">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        {r.state === 'added' ? (
          <span className="flex items-center gap-1 text-xs font-bold text-brand-700">
            <Check className="h-3.5 w-3.5" /> Added
          </span>
        ) : conf ? (
          <span
            title={
              conf === 'high' ? 'Linked from the company’s own website' : conf === 'medium' ? 'Job board name matches the company' : 'Found by guessing the name — check it belongs to this company'
            }
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
              conf === 'high' ? 'bg-emerald-50 text-emerald-700' : conf === 'medium' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {conf === 'high' ? 'From website' : conf === 'medium' ? 'Name match' : 'Check'}
          </span>
        ) : r.state === 'notfound' || r.state === 'error' ? (
          <X className="h-4 w-4 text-ink-300" />
        ) : null}
      </td>
    </tr>
  );
}
