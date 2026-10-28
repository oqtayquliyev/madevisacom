import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { EmailCodeAuth } from '@/components/auth/EmailCodeAuth';
import { clearAuthIntent } from '@/lib/authIntent';

/**
 * Sign up / sign in on the page you're on — no trip to /register. Closes by
 * itself once the account is ready (onDone runs, e.g. to show more jobs).
 */
export function AuthDialog({ open, onClose, onDone, initial = 'register' }: { open: boolean; onClose: () => void; onDone?: () => void; initial?: 'login' | 'register' }) {
  const { session } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initial);

  useEffect(() => {
    if (open) setMode(initial);
  }, [open, initial]);

  useEffect(() => {
    if (open && session) {
      clearAuthIntent(); // signed in here — nothing to return to
      onClose();
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={mode === 'register' ? 'Create your free account' : 'Sign in'} data-over-job-modal className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="menu-pop relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900">
          <X className="h-5 w-5" />
        </button>
        <EmailCodeAuth embedded mode={mode} onSwitch={() => setMode((m) => (m === 'login' ? 'register' : 'login'))} />
      </div>
    </div>
  );
}
