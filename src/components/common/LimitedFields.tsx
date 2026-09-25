import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

/**
 * Form fields with hard limits, so profile and organization fields can't
 * hold huge or junk text. The same limits are enforced by the database
 * (migration 20261002090000); these just make them visible while typing.
 */
export const FIELD_LIMITS = {
  fullName: 80,
  occupation: 80,
  education: 120,
  specialization: 120,
  experience: 1000,
  languageItems: 10,
  languageLength: 40,
  orgName: 120,
  website: 200,
  linkedin: 200,
  username: 30,
} as const;

// Control characters (except tab/newline) never belong in a profile field.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Strips control characters and collapses runs of spaces. */
export function cleanText(value: string, max: number): string {
  return value
    .replace(CONTROL_CHARS, '')
    .replace(/ {2,}/g, ' ')
    .slice(0, max);
}

/** "12 / 80" — grey normally, amber near the limit, red at it. */
export function CharCount({ value, max, className = '' }: { value: string; max: number; className?: string }) {
  const n = value.length;
  const tone = n >= max ? 'text-rose-600' : n >= max * 0.85 ? 'text-amber-600' : 'text-ink-400';
  return (
    <span className={`text-[11px] font-medium tabular-nums ${tone} ${className}`} aria-live="polite">
      {n} / {max}
    </span>
  );
}

/** Label row with a live character count on the right. */
export function LimitedLabel({ label, value, max, htmlFor }: { label: string; value: string; max: number; htmlFor?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-ink-500">
        {label}
      </label>
      <CharCount value={value} max={max} />
    </div>
  );
}

/**
 * A textarea that grows taller as you type (up to maxHeight, then it
 * scrolls) instead of hiding text behind a tiny box. Width never changes.
 */
export function AutoGrowTextarea({
  value,
  onChange,
  max,
  minRows = 3,
  maxHeight = 320,
  className = '',
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
  minRows?: number;
  maxHeight?: number;
  className?: string;
  id?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, maxHeight]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      maxLength={max}
      onChange={(e) => onChange(cleanText(e.target.value, max))}
      className={`resize-none ${className}`}
      {...rest}
    />
  );
}

/**
 * Chips input: type a value and press Enter or comma to add it; Backspace
 * on an empty box removes the last one. Pasting "English, Turkish" adds
 * both. Limited in count and in length per chip; duplicates are ignored.
 */
export function ChipsInput({
  values,
  onChange,
  maxItems,
  maxLength,
  placeholder,
  id,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  maxItems: number;
  maxLength: number;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState('');
  const full = values.length >= maxItems;

  const add = (raw: string) => {
    const parts = raw
      .split(/[,;\n]/)
      .map((p) => cleanText(p.trim(), maxLength))
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) {
      if (next.length >= maxItems) break;
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 py-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        {values.map((v) => (
          <span key={v} className="inline-flex max-w-full items-center gap-1 rounded bg-brand-50 py-1 pl-2 pr-1 text-xs font-semibold text-brand-800">
            <span className="truncate">{v}</span>
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
              className="grid h-4 w-4 place-items-center rounded text-brand-600 hover:bg-brand-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          disabled={full}
          maxLength={maxLength}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]/.test(v)) add(v);
            else setDraft(v);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => draft && add(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/[,;\n]/.test(text)) {
              e.preventDefault();
              add(text);
            }
          }}
          placeholder={full ? `${maxItems} max` : values.length ? 'Add another' : placeholder}
          className="h-7 min-w-[8rem] flex-1 bg-transparent px-1 text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400 disabled:cursor-not-allowed"
        />
      </div>
      <p className="mt-1 text-[11px] text-ink-400">
        Press Enter or comma to add · {values.length} / {maxItems}
      </p>
    </div>
  );
}
