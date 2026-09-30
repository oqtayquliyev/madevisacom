import { useEffect, useState } from 'react';
import { Briefcase, FileDown, Paperclip, SlidersHorizontal, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { SIGNUP_CREDIT, usd, useOfferCredits } from '@/lib/sponsorOffer';
import { OfferFlags } from '@/components/briefs/OfferBits';

const KEY = (id: string) => `madevisa:offerWelcome:${id}`;
const NEW_FOR_DAYS = 14;

/**
 * Once per new account: "$20 credited — your first sponsorship document is free."
 * Not shown on the offer pages themselves.
 */
export function OfferWelcome() {
  const { user } = useAuth();
  const credits = useOfferCredits();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const created = Date.parse((user as { created_at?: string }).created_at ?? '');
    const isNew = Number.isFinite(created) && Date.now() - created < NEW_FOR_DAYS * 86_400_000;
    let seen = true;
    try {
      seen = Boolean(window.localStorage.getItem(KEY(user.id)));
    } catch {
      /* private mode: don't nag */
    }
    const onOfferPage = /^\/(brief|offers)/.test(window.location.pathname);
    if (isNew && !seen && !onOfferPage) {
      const t = window.setTimeout(() => setOpen(true), 1200);
      return () => window.clearTimeout(t);
    }
  }, [user]);

  const close = () => {
    setOpen(false);
    try {
      if (user) window.localStorage.setItem(KEY(user.id), '1');
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const balance = usd(credits?.balance ?? SIGNUP_CREDIT);

  const steps = [
    { icon: Briefcase, t: 'Open a job' },
    { icon: SlidersHorizontal, t: 'Drag who pays what' },
    { icon: FileDown, t: 'Save the PDF' },
    { icon: Paperclip, t: 'Attach it when you apply' },
  ];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="offer-welcome" className="fixed inset-0 z-[70] grid place-items-center bg-ink-950/50 p-4" onClick={close}>
      <div className="menu-pop w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative bg-brand-700 px-6 pb-6 pt-5 text-white">
          <button onClick={close} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
          <OfferFlags size={26} />
          <p className="mt-4 text-[56px] font-bold leading-none tabular-nums">{balance}</p>
          <h2 id="offer-welcome" className="mt-1 text-[20px] font-bold leading-tight">credited to your account</h2>
          <p className="mt-1 text-[14px] text-white/80">Enough for your first sponsorship document ($15). Attach it to an application. Get the visa sponsored.</p>
        </div>
        <ol className="space-y-2 px-6 py-5">
          {steps.map(({ icon: Icon, t }, i) => (
            <li key={t} className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8]">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-semibold text-ink-900">
                <span className="mr-1.5 tabular-nums text-ink-400">{i + 1}</span>
                {t}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex gap-2 px-6 pb-6">
          <button
            onClick={() => {
              close();
              nav('/offers');
            }}
            className="flex-1 rounded-xl bg-[#1D4ED8] py-3 text-[15px] font-bold text-white hover:bg-brand-800"
          >
            Make my free document
          </button>
          <button onClick={close} className="rounded-xl px-4 py-3 text-[14px] font-semibold text-ink-600 hover:bg-ink-50">
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
