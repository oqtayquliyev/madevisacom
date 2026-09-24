// Keeps the landing page and /jobs feeling fresh: each page load gets a
// new random order within "equally new" jobs, jobs the person already
// opened sink to the bottom, and jobs shown on the previous visits are
// moved behind ones they haven't seen yet.
//
// The seed is fixed for the whole visit (module scope), so "Show more",
// filtering or navigating back within the SPA never reshuffles what's
// already on screen — only a real refresh / new visit does.

const VISIT_SEED = Math.floor(Math.random() * 2 ** 31);
const SHOWN_KEY = 'madevisa:recentlyShown';
const SHOWN_VISITS_KEPT = 3;

/** Deterministic PRNG (mulberry32) so one visit's order is stable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Same input + same visit → same order; next visit → a different one. `salt` gives each list its own shuffle. */
export function visitShuffle<T>(items: T[], salt = ''): T[] {
  const out = [...items];
  const rand = rng(VISIT_SEED ^ hash(salt));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Stable partition: items for which `isBack` is true keep their order but move after the rest. */
export function moveToBack<T>(items: T[], isBack: (item: T) => boolean): T[] {
  const front: T[] = [];
  const back: T[] = [];
  for (const it of items) (isBack(it) ? back : front).push(it);
  return [...front, ...back];
}

// ---------------------------------------------------------------------------
// "Recently shown" memory (per list, last few visits, this device only)
// ---------------------------------------------------------------------------

type ShownStore = Record<string, { seed: number; ids: string[] }[]>;

function readShown(): ShownStore {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as ShownStore) : {};
  } catch {
    return {};
  }
}

/** Ids shown in this list on previous visits (not the current one). */
export function recentlyShownIds(list: string): Set<string> {
  const visits = readShown()[list] ?? [];
  return new Set(visits.filter((v) => v.seed !== VISIT_SEED).flatMap((v) => v.ids));
}

/** Remembers what this visit showed at the top of `list`, so the next visit leads with other jobs. */
export function rememberShown(list: string, ids: string[]) {
  if (!ids.length) return;
  try {
    const store = readShown();
    const visits = (store[list] ?? []).filter((v) => v.seed !== VISIT_SEED);
    visits.unshift({ seed: VISIT_SEED, ids: ids.slice(0, 40) });
    store[list] = visits.slice(0, SHOWN_VISITS_KEPT);
    localStorage.setItem(SHOWN_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable — rotation still works via the per-visit shuffle */
  }
}

/** Freshness bucket for ordering "Newest": today, last 3 days, last 2 weeks, older, unknown. */
export function recencyBucket(iso: string | null | undefined): number {
  if (!iso) return 4;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 4;
  const days = (Date.now() - t) / 86_400_000;
  if (days < 1) return 0;
  if (days < 3) return 1;
  if (days < 14) return 2;
  return 3;
}
