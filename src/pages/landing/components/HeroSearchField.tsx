import { Search } from 'lucide-react';

export type HeroOption = {
  id: string;
  label: string;
  countryCode?: string;
};

type HeroSearchFieldProps = {
  label: string;
  value: HeroOption;
  options: HeroOption[];
  onChange: (option: HeroOption) => void;
};

export function HeroSearchField({
  label,
  value,
  options,
  onChange,
}: HeroSearchFieldProps) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold text-ink-700">
        {label}
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />

        <select
          value={value?.id ?? ''}
          onChange={(event) => {
            const selected = options.find(
              (option) => option.id === event.target.value
            );

            if (selected) {
              onChange(selected);
            }
          }}
          className="h-12 w-full appearance-none rounded-lg border border-ink-200 bg-white pl-10 pr-3 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}