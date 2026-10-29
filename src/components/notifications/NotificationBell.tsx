import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  BellRing,
  Briefcase,
  AlertCircle as CircleAlert,
  CreditCard,
  Eye,
  FileSignature,
  Mail,
  MessageSquareReply,
  Rocket,
  Sparkles,
  Star,
  UserPlus,
} from 'lucide-react';
import { useNotifications, type AppNotification } from '@/lib/notifications';
import { handleNavClick } from '@/lib/navLink';
import { nav } from '@/lib/pageLayout';

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

// Every kind gets an icon and a colour; anything new falls back to the bell.
const KIND: Record<string, { icon: typeof Bell; tone: string; cta?: string }> = {
  offer_suggest: { icon: FileSignature, tone: 'bg-brand-50 text-brand-700', cta: 'Preview your document' },
  recruiter_contact: { icon: Mail, tone: 'bg-amber-50 text-amber-700', cta: 'Open the job' },
  application: { icon: Briefcase, tone: 'bg-brand-50 text-brand-700', cta: 'Track it here' },
  application_confirm: { icon: Briefcase, tone: 'bg-brand-50 text-brand-700', cta: 'Confirm and track it here' },
  application_submitted: { icon: Briefcase, tone: 'bg-brand-50 text-brand-700', cta: 'See it' },
  offer_ready: { icon: FileSignature, tone: 'bg-emerald-50 text-emerald-700', cta: 'Open and save as PDF' },
  offer_viewed: { icon: Eye, tone: 'bg-sky-50 text-sky-700', cta: 'See your document' },
  offer_reply: { icon: MessageSquareReply, tone: 'bg-emerald-50 text-emerald-700', cta: 'Read the reply' },
  reply_reported: { icon: MessageSquareReply, tone: 'bg-emerald-50 text-emerald-700' },
  credits_added: { icon: Sparkles, tone: 'bg-violet-50 text-violet-700', cta: 'See your documents' },
  job_alert: { icon: BellRing, tone: 'bg-brand-50 text-brand-700', cta: 'See the jobs' },
  plan_active: { icon: BadgeCheck, tone: 'bg-emerald-50 text-emerald-700' },
  plan_paid: { icon: CreditCard, tone: 'bg-emerald-50 text-emerald-700' },
  plan_changed: { icon: CreditCard, tone: 'bg-ink-100 text-ink-700' },
  plan_ended: { icon: CreditCard, tone: 'bg-ink-100 text-ink-700' },
  plan_payment_issue: { icon: CircleAlert, tone: 'bg-rose-50 text-rose-700' },
  plan_request: { icon: UserPlus, tone: 'bg-ink-100 text-ink-700' },
  plan_price_check: { icon: CircleAlert, tone: 'bg-amber-50 text-amber-700' },
  auto_apply_done: { icon: Rocket, tone: 'bg-brand-50 text-brand-700' },
  auto_apply_applied: { icon: Rocket, tone: 'bg-brand-50 text-brand-700' },
  auto_apply_on: { icon: Rocket, tone: 'bg-brand-50 text-brand-700' },
  auto_apply_request: { icon: Rocket, tone: 'bg-ink-100 text-ink-700' },
  feedback_published: { icon: Star, tone: 'bg-amber-50 text-amber-700' },
};
const fallback = { icon: Bell, tone: 'bg-ink-100 text-ink-600' };

/** One notification: icon, title, short body, what to do, when. */
export function NotificationRow({ n, onOpen, roomy = false }: { n: AppNotification; onOpen?: () => void; roomy?: boolean }) {
  const k = KIND[n.kind] ?? fallback;
  const Icon = k.icon;
  const content = (
    <div className="flex gap-3">
      <span className={`mt-0.5 grid shrink-0 place-items-center rounded-full ${roomy ? 'h-10 w-10' : 'h-8 w-8'} ${k.tone}`}>
        <Icon className={roomy ? 'h-[18px] w-[18px]' : 'h-4 w-4'} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold text-ink-900 ${roomy ? 'text-[15px]' : 'text-sm'}`}>
          {n.audience === 'admin' && <span className="mr-1.5 rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Admin</span>}
          {n.title}
        </p>
        {n.body && <p className={`mt-0.5 text-ink-600 ${roomy ? 'text-[14px] leading-6' : 'line-clamp-2 text-xs leading-5'}`}>{n.body}</p>}
        {n.link && k.cta && <p className="mt-1 text-xs font-bold text-[#1D4ED8]">{k.cta}</p>}
        <p className="mt-1 text-[11px] text-ink-400">{ago(n.created_at)}</p>
      </div>
      {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="New" />}
    </div>
  );
  const pad = roomy ? 'px-5 py-4' : 'px-4 py-3';
  return n.link ? (
    <a
      href={n.link}
      onClick={(e) =>
        handleNavClick(e, () => {
          onOpen?.();
          nav(n.link!);
        })
      }
      className={`block ${pad} hover:bg-ink-50`}
    >
      {content}
    </a>
  ) : (
    <div className={pad}>{content}</div>
  );
}

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
        <div className="fixed inset-x-3 top-[4.75rem] z-50 flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[24rem]">
          <p className="border-b border-ink-100 px-4 py-3 text-sm font-bold text-ink-950">Notifications</p>
          {!items.length ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">Nothing yet. Jobs you apply to, your sponsorship documents and job alerts appear here.</p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto sm:max-h-[26rem]">
              {items.slice(0, 8).map((n) => (
                <li key={n.id} className={n.read_at ? '' : 'bg-brand-50/50'}>
                  <NotificationRow n={n} onOpen={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
          <a
            href="/notifications"
            onClick={(e) =>
              handleNavClick(e, () => {
                setOpen(false);
                nav('/notifications');
              })
            }
            className="block border-t border-ink-100 px-4 py-3 text-center text-[13px] font-bold text-[#1D4ED8] hover:bg-ink-50"
          >
            See all notifications
          </a>
        </div>
      )}
    </div>
  );
}
