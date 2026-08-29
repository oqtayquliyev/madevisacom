type CountryFlagProps = { code: string; name: string; className?: string };

export function CountryFlag({ code, name, className = 'h-5 w-5' }: CountryFlagProps) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-100 ring-1 ring-ink-200 ${className}`}>
      <img src={`https://flagcdn.com/w80/${code.toLowerCase()}.png`} alt={`${name} flag`} className="h-full w-full object-cover" loading="lazy" />
    </span>
  );
}
