import { Globe2 } from 'lucide-react';

type CircleFlagProps = {
  countryCode?: string | null;
  label?: string;
  size?: number;
  className?: string;
};

/**
 * Renders a country flag as a circular icon using the circle-flags CDN
 * (https://github.com/HatScripts/circle-flags) instead of emoji, which
 * render inconsistently across OS/browsers and look out of place next
 * to the rest of the UI. Falls back to a generic globe circle if the
 * code is missing/unknown or the image fails to load.
 */
export function CircleFlag({ countryCode, label, size = 24, className = '' }: CircleFlagProps) {
  const code = countryCode?.toLowerCase();

  if (!code) {
    return (
      <span
        style={{ width: size, height: size }}
        className={`grid shrink-0 place-items-center rounded-full bg-ink-100 text-ink-400 ${className}`}
        title={label}
      >
        <Globe2 style={{ width: size * 0.6, height: size * 0.6 }} />
      </span>
    );
  }

  return (
    <img
      src={`https://hatscripts.github.io/circle-flags/flags/${code}.svg`}
      alt={label ? `${label} flag` : ''}
      title={label}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full border border-ink-100 object-cover ${className}`}
      onError={(event) => {
        event.currentTarget.style.visibility = 'hidden';
      }}
    />
  );
}
