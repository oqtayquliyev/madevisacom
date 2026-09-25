type TravelerAvatarProps = {
  /** Stable per-user seed — usually the profile id or email. Kept so
   * existing callers don't need changing; it doesn't affect the look. */
  seed?: string;
  /** The user's uploaded photo (profile.avatar_url). When set, it's shown. */
  avatarUrl?: string | null;
  size?: number;
  className?: string;
};

/**
 * A person's photo, or the MadeVisa default avatar (blue tile with a white
 * person) when there's no photo — used for guests and for accounts that
 * haven't uploaded one. Always a square with 4px rounded corners.
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
        className={`shrink-0 rounded object-cover ${className}`}
      />
    );
  }
  return <DefaultAvatar size={size} className={className} />;
}

/** The MadeVisa default profile avatar (square, 4px corners). */
export function DefaultAvatar({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 overflow-hidden rounded ${className}`}
    >
      <path d="M34 36H2C0.9 36 0 35.1 0 34V2C0 0.9 0.9 0 2 0H34C35.1 0 36 0.9 36 2V34C36 35.1 35.1 36 34 36Z" fill="#2563EB" />
      <path d="M18 21C22.4183 21 26 17.4183 26 13C26 8.58172 22.4183 5 18 5C13.5817 5 10 8.58172 10 13C10 17.4183 13.5817 21 18 21Z" fill="white" />
      <path d="M4.20001 36H31.9C30.9 29.2 25.1 24 18.1 24C11.1 24 5.10001 29.2 4.20001 36Z" fill="white" />
    </svg>
  );
}
