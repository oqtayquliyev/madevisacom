import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Building2, ChevronDown, MessageSquarePlus, Search } from 'lucide-react';
import type { DirectoryCompany } from '@/lib/companies';

/**
 * "Applied and heard nothing?" — invites people to share how an application
 * went: pick a company from the list (or type one), or tap a logo.
 */
export function SharePromo({
  companies,
  onPick,
  title = 'Applied and heard nothing? Make it count.',
  text = 'Share how your application went — silence, rejection or interview. It stays private and only adds to the totals, so the next applicant knows where their time is well spent.',
  footer,
  className = 'mb-8',
  bare = false,
}: {
  companies: DirectoryCompany[];
  onPick: (c: { id?: string | null; name: string; logo_url?: string | null } | null) => void;
  title?: string;
  text?: string;
  footer?: ReactNode;
  className?: string;
  /** No card background — for use inside a blue page header. */
  bare?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  // Quick pick: the biggest companies (most open listings) that have a logo,
  // as many as fill two full rows of the box.
  const pickRef = useRef<HTMLDivElement>(null);
  const [perRow, setPerRow] = useState(8);
  useEffect(() => {
    const el = pickRef.current;
    if (!el) return;
    const measure = () => setPerRow(Math.max(4, Math.floor((el.clientWidth + 8) / (40 + 8))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const quick = useMemo(
    () =>
      companies
        .filter((c) => c.logo_url)
        .sort((a, b) => b.active_jobs + b.active_programs - (a.active_jobs + a.active_programs))
        .slice(0, perRow * 2),
    [companies, perRow],
  );
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? companies.filter((c) => c.name.toLowerCase().includes(t)) : companies).slice(0, 8);
  }, [companies, q]);
  const pick = (c: DirectoryCompany) => {
    onPick({ id: c.id, name: c.name, logo_url: c.logo_url });
    setQ('');
    setOpen(false);
  };

  return (
    <section className={`relative z-20 text-white ${bare ? '' : 'rounded-xl bg-brand-700 p-5 sm:p-7'} ${className}`}>
      {/* Decoration is clipped on its own layer, so the company list can drop below the box. */}
      <div className={`pointer-events-none absolute inset-0 overflow-hidden rounded-xl ${bare ? 'hidden' : ''}`}>
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-20 right-40 h-40 w-40 rounded-full bg-white/5" />
      </div>
      <div className="relative grid gap-6 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-center">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold">
            <MessageSquarePlus className="h-3.5 w-3.5" /> 20 seconds · private
          </p>
          {bare ? (
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-[40px]">{title}</h1>
          ) : (
            <h2 className="mt-3 text-2xl font-bold leading-tight sm:text-[28px]">{title}</h2>
          )}
          <p className="mt-2 max-w-xl text-[15px] leading-6 text-white/80">{text}</p>
          {footer && <div className="mt-4">{footer}</div>}
        </div>
        <div className="rounded-xl bg-white p-3 text-ink-900 shadow-lg shadow-black/10">
          <div className="relative flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || q.trim().length < 2) return;
                  const exact = matches.find((m) => m.name.toLowerCase() === q.trim().toLowerCase());
                  if (exact) pick(exact);
                  else {
                    onPick({ name: q.trim() });
                    setQ('');
                  }
                }}
                placeholder="Which company did you apply to?"
                className="h-11 w-full rounded-lg border border-ink-200 pl-9 pr-8 text-sm outline-none transition focus:border-[#1D4ED8]"
              />
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              {open && (
                <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-ink-200 bg-white py-1 shadow-xl">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[#1D4ED8]/5">
                        <MiniLogo url={c.logo_url} />
                        <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                        <span className="text-[11px] text-ink-400">{c.active_jobs.toLocaleString()} jobs</span>
                      </button>
                    </li>
                  ))}
                  {q.trim().length >= 2 && (
                    <li className="border-t border-ink-100">
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick({ name: q.trim() }), setQ(''), setOpen(false))} className="w-full px-3 py-2 text-left text-[13px] text-[#1D4ED8] hover:bg-[#1D4ED8]/5">
                        Not listed? Share about “{q.trim()}”
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
            <button
              onClick={() => (q.trim().length >= 2 ? (onPick({ name: q.trim() }), setQ('')) : onPick(null))}
              className="shrink-0 rounded-lg bg-[#1D4ED8] px-4 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              Share
            </button>
          </div>
          <div className="mt-3" ref={pickRef}>
            {quick.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Quick pick · top companies</p>}
            {quick.length > 0 && (
              <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
                {quick.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => pick(c)}
                    title={c.name}
                    className="grid aspect-square w-full max-w-[48px] place-items-center justify-self-center rounded-lg border border-ink-100 bg-white p-1 transition hover:-translate-y-0.5 hover:border-[#1D4ED8]/40 hover:shadow-md"
                  >
                    <img src={c.logo_url!} alt={c.name} className="max-h-full max-w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniLogo({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-6 w-6 shrink-0 rounded border border-ink-100 bg-white object-contain p-0.5" />
  ) : (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[#1D4ED8]/10">
      <Building2 className="h-3 w-3 text-[#1D4ED8]/60" />
    </span>
  );
}

