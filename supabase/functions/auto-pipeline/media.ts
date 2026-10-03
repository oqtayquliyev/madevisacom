// The media library — real photos and video clips behind posts and reels.
//
//   { cron: "media" }  → runMedia(): for each country MadeVisa posts about
//   (and "ZZ" = any country: people at work, interviews, airports), look up
//   portrait photos and clips on Pexels and save their addresses, the
//   photographer's name and the page they came from in `social_media`
//   (migration 20261127090000). Nothing is downloaded here: the image
//   renderer and the reel renderer fetch a file when a post uses it.
//
//   loadMedia() gives the program a picker: the photo or clips for a
//   country that were used least recently, so nothing comes straight back.
//
// Needs the secret PEXELS_API_KEY on this function (the same key the reel
// renderer uses in GitHub Actions). Pexels photos and videos are free to
// use; the people in them have not endorsed anything, so posts never present
// a face as a named person or as someone telling their own story.

// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */
import { hash } from './programSchedule.ts';
import { LANDMARK, PEOPLE_FOOTAGE } from './programFormats.ts';
import type { Service } from './shared.ts';

/** Code for media that fits any country. */
export const ANY = 'ZZ';
const PHOTOS_PER_COUNTRY = 10;
const CLIPS_PER_COUNTRY = 5;
const PHOTOS_ANY = 40;
const CLIPS_ANY = 20;
/** Pexels allows 200 requests an hour; one run stays far below that. */
const MAX_REQUESTS = 70;

const ANY_PHOTOS = ['young professional working on laptop', 'job interview', 'colleagues talking in office', 'woman working in cafe with laptop', 'man at office desk', 'traveler at airport with suitcase', 'person writing resume', 'team meeting diverse'];

type Row = { id: number; code: string; kind: 'photo' | 'video'; url: string; credit: string | null; last_used_at: string | null; uses: number };
export type Shot = { id: number | null; url: string; credit: string | null };

export type MediaLibrary = {
  /** A photo for the country; `any` also accepts a general one when the country has none. */
  photo(code: string | null | undefined, seed: number, any?: boolean): Shot | null;
  /** Clips for a reel: the country's first, then general ones. */
  clips(code: string | null | undefined, seed: number): { id: number; url: string; credit: string | null }[];
  counts: { photos: number; videos: number };
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
  const { data } = await service.from('social_media').select('id, code, kind, url, credit, last_used_at, uses').eq('enabled', true).limit(4000);
  const rows = ((data ?? []) as Row[]).filter((r) => r.url);
  const by = (code: string, kind: Row['kind']) => rows.filter((r) => r.code === code && r.kind === kind);
  const handed = new Set<number>();
  return {
    counts: { photos: rows.filter((r) => r.kind === 'photo').length, videos: rows.filter((r) => r.kind === 'video').length },
    photo(code, seed, any = false) {
      const cc = (code ?? '').toUpperCase();
      const pool = cc ? order(by(cc, 'photo'), seed) : [];
      const pick = pool.find((r) => !handed.has(r.id)) ?? pool[0];
      if (pick) {
        handed.add(pick.id);
        return { id: pick.id, url: pick.url, credit: pick.credit };
      }
      // The photo added by hand for this country (Admin → Social media → Country photos).
      const own = cc ? single.get(cc) : undefined;
      if (own) return { id: null, url: own.url, credit: own.credit };
      if (!any) return null;
      const general = order(by(ANY, 'photo'), seed);
      const g = general.find((r) => !handed.has(r.id)) ?? general[0];
      if (!g) return null;
      handed.add(g.id);
      return { id: g.id, url: g.url, credit: g.credit };
    },
    clips(code, seed) {
      const cc = (code ?? '').toUpperCase();
      const own = cc ? order(by(cc, 'video'), seed) : [];
      const general = order(by(ANY, 'video'), seed);
      // A reel about a country never shows footage of another one: its own clips, else general ones.
      return [...own, ...(own.length >= 2 ? [] : general)].slice(0, 6).map((r) => ({ id: r.id, url: r.url, credit: r.credit }));
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

/** A portrait crop big enough for a 1080-wide post. */
function photoUrl(src: Record<string, string> | undefined): string | null {
  const portrait = src?.portrait;
  if (portrait && /[?&]h=\d+/.test(portrait) && /[?&]w=\d+/.test(portrait)) return portrait.replace(/([?&])h=\d+/, '$1h=1620').replace(/([?&])w=\d+/, '$1w=1080');
  return portrait ?? src?.large2x ?? src?.large ?? null;
}

async function searchPhotos(key: string, query: string, want: number): Promise<Found[]> {
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${Math.min(30, want + 6)}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Pexels answered ${res.status}`);
  const photos = ((await res.json()).photos ?? []) as any[];
  return photos
    .map((p): Found | null => {
      const url = photoUrl(p.src);
      return url ? { kind: 'photo', url, thumb: p.src?.medium ?? p.src?.small ?? null, credit: p.photographer ? String(p.photographer).slice(0, 80) : null, page: p.url ?? null, source_id: String(p.id), width: p.width ?? null, height: p.height ?? null, seconds: null } : null;
    })
    .filter((x): x is Found => Boolean(x));
}

async function searchVideos(key: string, query: string, want: number): Promise<Found[]> {
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
}

/** What to search for, per country: people in its best-known city first, then the place itself. */
function queriesFor(code: string): { photos: string[]; videos: string[] } {
  if (code === ANY) return { photos: ANY_PHOTOS, videos: PEOPLE_FOOTAGE };
  const city = LANDMARK[code];
  const country = regionName(code);
  return {
    photos: [city ? `${city} street people` : null, city ? `${city} city` : null, `${country} people`, `${country} city`].filter((x): x is string => Boolean(x)),
    videos: [city ? `${city} people walking` : null, city ? `${city} city` : null, `${country} city`].filter((x): x is string => Boolean(x)),
  };
}

/**
 * Top the library up. `force` (the admin's button) fills every country that
 * is short; the daily run does a few countries at a time.
 * Returns one line for the run log, or null when nothing was needed.
 */
export async function runMedia(service: Service, force: boolean): Promise<string | null> {
  const finish = async (ok: boolean, note: string) => {
    await service.from('social_program').update({ media_at: new Date().toISOString(), media_note: note.slice(0, 300) }).eq('id', true);
    if (force || !ok) await service.rpc('pipeline_finished', { p_kind: 'media', p_ok: ok, p_summary: note, p_detail: null });
    return note;
  };
  const key = Deno.env.get('PEXELS_API_KEY') ?? '';
  if (!key) return finish(false, 'Photo and clip library: add the secret PEXELS_API_KEY to this function (Supabase → Edge Functions → Secrets). A free key comes from pexels.com/api.');

  const { data: existing, error } = await service.from('social_media').select('code, kind, source_id').limit(8000);
  if (error) return finish(false, 'Photo and clip library: run the migration 20261127090000_control_room_cvs_media.sql first.');
  const have = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of (existing ?? []) as { code: string; kind: string; source_id: string | null }[]) {
    have.set(`${r.code}:${r.kind}`, (have.get(`${r.code}:${r.kind}`) ?? 0) + 1);
    if (r.source_id) seen.add(`${r.kind}:${r.source_id}`);
  }

  // Which countries: the ones jobs are collected from, the program's focus, and every country with a known city.
  const [{ data: settings }, { data: program }] = await Promise.all([service.from('auto_release_settings').select('country_order').eq('id', true).maybeSingle(), service.from('social_program').select('focus').eq('id', true).maybeSingle()]);
  const codes = [ANY, ...new Set([...(((program as any)?.focus ?? []) as string[]), ...(((settings as any)?.country_order ?? []) as string[]), ...Object.keys(LANDMARK)].map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c) && c !== ANY))];

  let requests = 0;
  let photos = 0;
  let clips = 0;
  const touched = new Set<string>();
  const problems: string[] = [];
  const budget = force ? MAX_REQUESTS : 24;

  for (const code of codes) {
    if (requests >= budget) break;
    const q = queriesFor(code);
    for (const kind of ['photo', 'video'] as const) {
      const target = code === ANY ? (kind === 'photo' ? PHOTOS_ANY : CLIPS_ANY) : kind === 'photo' ? PHOTOS_PER_COUNTRY : CLIPS_PER_COUNTRY;
      let missing = target - (have.get(`${code}:${kind}`) ?? 0);
      for (const query of kind === 'photo' ? q.photos : q.videos) {
        if (missing <= 0 || requests >= budget) break;
        requests++;
        try {
          const found = (kind === 'photo' ? await searchPhotos(key, query, missing) : await searchVideos(key, query, missing)).filter((f) => !seen.has(`${f.kind}:${f.source_id}`)).slice(0, missing);
          if (!found.length) continue;
          const { error: insErr } = await service.from('social_media').upsert(
            found.map((f) => ({ code, kind: f.kind, url: f.url, thumb: f.thumb, credit: f.credit, page: f.page, query, source: 'pexels', source_id: f.source_id, width: f.width, height: f.height, seconds: f.seconds })),
            { onConflict: 'source,kind,source_id', ignoreDuplicates: true }
          );
          if (insErr) throw new Error(insErr.message);
          for (const f of found) seen.add(`${f.kind}:${f.source_id}`);
          missing -= found.length;
          if (kind === 'photo') photos += found.length;
          else clips += found.length;
          touched.add(code);
        } catch (e) {
          problems.push(e instanceof Error ? e.message : 'search failed');
          // A refused key or a rate limit won't get better on the next query.
          if (/40[13]|429/.test(problems[problems.length - 1])) requests = budget;
        }
      }
    }
  }

  if (!photos && !clips) {
    if (problems.length) return finish(false, `Photo and clip library: nothing added — ${problems[0]}.`);
    await service.from('social_program').update({ media_at: new Date().toISOString() }).eq('id', true);
    return force ? finish(true, 'Photo and clip library: already full for every country.') : null;
  }
  return finish(true, `Photo and clip library: added ${photos} ${photos === 1 ? 'photo' : 'photos'} and ${clips} ${clips === 1 ? 'clip' : 'clips'} for ${touched.size} ${touched.size === 1 ? 'country' : 'countries'}${requests >= budget ? ' — more next time' : ''}.`);
}
