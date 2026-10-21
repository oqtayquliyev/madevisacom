import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { FileDown, FileSignature, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { jobPath } from '@/lib/jobUrl';
import { getRecentlyViewedJobs, type ViewedJobSnapshot } from '@/lib/viewedJobs';
import { briefPath, fetchMyBriefs, isCountryCode, newOfferPath } from '@/lib/briefs';
import { allCountries } from '@/data/allCountries';
import { briefCountries, canMakeDocument, docsLabel, useOfferCredits, uuidFromBoardId } from '@/lib/sponsorOffer';
import { visaGuideByCode } from '@/data/visa';
import { CircleFlag } from '@/components/common/CircleFlag';
import { OfferFlags } from '@/components/briefs/OfferBits';
import { usePersonalization } from '@/lib/personalization';
import { isLocalJobFor } from '@/lib/visaFit';

type Row = ViewedJobSnapshot & { uuid: string; ok: boolean; offer: { share: string; paid: string | null } | null };

const PAGE = 5;

/**
 * "Your last visited jobs": what each one needs — its PDF if you made one
 * ("See PDF"), nothing if it's in your country, else "Prepare PDF" — or
 * "In Pro" when the person has no plan and no documents left.
 * 5 at a time with "Show more".
 */
export function OfferJobPicker({ limit = PAGE, onAuth, title = 'Your last visited jobs' }: { limit?: number; onAuth?: (p: 'login' | 'register') => void; title?: string }) {
  const { user } = useAuth();
  const { profile: visitor } = usePersonalization();
  const credits = useOfferCredits();
  const [offers, setOffers] = useState<Map<string, { share: string; paid: string | null }>>(new Map());
  const [shown, setShown] = useState(limit);
  const viewed = useMemo(() => (user ? getRecentlyViewedJobs() : []), [user]);

  useEffect(() => {
    if (!user) return;
    fetchMyBriefs().then((list) => setOffers(new Map((list ?? []).filter((b) => b.job_id).map((b) => [b.job_id as string, { share: b.share_id, paid: b.paid_with ?? null }]))));
  }, [user]);

  const all: Row[] = viewed
    .map((v) => {
      const uuid = uuidFromBoardId(v.id);
      return uuid ? { ...v, uuid, ok: isCountryCode(v.countryCode), offer: offers.get(uuid) ?? null } : null;
    })
    .filter((r): r is Row => Boolean(r));
  const rows = all.slice(0, shown);
  const left = all.length - rows.length;
  const canMake = canMakeDocument(credits);

  const go = (href: string) => (e: MouseEvent) => {
    e.preventDefault();
    nav(href);
  };
  const toBuy = (e: MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('buy');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else nav('/checkout?plan=starter&source=documents');
  };

  if (!user) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl bg-white p-5 ring-1 ring-ink-200 sm:flex-row sm:items-center">
        <OfferFlags size={26} />
        <p className="min-w-0 flex-1 text-[15px] font-semibold text-ink-900">Create an account to prepare a document for the jobs you open.</p>
        <button onClick={() => onAuth?.('register')} className="rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800">
          Create account
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="picker-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="picker-title" className="text-[17px] font-bold text-ink-950">
          {title}
        </h2>
        {credits && (
          <p className="text-[13px] text-ink-500">
            You have <strong className="text-ink-900">{docsLabel(credits.left)}</strong> left
          </p>
        )}
      </div>
      {all.length === 0 ? (
        <div className="mt-3 flex flex-col items-start gap-3 rounded-xl border border-dashed border-ink-300 bg-white p-5 sm:flex-row sm:items-center">
          <OfferFlags size={24} />
          <p className="min-w-0 flex-1 text-[14px] text-ink-600">Open a job you like, then come back — it shows up here, ready to prepare.</p>
          <a href="/jobs" onClick={go('/jobs')} className="rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800">
            Browse jobs
          </a>
        </div>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-xl bg-white ring-1 ring-ink-200">
            {rows.map((r) => {
              const job = jobPath({ id: r.id, title: r.title, company: r.organization });
              const local = isLocalJobFor(r.countryCode, visitor);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <CircleFlag countryCode={r.countryCode} label={r.country} size={24} />
                  <a href={job} onClick={go(job)} className="min-w-0 flex-1 basis-40">
                    <span className="block truncate text-[14px] font-semibold text-ink-900 hover:text-[#1D4ED8]">{r.title}</span>
                    <span className="block truncate text-[12px] text-ink-500">
                      {r.organization}
                      {r.country ? `, ${r.country}` : ''}
                    </span>
                  </a>
                  <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                    {r.offer ? (
                      <>
                        <span className="text-[12px] font-semibold text-emerald-700">{r.offer.paid === 'pro' ? 'Included in your membership' : 'Prepared'}</span>
                        <a href={briefPath(r.offer.share)} onClick={go(briefPath(r.offer.share))} className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D4ED8]/30 px-3 py-2 text-[13px] font-bold text-[#1D4ED8] hover:bg-[#1D4ED8]/5">
                          <FileDown className="h-4 w-4" /> See PDF
                        </a>
                      </>
                    ) : local ? (
                      <span className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-700" title="This job is in your country — no visa or sponsorship needed.">
                        In your country · no visa needed
                      </span>
                    ) : !r.ok ? (
                      <PickCountry uuid={r.uuid} />
                    ) : canMake || !credits ? (
                      <a href={newOfferPath(r.uuid)} onClick={go(newOfferPath(r.uuid))} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-2 text-[13px] font-bold text-white hover:bg-brand-800">
                        <FileSignature className="h-4 w-4" /> Prepare PDF
                      </a>
                    ) : (
                      <>
                        <span className="text-[12px] font-semibold text-ink-500">{credits?.pro ? `All ${credits.quota} used this month` : 'Part of the membership'}</span>
                        {!credits?.pro && (
                          <a href="#buy" onClick={toBuy} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-[13px] font-bold text-ink-950 hover:bg-amber-300">
                            <Lock className="h-4 w-4" /> Get started
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {left > 0 && (
            <button onClick={() => setShown((n) => n + PAGE)} className="mt-2 w-full rounded-xl border border-dashed border-ink-300 bg-white py-2.5 text-[14px] font-semibold text-ink-700 hover:border-[#1D4ED8] hover:text-[#1D4ED8]">
              Show {Math.min(PAGE, left)} more · {left} left
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Job has no country ("Various", remote): pick where you'd work, then prepare. */
function PickCountry({ uuid }: { uuid: string }) {
  const checked = [...briefCountries].map((c) => ({ code: c, name: visaGuideByCode.get(c)?.name ?? c })).sort((a, b) => a.name.localeCompare(b.name));
  const others = allCountries.filter((c) => !briefCountries.has(c.code));
  const [code, setCode] = useState(checked[0]?.code ?? 'DE');
  const href = `${newOfferPath(uuid)}&country=${code}`;
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white py-1 pl-2 pr-1">
        <CircleFlag countryCode={code} size={18} />
        <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Country you'd work in" className="max-w-[150px] bg-transparent py-1 text-[13px] font-semibold text-ink-800 outline-none">
          <optgroup label="Checked visa routes">
            {checked.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Choose another country">
            {others.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </optgroup>
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
