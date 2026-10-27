import { ExternalLink, ShieldCheck } from 'lucide-react';
import { UK_REGISTER_URL, useUkSponsor } from '@/lib/sponsorRegister';
import { REGISTER_NAME, useSponsorProof } from '@/lib/sponsorProof';

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

/** Small pill for the job page hero (UK jobs only). Renders nothing when not matched. */
export function UkSponsorPill({ publisherId }: { publisherId: string | null | undefined }) {
  const s = useUkSponsor(publisherId);
  if (!s) return null;
  return (
    <a
      href={UK_REGISTER_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={`Listed as “${s.name}” on the UK Home Office register of licensed sponsors${s.checked ? ` (checked ${day(s.checked)})` : ''}`}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2.5 py-1 text-[11px] font-bold text-emerald-100 ring-1 ring-emerald-300/40 hover:bg-emerald-400/30"
    >
      <ShieldCheck className="h-3.5 w-3.5" /> Licensed UK visa sponsor
    </a>
  );
}

/**
 * Company page: "Does X sponsor visas?" answered from the official register.
 * Shows only a positive, sourced answer — "not found under this name" is not
 * the same as "doesn't sponsor", so we don't claim that.
 */
export function SponsorAnswer({ publisherId, companyName }: { publisherId: string; companyName: string }) {
  const s = useUkSponsor(publisherId);
  if (!s) return null;
  const routes = s.routes.filter(Boolean).slice(0, 4);
  return (
    <section id="sponsorship" className="scroll-mt-40 rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
      <h2 className="flex items-center gap-2 text-[18px] font-bold text-ink-950">
        <ShieldCheck className="h-5 w-5 text-emerald-600" /> Does {companyName} sponsor visas?
      </h2>
      <p className="mt-2 text-[14px] leading-6 text-ink-700">
        <strong className="text-ink-950">Yes, in the UK.</strong> {companyName} is on the UK Home Office register of licensed sponsors as{' '}
        <strong className="text-ink-950">{s.name}</strong>
        {s.city ? ` (${s.city})` : ''}. That means it is allowed to hire people from abroad on UK work visas
        {routes.length ? `, including: ${routes.join(', ')}` : ''}.
      </p>
      <p className="mt-2 text-[12px] text-ink-500">
        A licence doesn’t mean every role is sponsored — check the job ad, or add a sponsorship document when you apply.{' '}
        <a href={UK_REGISTER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 hover:underline">
          Official register <ExternalLink className="h-3 w-3" />
        </a>
        {s.checked ? ` · checked ${day(s.checked)}` : ''}
      </p>
    </section>
  );
}

/**
 * Job page hero: "Visa sponsor on record · UK, US" when the company is in any official
 * register (UK Home Office, NL IND, US H-1B data). Shown to everyone — the details are in
 * "Your edge on this job". Renders nothing when not matched.
 */
export function SponsorRecordPill({ publisherId }: { publisherId: string | null | undefined }) {
  const records = useSponsorProof(publisherId);
  if (!records?.length) return null;
  const where = records.map((r) => (r.country === 'GB' ? 'UK' : r.country)).join(', ');
  return (
    <a
      href="#edge-title"
      title={records.map((r) => `${REGISTER_NAME[r.country] ?? r.country}: “${r.name}”`).join('\n')}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2.5 py-1 text-[11px] font-bold text-emerald-100 ring-1 ring-emerald-300/40 hover:bg-emerald-400/30"
    >
      <ShieldCheck className="h-3.5 w-3.5" /> Visa sponsor on record · {where}
    </a>
  );
}
