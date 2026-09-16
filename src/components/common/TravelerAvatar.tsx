const BACKGROUND_COLORS = 'b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf,c9f2c7';

type TravelerAvatarProps = {
  /** Stable per-user seed — usually the profile id or email */
  seed: string;
  size?: number;
  className?: string;
};

/**
 * Illustrated, colorful avatar generated from DiceBear's free HTTP API
 * (https://api.dicebear.com — no key, MIT licensed). The same seed
 * always renders the same avatar, so a signed-in user's picture stays
 * consistent across sessions without ever needing an upload.
 */
export function TravelerAvatar({ seed, size = 36, className = '' }: TravelerAvatarProps) {
  const src = `https://api.dicebear.com/10.x/adventurer/svg?seed=${encodeURIComponent(
    seed
  )}&backgroundColor=${BACKGROUND_COLORS}`;

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full border border-ink-100 bg-ink-50 object-cover ${className}`}
    />
  );
}
