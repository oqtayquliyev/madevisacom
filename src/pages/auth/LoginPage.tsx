import { useSeo } from '@/lib/seo';
import { EmailCodeAuth } from '@/components/auth/EmailCodeAuth';

type LoginPageProps = {
  onSwitchToRegister: () => void;
  onHome?: () => void;
};

/** Sign in with a code emailed to you (or Google) — no password. */
export function LoginPage({ onSwitchToRegister, onHome }: LoginPageProps) {
  useSeo({ title: 'Sign in', description: 'Sign in to your MadeVisa account.', path: '/login', noindex: true });
  return <EmailCodeAuth mode="login" onSwitch={onSwitchToRegister} onHome={onHome} />;
}
