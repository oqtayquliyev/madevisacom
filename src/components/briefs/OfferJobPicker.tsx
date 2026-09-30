import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { FileDown, FileSignature } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { jobPath } from '@/lib/jobUrl';
import { getRecentlyViewedJobs, type ViewedJobSnapshot } from '@/lib/viewedJobs';
import { briefPath, fetchMyBriefs, newOfferPath } from '@/lib/briefs';
import { briefCountries, uuidFromBoardId } from '@/lib/sponsorOffer';
import { visaGuideByCode } from '@/data/visa';
import { CircleFlag } from '@/components/common/CircleFlag';
import { OfferFlags } from '@/components/briefs/OfferBits';

type Row = ViewedJobSnapshot & { uuid: string; ok: boolean; offer: string | null };

/**
 * "Your last visited jobs" → one tap to "Prepare PDF to apply".
 * Jobs in supported countries first; jobs with an offer open it instead.
 */
export function OfferJobPicker({ limit = 6, onAuth, title = 'Your last visited jobs' }: { limit?: number; onAuth?: (p: 'login' | 'register') => void; title?: string }) {
  const { user } = useAuth();
  const [offers, setOffers] = useState<Map<string, string>>(new Map());
  const viewed = useMemo(() => (user ? getRecentlyViewedJobs() : []), [user]);

  useEffect(() => {
    if (!user) return;
    fetchMyBriefs().then((list) => setOffers(new Map((list ?? []).filter((b) => b.job_id).map((b) => [b.job_id as string, b.share_id]))));
  }, [user]);

  const rows: Row[] = viewed
    .map((v) => {
      const uuid = uuidFromBoardId(v.id);
      return uuid ? { ...v, uuid, ok: briefCountries.has((v.countryCode ?? '').toUpperCase()), offer: offers.get(uuid) ?? null } : null;
    })
    .filter((r): r is Row => Boolean(r))
    .sort((a, b) => Number(b.ok) - Number(a.ok))
    .slice(0, limit);

  const go = (href: string) => (e: MouseEvent) => {
    e.preventDefault();
    nav(href);
  };

  if (!user) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl bg-white p-5 ring-1 ring-ink-200 sm:flex-row sm:items-center">
        <OfferFlags size={26} />
        <p className="min-w-0 flex-1 text-[15px] font-semibold text-ink-900">Sign up and get 5 offers free.</p>
        <button onClick={() => onAuth?.('register')} className="rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800">
          Create free account
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="picker-title">
      <h2 id="picker-title" className="text-[17px] font-bold text-ink-950">
        {title}
      </h2>
      {rows.length === 0 ? (
        <div className="mt-3 flex flex-col items-start gap-3 rounded-xl border border-dashed border-ink-300 bg-white p-5 sm:flex-row sm:items-center">
          <OfferFlags size={24} />
          <p className="min-w-0 flex-1 text-[14px] text-ink-600">Open a job in one of these countries, then come back.</p>
          <a href="/jobs" onClick={go('/jobs')} className="rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800">
            Browse jobs
          </a>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-xl bg-white ring-1 ring-ink-200">
          {rows.map((r) => {
            const job = jobPath({ id: r.id, title: r.title, company: r.organization });
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <CircleFlag countryCode={r.countryCode} label={r.country} size={24} />
                <a href={job} onClick={go(job)} className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink-900 hover:text-[#1D4ED8]">{r.title}</span>
                  <span className="block truncate text-[12px] text-ink-500">
                    {r.organization}
                    {r.country ? `, ${r.country}` : ''}
                  </span>
                </a>
                {r.offer ? (
                  <a href={briefPath(r.offer)} onClick={go(briefPath(r.offer))} className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D4ED8]/30 px-3 py-2 text-[13px] font-bold text-[#1D4ED8] hover:bg-[#1D4ED8]/5">
                    <FileDown className="h-4 w-4" /> Your PDF
                  </a>
                ) : r.ok ? (
                  <a href={newOfferPath(r.uuid)} onClick={go(newOfferPath(r.uuid))} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-2 text-[13px] font-bold text-white hover:bg-brand-800">
                    <FileSignature className="h-4 w-4" /> Prepare PDF to apply
                  </a>
                ) : (
                  <PickCountry uuid={r.uuid} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Job's own country isn't covered: pick where you'd work, then prepare. */
function PickCountry({ uuid }: { uuid: string }) {
  const list = [...briefCountries].map((c) => ({ code: c, name: visaGuideByCode.get(c)?.name ?? c })).sort((a, b) => a.name.localeCompare(b.name));
  const [code, setCode] = useState(list[0]?.code ?? 'DE');
  const href = `${newOfferPath(uuid)}&country=${code}`;
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white py-1 pl-2 pr-1">
        <CircleFlag countryCode={code} size={18} />
        <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Country you'd work in" className="bg-transparent py-1 text-[13px] font-semibold text-ink-800 outline-none">
          {list.map((c) => (
            <option key={c.code} value={c.code}>
              Work in {c.name}
            </option>
          ))}
        </select>
      </span>
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          nav(href);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-2 text-[13px] font-bold text-white hover:bg-brand-800"
      >
        <FileSignature className="h-4 w-4" /> Prepare PDF
      </a>
    </span>
  );
}
