import { useEffect, useState } from 'react';
import { BellPlus, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useMyPlan } from '@/lib/plans';
import { useCompanySignal } from '@/lib/companySignals';
import { companyPath } from '@/lib/companies';
import { classifyJob } from '@/lib/jobTaxonomy';
import { AppLink } from '@/pages/info/InfoPage';
import { ProLock } from '@/components/pro/ProLock';

// Three Pro boxes on the job page. Non-Pro visitors see blurred
// placeholders with "Unlock with Pro"; the real data is only fetched for
// Pro members (and the database refuses it to everyone else).

function ResponseDetails({ publisherId, company }: { publisherId: string; company: string }) {
  const s = useCompanySignal(publisherId);
  if (s === undefined) return <p className="text-sm text-ink-500">Loading…</p>;
  if (!s) return <p className="text-sm text-ink-500">No data for {company} yet.</p>;
  const rows: [string, string][] = [
    ['Reply rate', s.response_rate != null ? `${Math.round(s.response_rate)}% of applicants` : 'Not enough reports yet'],
    ['Typical time to reply', s.median_days != null ? `${Math.max(1, Math.round(s.median_days))} days` : '—'],
    ['Applications tracked on MadeVisa', String(s.tracked)],
    ['New roles in the last 30 days', String(s.posted_30d)],
    ['Open roles now', String(s.live)],
  ];
  return (
    <>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-ink-100 py-1.5 text-sm">
            <dt className="text-ink-500">{k}</dt>
            <dd className="font-semibold text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>
      <AppLink href={companyPath({ id: publisherId, name: company })} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
        {company} on MadeVisa
      </AppLink>
    </>
  );
}

function VisaSponsors({ iso, countryName }: { iso: string; countryName: string }) {
  const [list, setList] = useState<{ id: string; name: string; logo: string | null; jobs: number }[] | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.rpc('visa_sponsors_in', { p_iso: iso }).then(({ data }) => alive && setList((data as typeof list) ?? []));
    return () => {
      alive = false;
    };
  }, [iso]);
  if (!list) return <p className="text-sm text-ink-500">Loading…</p>;
  if (!list.length) return <p className="text-sm text-ink-500">No open roles in {countryName} say they sponsor visas right now.</p>;
  return (
    <ul className="space-y-2">
      {list.map((c) => (
        <li key={c.id} className="flex items-center gap-3">
          {c.logo ? <img src={c.logo} alt="" width={28} height={28} className="h-7 w-7 rounded-md border border-ink-100 object-contain" /> : <span className="h-7 w-7 rounded-md bg-ink-100" />}
          <AppLink href={companyPath(c)} className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900 hover:text-brand-700">
            {c.name}
          </AppLink>
          <span className="text-xs text-ink-500">
            {c.jobs} {c.jobs === 1 ? 'role' : 'roles'} with sponsorship
          </span>
        </li>
      ))}
    </ul>
  );
}

function AlertButton({ keywords, country }: { keywords: string; country: string | null }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const save = async () => {
    setState('busy');
    const { error } = await supabase.from('job_alerts').insert({ keywords, country_code: country, label: keywords });
    setState(error ? 'error' : 'done');
  };
  if (state === 'done')
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4" /> Alert saved — new “{keywords}” jobs will appear in your notifications (checked every 30 minutes).
      </p>
    );
  return (
    <>
      <p className="text-sm text-ink-600">
        Get notified the moment new <strong>{keywords}</strong> roles{country ? ' in this country' : ''} are published — before most people see them.
      </p>
      <button onClick={() => void save()} disabled={state === 'busy'} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
        {state === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellPlus className="h-4 w-4" />} Create alert
      </button>
      {state === 'error' && <p className="mt-2 text-xs text-rose-700">Couldn’t save the alert. Please try again.</p>}
    </>
  );
}

export function JobProInsights({
  publisherId,
  company,
  title,
  department,
  countryCode,
  countryName,
}: {
  publisherId: string | null | undefined;
  company: string;
  title: string;
  department?: string | null;
  countryCode: string | null | undefined;
  countryName: string | null | undefined;
}) {
  const { isPro } = useMyPlan();
  const keywords = classifyJob(title, department)?.label.replace(/\s*\(other\)$/, '') ?? title.split(/\s+/).slice(0, 3).join(' ');
  return (
    <section className="mt-8 space-y-4">
      <h2 className="text-lg font-bold text-ink-950">Before you apply</h2>
      {publisherId && (
        <ProLock title={`How ${company} treats applicants`} teaser={`See ${company}’s exact reply rate, typical reply time and hiring activity.`}>
          {isPro && <ResponseDetails publisherId={publisherId} company={company} />}
        </ProLock>
      )}
      {countryCode && (
        <ProLock title={`Companies sponsoring visas in ${countryName ?? 'this country'}`} teaser="See which companies are hiring with visa sponsorship right now." rows={4}>
          {isPro && <VisaSponsors iso={countryCode} countryName={countryName ?? 'this country'} />}
        </ProLock>
      )}
      <ProLock title={`Alert me about new “${keywords}” jobs`} teaser="Get notified the moment matching jobs are published — be an early applicant." rows={2}>
        {isPro && <AlertButton keywords={keywords} country={countryCode ?? null} />}
      </ProLock>
    </section>
  );
}
