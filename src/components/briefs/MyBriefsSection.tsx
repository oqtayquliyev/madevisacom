import { useEffect, useState } from 'react';
import { Eye, FileText } from 'lucide-react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { formatRelativeTime } from '@/lib/dates';
import { BRIEF_STATUS_LABEL, briefPath, fetchMyBriefs, type MyBrief } from '@/lib/briefs';

function go(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

const STATUS_TONE: Record<string, string> = {
  created: 'bg-ink-100 text-ink-600',
  sent: 'bg-sky-50 text-sky-700',
  replied: 'bg-emerald-50 text-emerald-700',
  interview: 'bg-emerald-50 text-emerald-700',
  offer: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-ink-100 text-ink-600',
  no_reply: 'bg-amber-50 text-amber-800',
};

/** "Your Hiring Briefs" on the dashboard. Hidden until the user has made one. */
export function MyBriefsSection() {
  const [briefs, setBriefs] = useState<MyBrief[] | null | undefined>(undefined);
  useEffect(() => {
    fetchMyBriefs().then(setBriefs);
  }, []);

  if (!briefs || briefs.length === 0) return null;

  const sent = briefs.filter((b) => b.status !== 'created').length;
  const viewed = briefs.filter((b) => b.view_count > 0).length;
  const replied = briefs.filter((b) => ['replied', 'interview', 'offer', 'declined'].includes(b.status)).length;

  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink-950">
          <FileText className="h-[18px] w-[18px] text-[#1D4ED8]" /> Your Hiring Briefs
        </h2>
        <p className="text-[13px] text-ink-500">
          {sent} sent · {viewed} viewed · {replied} replied
        </p>
      </div>
      <ul className="mt-4 space-y-2">
        {briefs.map((b) => (
          <li key={b.id}>
            <a
              href={briefPath(b.share_id)}
              onClick={(e) => {
                e.preventDefault();
                go(briefPath(b.share_id));
              }}
              className="flex items-center gap-3 rounded-lg bg-[#1D4ED8]/5 px-3 py-3 transition-colors hover:bg-[#1D4ED8]/10"
            >
              <CircleFlag countryCode={b.country_code} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink-900">{b.job_title}</span>
                <span className="block truncate text-[12px] text-ink-500">
                  {b.company_name} · created {formatRelativeTime(b.created_at, '')}
                </span>
              </span>
              <span className="hidden items-center gap-1 text-[12px] text-ink-500 sm:flex" title="Opens by anyone other than you">
                <Eye className="h-3.5 w-3.5" /> {b.view_count}
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[b.status] ?? STATUS_TONE.created}`}>{BRIEF_STATUS_LABEL[b.status]}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
