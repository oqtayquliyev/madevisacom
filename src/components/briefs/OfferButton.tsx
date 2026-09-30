import { useEffect, useState } from 'react';
import { FileDown, FileSignature } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { briefPath, fetchMyBriefForJob, newOfferPath } from '@/lib/briefs';
import { creditsBadge, useOfferCredits } from '@/lib/sponsorOffer';

/**
 * "Sponsorship offer · 3 left" — next to Apply on every open job page.
 * Opens the builder (with a covered country picked if the job's isn't),
 * or "Your document is ready" once made.
 */
export function OfferButton({ jobId, variant, country, onAuth }: { jobId: string; variant: 'hero' | 'body'; country?: string | null; onAuth?: (p: 'login' | 'register') => void }) {
  const { session } = useAuth();
  const credits = useOfferCredits();
  const [existing, setExisting] = useState<string | null>(null);
  useEffect(() => {
    if (session) fetchMyBriefForJob(jobId).then((b) => setExisting(b?.share_id ?? null));
  }, [session, jobId]);

  const out = credits && !credits.unlimited && credits.left === 0 && !existing;
  const href = existing ? briefPath(existing) : out ? '/pricing#offers' : `${newOfferPath(jobId)}${country ? `&country=${country}` : ''}`;
  const hero = variant === 'hero';

  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (!session) return onAuth?.('register');
        nav(href);
      }}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        hero ? 'text-white ring-1 ring-white/50 hover:bg-white/10 focus-visible:outline-white' : 'text-[#1D4ED8] ring-1 ring-[#1D4ED8]/40 hover:bg-[#1D4ED8]/5 focus-visible:outline-brand-600'
      }`}
    >
      {existing ? <FileDown className="h-4 w-4" /> : <FileSignature className="h-4 w-4" />}
      {existing ? 'Your document is ready' : out ? 'Get more offers' : 'Sponsorship offer'}
      {!existing && !out && (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${hero ? 'bg-white text-brand-700' : 'bg-[#1D4ED8] text-white'}`}>{creditsBadge(credits)}</span>
      )}
    </a>
  );
}
