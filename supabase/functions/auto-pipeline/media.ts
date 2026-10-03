// The media library — real photos and video clips of the countries MadeVisa
// posts about, used everywhere a picture is needed: the photo that opens a
// post, the footage behind a reel, the cover of a blog article.
//
//   { cron: "media" }  → runMedia(): for every main destination, look up
//   upright photos, wide photos and clips on a free stock site and save
//   them in `social_media` (migration 20261127090000) with the
//   photographer's name and the page they came from. Then give every blog
//   article without a cover one of the wide photos.
//
//   Two sources, whichever key is set as a secret on this function:
//     PIXABAY_API_KEY  Pixabay (pixabay.com/api/docs — the key is shown there
//                      once you are logged in). Pixabay doesn't allow linking
//                      to its photos permanently, so each photo is copied
//                      into this project's storage (social-images/library/).
//                      Clips may be linked directly.
//     PEXELS_API_KEY   Pexels. Its addresses are permanent, nothing is copied.
//   With both set, Pixabay is used (Pexels stopped giving out new keys in 2026).
//
//   loadMedia() gives the program a picker. A post about a country gets
//   that country's pictures and never another country's; a post about no
//   country in particular (a CV tip, a question) takes its turn through all
//   of them. The one used least recently goes first, so nothing comes
//   straight back.
//
// There is no "any country" group: only destinations. Rows left under the
// old code "ZZ" are removed at the next fill.
//
// Stock photos are free to use; the people in them have not endorsed
// anything, so posts never present a face as a named person or as someone
// telling their own story.

// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */
import { hash } from './programSchedule.ts';
import { LANDMARK } from './programFormats.ts';
import type { Service } from './shared.ts';

/** The retired "any country" code; such rows are ignored and cleaned up. */
const RETIRED = 'ZZ';
/** Per country: upright photos (posts, reels), wide photos (article covers), clips (reels). */
const TARGET = { photo: 10, wide: 4, video: 5 } as const;
type Shape = keyof typeof TARGET;
/** Searches per run. Pexels allows 200 an hour and Pixabay 100 a minute; one run stays far below both. */
const MAX_REQUESTS = 70;

type Row = { id: number; code: string; kind: 'photo' | 'video'; url: string; credit: string | null; last_used_at: string | null; uses: number; width: number | null; height: number | null };
export type Shot = { id: number | null; url: string; credit: string | null };
const isWide = (r: { width: number | null; height: number | null }) => Boolean(r.width && r.height && r.width > r.height);

export type MediaLibrary = {
  /** An upright photo: the country's own, or — with no country — the next one in turn from the whole library. */
  photo(code: string | null | undefined, seed: number): Shot | null;
  /** A wide photo (article covers), picked the same way. */
  wide(code: string | null | undefined, seed: number): Shot | null;
  /** Clips for a reel: the country's own, or — with no country — a mix from the whole library. */
  clips(code: string | null | undefined, seed: number): { id: number; url: string; credit: string | null }[];
  counts: { photos: number; wide: number; videos: number; countries: number };
};

/** Least recently used first; among equals the seed decides, so two posts written together differ. */
function order(rows: Row[], seed: number): Row[] {
  return [...rows].sort((a, b) => {
    const ta = a.last_used_at ? Date.parse(a.last_used_at) : 0;
    const tb = b.last_used_at ? Date.parse(b.last_used_at) : 0;
    return ta - tb || a.uses - b.uses || (hash(`${seed}:${a.id}`) % 1000) - (hash(`${seed}:${b.id}`) % 1000);
  });
}

export async function loadMedia(service: Service, single: Map<string, { url: string; credit: string | null }>): Promise<MediaLibrary> {
  // Before the migration is run the table is missing: the query errors and the library is simply empty.
  const { data } = await service.from('social_media').select('id, code, kind, url, credit, last_used_at, uses, width, height').eq('enabled', true).neq('code', RETIRED).limit(6000);
  const rows = ((data ?? []) as Row[]).filter((r) => r.url && r.code !== RETIRED);
  const upright = rows.filter((r) => r.kind === 'photo' && !isWide(r));
  const wide = rows.filter((r) => r.kind === 'photo' && isWide(r));
  const videos = rows.filter((r) => r.kind === 'video');
  const handed = new Set<number>();
  const shot = (r: Row): Shot => {
    handed.add(r.id);
    r.last_used_at = new Date().toISOString(); // so the next pick in this run takes another one
    return { id: r.id, url: r.url, credit: r.credit };
  };
  const pickFrom = (pool: Row[], code: string | null | undefined, seed: number): Row | undefined => {
    const cc = (code ?? '').toUpperCase();
    const list = order(cc ? pool.filter((r) => r.code === cc) : pool, seed);
    return list.find((r) => !handed.has(r.id)) ?? list[0];
  };
  return {
    counts: { photos: upright.length, wide: wide.length, videos: videos.length, countries: new Set(rows.map((r) => r.code)).size },
    photo(code, seed) {
      const pick = pickFrom(upright, code, seed);
      if (pick) return shot(pick);
      // The photo added by hand for this country (Admin → Social media → Country photos).
      const own = code ? single.get(code.toUpperCase()) : undefined;
      return own ? { id: null, url: own.url, credit: own.credit } : null;
    },
    wide(code, seed) {
      const pick = pickFrom(wide, code, seed);
      return pick ? shot(pick) : null;
    },
    clips(code, seed) {
      const cc = (code ?? '').toUpperCase();
      if (cc) return order(videos.filter((r) => r.code === cc), seed).slice(0, 6).map((r) => ({ id: r.id, url: r.url, credit: r.credit }));
      // No country in particular: the least used clips, at most one per country, so a reel moves between places.
      const seen = new Set<string>();
      const mix: Row[] = [];
      for (const r of order(videos, seed)) {
        if (seen.has(r.code)) continue;
        seen.add(r.code);
        mix.push(r);
        if (mix.length >= 6) break;
      }
      return mix.map((r) => ({ id: r.id, url: r.url, credit: r.credit }));
    },
  };
}

// ---------------------------------------------------------------------------
// Filling the library
// ---------------------------------------------------------------------------

const regionName = (() => {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return (code: string) => names.of(code) ?? code;
  } catch {
    return (code: string) => code;
  }
})();

type Found = { kind: 'photo' | 'video'; url: string; thumb: string | null; credit: string | null; page: string | null; source_id: string; width: number | null; height: number | null; seconds: number | null };
type Source = {
  name: 'pexels' | 'pixabay';
  /** True when files must be copied into our own storage before use. */
  copy: boolean;
  photos(query: string, want: number, wide: boolean): Promise<Found[]>;
  videos(query: string, want: number): Promise<Found[]>;
};

// --- Pexels -----------------------------------------------------------------

/** A portrait crop big enough for a 1080-wide post. */
function photoUrl(src: Record<string, string> | undefined): string | null {
  const portrait = src?.portrait;
  if (portrait && /[?&]h=\d+/.test(portrait) && /[?&]w=\d+/.test(portrait)) return portrait.replace(/([?&])h=\d+/, '$1h=1620').replace(/([?&])w=\d+/, '$1w=1080');
  return portrait ?? src?.large2x ?? src?.large ?? null;
}

const pexels = (key: string): Source => ({
  name: 'pexels',
  copy: false,
  async photos(query, want, wide) {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${wide ? 'landscape' : 'portrait'}&per_page=${Math.min(30, want + 6)}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Pexels answered ${res.status}`);
    const photos = ((await res.json()).photos ?? []) as any[];
    return photos
      .filter((p) => (wide ? p.width > p.height : p.height >= p.width))
      .map((p): Found | null => {
        const url = wide ? p.src?.large2x ?? p.src?.large ?? null : photoUrl(p.src);
        return url ? { kind: 'photo', url, thumb: p.src?.medium ?? p.src?.small ?? null, credit: p.photographer ? String(p.photographer).slice(0, 80) : null, page: p.url ?? null, source_id: String(p.id), width: p.width ?? null, height: p.height ?? null, seconds: null } : null;
      })
      .filter((x): x is Found => Boolean(x));
  },
  async videos(query, want) {
    const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${Math.min(30, want + 6)}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Pexels answered ${res.status}`);
    const videos = ((await res.json()).videos ?? []) as any[];
    return videos
      .filter((v) => v.duration >= 6 && v.duration <= 90)
      .map((v): Found | null => {
        // The smallest file that is still at least 1280 px tall (the same rule as the reel renderer).
        const files = ((v.video_files ?? []) as any[]).filter((f) => f.file_type === 'video/mp4' && f.height >= f.width).sort((a, b) => a.height - b.height);
        const file = files.find((f) => f.height >= 1280) ?? files[files.length - 1];
        return file?.link ? { kind: 'video', url: file.link, thumb: v.image ?? null, credit: v.user?.name ? String(v.user.name).slice(0, 80) : null, page: v.url ?? null, source_id: String(v.id), width: file.width ?? null, height: file.height ?? null, seconds: Math.round(v.duration) } : null;
      })
      .filter((x): x is Found => Boolean(x));
  },
});

// --- Pixabay ----------------------------------------------------------------
// Docs: pixabay.com/api/docs. 100 requests a minute; photo addresses expire,
// so photos are copied (see keep()); "show where the images are from" → the
// credit reads "Name / Pixabay" and the admin library names the source.

const MAX_CLIP_BYTES = 45_000_000;
const pixabayCredit = (user: unknown) => `${String(user ?? '').slice(0, 60) || 'Pixabay'} / Pixabay`.replace(/^Pixabay \/ Pixabay$/, 'Pixabay');

const pixabay = (key: string): Source => ({
  name: 'pixabay',
  copy: true,
  async photos(query, want, wide) {
    const res = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query.slice(0, 100))}&image_type=photo&orientation=${wide ? 'horizontal&min_width=1200' : 'vertical&min_height=1200'}&safesearch=true&per_page=${Math.max(3, Math.min(40, want + 8))}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Pixabay answered ${res.status}`);
    const hits = ((await res.json()).hits ?? []) as any[];
    return hits
      .filter((h) => h.largeImageURL && /\.jpe?g(\?|$)/i.test(String(h.largeImageURL)) && (wide ? h.imageWidth > h.imageHeight : h.imageHeight >= h.imageWidth))
      .map((h): Found => ({ kind: 'photo', url: h.largeImageURL, thumb: null, credit: pixabayCredit(h.user), page: h.pageURL ?? null, source_id: String(h.id), width: h.imageWidth ?? null, height: h.imageHeight ?? null, seconds: null }));
  },
  async videos(query, want) {
    const res = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query.slice(0, 100))}&video_type=film&safesearch=true&per_page=${Math.max(3, Math.min(50, want * 4 + 8))}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Pixabay answered ${res.status}`);
    const hits = ((await res.json()).hits ?? []) as any[];
    const found = hits
      .filter((h) => h.duration >= 6 && h.duration <= 90 && h.videos)
      .map((h): (Found & { upright: boolean }) | null => {
        const files = (['tiny', 'small', 'medium', 'large'] as const).map((k) => h.videos[k]).filter((f: any) => f?.url && f.width && f.height && (!f.size || f.size <= MAX_CLIP_BYTES)) as any[];
        if (!files.length) return null;
        const upright = files[0].height > files[0].width;
        // Upright: the smallest file at least 1280 px tall. Wide: at least 1080 px tall, because the reel keeps only the middle of it.
        const need = upright ? 1280 : 1080;
        const file = files.find((f) => f.height >= need) ?? (upright ? files[files.length - 1] : null);
        if (!file) return null;
        return { kind: 'video', url: file.url, thumb: file.thumbnail ?? h.videos.tiny?.thumbnail ?? null, credit: pixabayCredit(h.user), page: h.pageURL ?? null, source_id: String(h.id), width: file.width, height: file.height, seconds: Math.round(h.duration), upright };
      })
      .filter((x): x is Found & { upright: boolean } => Boolean(x));
    // Pixabay can't be asked for upright clips only, so they are put first here.
    return found.sort((a, b) => Number(b.upright) - Number(a.upright)).map(({ upright: _u, ...f }) => f);
  },
});

/** Copy a picture into this project's storage (social-images/library/…) and return its public address. */
async function keep(service: Service, from: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(from, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!/^image\/jpe?g$/.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 5_000 || bytes.length > 5_000_000) return null;
    const { error } = await service.storage.from('social-images').upload(path, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
    if (error) return null;
    return service.storage.from('social-images').getPublicUrl(path).data.publicUrl as string;
  } catch {
    return null;
  }
}

/** Make a found item usable for good: photos (and clip covers) from a "copy" source go into our storage. */
async function settle(service: Service, source: Source, code: string, f: Found): Promise<Found | null> {
  if (!source.copy) return f;
  const base = `library/${code}/${source.name}-${f.source_id}`;
  if (f.kind === 'photo') {
    const url = await keep(service, f.url, `${base}.jpg`);
    return url ? { ...f, url, thumb: url } : null;
  }
  // A clip may be linked directly; only its cover picture is copied (the clip still works without one).
  const thumb = f.thumb ? await keep(service, f.thumb, `${base}-cover.jpg`) : null;
  return { ...f, thumb };
}

/** What to search for, per country: people in its best-known city first, then the place itself. */
function queriesFor(code: string): Record<Shape, string[]> {
  const city = LANDMARK[code];
  const country = regionName(code);
  const list = (...q: (string | null)[]) => q.filter((x): x is string => Boolean(x));
  return {
    photo: list(city ? `${city} street people` : null, city ? `${city} city` : null, `${country} people`, `${country} city`),
    wide: list(city ? `${city} skyline` : null, city ? `${city} city` : null, `${country} landscape`),
    video: list(city ? `${city} people walking` : null, city ? `${city} city` : null, `${country} city`),
  };
}

/** The old "any country" rows: remove them and the files copied for them. */
async function dropRetired(service: Service): Promise<number> {
  const { data } = await service.from('social_media').select('id').eq('code', RETIRED).limit(1000);
  const n = ((data ?? []) as unknown[]).length;
  if (!n) return 0;
  await service.from('social_media').delete().eq('code', RETIRED);
  try {
    const { data: files } = await service.storage.from('social-images').list(`library/${RETIRED}`, { limit: 1000 });
    const paths = ((files ?? []) as { name: string }[]).map((f) => `library/${RETIRED}/${f.name}`);
    if (paths.length) await service.storage.from('social-images').remove(paths);
  } catch {
    /* the files are only leftovers; the rows are what matter */
  }
  return n;
}

/**
 * Blog articles without a cover get a wide photo from the library: their
 * country's, or — for an article about no country — the next one in turn.
 * An article about a country the library has no wide photo for is left alone.
 */
export async function coverArticles(service: Service): Promise<number> {
  const { data, error } = await service.from('articles').select('id, country_code').is('cover_url', null).order('publish_at', { ascending: false, nullsFirst: true }).limit(300);
  const todo = (data ?? []) as { id: string; country_code: string | null }[];
  if (error || !todo.length) return 0;
  const lib = await loadMedia(service, new Map());
  if (!lib.counts.wide) return 0;
  const used: number[] = [];
  let done = 0;
  for (const a of todo) {
    const shot = lib.wide(a.country_code, hash(a.id));
    if (!shot) continue;
    const { error: upErr } = await service.from('articles').update({ cover_url: shot.url }).eq('id', a.id).is('cover_url', null);
    if (upErr) break;
    if (shot.id) used.push(shot.id);
    done++;
  }
  if (used.length) await service.rpc('social_media_used', { p_ids: used });
  return done;
}

/**
 * Top the library up. `force` (the admin's button) fills every country that
 * is short; the daily run does a few countries at a time.
 * Returns one line for the run log, or null when nothing was needed.
 */
export async function runMedia(service: Service, force: boolean): Promise<string | null> {
  const note = await fill(service, force);
  // Whatever the fill did, articles that still have no cover get one from what is there.
  const covered = await coverArticles(service).catch(() => 0);
  if (covered && force) {
    const line = `${note ?? 'Photo and clip library:'} ${covered} blog ${covered === 1 ? 'article' : 'articles'} got a cover photo.`;
    await service.from('social_program').update({ media_note: line.slice(0, 300) }).eq('id', true);
    return line;
  }
  return note;
}

async function fill(service: Service, force: boolean): Promise<string | null> {
  const finish = async (ok: boolean, note: string) => {
    await service.from('social_program').update({ media_at: new Date().toISOString(), media_note: note.slice(0, 300) }).eq('id', true);
    if (force || !ok) await service.rpc('pipeline_finished', { p_kind: 'media', p_ok: ok, p_summary: note, p_detail: null });
    return note;
  };
  const pixabayKey = Deno.env.get('PIXABAY_API_KEY') ?? '';
  const pexelsKey = Deno.env.get('PEXELS_API_KEY') ?? '';
  const source = pixabayKey ? pixabay(pixabayKey) : pexelsKey ? pexels(pexelsKey) : null;
  if (!source) return finish(false, 'Photo and clip library: add the secret PIXABAY_API_KEY to this function (Supabase → Edge Functions → Secrets). The key is free: log in at pixabay.com and open pixabay.com/api/docs — it is shown there.');
  const started = Date.now();
  /** Copying files takes time; stop early enough to finish inside one run. */
  const outOfTime = () => Date.now() - started > 100_000;

  const dropped = await dropRetired(service).catch(() => 0);
  const { data: existing, error } = await service.from('social_media').select('code, kind, source, source_id, query, created_at, width, height').limit(8000);
  if (error) return finish(false, 'Photo and clip library: run the migration 20261127090000_control_room_cvs_media.sql first.');
  const have = new Map<string, number>();
  const seen = new Set<string>();
  // Searches already made in the last 24 hours aren't repeated (the sites ask for that).
  const asked = new Set<string>();
  for (const r of (existing ?? []) as { code: string; kind: 'photo' | 'video'; source: string; source_id: string | null; query: string | null; created_at: string; width: number | null; height: number | null }[]) {
    const shape: Shape = r.kind === 'video' ? 'video' : isWide(r) ? 'wide' : 'photo';
    have.set(`${r.code}:${shape}`, (have.get(`${r.code}:${shape}`) ?? 0) + 1);
    if (r.source_id) seen.add(`${r.source}:${r.kind}:${r.source_id}`);
    if (r.query && Date.now() - Date.parse(r.created_at) < 24 * 3_600_000) asked.add(`${r.source}:${shape}:${r.query}`);
  }

  // Which countries: the ones jobs are collected from, the program's focus, and every country with a known city.
  const [{ data: settings }, { data: program }] = await Promise.all([service.from('auto_release_settings').select('country_order').eq('id', true).maybeSingle(), service.from('social_program').select('focus').eq('id', true).maybeSingle()]);
  const codes = [...new Set([...(((program as any)?.focus ?? []) as string[]), ...(((settings as any)?.country_order ?? []) as string[]), ...Object.keys(LANDMARK)].map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c) && c !== RETIRED))];

  let requests = 0;
  let photos = 0;
  let clips = 0;
  const touched = new Set<string>();
  /** Country-and-kind pairs still below their target after this run. */
  let short = 0;
  const problems: string[] = [];
  const budget = force ? MAX_REQUESTS : 24;

  for (const code of codes) {
    if (requests >= budget || outOfTime()) break;
    const q = queriesFor(code);
    for (const shape of ['photo', 'video', 'wide'] as const) {
      const kind = shape === 'video' ? 'video' : 'photo';
      const target = TARGET[shape];
      let missing = target - (have.get(`${code}:${shape}`) ?? 0);
      const queries = q[shape];
      // A share per search, so one search term doesn't fill the whole country with look-alikes.
      const perQuery = Math.max(3, Math.ceil(target / queries.length) + 1);
      for (const query of queries) {
        if (missing <= 0 || requests >= budget || outOfTime()) break;
        if (asked.has(`${source.name}:${shape}:${query}`)) continue;
        asked.add(`${source.name}:${shape}:${query}`);
        requests++;
        try {
          const hits = (kind === 'photo' ? await source.photos(query, missing, shape === 'wide') : await source.videos(query, missing)).filter((f) => !seen.has(`${source.name}:${f.kind}:${f.source_id}`)).slice(0, Math.min(missing, perQuery));
          // Five at a time: photos from a "copy" source are fetched and stored here.
          const found: Found[] = [];
          for (let at = 0; at < hits.length && !outOfTime(); at += 5) {
            const done = await Promise.all(hits.slice(at, at + 5).map((f) => settle(service, source, code, f)));
            found.push(...done.filter((x): x is Found => Boolean(x)));
          }
          if (!found.length) continue;
          const { error: insErr } = await service.from('social_media').upsert(
            found.map((f) => ({ code, kind: f.kind, url: f.url, thumb: f.thumb, credit: f.credit, page: f.page, query, source: source.name, source_id: f.source_id, width: f.width, height: f.height, seconds: f.seconds })),
            { onConflict: 'source,kind,source_id', ignoreDuplicates: true }
          );
          if (insErr) throw new Error(insErr.message);
          for (const f of found) seen.add(`${source.name}:${f.kind}:${f.source_id}`);
          missing -= found.length;
          if (kind === 'photo') photos += found.length;
          else clips += found.length;
          touched.add(code);
        } catch (e) {
          problems.push(e instanceof Error ? e.message : 'search failed');
          // A refused key or a rate limit won't get better on the next query.
          if (/40[013]|429/.test(problems[problems.length - 1])) requests = budget;
        }
      }
      if (missing > 0) short++;
    }
  }

  if (!photos && !clips) {
    if (problems.length) return finish(false, `Photo and clip library: nothing added — ${problems[0]}.`);
    await service.from('social_program').update({ media_at: new Date().toISOString() }).eq('id', true);
    if (!force) return null;
    if (dropped) return finish(true, `Photo and clip library: removed ${dropped} “any country” items. Nothing new to add right now.`);
    return finish(true, short ? 'Photo and clip library: nothing new right now. The searches for the countries that are still short were already made today — the sites ask not to repeat a search within 24 hours. Press again tomorrow.' : 'Photo and clip library: already full for every country.');
  }
  const more = requests >= budget || outOfTime() ? ' — press again for more' : short ? ' — some countries are still short; more can be found tomorrow' : '';
  return finish(true, `Photo and clip library: added ${photos} ${photos === 1 ? 'photo' : 'photos'} and ${clips} ${clips === 1 ? 'clip' : 'clips'} for ${touched.size} ${touched.size === 1 ? 'country' : 'countries'}${more} (from ${source.name === 'pixabay' ? 'Pixabay' : 'Pexels'}).${dropped ? ` Removed ${dropped} “any country” items.` : ''}`);
}
