import type { CSSProperties } from 'react';

const LOGO_MAIN =
  'https://res.cloudinary.com/dkvg0oo8c/image/upload/v1789479857/madevisa-logo-header_fqdylj.svg';
const LOGO_FOOTER =
  'https://res.cloudinary.com/dkvg0oo8c/image/upload/v1788950524/Logo-Footer_uqo16m.svg';

type LogoProps = {
  variant?: 'header' | 'footer';
  className?: string;
  /** Inline style, applied last so it reliably overrides the variant's
   * default size class — a className height override doesn't reliably
   * win here, since Tailwind's compiled stylesheet order (not the order
   * classes appear in the `class` attribute) decides which same-
   * category utility wins, and that's not something a caller can
   * control. Inline styles always beat classes on specificity, so this
   * is the one way to guarantee a custom size actually applies. */
  style?: CSSProperties;
};

/**
 * Renders the MadeVisa brand mark. Uses the redesigned Cloudinary-hosted
 * SVGs, with a plain-text fallback baked in via onError in case the asset
 * host is ever unreachable (offline preview, ad blockers, etc.).
 */
export function Logo({ variant = 'header', className = '', style }: LogoProps) {
  const sizeClass = variant === 'footer' ? 'h-8' : 'h-6';

  const onError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    target.style.display = 'none';
    const fallback = target.parentElement?.querySelector<HTMLElement>('[data-logo-fallback]');
    if (fallback) fallback.style.display = 'inline-flex';
  };

  if (variant === 'footer') {
    return <img src={LOGO_FOOTER} alt="MadeVisa" className={`${sizeClass} w-auto object-contain ${className}`} style={style} onError={onError} />;
  }

  // Header logo has dark lettering; in dark mode swap to the white-lettered
  // footer artwork at the same size so it stays readable.
  return (
    <>
      <img src={LOGO_MAIN} alt="MadeVisa" className={`${sizeClass} w-auto object-contain dark:hidden ${className}`} style={style} onError={onError} />
      <img
        src={LOGO_FOOTER}
        alt="MadeVisa"
        aria-hidden="true"
        className={`${sizeClass} hidden w-auto object-contain dark:inline-block ${className}`}
        style={style}
        onError={onError}
      />
    </>
  );
}

/** Wrapper that pairs the image logo with a hidden text fallback. */
export function BrandMark({
  variant = 'header',
  onClick,
}: {
  variant?: 'header' | 'footer';
  onClick?: () => void;
}) {
  const isFooter = variant === 'footer';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="MadeVisa home"
      className="flex items-center gap-2.5"
    >
      <Logo variant={variant} />
      <span
        data-logo-fallback
        style={{ display: 'none' }}
        className={`items-center text-lg font-bold tracking-tight ${
          isFooter ? 'text-white' : 'text-ink-950 dark:text-ink-50'
        }`}
      >
        madevisa<span className="text-brand-500">.</span>
      </span>
    </button>
  );
}
