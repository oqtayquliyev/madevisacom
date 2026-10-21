import { forwardRef, useEffect, useState } from 'react';
import { searchPublishers, type PublisherMatch } from '@/lib/companyExperiences';
import { FileSignature, Lock, PenLine, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { customOfferPath } from '@/lib/briefs';
import { briefCountries, canMakeDocument, docsLabel, useOfferCredits } from '@/lib/sponsorOffer';
import { visaGuideByCode } from '@/data/visa';
import { allCountries } from '@/data/allCountries';
import { CircleFlag } from '@/components/common/CircleFlag';
export type OfferCompanyPick = { id: string | null; name: string; countryCode: string | null };

const INPUT =
  'mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15';

/**
 * Custom sponsorship document: any company and role. Type a company — ones
 * already on MadeVisa are suggested — then the role and country. Opens the
 * offer builder (/brief/new?custom=1).
 * Without Pro (or a document kept from before) the form is shown blurred with a way to get it.
 */
export const CustomOfferCard = forwardRef<HTMLElement, { pick?: OfferCompanyPick | null; onAuth?: (p: 'login' | 'register') => void; onClearPick?: () => void }>(
  function CustomOfferCard({ pick = null, onAuth, onClearPick }, ref) {
    const { user } = useAuth();
    const credits = useOfferCredits();
    const [company, setCompany] = useState('');
    const [title, setTitle] = useState('');
    const [country, setCountry] = useState('DE');
    const [city, setCity] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pub, setPub] = useState<{ id: string; name: string } | null>(null);
    const [hits, setHits] = useState<PublisherMatch[]>([]);
    const [focus, setFocus] = useState(false);

    // A company handed in from elsewhere fills the form.
    useEffect(() => {
      if (!pick) return;
      setCompany(pick.name);
      setPub(pick.id ? { id: pick.id, name: pick.name } : null);
      if (pick.countryCode && allCountries.some((c) => c.code === pick.countryCode)) setCountry(pick.countryCode);
      setError(null);
    }, [pick]);

    // Suggestions from companies already on MadeVisa.
    useEffect(() => {
      if (pub?.name === company || company.trim().length < 2) return setHits([]);
      const t = window.setTimeout(() => searchPublishers(company).then((r) => setHits(r.slice(0, 6))), 200);
      return () => window.clearTimeout(t);
    }, [company, pub]);

    const canPay = canMakeDocument(credits);
    // Signed out, or signed in with nothing to make one with → blurred. (While it loads, don't flash the lock.)
    const locked = !user || (credits !== null && !canPay);
    const pickedId = pub && pub.name === company ? pub.id : null;

    const checked = [...briefCountries].map((c) => ({ code: c, name: visaGuideByCode.get(c)?.name ?? c })).sort((a, b) => a.name.localeCompare(b.name));
    const others = allCountries.filter((c) => !briefCountries.has(c.code));

    const go = () => {
      if (!company.trim()) return setError('Add the company this document is for.');
      if (!title.trim()) return setError('Add the role you are applying for.');
      setError(null);
      nav(customOfferPath({ company, title, country, city, publisherId: pickedId }));
    };

    return (
      <section ref={ref} aria-labelledby="custom-offer" className="scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="custom-offer" className="flex items-center gap-2 text-[17px] font-bold text-ink-950">
              <PenLine className="h-4 w-4 text-[#1D4ED8]" /> Custom Visa Plan
            </h2>
            <p className="mt-0.5 text-[14px] text-ink-500">For a job you found elsewhere, or a company you want to approach first. Add the company yourself.</p>
          </div>
          {credits && !locked && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">
              {credits.proLeft > 0 ? `${credits.proLeft} left this month` : `${docsLabel(credits.left)} left`}
            </span>
          )}
        </div>

        <div className={`relative mt-3 rounded-xl bg-white ring-1 ring-ink-200 ${locked ? 'min-h-[230px] overflow-hidden' : ''}`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!locked) go();
            }}
            aria-hidden={locked}
            className={`grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 ${locked ? 'pointer-events-none select-none blur-[5px]' : ''}`}
          >
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-800">Company</span>
              <span className="relative block">
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  onFocus={() => setFocus(true)}
                  onBlur={() => window.setTimeout(() => setFocus(false), 150)}
                  maxLength={200}
                  placeholder="Search or type a company"
                  autoComplete="off"
                  className={INPUT}
                  tabIndex={locked ? -1 : 0}
                />
                {focus && hits.length > 0 && !pickedId && (
                  <span role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 block overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-ink-200">
                    {hits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setCompany(h.name);
                          setPub({ id: h.id, name: h.name });
                          setHits([]);
                        }}
                        className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-[14px] hover:bg-[#1D4ED8]/5"
                      >
                        <span className="truncate font-semibold text-ink-900">{h.name}</span>
                        {h.country?.name && <span className="shrink-0 text-[12px] text-ink-500">{h.country.name}</span>}
                      </button>
                    ))}
                  </span>
                )}
                {pickedId && (
                  <button
                    type="button"
                    onClick={() => {
                      onClearPick?.();
                      setPub(null);
                      setCompany('');
                    }}
                    aria-label="Clear company"
                    className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
              {pickedId && <span className="mt-1 block text-[11px] font-medium text-emerald-700">On MadeVisa — its details fill the Employer block.</span>}
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-800">Role</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="e.g. Data Engineer" className={INPUT} tabIndex={locked ? -1 : 0} />
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-800">Country you’d work in</span>
              <span className="mt-1 flex items-center gap-2">
                <CircleFlag countryCode={country} size={22} />
                <select value={country} onChange={(e) => setCountry(e.target.value)} className={`${INPUT} mt-0`} tabIndex={locked ? -1 : 0}>
                  <optgroup label="Checked visa routes">
                    {checked.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Other countries">
                    {others.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </span>
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-800">City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={120} placeholder="Optional" className={INPUT} tabIndex={locked ? -1 : 0} />
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
              <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-3 text-[14px] font-bold text-white hover:bg-brand-800" tabIndex={locked ? -1 : 0}>
                <FileSignature className="h-4 w-4" /> Prepare custom PDF
              </button>
              <span className="text-[13px] text-ink-500">You’ll set the terms and see the document before it’s counted.</span>
              {error && <span className="text-[13px] font-semibold text-rose-600">{error}</span>}
            </div>
          </form>

          {locked && (
            <div className="absolute inset-0 grid place-items-center bg-white/40 p-4">
              <div className="flex max-w-md flex-col items-center gap-2 rounded-xl bg-white px-6 py-5 text-center shadow-soft-lg ring-1 ring-ink-200">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8]">
                  <Lock className="h-5 w-5" />
                </span>
                {!user ? (
                  <>
                    <p className="text-[15px] font-bold text-ink-950">Sign up to make custom Visa Plans</p>
                    <p className="text-[13px] text-ink-500">Free accounts get 1 sponsorship document a month, members 20.</p>
                    <button onClick={() => onAuth?.('register')} className="mt-1 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800">
                      Create account
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[15px] font-bold text-ink-950">{credits?.pro ? `All ${credits.quota} used this month` : 'Part of the membership'}</p>
                    <p className="text-[13px] text-ink-500">
                      {credits?.pro ? 'Your documents renew on the 1st.' : 'The MadeVisa Membership includes 20 sponsorship documents a month and CV match on every job.'}
                    </p>
                    {!credits?.pro && (
                      <a
                        href="#buy"
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById('buy')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="mt-1 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800"
                      >
                        See the plan
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    );
  },
);
