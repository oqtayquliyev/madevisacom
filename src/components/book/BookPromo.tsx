import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Loader2, Star, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { BOOK, BOOK_ONLY_PRICE, MEMBERSHIP_PRICE, useMembership } from '@/lib/plans';
import { goToBookCheckout, goToMembershipCheckout } from '@/lib/gumroad';
import { markPromo, promoDue, trackBook, useBookPromo, useProfession } from '@/lib/bookPromo';
import { CATEGORIES_BY_GROUP } from '@/lib/jobTaxonomy';
import { GENERAL_INSIGHT, type BookReview } from '@/data/bookPromo';
import { nav } from '@/lib/pageLayout';

// The book promotion pieces: the career outlook (profession → insight → book), the stars,
// the six reviews, and the two buy options. Used by /book, the jobs page and the dashboard.

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }} aria-hidden>
            <Star className="absolute inset-0 text-amber-400" style={{ width: size, height: size }} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="fill-amber-400 text-amber-400" style={{ width: size, height: size }} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function BookReviews({ className = '' }: { className?: string }) {
  const c = useBookPromo();
  const list = c.reviews.filter((r) => r.published);
  if (!list.length) return null;
  return (
    <section className={className} aria-labelledby="book-reviews">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="book-reviews" className="text-2xl font-bold tracking-tight text-ink-950">Customer reviews</h2>
        <span className="flex items-center gap-2 text-[15px] font-semibold text-ink-800">
          <Stars value={c.rating} size={18} /> {c.rating.toFixed(1)} out of 5
        </span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((r) => (
          <ReviewCard key={r.id} r={r} />
        ))}
      </div>
    </section>
  );
}

function ReviewCard({ r }: { r: BookReview }) {
  return (
    <figure className="flex h-full flex-col rounded-2xl bg-white p-5 ring-1 ring-ink-200">
      <Stars value={r.rating} />
      <blockquote className="mt-3 flex-1 text-[14.5px] leading-6 text-ink-800">“{r.text}”</blockquote>
      <figcaption className="mt-4 flex items-center gap-3 border-t border-ink-100 pt-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-700">{r.name.charAt(0)}</span>
        <span>
          <span className="block text-[14px] font-bold text-ink-950">{r.name}</span>
          <span className="block text-[12.5px] text-ink-500">{r.profession} · Verified buyer</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** The two options, side by side. Prices come from the plan catalogue (checked against Gumroad on the server). */
export function BuyOptions({ placement, profession, className = '' }: { placement: string; profession?: string | null; className?: string }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<'book' | 'bundle' | null>(null);
  const buy = async (what: 'book' | 'bundle') => {
    if (busy) return;
    setBusy(what);
    trackBook('click', `${placement}_${what}`, profession);
    if (what === 'book') await goToBookCheckout({ email: user?.email ?? null, source: `book_${placement}` });
    else await goToMembershipCheckout({ signedIn: Boolean(user), email: user?.email ?? null, source: `book_${placement}` });
    window.setTimeout(() => setBusy(null), 1500);
  };
  const box = (what: 'book' | 'bundle', title: string, price: string, points: string[], cta: string, best = false) => (
    <div className={`relative flex flex-col rounded-2xl p-5 ${best ? 'bg-white ring-2 ring-brand-600' : 'bg-white ring-1 ring-ink-200'}`}>
      {best && <span className="absolute -top-3 left-5 rounded-full bg-[#FFD60A] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-950">Best value</span>}
      <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">{title}</p>
      <p className="mt-1 text-[34px] font-bold leading-none tracking-tight text-ink-950">{price}</p>
      <ul className="mt-4 flex-1 space-y-2">
        {points.map((p) => (
          <li key={p} className="flex gap-2 text-[14px] text-ink-800">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {p}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => void buy(what)}
        disabled={busy != null}
        className={`mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold disabled:opacity-80 ${best ? 'bg-brand-600 text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] hover:bg-brand-700' : 'bg-ink-950 text-white hover:bg-ink-800'}`}
      >
        {busy === what ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <>{cta} <ArrowRight className="h-4 w-4" aria-hidden /></>}
      </button>
    </div>
  );
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${className}`}>
      {box('book', 'Book only', BOOK_ONLY_PRICE, ['Complete digital book', 'One-time payment', 'Digital delivery'], `Buy the Book — ${BOOK_ONLY_PRICE}`)}
      {box('bundle', 'Book + 1 year MadeVisa membership', MEMBERSHIP_PRICE, ['The complete digital book is included', 'One year of MadeVisa membership', 'Access to 500,000+ more jobs a month', 'Smart CV matching and every member benefit'], `Get Full Access — ${MEMBERSHIP_PRICE}`, true)}
    </div>
  );
}

/**
 * "Your profession is changing": the visitor's profession (picked, or guessed from their last
 * search — never claimed from a CV), its insight, and the book. `compact` = a card in a list,
 * shown at most once every few days and dismissible. Hidden for members except on /book.
 */
export function CareerOutlook({ placement, compact = false, className = '' }: { placement: 'book' | 'jobs' | 'home' | 'dashboard' | 'cv'; compact?: boolean; className?: string }) {
  const c = useBookPromo();
  const { member, ready } = useMembership();
  const { label, insight, source, choose } = useProfession(c.insights);
  const enabled = placement === 'book' || placement === 'cv' || c.placements[placement as 'jobs' | 'home' | 'dashboard'];
  const [show, setShow] = useState(() => !compact || promoDue(placement, c.frequencyDays));
  // The book page and the homepage show it to everyone; elsewhere only to people who aren't members.
  const visible = enabled && show && (placement === 'book' || placement === 'home' || (ready && !member));

  useEffect(() => {
    if (!visible) return;
    trackBook('shown', placement, label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  if (!visible) return null;

  const picker = (
    <label className="mt-3 flex flex-wrap items-center gap-2 text-[14px] text-ink-700">
      <span className="font-semibold">Your specialization:</span>
      <select value={label ?? ''} onChange={(e) => choose(e.target.value)} className="h-11 w-full rounded-lg border border-ink-300 bg-white px-3 text-[16px] font-semibold text-ink-950 sm:h-10 sm:w-auto sm:max-w-[320px] sm:text-[14px]">
        <option value="">Choose your field…</option>
        {CATEGORIES_BY_GROUP.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.labels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {source === 'search' && <span className="text-[12px] text-ink-500">Found from your last search — change it anytime.</span>}
    </label>
  );

  return (
    <section className={`relative overflow-hidden rounded-2xl bg-[#F6F1E8] ring-1 ring-[#E8DFCF] ${compact ? 'p-5' : 'p-6 sm:p-8'} ${className}`} aria-label="Your career outlook">
      {compact && (
        <button type="button" onClick={() => { setShow(false); markPromo(placement); }} aria-label="Dismiss" className="absolute right-3 top-3 rounded-full p-1.5 text-ink-500 hover:bg-white">
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="flex flex-col-reverse gap-5 sm:flex-row-reverse sm:items-center sm:gap-7">
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-rose-600">Your career outlook</p>
          <h2 className={`mt-1.5 font-title font-bold leading-[1.15] tracking-tight text-ink-950 ${compact ? 'text-[22px]' : 'text-[28px] sm:text-[34px]'}`}>
            Your profession is changing. Here’s what comes next.
          </h2>
          {picker}
          <blockquote className={`mt-4 rounded-xl border-l-4 border-rose-500 bg-white px-4 py-3 text-ink-800 ${compact ? 'text-[14.5px] leading-6' : 'text-[15.5px] leading-7'}`}>
            {insight}
          </blockquote>
          <p className="mt-2 text-[11.5px] text-ink-400">General industry insight — not an analysis of your CV.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                trackBook('click', placement, label);
                if (placement === 'book') document.getElementById('buy')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                else nav('/book');
              }}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-[15px] font-bold text-white hover:bg-brand-700 sm:w-auto"
            >
              {placement === 'book' ? 'Get your 2026–2027 career guide' : 'Explore your career outlook'} <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <button type="button" onClick={() => placement !== 'book' && nav('/book')} className={`shrink-0 self-center ${compact ? 'w-[210px] sm:w-[230px]' : 'w-[220px] sm:w-[260px]'}`} aria-label={BOOK.title}>
          <img src={BOOK.cover} alt={BOOK.title} width={574} height={600} loading="lazy" className="h-auto w-full" />
        </button>
      </div>
    </section>
  );
}

/** Five real pages from the book (public/book-preview/page-1…5.webp). */
export const BOOK_PREVIEW_PAGES = [1, 2, 3, 4, 5].map((n) => `/book-preview/page-${n}.webp`);

/** Small page previews under the cover; a click opens them large, with arrows to flip through. */
export function BookPreviewPages({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (open == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i == null ? i : (i + 1) % BOOK_PREVIEW_PAGES.length));
      if (e.key === 'ArrowLeft') setOpen((i) => (i == null ? i : (i - 1 + BOOK_PREVIEW_PAGES.length) % BOOK_PREVIEW_PAGES.length));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  return (
    <div className={className}>
      <p className="text-center text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-500">Look inside</p>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {BOOK_PREVIEW_PAGES.map((src, i) => (
          <button key={src} type="button" onClick={() => { setOpen(i); trackBook('click', 'preview'); }} className="overflow-hidden rounded-[3px] ring-1 ring-ink-200 transition hover:-translate-y-0.5 hover:ring-brand-500" aria-label={`Preview page ${i + 1}`}>
            <img src={src} alt="" width={910} height={1287} loading="lazy" className="h-auto w-full" />
          </button>
        ))}
      </div>
      {open != null &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink-950/85 p-3" onClick={(e) => e.target === e.currentTarget && setOpen(null)} role="dialog" aria-label="Book preview">
            <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
              <X className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => setOpen((open - 1 + BOOK_PREVIEW_PAGES.length) % BOOK_PREVIEW_PAGES.length)} aria-label="Previous page" className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:left-6">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <img src={BOOK_PREVIEW_PAGES[open]} alt={`Book page preview ${open + 1}`} className="max-h-[92vh] w-auto max-w-[92vw] rounded bg-white shadow-2xl" />
            <button type="button" onClick={() => setOpen((open + 1) % BOOK_PREVIEW_PAGES.length)} aria-label="Next page" className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:right-6">
              <ChevronRight className="h-6 w-6" />
            </button>
            <p className="absolute bottom-3 text-[13px] font-semibold text-white/80">
              {open + 1} / {BOOK_PREVIEW_PAGES.length}
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
