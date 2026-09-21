export type FetchedJob = {
  externalId: string;
  title: string;
  locationText: string;
  descriptionHtml: string;
  url: string;
  updatedAt: string;
};

/**
 * Greenhouse's public Job Board API — no auth required for GET.
 * https://developers.greenhouse.io/job-board.html
 *
 * `boardToken` is the slug in the company's own board URL, e.g. for
 * https://boards.greenhouse.io/stripe the token is "stripe".
 */
export async function fetchGreenhouseJobs(boardToken: string): Promise<{ ok: boolean; jobs: FetchedJob[]; error?: string }> {
  const token = boardToken.trim().toLowerCase();
  if (!token) return { ok: false, jobs: [], error: 'Enter a board token.' };

  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`
    );
    if (!res.ok) {
      return { ok: false, jobs: [], error: `Greenhouse returned ${res.status} — check the board token.` };
    }
    const data = await res.json();
    const jobs: FetchedJob[] = (data.jobs ?? []).map((j: Record<string, unknown>) => ({
      externalId: String(j.id),
      title: String(j.title ?? 'Untitled role'),
      locationText: String((j.location as { name?: string } | undefined)?.name ?? ''),
      descriptionHtml: String(j.content ?? ''),
      url: String(j.absolute_url ?? ''),
      updatedAt: String(j.updated_at ?? ''),
    }));
    return { ok: true, jobs };
  } catch (err) {
    return { ok: false, jobs: [], error: err instanceof Error ? err.message : 'Fetch failed.' };
  }
}

/** Strips HTML tags down to plain text for the short description field — the
 * detail page can still show the richer version later if we decide to store HTML. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
