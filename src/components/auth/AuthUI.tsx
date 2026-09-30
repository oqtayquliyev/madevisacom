import { type ReactNode, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { handleNavClick } from '@/lib/navLink';
import { JobTicker } from '@/components/auth/JobTicker';

/**
 * Sign-in / register / reset layout: the form card sits on a light top
 * area and overlaps a MadeVisa-blue band below it (the job page's hero,
 * flipped), where real jobs drift past — a reason to finish signing up,
 * with nothing to click away to.
 */
export function AuthCard({
  children,
  title,
  subtitle,
  onHome,
  embedded = false,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  onHome?: () => void;
  /** Inside a dialog: just the form, no page around it. */
  embedded?: boolean;
}) {
  if (embedded) {
    return (
      <div>
        <h2 className="pr-8 text-2xl font-bold tracking-tight text-ink-950">{title}</h2>
        {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    );
  }

  const goBack = () => {
    // Back to wherever the visitor came from on MadeVisa; home otherwise.
    const cameFromHere = document.referrer && new URL(document.referrer).origin === window.location.origin;
    if (window.history.length > 1 && (cameFromHere || window.history.state !== null)) window.history.back();
    else onHome?.();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <div className="px-5 pt-5 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-[#2563EB]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <a href="/" onClick={(event) => handleNavClick(event, () => onHome?.())} className="inline-flex items-center" aria-label="MadeVisa home">
            <Logo />
          </a>
          {/* Balances the Back button so the logo stays centered. */}
          <span className="w-[76px]" aria-hidden="true" />
        </div>

        <div className="relative z-10 mx-auto mt-8 w-full max-w-md rounded-lg border border-ink-200 bg-white p-6 shadow-soft-lg sm:mt-10 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-ink-950">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>

      {/* Blue band: the card above overlaps into it. */}
      <section className="-mt-24 flex-1 bg-brand-700 pb-10 pt-32 text-white sm:-mt-28 sm:pb-12 sm:pt-36">
        <p className="px-5 text-center text-sm font-semibold text-white/85 sm:text-base">
          Jobs straight from company career pages, waiting for you
        </p>
        {/* Phones: no ticker — the moving rows don't run reliably there and
            only push the form's context further down. */}
        <div className="mx-auto mt-6 hidden max-w-[1400px] sm:block">
          <JobTicker />
        </div>
      </section>
    </div>
  );
}

/** A clearly visible back control — an icon + label pill at the top of
 *  a step, rather than a small text link easy to miss at the bottom. */
export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-600 transition hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

export function GoogleButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm font-semibold text-ink-700 shadow-soft transition hover:border-ink-300 hover:shadow-soft-lg disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
      {label}
    </button>
  );
}

export function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function Input({ label, type = 'text', value, onChange, placeholder, required, autoComplete }: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-600">{label}</span>
      <div className="relative">
        <input
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          className={`w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-sm text-ink-800 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100 ${isPassword ? 'pr-11' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            tabIndex={-1}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-ink-700"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </label>
  );
}

export function PrimaryButton({ children, onClick, loading, disabled, className = '' }: { children: ReactNode; onClick?: () => void; loading?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-700 disabled:opacity-50 ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-ink-200" />
      <span className="text-xs font-medium text-ink-400">{label}</span>
      <div className="h-px flex-1 bg-ink-200" />
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">{message}</div>;
}

export function useAuthForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { loading, setLoading, error, setError };
}
