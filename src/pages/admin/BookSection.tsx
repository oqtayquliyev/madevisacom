import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { loadBookPromo, saveBookPromo } from '@/lib/bookPromo';
import { DEFAULT_BOOK_PROMO, type BookPromoContent, type BookReview, type ProfessionInsight } from '@/data/bookPromo';
import { BOOK, BOOK_ONLY_PRICE, MEMBERSHIP_PRICE } from '@/lib/plans';

// Admin → Book: the reviews (masked name, profession, text, stars, published, order), the displayed
// rating, profession insights, how often promos show and where. Saved as one JSON row (book_promo).
// Performance: Admin → Paywall, "by source" rows starting with "book_" (placement and profession).

const input = 'w-full rounded-lg border border-ink-300 bg-white px-2.5 py-1.5 text-[13.5px]';

export function BookSection() {
  const [c, setC] = useState<BookPromoContent>(DEFAULT_BOOK_PROMO);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => void loadBookPromo(true).then((v) => setC(structuredClone(v))), []);

  const set = (patch: Partial<BookPromoContent>) => setC((x) => ({ ...x, ...patch }));
  const setReview = (i: number, patch: Partial<BookReview>) => set({ reviews: c.reviews.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const setInsight = (i: number, patch: Partial<ProfessionInsight>) => set({ insights: c.insights.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const move = <T,>(list: T[], i: number, d: number): T[] => {
    const a = [...list];
    const j = i + d;
    if (j < 0 || j >= a.length) return a;
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  };
  const save = async () => {
    setMsg('Saving…');
    const err = await saveBookPromo(c);
    setMsg(err ?? 'Saved. The site shows it now.');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Book promotion</h2>
          <p className="text-[13px] text-ink-500">
            {BOOK.title} · Book only {BOOK_ONLY_PRICE} · Book + 1 year {MEMBERSHIP_PRICE} (prices: plans.ts, checked against Gumroad in Admin → Plans) ·{' '}
            <a href="/book" target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">
              open /book
            </a>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-[13px] text-ink-600">{msg}</span>}
          <button type="button" onClick={() => void save()} className="rounded-lg bg-ink-950 px-4 py-2 text-[14px] font-bold text-white">
            Save
          </button>
        </div>
      </div>

      <section className="grid gap-4 rounded-xl bg-white p-4 ring-1 ring-ink-200 sm:grid-cols-4">
        <label className="text-[13px] font-semibold">
          Displayed rating (out of 5)
          <input type="number" step="0.1" min={1} max={5} value={c.rating} onChange={(e) => set({ rating: Number(e.target.value) })} className={input} />
        </label>
        <label className="text-[13px] font-semibold">
          Show a promo again after (days)
          <input type="number" min={0} value={c.frequencyDays} onChange={(e) => set({ frequencyDays: Number(e.target.value) })} className={input} />
        </label>
        <fieldset className="text-[13px] sm:col-span-2">
          <legend className="font-semibold">Where the career outlook appears</legend>
          <div className="mt-1.5 flex flex-wrap gap-4">
            {(['jobs', 'home', 'dashboard', 'popup'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" checked={c.placements[k]} onChange={(e) => set({ placements: { ...c.placements, [k]: e.target.checked } })} /> {k}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Reviews ({c.reviews.filter((r) => r.published).length} published)</h3>
          <button
            type="button"
            onClick={() => set({ reviews: [...c.reviews, { id: `r${Date.now()}`, name: 'A*** B***', profession: '', text: '', rating: 5, published: false }] })}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1 ring-ink-300"
          >
            <Plus className="h-4 w-4" /> Add review
          </button>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-500">Use masked names (J*** A***). Only real customer feedback, shared with permission.</p>
        <div className="mt-3 space-y-3">
          {c.reviews.map((r, i) => (
            <div key={r.id} className="grid gap-2 rounded-xl bg-white p-3 ring-1 ring-ink-200 sm:grid-cols-[1fr_1fr_90px_auto]">
              <input value={r.name} onChange={(e) => setReview(i, { name: e.target.value })} placeholder="J*** A***" className={input} aria-label="Name" />
              <input value={r.profession} onChange={(e) => setReview(i, { profession: e.target.value })} placeholder="Profession" className={input} aria-label="Profession" />
              <select value={r.rating} onChange={(e) => setReview(i, { rating: Number(e.target.value) })} className={input} aria-label="Stars">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <label className="mr-1 flex items-center gap-1 text-[12.5px]">
                  <input type="checkbox" checked={r.published} onChange={(e) => setReview(i, { published: e.target.checked })} /> Published
                </label>
                <button type="button" aria-label="Up" onClick={() => set({ reviews: move(c.reviews, i, -1) })} className="p-1"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label="Down" onClick={() => set({ reviews: move(c.reviews, i, 1) })} className="p-1"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" aria-label="Remove" onClick={() => set({ reviews: c.reviews.filter((_, j) => j !== i) })} className="p-1 text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <textarea value={r.text} onChange={(e) => setReview(i, { text: e.target.value })} rows={2} placeholder="Review text" className={`${input} sm:col-span-4`} aria-label="Review" />
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Profession insights</h3>
          <button type="button" onClick={() => set({ insights: [...c.insights, { id: `p${Date.now()}`, label: '', keywords: [], insight: '' }] })} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1 ring-ink-300">
            <Plus className="h-4 w-4" /> Add profession
          </button>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-500">Keywords match the visitor’s last job search (comma-separated). Write each insight for that profession — not a template with the name swapped.</p>
        <div className="mt-3 space-y-3">
          {c.insights.map((p, i) => (
            <div key={p.id} className="grid gap-2 rounded-xl bg-white p-3 ring-1 ring-ink-200 sm:grid-cols-[1fr_2fr_auto]">
              <input value={p.label} onChange={(e) => setInsight(i, { label: e.target.value })} placeholder="Profession" className={input} aria-label="Profession" />
              <input value={p.keywords.join(', ')} onChange={(e) => setInsight(i, { keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} placeholder="keywords" className={input} aria-label="Keywords" />
              <button type="button" aria-label="Remove" onClick={() => set({ insights: c.insights.filter((_, j) => j !== i) })} className="p-1 text-rose-600"><Trash2 className="h-4 w-4" /></button>
              <textarea value={p.insight} onChange={(e) => setInsight(i, { insight: e.target.value })} rows={3} className={`${input} sm:col-span-3`} aria-label="Insight" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
