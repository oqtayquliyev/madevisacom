import { ScanSearch } from 'lucide-react';
import { nav } from '@/lib/pageLayout';
import { useCv } from '@/lib/cv/store';
import { CvUpload } from '@/components/cv/CvUpload';

/** "Your CV" in the profile sidebar: add, replace or remove it. */
export function CvCard() {
  const { cv } = useCv();
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-ink-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-500">Your CV</p>
        {cv && (
          <a href="/cv-match" onClick={(e) => (e.preventDefault(), nav('/cv-match'))} className="text-[13px] font-semibold text-[#1D4ED8] hover:underline">
            What we read
          </a>
        )}
      </div>
      <CvUpload compact allowRemove className="mt-2" />
      <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-4 text-ink-500">
        <ScanSearch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {cv ? 'Used for “Check your match” on every job. Sent to an employer only when you ask.' : 'Add it to see how well you match every job. It goes to an employer only when you ask.'}
      </p>
    </div>
  );
}
