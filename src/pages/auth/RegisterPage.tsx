import { useSeo } from '@/lib/seo';
import { EmailCodeAuth } from '@/components/auth/EmailCodeAuth';

/** Kept for the (now unused) "check your inbox" page's props. */
export type PendingSignup = {
  email: string;
  fullName: string;
  phone: string;
  countryName: string | null;
  nationalityName: string | null;
  role: 'customer' | 'agency' | 'government';
};

type RegisterPageProps = {
  onSwitchToLogin: () => void;
  onHome?: () => void;
  /** Unused since sign-up became passwordless (email code). */
  onPendingConfirmation?: (info: PendingSignup) => void;
};

/**
 * Create an account: just an email (or Google). We email a code; typing it
 * creates the account and signs you in. Your name is asked right after.
 * Organizations set up their company later from Profile.
 */
export function RegisterPage({ onSwitchToLogin, onHome }: RegisterPageProps) {
  useSeo({ title: 'Create account', description: 'Create your free MadeVisa account.', path: '/register', noindex: true });
  return <EmailCodeAuth mode="register" onSwitch={onSwitchToLogin} onHome={onHome} />;
}
