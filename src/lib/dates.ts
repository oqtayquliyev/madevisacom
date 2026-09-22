/** Short display date ("Jan 12, 2026"), or a clear fallback when the input isn't a real date — used wherever a possibly-missing date (e.g. a job's scraped posting date) needs to say "Not specified" rather than being silently hidden or showing "Invalid Date". */
export function formatShortDate(iso: string | null | undefined, fallback = 'Not specified'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
