import { useState } from 'react';
import { ScanSearch, X } from 'lucide-react';
import { useCv } from '@/lib/cv/store';
import { CvUpload } from '@/components/cv/CvUpload';

const KEY = 'mv:cvPromptClosed';

/**
 * A reminder strip for pages that list jobs: "Upload your CV to see how
 * well you match". Gone once there is a CV; can be closed for the day.
 */
export function CvPrompt({ className = '', where = 'these jobs' }: { className?: string; where?: string }) {
  const { cv, ready } = useCv();
  const [closed, setClosed] = useState(() => {
    try {
      return window.sessionStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (cv || !ready || closed) return null;
  return (
    <aside aria-label="Upload your CV" className={`relative grid gap-4 rounded-2xl border border-brand-200 bg-brand-50/70 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)] md:items-center ${className}`}>
      <button
        onClick={() => {
          setClosed(true);
          try {
            window.sessionStorage.setItem(KEY, '1');
          } catch {
            /* ignore */
          }
        }}
        aria-label="Close"
        className="absolute right-2 top-2 rounded-full p-1.5 text-ink-400 hover:bg-white hover:text-ink-700"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="min-w-0 pr-6">
        <p className="flex items-center gap-2 text-[16px] font-bold leading-snug text-ink-950">
          <ScanSearch className="h-5 w-5 shrink-0 text-brand-700" /> See how well you match {where}
        </p>
        <p className="mt-1 text-[13.5px] leading-5 text-ink-600">Upload your CV once. Every job then shows your match score and the skills you’re missing before you apply. Free.</p>
      </div>
      <CvUpload compact />
    </aside>
  );
}
