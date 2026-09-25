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
  const src = variant === 'footer' ? LOGO_FOOTER : LOGO_MAIN;
  const sizeClass = variant === 'footer' ? 'h-8' : 'h-6';

  return (
    <img
      src={src}
      alt="MadeVisa"
      className={`${sizeClass} w-auto object-contain ${className}`}
      style={style}
      onError={(event) => {
        const target = event.currentTarget;
        target.style.display = 'none';
        const fallback = target.nextElementSibling as HTMLElement | null;
        if (fallback) fallback.style.display = 'inline-flex';
      }}
    />
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

  // A real link to "/" so right-click → "Open link in new tab" works;
  // a plain click still runs the in-app navigation.
  return (
    <a
      href="/"
      onClick={(event) => {
        if (!onClick || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onClick();
      }}
      aria-label="MadeVisa home"
      className="flex items-center gap-2.5"
    >
      <Logo variant={variant} />
      <span
        style={{ display: 'none' }}
        className={`items-center text-lg font-bold tracking-tight ${
          isFooter ? 'text-white' : 'text-ink-950'
        }`}
      >
        madevisa<span className="text-brand-500">.</span>
      </span>
    </a>
  );
}
