/** The cards Gumroad takes, drawn as small marks (no images to load). */
export function CardMarks({ className = '' }: { className?: string }) {
  const box = 'grid h-6 w-10 place-items-center rounded-[4px] ring-1 ring-inset ring-ink-200';
  return (
    <div className={`flex items-center gap-1.5 ${className}`} aria-label="Visa, Mastercard, American Express, Discover and PayPal accepted">
      <span className={`${box} bg-white text-[11px] font-black italic tracking-tight text-[#1A1F71]`}>VISA</span>
      <span className={`${box} bg-[#252525]`}>
        <svg viewBox="0 0 24 16" className="h-4 w-6" aria-hidden>
          <circle cx="9" cy="8" r="6" fill="#EB001B" />
          <circle cx="15" cy="8" r="6" fill="#F79E1B" fillOpacity="0.9" />
        </svg>
      </span>
      <span className={`${box} bg-[#2E77BC] text-[8.5px] font-black tracking-tight text-white`}>AMEX</span>
      <span className={`${box} bg-white text-[6.5px] font-black tracking-tight text-ink-900`}>
        <span>
          DISC<span className="inline-block h-[6px] w-[6px] rounded-full bg-[#F58220] align-[-0.5px]" />VER
        </span>
      </span>
      <span className={`${box} bg-white text-[8.5px] font-black italic tracking-tight`}>
        <span>
          <span className="text-[#003087]">Pay</span>
          <span className="text-[#009CDE]">Pal</span>
        </span>
      </span>
    </div>
  );
}
