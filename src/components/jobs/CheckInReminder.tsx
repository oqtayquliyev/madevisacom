import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { fetchDueCheckIns, updateApplicationReport } from '@/lib/companies';

const DISMISS_KEY = 'madevisa:checkinDismissed';

/**
 * In-app reminder: when a tracked application's check-in date has come,
 * a small card asks "Did X reply? 3 quick questions". Shown once per
 * browser session; "Later" moves the reminder 2 days on.
 */
export function CheckInReminder() {
  const { user } = useAuth();
  const [due, setDue] = useState<{ id: string; listing_id: string; listing_title: string | null; company: string } | null>(null);

  useEffect(() => {
    if (!user || window.location.pathname.startsWith('/profile')) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* ignore */
    }
    let alive = true;
    const t = window.setTimeout(() => {
      fetchDueCheckIns().then((list) => alive && setDue(list[0] ?? null));
    }, 2500);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [user]);

  if (!due) return null;
  const close = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDue(null);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[70] sm:left-auto sm:w-[360px]" role="status">
      <div className="rounded-xl bg-white p-4 shadow-soft-lg ring-1 ring-[#2563EB]/25">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#2563EB]/10 text-[#2563EB]">
            <Bell className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink-950">Did {due.company} reply?</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-ink-600">3 quick questions about {due.listing_title ?? 'your application'} — takes 10 seconds.</p>
            <div className="mt-3 flex gap-2">
              <a href={`/profile?track=${due.listing_id}`} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
                Answer now
              </a>
              <button
                onClick={() => {
                  void updateApplicationReport(due.id, { remind_at: new Date(Date.now() + 2 * 86_400_000).toISOString() });
                  close();
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50"
              >
                Later
              </button>
            </div>
          </div>
          <button onClick={close} aria-label="Close" className="text-ink-400 hover:text-ink-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
