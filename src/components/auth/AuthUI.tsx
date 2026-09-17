import { type ReactNode, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { handleNavClick } from '@/lib/navLink';
import { AuthSidePanel } from './AuthSidePanel';

export function AuthCard({
  children,
  title,
  subtitle,
  onHome,
  showSidePanel = false,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  onHome?: () => void;
  showSidePanel?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#f7f9fc] lg:grid lg:grid-cols-2">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-12">
        <a
          href="/"
          onClick={(event) => handleNavClick(event, () => onHome?.())}
          className="mb-8 inline-flex w-fit items-center"
          aria-label="MadeVisa home"
        >
          <Logo />
        </a>
        <div className="rounded-3xl border border-ink-200 bg-white p-6 shadow-soft-lg sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-ink-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
      {showSidePanel && <AuthSidePanel />}
    </div>
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
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-sm text-ink-800 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
      />
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
