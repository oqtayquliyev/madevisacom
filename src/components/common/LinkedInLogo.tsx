/** LinkedIn's "in" mark, in LinkedIn blue. */
export function LinkedInLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path
        fill="#fff"
        d="M7.1 9.6h-2.7V19h2.7V9.6ZM5.75 5a1.55 1.55 0 1 0 0 3.1 1.55 1.55 0 0 0 0-3.1ZM19.6 13.8c0-2.5-.54-4.4-3.46-4.4-1.4 0-2.35.77-2.73 1.5h-.04V9.6h-2.6V19h2.7v-4.65c0-1.23.23-2.42 1.75-2.42 1.5 0 1.52 1.4 1.52 2.5V19h2.7l.16-5.2Z"
      />
    </svg>
  );
}
