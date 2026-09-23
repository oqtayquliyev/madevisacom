import { PartyPopper, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { TravelerAvatar } from '@/components/common/TravelerAvatar';
import type { View } from '@/types';

type WelcomeModalProps = {
  go: (view: View) => void;
};

/**
 * Shown once, right after a fresh sign-in/sign-up (see
 * lib/auth.tsx -> justSignedIn). Mount this near the root of the app,
 * inside AuthProvider — it renders nothing unless justSignedIn is true.
 */
export function WelcomeModal({ go }: WelcomeModalProps) {
  const { profile, justSignedIn, clearJustSignedIn } = useAuth();

  if (!justSignedIn || !profile) return null;

  const firstName = profile.full_name?.split(' ')[0] || 'there';

  const goToProfile = () => {
    clearJustSignedIn();
    go('profile');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/50 px-4">
      <div className="relative w-full max-w-sm border border-ink-200 bg-white p-6 text-center shadow-soft-lg sm:p-8">
        <button
          type="button"
          onClick={clearJustSignedIn}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-ink-400 hover:bg-ink-50 hover:text-ink-700"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto flex h-20 w-20 items-center justify-center">
          <TravelerAvatar seed={profile.id} avatarUrl={profile.avatar_url} size={80} className="border-2 border-white shadow-soft" />
        </div>

        <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-600">
          <PartyPopper className="h-3.5 w-3.5" />
          Welcome to MadeVisa
        </div>

        <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950">Hey, {firstName}!</h2>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          Your account is ready. Jobs, programs and visa experts are all matched to your profile from here on.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={goToProfile}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Go to my profile
          </button>
          <button
            type="button"
            onClick={clearJustSignedIn}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-ink-500 hover:bg-ink-50"
          >
            Start exploring
          </button>
        </div>
      </div>
    </div>
  );
}
