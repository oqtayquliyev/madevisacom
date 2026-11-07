import { useEffect } from 'react';
import { BookOpen, Check, Download, Globe2, ShieldCheck, Smartphone } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { WRAP } from '@/lib/pageLayout';
import { BOOK, BOOK_ONLY_PRICE, MEMBERSHIP_PRICE } from '@/lib/plans';
import { trackBook, useBookPromo } from '@/lib/bookPromo';
import { BOOK_INSIDE } from '@/data/bookPromo';
import { BookReviews, BuyOptions, CareerOutlook, Stars } from '@/components/book/BookPromo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';

// /book — the book's own page, laid out like a store product page: cover on the left, title,
// rating and description in the middle, the buy box on the right; then the career outlook,
// what's inside, product details and the six reviews. Server-rendered copy for search engines:
// api/seo.ts (slug "book"), with Book + Product structured data.

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

export const BOOK_DESCRIPTION = `${BOOK.title}: how AI is changing 40+ industries, which responsibilities stay human, and how to adapt with remote work, freelancing and your own digital product. Book ${BOOK_ONLY_PRICE}, or with one year of MadeVisa membership for ${MEMBERSHIP_PRICE}.`;

export function BookPage({ go, onAuth }: Props) {
  const c = useBookPromo();
  useSeo({ title: `${BOOK.title} — Book | MadeVisa`, description: BOOK_DESCRIPTION, path: '/book', ogImage: `https://madevisa.com${BOOK.cover}` });
  useEffect(() => trackBook('shown', 'page'), []);
  const published = c.reviews.filter((r) => r.published).length;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />
      <main className={`${WRAP} py-8 sm:py-12`}>
        <nav className="text-[13px] text-ink-500" aria-label="Breadcrumb">
          <a href="/" className="hover:underline">MadeVisa</a> › <span>Books</span> › <span className="text-ink-800">{BOOK.title}</span>
        </nav>

        {/* Product: cover · details · buy box */}
        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,3.4fr)]">
          <div className="flex justify-center lg:sticky lg:top-24 lg:self-start">
            <img src={BOOK.cover} alt={`${BOOK.title} — book cover`} width={600} height={778} className="h-auto w-full max-w-[380px] rounded-[4px] shadow-2xl ring-1 ring-ink-200" />
          </div>

          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-rose-600">2027 job market prediction · eBook</p>
            <h1 className="mt-2 font-title text-[30px] font-bold leading-[1.12] tracking-tight text-ink-950 sm:text-[38px]">{BOOK.title}</h1>
            <p className="mt-2 text-[17px] italic text-ink-600">{BOOK.subtitle}</p>
            <p className="mt-2 text-[14px] text-ink-600">
              by <span className="font-semibold text-brand-700">MadeVisa</span>
            </p>
            <a href="#reviews" className="mt-3 flex items-center gap-2 text-[14px] text-ink-700 hover:underline">
              <span className="font-bold">{c.rating.toFixed(1)}</span> <Stars value={c.rating} /> <span className="text-brand-700">{published} ratings</span>
            </a>
            <hr className="my-5 border-ink-200" />
            <p className="flex items-baseline gap-3">
              <span className="text-[30px] font-bold text-ink-950">{BOOK_ONLY_PRICE}</span>
              <span className="text-[14px] text-ink-600">
                or <strong className="text-ink-950">{MEMBERSHIP_PRICE}</strong> with 1 year of MadeVisa
              </span>
            </p>
            <h2 className="mt-6 text-[18px] font-bold text-ink-950">Your next career chapter starts with understanding what’s changing.</h2>
            <p className="mt-2 text-[15px] leading-7 text-ink-700">
              This guide explores how AI is transforming different industries, which responsibilities remain important, where new opportunities are emerging and how professionals can adapt. It includes industry- and profession-specific analysis — not a personal report.
            </p>
            <ul className="mt-4 space-y-2">
              {BOOK_INSIDE.map((t) => (
                <li key={t} className="flex gap-2 text-[15px] text-ink-800">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {t}
                </li>
              ))}
            </ul>
            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [BookOpen, 'Format', 'Digital eBook'],
                [Globe2, 'Language', 'English'],
                [Smartphone, 'Reads on', 'Phone, tablet, PC'],
                [Download, 'Delivery', 'Instant'],
              ].map(([Icon, k, v]) => {
                const I = Icon as typeof BookOpen;
                return (
                  <div key={k as string} className="rounded-xl bg-white p-3 text-center ring-1 ring-ink-200">
                    <I className="mx-auto h-5 w-5 text-ink-500" aria-hidden />
                    <dt className="mt-1 text-[11.5px] text-ink-500">{k as string}</dt>
                    <dd className="text-[13px] font-semibold text-ink-900">{v as string}</dd>
                  </div>
                );
              })}
            </dl>
          </div>

          {/* Buy box */}
          <aside id="buy" className="h-fit rounded-2xl bg-white p-5 ring-1 ring-ink-200 lg:sticky lg:top-24">
            <p className="text-[13px] font-semibold text-emerald-700">In stock · instant digital delivery</p>
            <BuyOptions placement="page" className="mt-4 !grid-cols-1" />
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-ink-500">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Secure checkout by Gumroad · pay once
            </p>
          </aside>
        </div>

        <CareerOutlook placement="book" className="mt-14" />

        <BookReviews className="mt-14 scroll-mt-24" />
        <div id="reviews" />
      </main>
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
