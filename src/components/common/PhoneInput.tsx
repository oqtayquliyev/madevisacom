import { callingCodes } from '@/data/callingCodes';

type PhoneInputProps = {
  /** ISO alpha-2 code of the currently selected country, if any */
  countryIsoCode?: string | null;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

/**
 * A phone field that shows the calling code (e.g. "+994") for whichever
 * country the person has selected elsewhere in the form, and lets them
 * type just the local number after it. `value`/`onChange` always carry
 * the full "+994 50 555 12 34" style string, so this drops in anywhere
 * a plain phone <Input> was used before.
 */
export function PhoneInput({ countryIsoCode, value, onChange, required }: PhoneInputProps) {
  const dialCode = countryIsoCode ? callingCodes[countryIsoCode.toUpperCase()] : undefined;

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-600">Phone{required ? '' : ' (optional)'}</span>
      <div className="flex overflow-hidden rounded-xl border border-ink-200 bg-white transition focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
        <span className="flex shrink-0 items-center border-r border-ink-200 bg-ink-50 px-3 text-sm font-semibold text-ink-600">
          {dialCode ?? '+ ?'}
        </span>
        <input
          type="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={dialCode ? '50 555 12 34' : 'Select a country first'}
          required={required}
          className="w-full px-3.5 py-3 text-sm text-ink-800 outline-none"
        />
      </div>
      {!dialCode && (
        <span className="mt-1 block text-xs text-ink-400">Pick a country above to see its dialing code.</span>
      )}
    </label>
  );
}
