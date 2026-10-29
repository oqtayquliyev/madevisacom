import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CircleFlag } from '@/components/common/CircleFlag';

export type ComboOption = {
  value: string;
  label: string;
  count?: number;
  /** Options with the same group are listed under one heading. */
  group?: string;
  /** Two-letter country code → shows a round flag. */
  flag?: string;
};

type Props = {
  label: string;
  icon: LucideIcon;
  value: string;
  /** Value meaning "no filter" (listed first). */
  allValue: string;
  allLabel: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Group headings can be clicked to pick the whole group; this maps a group name to its value. */
  groupValue?: (group: string) => string;
  /** Text for the button when a value is picked (defaults to the option label). */
  displayFor?: (value: string) => string;
  /** Which edge the list lines up with on larger screens. */
  align?: 'left' | 'right';
  className?: string;
  /** 'dark' = on a blue bar (default); 'light' = inside the white Filters panel; 'pill' = the jobs page's slim filter row. */
  tone?: 'dark' | 'light' | 'pill';
};

/**
 * Filter button for the dark /jobs hero: shows the current choice and opens
 * a list (searchable, grouped, with job counts). On phones the list opens
 * as a centred sheet so it never runs off the screen.
 */
export function FilterCombo({ label, icon: Icon, value, allValue, allLabel, options, onChange, searchable, searchPlaceholder, groupValue, displayFor, align = 'left', className = '', tone = 'dark' }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const active = value !== allValue;
  const current = options.find((o) => o.value === value);
  const shown = active ? displayFor?.(value) ?? current?.label ?? value : allLabel;

  useEffect(() => {
    if (!open) return;
    setQ('');
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s) || (o.group ?? '').toLowerCase().includes(s));
  }, [options, q]);

  // Keep group order as given; options inside keep their order too.
  const grouped = useMemo(() => {
    const out: { group: string | null; items: ComboOption[] }[] = [];
    for (const o of filtered) {
      const g = o.group ?? null;
      const last = out[out.length - 1];
      if (last && last.group === g) last.items.push(o);
      else out.push({ group: g, items: [o] });
    }
    return out;
  }, [filtered]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const row = (o: ComboOption, indent: boolean) => {
    const selected = o.value === value;
    return (
      <button
        key={o.value}
        type="button"
        onClick={() => pick(o.value)}
        className={`flex w-full items-center gap-2 rounded-md py-2 pr-2.5 text-left text-sm transition ${indent ? 'pl-5' : 'pl-2.5'} ${
          selected ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-700 hover:bg-ink-50'
        }`}
      >
        {o.flag && <CircleFlag countryCode={o.flag} label={o.label} size={16} />}
        <span className="min-w-0 flex-1 truncate">{o.label}</span>
        {o.count != null && <span className="shrink-0 text-xs tabular-nums text-ink-400">{o.count.toLocaleString()}</span>}
        {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
      </button>
    );
  };

  const pillButton = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`${label}: ${shown}`}
      className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] font-semibold transition ${
        active ? 'bg-brand-700 text-white hover:bg-brand-800' : 'bg-white text-ink-800 ring-1 ring-inset ring-ink-300 hover:ring-ink-500'
      }`}
    >
      {active && current?.flag ? <CircleFlag countryCode={current.flag} label={current.label} size={15} /> : null}
      <span className="max-w-[11rem] truncate">{active ? shown : label}</span>
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
    </button>
  );

  return (
    <div className={`relative min-w-0 ${tone === 'pill' ? 'shrink-0' : ''} ${className}`}>
      {tone === 'pill' ? pillButton : <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-11 w-full min-w-0 items-center gap-2 rounded-md border px-3 text-left transition ${
          tone === 'light'
            ? active
              ? 'border-brand-600 bg-brand-50 text-brand-700'
              : 'border-ink-300 bg-white text-ink-800 hover:border-brand-400'
            : active
              ? 'border-white bg-white text-brand-700'
              : 'border-white/25 bg-white/10 text-white hover:border-white/60 hover:bg-white/15'
        }`}
      >
        {active && current?.flag ? <CircleFlag countryCode={current.flag} label={current.label} size={16} /> : <Icon className="h-4 w-4 shrink-0 opacity-80" />}
        <span className="min-w-0 flex-1">
          <span className={`block text-[10px] font-semibold uppercase leading-3 tracking-wide ${active ? 'text-brand-500' : tone === 'light' ? 'text-ink-500' : 'text-white/60'}`}>{label}</span>
          <span className="block truncate text-[13px] font-semibold leading-5">{shown}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>}

      {open && (
        <>
          <button type="button" aria-label={`Close ${label}`} onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default bg-ink-950/30 sm:bg-transparent" />
          <div
            role="listbox"
            className={`fixed inset-x-4 top-[12vh] z-50 flex max-h-[76vh] flex-col overflow-hidden rounded-lg border border-ink-200 bg-white text-ink-900 shadow-2xl sm:absolute sm:inset-x-auto ${align === 'right' ? 'sm:right-0' : 'sm:left-0'} sm:top-full sm:mt-1.5 sm:max-h-[26rem] sm:w-[22rem]`}
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2 sm:hidden">
              <span className="text-sm font-bold">{label}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-ink-500 hover:bg-ink-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            {searchable && (
              <div className="flex items-center gap-2 border-b border-ink-100 px-3">
                <Search className="h-4 w-4 shrink-0 text-ink-400" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={searchPlaceholder ?? 'Search…'}
                  className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-ink-400"
                />
              </div>
            )}
            <div className="overflow-y-auto overscroll-contain p-1.5">
              {!q && row({ value: allValue, label: allLabel }, false)}
              {grouped.map((g) =>
                g.group ? (
                  <div key={g.group}>
                    {groupValue ? (
                      <button
                        type="button"
                        onClick={() => pick(groupValue(g.group as string))}
                        className={`sticky top-0 z-10 mt-1 flex w-full items-center justify-between bg-white px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide hover:text-brand-700 ${
                          value === groupValue(g.group) ? 'text-brand-700' : 'text-ink-500'
                        }`}
                      >
                        {g.group}
                        <span className="font-semibold normal-case tracking-normal text-brand-600">All</span>
                      </button>
                    ) : (
                      <p className="sticky top-0 z-10 mt-1 bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-500">{g.group}</p>
                    )}
                    {g.items.map((o) => row(o, true))}
                  </div>
                ) : (
                  <div key="_">{g.items.map((o) => row(o, false))}</div>
                )
              )}
              {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-400">Nothing matches “{q}”.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
