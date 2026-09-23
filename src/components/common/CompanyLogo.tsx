const PALETTE = [
  'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300',
  'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
  'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
  'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300',
  'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300',
  'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300',
  'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300',
];

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Deterministic circular initials avatar, used as a logo stand-in for companies. */
export function CompanyLogo({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      className={`grid shrink-0 place-items-center rounded-full font-bold ${colorFor(name)}`}
    >
      {initialsFor(name)}
    </span>
  );
}
