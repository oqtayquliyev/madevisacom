import { supabase } from '@/lib/supabase';
import { backfillJobFacts, bulkSetJobStatus, purgeJunkJobs, type ImportCountryLookup } from '@/lib/admin';
import { syncImportSource, updateImportSource, type ImportSource } from '@/lib/importSync';

export type PipelineResult = { imported: number; published: number; detected: number; emptySources: ImportSource[]; errors: string[] };

/**
 * For freshly added companies, in one go:
 *   1. import their jobs (to pending)
 *   2. detect job details for anything still missing them
 *   3. publish those companies' pending jobs, and switch their sources to
 *      auto-publish so future syncs go live directly.
 */
export async function importDetectPublish(
  sources: ImportSource[],
  opts: {
    countries: ImportCountryLookup[];
    publish: boolean;
    onProgress?: (message: string) => void;
    onSourceDone?: (src: ImportSource, added: number, error?: string) => void;
    shouldStop?: () => boolean;
  }
): Promise<PipelineResult> {
  const say = opts.onProgress ?? (() => {});
  const stop = opts.shouldStop ?? (() => false);
  const out: PipelineResult = { imported: 0, published: 0, detected: 0, emptySources: [], errors: [] };
  if (!sources.length) return out;

  // 1. Import (2 companies at a time).
  let next = 0;
  let done = 0;
  const live = new Map<string, string>();
  const show = () => say(`Importing jobs: ${done} of ${sources.length} companies${live.size ? ` — ${[...live.values()].join(' · ')}` : ''}`);
  await Promise.all(
    Array.from({ length: Math.min(2, sources.length) }, async () => {
      while (next < sources.length && !stop()) {
        const src = sources[next++];
        live.set(src.id, `${src.publisher?.name ?? 'Company'}: starting…`);
        show();
        const res = await syncImportSource(src, {
          countries: opts.countries,
          removal: 'expire',
          refreshContent: false,
          shouldStop: stop,
          onProgress: (m) => {
            live.set(src.id, m.replace(/…$/, ''));
            show();
          },
        });
        live.delete(src.id);
        done++;
        out.imported += res.summary.added;
        if (res.summary.error) out.errors.push(`${src.publisher?.name ?? 'Company'}: ${res.summary.error}`);
        if (!res.summary.added && !res.summary.fetched) out.emptySources.push(src);
        opts.onSourceDone?.(src, res.summary.added, res.summary.error);
        show();
      }
    })
  );
  if (stop() || !opts.publish) return out;

  // 2. Detect details for jobs that don't have them yet.
  say('Detecting job details…');
  const det = await backfillJobFacts((d, t) => say(`Detecting job details: ${d.toLocaleString()} / ${t.toLocaleString()}`), stop, { onlyMissing: true });
  out.detected = det.updated;
  await purgeJunkJobs();
  if (stop()) return out;

  // 3. Publish these companies' pending jobs.
  say('Publishing…');
  const pubIds = [...new Set(sources.map((s) => s.publisher_id))];
  const ids: string[] = [];
  for (let i = 0; i < pubIds.length; i += 50) {
    const chunk = pubIds.slice(i, i + 50);
    for (let from = 0; from < 50_000; from += 1000) {
      const { data, error } = await supabase.from('sponsored_jobs').select('id').in('publisher_id', chunk).eq('status', 'pending').range(from, from + 999);
      if (error) {
        out.errors.push(error.message);
        break;
      }
      ids.push(...((data ?? []) as { id: string }[]).map((r) => r.id));
      if (!data || data.length < 1000) break;
    }
  }
  if (ids.length) {
    const r = await bulkSetJobStatus(ids, 'published');
    if (r.ok) out.published = ids.length;
    else out.errors.push(r.error ?? 'Publish failed');
  }
  for (const s of sources) if (!out.emptySources.includes(s)) await updateImportSource(s.id, { auto_publish: true });
  return out;
}
