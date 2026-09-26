import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Building2, Check, ExternalLink, Globe, Loader2, Trash2, Zap } from 'lucide-react';
import type { ImportCountryLookup } from '@/lib/admin';
import { addFoundCompany, hostOf, makeCompanyLogo, proveCareerSource, WAVES, type ProvenSource } from '@/lib/companyFinder';
import {
  deleteCompanyLead,
  fetchCompanyLeads,
  leadsTableMissing,
  leadToCompany,
  LEAD_REASON_LABEL,
  type CompanyLead,
  type LeadReason,
} from '@/lib/companyLeads';
import { importDetectPublish } from '@/lib/autoPipeline';

const COUNTRY = Object.fromEntries(WAVES.flatMap((w) => w.countries.map((c) => [c.code, c])));
const PAGE = 50;

type RowState = { status: 'idle' | 'checking' | 'found' | 'notfound' | 'adding' | 'added' | 'failed'; proven?: ProvenSource | null; note?: string };

/**
 * Import Center → companies the finder couldn't place (no career page with
 * jobs, website didn't load, unsure match). Paste the career page, check it,
 * then add the company with its jobs — published directly if you like.
 */
export function CompanyLeadsSection({ countries, onChange }: { countries: ImportCountryLookup[]; onChange: () => void }) {
  const [leads, setLeads] = useState<CompanyLead[] | null>(null);
  const [country, setCountry] = useState('all');
  const [reason, setReason] = useState<'all' | LeadReason>('all');
  const [noLogo, setNoLogo] = useState(false);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [state, setState] = useState<Record<string, RowState>>({});
  const [publish, setPublish] = useState(true);
  const [open, setOpen] = useState(true);

  const load = () => fetchCompanyLeads().then(setLeads);
  useEffect(() => {
    void load();
  }, []);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads ?? []) m.set(l.country_code ?? '—', (m.get(l.country_code ?? '—') ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (leads ?? []).filter(
      (l) =>
        (country === 'all' || (l.country_code ?? '—') === country) &&
        (reason === 'all' || l.reason === reason) &&
        (!noLogo || !l.icons?.length) &&
        (!s || l.name.toLowerCase().includes(s) || (l.domain ?? '').includes(s))
    );
  }, [leads, country, reason, noLogo, q]);

  const set = (id: string, p: RowState) => setState((st) => ({ ...st, [id]: { ...st[id], ...p } }));

  const check = async (l: CompanyLead, raw: string) => {
    const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
    try {
      new URL(url);
    } catch {
      return set(l.id, { status: 'notfound', note: 'That doesn’t look like a web address.' });
    }
    set(l.id, { status: 'checking', note: `Checking ${hostOf(url)}…` });
    const proven = await proveCareerSource([{ kind: 'careers_url', url, platform: null, evidence: 'website', jobs: null }]).catch(() => null);
    set(l.id, proven ? { status: 'found', proven, note: undefined } : { status: 'notfound', proven: null, note: 'No jobs found there — try the page that lists the jobs.' });
  };

  const add = async (l: CompanyLead) => {
    const proven = state[l.id]?.proven;
    if (!proven) return;
    set(l.id, { status: 'adding', note: 'Adding company…' });
    const logoUrl = l.icons?.length ? await makeCompanyLogo(l.icons, l.name).catch(() => null) : null;
    const countryId = countries.find((c) => c.iso_code === l.country_code)?.id ?? null;
    const res = await addFoundCompany({ name: l.name, website: l.website ?? `https://${l.domain ?? ''}`, countryId, logoUrl }, { ...proven, confidence: 'high' });
    if (!res.ok) return set(l.id, { status: 'failed', note: res.error });
    const pipe = await importDetectPublish([res.source], { countries, publish, onProgress: (m) => set(l.id, { status: 'adding', note: m }) });
    await deleteCompanyLead(l.id);
    set(l.id, {
      status: 'added',
      note: publish ? `Added · ${pipe.published.toLocaleString()} jobs published` : `Added · ${pipe.imported.toLocaleString()} jobs to pending`,
    });
    onChange();
  };

  const remove = async (l: CompanyLead) => {
    if (!window.confirm(`Remove ${l.name} from this list?`)) return;
    await deleteCompanyLead(l.id);
    setLeads((ls) => (ls ?? []).filter((x) => x.id !== l.id));
  };

  if (leads === null) return null;

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-amber-200 bg-white">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 bg-amber-50/60 px-5 py-3.5 text-left">
        <Bookmark className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-ink-950">
            Waiting for a career page <span className="text-ink-400">· {leads.length.toLocaleString()} companies</span>
          </h3>
          <p className="text-xs text-ink-500">From “Find new companies”: no career page with jobs, website didn’t load, or an unsure match. Paste the career page, check it, add.</p>
        </div>
        <span className="text-xs font-semibold text-ink-500">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-4">
          {leadsTableMissing() ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Run the <code>20261015090000_company_leads.sql</code> migration in Supabase to keep these companies.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search company…"
                  className="h-8 w-52 rounded-md border border-ink-200 px-2 text-xs outline-none focus:border-brand-500"
                />
                <select value={country} onChange={(e) => setCountry(e.target.value)} className="h-8 rounded-md border border-ink-200 px-1.5 text-xs">
                  <option value="all">All countries</option>
                  {byCountry.map(([c, n]) => (
                    <option key={c} value={c}>
                      {COUNTRY[c]?.flag ?? ''} {COUNTRY[c]?.name ?? c} ({n})
                    </option>
                  ))}
                </select>
                <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className="h-8 rounded-md border border-ink-200 px-1.5 text-xs">
                  <option value="all">Any reason</option>
                  {(Object.keys(LEAD_REASON_LABEL) as LeadReason[]).map((r) => (
                    <option key={r} value={r}>
                      {LEAD_REASON_LABEL[r]}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-ink-600">
                  <input type="checkbox" checked={noLogo} onChange={(e) => setNoLogo(e.target.checked)} /> No logo only
                </label>
                <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish jobs directly when adding
                </label>
              </div>

              {visible.length === 0 ? (
                <p className="mt-4 text-sm text-ink-400">{leads.length ? 'Nothing matches these filters.' : 'Nothing waiting — companies the finder can’t place will appear here.'}</p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-lg border border-ink-200">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                      <tr>
                        <th className="px-3 py-2">Company</th>
                        <th className="px-2 py-2">Why</th>
                        <th className="px-2 py-2">Career page link</th>
                        <th className="w-36 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {visible.slice(0, shown).map((l) => (
                        <LeadRow key={l.id} lead={l} st={state[l.id] ?? { status: 'idle' }} onCheck={(u) => check(l, u)} onAdd={() => add(l)} onRemove={() => remove(l)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {visible.length > shown && (
                <button onClick={() => setShown((n) => n + PAGE)} className="mt-3 w-full rounded-lg border border-ink-200 py-2 text-xs font-semibold text-brand-700 hover:bg-ink-50">
                  Show more ({(visible.length - shown).toLocaleString()} more)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function LeadRow({ lead: l, st, onCheck, onAdd, onRemove }: { lead: CompanyLead; st: RowState; onCheck: (url: string) => void; onAdd: () => void; onRemove: () => void }) {
  const [url, setUrl] = useState(l.candidate_url ?? '');
  const c = leadToCompany(l);
  const busy = st.status === 'checking' || st.status === 'adding';
  return (
    <tr className={st.status === 'added' ? 'bg-emerald-50/50' : ''}>
      <td className="px-3 py-2.5 align-top">
        <div className="flex items-start gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded border border-ink-100 bg-white">
            {l.icons?.[0] ? <img src={l.icons[0]} alt="" className="h-full w-full object-contain p-0.5" /> : <Building2 className="h-4 w-4 text-ink-300" />}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink-950">
              {COUNTRY[l.country_code ?? '']?.flag ?? ''} {l.name}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-400">
              {c.website && (
                <a href={c.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 hover:text-brand-700">
                  <Globe className="h-3 w-3" /> {l.domain ?? hostOf(c.website)}
                </a>
              )}
              {l.employees ? <span>{l.employees.toLocaleString()} employees</span> : null}
              {l.industry && <span className="truncate">{l.industry}</span>}
            </p>
          </div>
        </div>
      </td>
      <td className="max-w-[200px] px-2 py-2.5 align-top text-xs">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${l.reason === 'lowconf' ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-600'}`}>{LEAD_REASON_LABEL[l.reason]}</span>
        {l.note && (l.reason === 'lowconf' || l.reason === 'error' || l.reason === 'nojobs') && <p className="mt-1 text-[11px] text-ink-400">{l.note}</p>}
      </td>
      <td className="max-w-[300px] px-2 py-2.5 align-top text-xs">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) onCheck(url);
          }}
          className="flex items-center gap-1"
        >
          <input
            value={url}
            disabled={busy || st.status === 'added'}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste career page link…"
            className="h-7 w-full min-w-0 rounded border border-ink-200 bg-white px-2 text-[11px] text-ink-800 outline-none focus:border-brand-500"
          />
          {url && /^https?:\/\//i.test(url) && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-ink-400 hover:text-brand-700" aria-label="Open link">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button type="submit" disabled={!url.trim() || busy || st.status === 'added'} className="h-7 shrink-0 rounded bg-ink-900 px-2 text-[11px] font-bold text-white hover:bg-ink-700 disabled:opacity-30">
            Check
          </button>
        </form>
        {st.status === 'found' && st.proven && (
          <p className="mt-1 font-semibold text-emerald-700">
            {st.proven.jobs.toLocaleString()}
            {st.proven.more ? '+' : ''} jobs found · {st.proven.platform ?? 'careers site'}
          </p>
        )}
        {st.note && (
          <p className={`mt-1 flex items-center gap-1 ${st.status === 'failed' || st.status === 'notfound' ? 'text-rose-600' : st.status === 'added' ? 'text-emerald-700' : 'text-ink-500'}`}>
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            <span className="truncate">{st.note}</span>
          </p>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="flex items-center justify-end gap-1.5">
          {st.status === 'added' ? (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
              <Check className="h-3.5 w-3.5" /> Added
            </span>
          ) : (
            <>
              <button
                onClick={onAdd}
                disabled={st.status !== 'found'}
                className="flex items-center gap-1 whitespace-nowrap rounded-md bg-brand-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-brand-700 disabled:opacity-30"
              >
                <Zap className="h-3.5 w-3.5" /> Add &amp; sync
              </button>
              <button onClick={onRemove} disabled={busy} className="rounded-md p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove from list">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
