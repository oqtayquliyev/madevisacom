/** A grey bar where a locked answer would be (no real data in the page). */
export function Blur({ w = 120 }: { w?: number }) {
  return <span aria-hidden className="inline-block h-[1.05em] select-none rounded bg-gradient-to-r from-ink-300 via-ink-200 to-ink-300 align-middle blur-[3px]" style={{ width: w }} />;
}

