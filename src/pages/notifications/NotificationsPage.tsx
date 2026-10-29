import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import type { View } from '@/types';
import { useAuth } from '@/lib/auth';
import { useNotifications, type AppNotification } from '@/lib/notifications';
import { useSeo } from '@/lib/seo';
import { NotificationRow } from '@/components/notifications/NotificationBell';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';

// /notifications — everything from the last 30 days (older ones are deleted), newest first.

function group(items: AppNotification[]) {
  const day = 86_400_000;
  const now = Date.now();
  const out: { title: string; items: AppNotification[] }[] = [
    { title: 'Today', items: [] },
    { title: 'This week', items: [] },
    { title: 'Earlier', items: [] },
  ];
  for (const n of items) {
    const age = now - Date.parse(n.created_at);
    out[age < day ? 0 : age < 7 * day ? 1 : 2].items.push(n);
  }
  return out.filter((g) => g.items.length);
}

export function NotificationsPage({ go, onAuth }: { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void }) {
  useSeo({ title: 'Notifications', description: 'Your MadeVisa notifications.', path: '/notifications', noindex: true });
  const { user, loading } = useAuth();
  const { items, unread, markAllRead } = useNotifications(300);

  // Opening the page reads them.
  useEffect(() => {
    if (unread) void markAllRead();
  }, [unread, markAllRead]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />
      <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-12">
        <h1 className="text-[28px] font-bold tracking-tight text-ink-950">Notifications</h1>
        <p className="mt-1 text-[13px] font-semibold text-ink-400">Kept for 30 days</p>

        {!loading && !user ? (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center ring-1 ring-ink-200">
            <Bell className="mx-auto h-8 w-8 text-ink-300" />
            <p className="mt-3 text-[15px] font-bold text-ink-900">Sign in to see your notifications</p>
            <button type="button" onClick={() => onAuth?.('login')} className="mt-4 rounded-full bg-ink-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-ink-800">
              Sign in
            </button>
          </div>
        ) : !items.length ? (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center ring-1 ring-ink-200">
            <Bell className="mx-auto h-8 w-8 text-ink-300" />
            <p className="mt-3 text-[15px] font-bold text-ink-900">Nothing yet</p>
            <p className="mt-1 text-sm text-ink-500">Jobs you apply to, your sponsorship documents and job alerts appear here.</p>
          </div>
        ) : (
          group(items).map((g) => (
            <section key={g.title} className="mt-8">
              <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-ink-400">{g.title}</h2>
              <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200">
                {g.items.map((n) => (
                  <li key={n.id}>
                    <NotificationRow n={n} roomy />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
