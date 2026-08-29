import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { CountryFlag } from './CountryFlag';

export type HeroOption = { id: string; label: string; countryCode?: string; icon?: React.ComponentType<{ className?: string }> };

type HeroSearchFieldProps = { label: string; value: HeroOption; options: HeroOption[]; onChange: (option: HeroOption) => void; renderValue?: (option: HeroOption) => ReactNode };

export function HeroSearchField({ label, value, options, onChange, renderValue }: HeroSearchFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));
  const ValueIcon = value.icon;

  return (
    <div className="relative">
      <label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label>
      <button onClick={() => setOpen(!open)} className="flex h-12 w-full items-center justify-between rounded-lg border border-ink-200 bg-white px-3 text-left text-sm font-medium text-ink-800 hover:border-brand-300">
        <span className="flex min-w-0 items-center gap-2.5">
          {value.countryCode ? <CountryFlag code={value.countryCode} name={value.label} /> : ValueIcon && <ValueIcon className="h-4 w-4 shrink-0 text-brand-600" />}
          <span className="truncate">{renderValue ? renderValue(value) : value.label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-ink-200 bg-white p-1 shadow-soft-xl">
          <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-ink-400" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search options" className="w-full bg-transparent text-xs outline-none" />
          </div>
          {filtered.map((option) => {
            const OptionIcon = option.icon;
            return <button key={option.id} onClick={() => { onChange(option); setOpen(false); setQuery(''); }} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-50">
              {option.countryCode ? <CountryFlag code={option.countryCode} name={option.label} /> : OptionIcon && <OptionIcon className="h-4 w-4 text-brand-600" />}
              <span className="flex-1">{option.label}</span>
              {option.id === value.id && <Check className="h-4 w-4 text-brand-600" />}
            </button>;
          })}
        </div>
      )}
    </div>
  );
}
