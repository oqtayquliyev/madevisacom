import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { CANDIDATE_COVER_LABEL, type CandidateCover } from '@/data/visa';
import { BRIEFS_PER_WEEK, briefEligibility, briefPath, createBrief, fetchMyBriefForJob } from '@/lib/briefs';

type Props = {
  jobId: string;
  publisherId: string | null;
  jobTitle: string;
  companyName: string;
  jobFunction: string | null;
  jobCity: string | null;
  countryCode: string | null;
  visa: 'offered' | 'not_offered' | null | undefined;
  closed: boolean;
  onAuth?: (page: 'login' | 'register') => void;
};

function go(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

/**
 * Shown on job pages whose listing doesn't mention visa sponsorship, in
 * countries with checked employer data. Lets the candidate build a
 * Hiring Brief to send to the employer themselves.
 */
export function HiringBriefCallout(props: Props) {
  const { session, profile } = useAuth();
  const eligibility = useMemo(
    () => briefEligibility({ countryCode: props.countryCode, visa: props.visa, closed: props.closed }),
    [props.countryCode, props.visa, props.closed],
  );
  const [existing, setExisting] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!session || !eligibility.ok) {
      setExisting(null);
      return;
    }
    fetchMyBriefForJob(props.jobId).then((b) => setExisting(b?.share_id ?? null));
  }, [session, props.jobId, eligibility.ok]);

  if (!eligibility.ok) return null;
  const { guide, routes } = eligibility;

  return (
    <section className="mt-4 rounded-xl border border-[#1D4ED8]/25 bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#1D4ED8]/10 text-[#1D4ED8]">
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold text-ink-950">This role doesn't mention visa sponsorship</h2>
          <p className="mt-1 text-[14px] leading-6 text-ink-600">
            In {guide.name}, hiring from abroad can be simpler than employers expect
            {routes.some((r) => r.employer && !r.employer.licenceNeeded) ? ', with no sponsor licence needed on some routes' : ''}. Create a one-page Hiring Brief that shows{' '}
            {props.companyName} what they'd have to do and what you'd cover, then send it yourself.
          </p>
          {!open && (
            <div className="mt-4">
              {!session ? (
                <button onClick={() => props.onAuth?.('login')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-800">
                  Sign in to create a Hiring Brief
                </button>
              ) : existing === undefined ? (
                <span className="inline-flex items-center gap-2 text-[14px] text-ink-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                </span>
              ) : existing ? (
                <a
                  href={briefPath(existing)}
                  onClick={(e) => {
                    e.preventDefault();
                    go(briefPath(existing));
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-800"
                >
                  Open your Hiring Brief <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-800">
                  Create a Hiring Brief
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {open && profile && (
        <BriefForm
          {...props}
          routes={routes}
          defaults={{
            name: profile.full_name ?? '',
            headline: profile.network_headline ?? profile.occupation ?? '',
            linkedin: profile.linkedin_url ?? null,
            username: profile.username ?? null,
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </section>
  );
}

function BriefForm({
  routes,
  defaults,
  onCancel,
  ...job
}: Props & {
  routes: NonNullable<ReturnType<typeof briefEligibility> & { ok: true }>['routes'];
  defaults: { name: string; headline: string; linkedin: string | null; username: string | null };
  onCancel: () => void;
}) {
  const [routeId, setRouteId] = useState(routes[0].id);
  const route = routes.find((r) => r.id === routeId) ?? routes[0];
  const allowed = route.employer!.candidateMayCover;
  const [covers, setCovers] = useState<CandidateCover[]>(allowed);
  const [remoteFirst, setRemoteFirst] = useState(false);
  const [name, setName] = useState(defaults.name);
  const [headline, setHeadline] = useState(defaults.headline);
  const [showLinkedIn, setShowLinkedIn] = useState(Boolean(defaults.linkedin));
  const [showProfile, setShowProfile] = useState(Boolean(defaults.username));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep chosen covers inside what the selected route allows.
  useEffect(() => {
    setCovers((c) => c.filter((x) => allowed.includes(x)));
  }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!name.trim()) {
      setError('Add the name the employer should see.');
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createBrief({
      jobId: job.jobId,
      publisherId: job.publisherId,
      jobTitle: job.jobTitle,
      companyName: job.companyName,
      jobFunction: job.jobFunction,
      jobCity: job.jobCity,
      countryCode: job.countryCode!.toUpperCase(),
      routeId,
      candidateName: name.trim(),
      candidateHeadline: headline.trim() || null,
      candidateLinkedin: showLinkedIn ? defaults.linkedin : null,
      candidateUsername: showProfile ? defaults.username : null,
      covers,
      remoteFirst,
      note,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    go(briefPath(res.shareId));
  };

  const inputCls = 'mt-1.5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[15px] text-ink-900 outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15';

  return (
    <div className="mt-6 space-y-5 border-t border-ink-100 pt-5">
      {routes.length > 1 && (
        <fieldset>
          <legend className="text-[14px] font-semibold text-ink-800">Visa route</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {routes.map((r) => (
              <label key={r.id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${routeId === r.id ? 'border-[#1D4ED8] bg-[#1D4ED8]/5' : 'border-ink-200 hover:border-ink-300'}`}>
                <input type="radio" name="route" checked={routeId === r.id} onChange={() => setRouteId(r.id)} className="mt-1 accent-[#1D4ED8]" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-ink-900">{r.name}</span>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${r.employer!.licenceNeeded ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                    {r.employer!.licenceNeeded ? 'Employer needs a sponsor licence' : 'No sponsor licence needed'}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-ink-500">Pick the one that fits you. Check the conditions on the destination page if you're unsure.</p>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[14px] font-semibold text-ink-800">Your name on the brief</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[14px] font-semibold text-ink-800">One-line headline</span>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={140} placeholder="e.g. Backend engineer, 6 years in fintech" className={inputCls} />
        </label>
      </div>

      <fieldset>
        <legend className="text-[14px] font-semibold text-ink-800">Costs you'll cover yourself</legend>
        <p className="text-[13px] text-ink-500">Only costs the law lets a candidate pay are listed. Salary is never part of a brief.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {allowed.map((c) => (
            <label key={c} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ink-200 px-3 py-2.5 text-[14px] text-ink-800 hover:border-ink-300">
              <input
                type="checkbox"
                checked={covers.includes(c)}
                onChange={(e) => setCovers((prev) => (e.target.checked ? [...prev, c] : prev.filter((x) => x !== c)))}
                className="h-4 w-4 accent-[#1D4ED8]"
              />
              {CANDIDATE_COVER_LABEL[c]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer gap-3 rounded-lg border border-ink-200 p-3 hover:border-ink-300">
        <input type="checkbox" checked={remoteFirst} onChange={(e) => setRemoteFirst(e.target.checked)} className="mt-1 h-4 w-4 accent-[#1D4ED8]" />
        <span>
          <span className="block text-[15px] font-semibold text-ink-900">I'm open to starting remotely first</span>
          <span className="block text-[13px] leading-5 text-ink-500">As a contractor or through an Employer of Record, relocating later. Often the easiest yes for an employer.</span>
        </span>
      </label>

      <label className="block">
        <span className="text-[14px] font-semibold text-ink-800">A short note to the hiring manager (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} rows={3} placeholder="Why this role, in two or three sentences." className={inputCls} />
        <span className="mt-1 block text-right text-[12px] text-ink-400">{note.length}/600</span>
      </label>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-ink-700">
        {defaults.linkedin && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showLinkedIn} onChange={(e) => setShowLinkedIn(e.target.checked)} className="h-4 w-4 accent-[#1D4ED8]" /> Show my LinkedIn
          </label>
        )}
        {defaults.username && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showProfile} onChange={(e) => setShowProfile(e.target.checked)} className="h-4 w-4 accent-[#1D4ED8]" /> Link my MadeVisa profile
          </label>
        )}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-700">{error}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        <p className="text-[12px] leading-5 text-ink-500 sm:mr-auto">Your email and phone are never shown. Up to {BRIEFS_PER_WEEK} briefs a week.</p>
        <button onClick={onCancel} className="rounded-lg px-4 py-2.5 text-[15px] font-semibold text-ink-600 hover:bg-ink-50">
          Cancel
        </button>
        <button onClick={submit} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create brief
        </button>
      </div>
    </div>
  );
}
