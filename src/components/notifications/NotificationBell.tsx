import { useEffect, useRef, useState } from 'react';
import { Bell, Briefcase, FileSignature, Sparkles } from 'lucide-react';
import { useNotifications } from '@/lib/notifications';
import { handleNavClick } from '@/lib/navLink';
import { nav } from '@/lib/pageLayout';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

const KIND_ICON: Record<string, typeof Bell> = {
  application: Briefcase,
  application_confirm: Briefcase,
  offer_ready: FileSignature,
  credits_added: Sparkles,
};
const CTA: Record<string, string> = {
  application: 'Track it here',
  application_confirm: 'Confirm and track it here',
  offer_ready: 'Open and save as PDF',
  credits_added: 'See your credits',
};

export function NotificationBell() {
  const { items, unread, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unread) void markAllRead();
        }}
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        className="relative grid h-10 w-10 place-items-center rounded-lg text-ink-600 hover:bg-ink-100"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl">
          <p className="border-b border-ink-100 px-4 py-3 text-sm font-bold text-ink-950">Notifications</p>
          {!items.length ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">Nothing yet. Jobs you apply to, your sponsor offers and job alerts appear here.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
              {items.map((n) => {
                const Icon = KIND_ICON[n.kind];
                const content = (
                  <div className="flex gap-3">
                    {Icon && (
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8]">
                        <Icon className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">
                      {n.audience === 'admin' && <span className="mr-1.5 rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Admin</span>}
                      {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-ink-600">{n.body}</p>}
                    {n.link && CTA[n.kind] && <p className="mt-1 text-xs font-bold text-[#1D4ED8]">{CTA[n.kind]}</p>}
                    <p className="mt-1 text-[11px] text-ink-400">{ago(n.created_at)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id} className={n.read_at ? '' : 'bg-brand-50/50'}>
                    {n.link ? (
                      <a
                        href={n.link}
                        onClick={(e) =>
                          handleNavClick(e, () => {
                            setOpen(false);
                            nav(n.link!);
                          })
                        }
                        className="block px-4 py-3 hover:bg-ink-50"
                      >
                        {content}
                      </a>
                    ) : (
                      <div className="px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
