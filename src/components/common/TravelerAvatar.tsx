import { User } from 'lucide-react';

type TravelerAvatarProps = {
  /** Stable per-user seed — usually the profile id or email. Kept for
   * backwards compatibility with existing callers, but no longer drives
   * an illustration — see below. */
  seed: string;
  /** The user's actual uploaded photo (profile.avatar_url). When set,
   * this is what renders — a real photo always wins over any fallback. */
  avatarUrl?: string | null;
  size?: number;
  className?: string;
};

/**
 * A user's real photo when they have one (avatarUrl), or a plain
 * classic profile icon otherwise. Previously this always generated a
 * colorful illustrated avatar from DiceBear regardless of whether the
 * person had actually uploaded a real photo — avatar_url has existed on
 * the profile this whole time (see src/lib/auth.tsx) but was never
 * checked here, so a real upload was silently ignored everywhere this
 * component was used outside of ProfilePage (which did its own manual
 * avatar_url check around this component rather than through it).
 */
export function TravelerAvatar({ avatarUrl, size = 36, className = '' }: TravelerAvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full border border-ink-100 dark:border-ink-800 object-cover ${className}`}
      />
    );
  }

  return (
    <span
      style={{ width: size, height: size }}
      className={`grid shrink-0 place-items-center rounded-full border border-ink-200 dark:border-ink-700 bg-ink-100 dark:bg-ink-800 text-ink-400 ${className}`}
    >
      <User style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}
