#!/usr/bin/env node
// Renders the Reels the content program has written.
//
// The pipeline (supabase/functions/auto-pipeline/program.ts) writes a reel as
// a post with status "rendering": the caption, plus a recipe in meta.reel —
// which background to look for and which text layers appear when. This script
// turns the recipe into a 1080×1920 MP4 with ffmpeg, uploads it to Supabase
// Storage and hands the post back to the queue (approved, or waiting for
// approval). It runs on GitHub Actions (.github/workflows/render-reels.yml):
// free, no server to keep.
//
// Background, first that works:
//   1. what the recipe prefers — photos from the media library as a slideshow
//      (3–5 photos, each with a slow zoom, cross-faded), or a clip from it
//   2. the other of the two
//   3. Pexels stock video for the city / country (only with PEXELS_API_KEY)
//   4. one country photo
//   5. MadeVisa's blue gradient with the flag
// A single photo or the gradient gets a slow zoom, so it still moves.
//
// Sound: a track from the bucket folder social-videos/music/ (MP3 or M4A you
// have the right to use — upload them in Admin → Social media → Content
// ideas). Picked by the reel's mood (tracks named "<mood>--name.mp3": energetic,
// upbeat, chill, emotional, cinematic), never one of the last 6 used, and started
// at the track's DROP (where the energy jumps) — the first second of a reel decides
// whether people stay, so it opens on the beat, not on a quiet intro.
// No tracks → a silent audio track.
//
// Cover: the recipe's `thumb` (big words, flag, logo — a transparent PNG) is laid over a
// frame of the finished video. Without it, a plain frame of the video, as before.
//
// Environment:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   required
//   PEXELS_API_KEY                            optional
// Local test:  node scripts/render-reels.mjs --local recipe.json --out out.mp4
//   (recipe.json: { bg: { file, kind }, frame, layers: [{ file, at, end, last }], duration, audio? })

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1080;
const H = 1920;
const FPS = 30;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.split('\n').slice(-6).join(' | ')}`))));
  });
}

/**
 * bg:      { file, kind: 'video' | 'image' }  or  { files: [..], kind: 'slides' } (2–5 photos, cross-faded)
 * frame:   PNG path — the always-on layer (logo, fades)
 * layers:  [{ file, at, end, last }] — text layers; `last` = the final step of a scene (it fades out)
 * audio:   optional music file (looped, faded in and out); none → silence
 */
export async function render({ bg, frame, layers, duration, out, audio = null, audioStart = 0 }) {
  const D = Number(duration.toFixed(2));
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  // Slideshow timing: n photos share the reel; neighbours overlap by FADE seconds.
  const slides = bg.kind === 'slides' ? bg.files.slice(0, 5) : [];
  const FADE = 0.6;
  const seg = slides.length ? Number(((D + (slides.length - 1) * FADE) / slides.length).toFixed(3)) : 0;
  if (bg.kind === 'video') args.push('-stream_loop', '-1', '-i', bg.file);
  else if (slides.length) for (const file of slides) args.push('-loop', '1', '-framerate', String(FPS), '-t', String(seg + 0.2), '-i', file);
  else args.push('-loop', '1', '-framerate', String(FPS), '-t', String(D), '-i', bg.file);
  // Inputs after the background: the frame, the text layers, the sound.
  const nb = slides.length || 1;
  args.push('-loop', '1', '-framerate', String(FPS), '-t', String(D), '-i', frame);
  for (const l of layers) args.push('-loop', '1', '-framerate', String(FPS), '-t', (l.end - l.at).toFixed(2), '-i', l.file);
  if (audio) args.push('-ss', Math.max(0, audioStart).toFixed(2), '-stream_loop', '-1', '-i', audio);
  else args.push('-f', 'lavfi', '-t', String(D), '-i', 'anullsrc=r=44100:cl=stereo');

  const f = [];
  // Background: fill the frame; a still gets a slow push-in (drawn at 2× so the zoom is smooth).
  if (bg.kind === 'video') f.push(`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,trim=duration=${D},setpts=PTS-STARTPTS[bg]`);
  else if (slides.length) {
    // Each photo: fill the frame, push in slowly (odd ones pull out, so it doesn't feel mechanical), then cross-fade into the next.
    const frames = Math.round(seg * FPS);
    slides.forEach((_, i) => {
      const z = i % 2 === 0 ? `1+0.10*on/${frames}` : `1.10-0.10*on/${frames}`;
      f.push(`[${i}:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=${FPS},setsar=1,trim=duration=${seg},setpts=PTS-STARTPTS,format=yuv420p[s${i}]`);
    });
    let prev = 's0';
    for (let i = 1; i < slides.length; i++) {
      const out = i === slides.length - 1 ? 'bg' : `x${i}`;
      f.push(`[${prev}][s${i}]xfade=transition=fade:duration=${FADE}:offset=${(i * (seg - FADE)).toFixed(3)}[${out}]`);
      prev = out;
    }
    if (slides.length === 1) f.push(`[s0]null[bg]`);
  } else f.push(`[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='1+0.14*on/${Math.round(D * FPS)}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=${FPS},setsar=1[bg]`);
  f.push(`[${nb}:v]format=rgba[fr]`, `[bg][fr]overlay=0:0:format=auto[v0]`);
  layers.forEach((l, i) => {
    const len = l.end - l.at;
    // Each layer fades in; only the last step of a scene fades out (earlier steps are covered by the next one).
    const fadeOut = l.last ? `,fade=t=out:st=${Math.max(0, len - 0.28).toFixed(2)}:d=0.28:alpha=1` : '';
    f.push(`[${nb + 1 + i}:v]format=rgba,fade=t=in:st=0:d=0.32:alpha=1${fadeOut},setpts=PTS-STARTPTS+${l.at.toFixed(2)}/TB[l${i}]`);
    f.push(`[v${i}][l${i}]overlay=0:0:eof_action=pass:format=auto[v${i + 1}]`);
  });
  const a = nb + 1 + layers.length;
  if (audio) f.push(`[${a}:a]atrim=duration=${D},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.5,afade=t=out:st=${Math.max(0, D - 1).toFixed(2)}:d=1,aresample=44100[au]`);
  args.push('-filter_complex', f.join(';'), '-map', `[v${layers.length}]`, '-map', audio ? '[au]' : `${a}:a`);
  // Capped bitrate: busy footage stays under ~9 MB (Telegram fetches videos up to 20 MB by link).
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-maxrate', '5M', '-bufsize', '10M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), '-g', String(FPS * 2), '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-t', String(D), '-movflags', '+faststart', out);
  await run('ffmpeg', args);
}

export const cover = (video, at, out) => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '3', out]);

/** The thumbnail: a frame of the video with the cover text layer (veil, big words, flag) on top. */
export const thumbnail = (video, at, layer, out) =>
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', video, '-i', layer, '-filter_complex', `[0:v]scale=${W}:${H}[b];[1:v]scale=${W}:${H},format=rgba[t];[b][t]overlay=0:0:format=auto`, '-frames:v', '1', '-q:v', '2', out]);

// --- Music: mood, no repeats, start at the drop ------------------------------------------
export const MOODS = ['energetic', 'upbeat', 'chill', 'emotional', 'cinematic'];
/** "energetic--city-run.mp3" → "energetic"; no prefix → null (fits any mood). */
export const moodOf = (name) => {
  const m = String(name).toLowerCase().match(/^([a-z]+)--/);
  return m && MOODS.includes(m[1]) ? m[1] : null;
};

/** A track for this reel: its mood first, not one of the recently used, stable for the same post. */
export function pickTrack(tracks, mood, recent, key) {
  const fresh = tracks.filter((t) => !recent.includes(t));
  const pools = [fresh.filter((t) => moodOf(t) === mood), fresh.filter((t) => moodOf(t) === null), fresh, tracks];
  const pool = pools.find((p) => p.length) ?? [];
  return pool.length ? pool[hash(key) % pool.length] : null;
}

/** Loudness per 0.25 s window of the first 120 s of a track (mono, 8 kHz). */
async function energy(file) {
  const pcm = await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-t', '120', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg ${code}`))));
  });
  const win = 2000; // 0.25 s at 8 kHz
  const out = [];
  for (let i = 0; i + win * 2 <= pcm.length; i += win * 2) {
    let sum = 0;
    for (let j = i; j < i + win * 2; j += 2) {
      const v = pcm.readInt16LE(j) / 32768;
      sum += v * v;
    }
    out.push(Math.sqrt(sum / win));
  }
  return out;
}

/**
 * Where the track "drops": the 0.25 s step after which the next 2 s are loudest compared with
 * the 2 s before (from 2 s in; the reel must still fit after it). Answers seconds, 0 when unclear.
 */
export function dropAt(levels, reelSeconds) {
  const step = 0.25;
  const span = 8; // 2 s
  const last = levels.length - Math.ceil(reelSeconds / step);
  let best = 0;
  let bestGain = 0;
  for (let i = span; i <= last && i < levels.length - span; i++) {
    const before = levels.slice(i - span, i).reduce((a, b) => a + b, 0) / span;
    const after = levels.slice(i, i + span).reduce((a, b) => a + b, 0) / span;
    const gain = after - before * 1.15;
    if (gain > bestGain && after > 0.05) {
      bestGain = gain;
      best = i;
    }
  }
  // Start a beat early, so the drop lands right as the first words appear.
  return best ? Math.max(0, best * step - 0.35) : 0;
}

export async function findDrop(file, reelSeconds) {
  try {
    return dropAt(await energy(file), reelSeconds);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------

const env = (k) => process.env[k] ?? '';

async function download(url, file, maxBytes = 80_000_000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`${res.status} for ${url.slice(0, 90)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error('file too large');
  await writeFile(file, buf);
  return { type: (res.headers.get('content-type') ?? '').split(';')[0], bytes: buf.length };
}

/** A portrait stock video for the first query that has one we haven't used lately. */
async function pexels(queries, salt, used) {
  if (!env('PEXELS_API_KEY')) return null;
  for (const query of queries) {
    try {
      const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=24`, { headers: { Authorization: env('PEXELS_API_KEY') }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const videos = ((await res.json()).videos ?? []).filter((v) => v.duration >= 5 && !used.has(String(v.id)));
      if (!videos.length) continue;
      const v = videos[salt % Math.min(videos.length, 12)];
      // The smallest file that is still at least 1280 px tall.
      const files = (v.video_files ?? []).filter((x) => x.file_type === 'video/mp4' && x.height >= x.width).sort((a, b) => a.height - b.height);
      const file = files.find((x) => x.height >= 1280) ?? files[files.length - 1];
      if (!file) continue;
      return { url: file.link, id: String(v.id), credit: v.user?.name ?? null, page: v.url, query };
    } catch {
      /* next query */
    }
  }
  return null;
}

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

async function main() {
  const base = env('SUPABASE_URL').replace(/\/+$/, '');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const rest = (path, init = {}) => fetch(`${base}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });

  const res = await rest('social_posts?status=eq.rendering&select=id,platform,meta,scheduled_at&order=scheduled_at&limit=8');
  if (!res.ok) throw new Error(`Reading the queue failed: ${res.status} ${await res.text()}`);
  const posts = await res.json();
  if (!posts.length) {
    // Still say hello: the program only plans reels while the renderer is reporting in.
    await rest('social_program?id=eq.true', { method: 'PATCH', body: JSON.stringify({ reels_at: new Date().toISOString() }) });
    console.log('Nothing to render.');
    return;
  }
  // Music, if any was uploaded.
  let tracks = [];
  try {
    const list = await (await fetch(`${base}/storage/v1/object/list/social-videos`, { method: 'POST', headers, body: JSON.stringify({ prefix: 'music', limit: 200 }) })).json();
    tracks = (Array.isArray(list) ? list : []).map((o) => o.name).filter((n) => /\.(mp3|m4a)$/i.test(n)).sort();
  } catch {
    tracks = [];
  }
  // Stock videos used by recent reels, so the same clip doesn't come back.
  const recent = await (await rest('social_posts?select=meta&video_url=not.is.null&order=created_at.desc&limit=80')).json().catch(() => []);
  const used = new Set((Array.isArray(recent) ? recent : []).map((r) => r.meta?.reel?.bg_used?.id).filter(Boolean).map(String));
  // The last few tracks, newest first — the next reel doesn't repeat them.
  const recentTracks = (Array.isArray(recent) ? recent : []).map((r) => r.meta?.reel?.music).filter(Boolean).slice(0, 6);

  let done = 0;
  const problems = [];
  for (const post of posts) {
    const reel = post.meta?.reel;
    const dir = await mkdtemp(join(tmpdir(), 'reel-'));
    try {
      if (!reel?.layers?.length || !reel.frame) throw new Error('This post has no reel recipe');
      // Text layers.
      const frame = join(dir, 'frame.png');
      await download(reel.frame, frame);
      const layers = [];
      for (const [i, l] of reel.layers.entries()) {
        const file = join(dir, `l${i}.png`);
        const got = await download(l.url, file);
        if (!got.type.includes('png')) throw new Error(`Layer ${i + 1} didn’t render`);
        layers.push({ file, at: l.at, end: l.end, last: Boolean(l.last) });
      }
      // Background.
      const salt = hash(`${post.id}:${reel.bg?.salt ?? 0}`);
      let bg = null;
      let bgUsed = null;
      // A slideshow of photos from the media library (Admin → Social media → Photos and clips).
      const trySlides = async () => {
        const files = [];
        const credits = [];
        const ids = [];
        for (const [i, shot] of (reel.bg?.photos ?? []).slice(0, 5).entries()) {
          if (!shot?.url) continue;
          try {
            const file = join(dir, `slide${i}.jpg`);
            const got = await download(shot.url, file, 12_000_000);
            if (!/image\/(jpeg|png)/.test(got.type)) continue;
            files.push(file);
            if (shot.credit) credits.push(shot.credit);
            if (shot.id) ids.push(shot.id);
          } catch {
            /* skip this photo */
          }
        }
        if (files.length < 2) return false;
        bg = { files, kind: 'slides' };
        bgUsed = { source: 'slides', count: files.length, credit: [...new Set(credits)].slice(0, 5).join(', ') || null };
        if (ids.length) await rest('rpc/social_media_used', { method: 'POST', body: JSON.stringify({ p_ids: ids }) }).catch(() => {});
        return true;
      };
      if (reel.bg?.prefer === 'photos') await trySlides();
      // Clips from the media library (chosen per country when the post was written). Then a live stock search, as before.
      for (const clip of bg ? [] : (reel.bg?.clips ?? []).filter((c) => c?.url && !used.has(`lib:${c.id}`))) {
        try {
          const got = await download(clip.url, join(dir, 'bg.mp4'));
          if (!got.type.includes('video') && !got.type.includes('octet-stream')) continue;
          bg = { file: join(dir, 'bg.mp4'), kind: 'video' };
          bgUsed = { source: 'library', id: `lib:${clip.id}`, credit: clip.credit ?? null };
          used.add(`lib:${clip.id}`);
          // So the same clip doesn't open the next reel too.
          await rest('rpc/social_media_used', { method: 'POST', body: JSON.stringify({ p_ids: [clip.id] }) }).catch(() => {});
          break;
        } catch {
          bg = null;
        }
      }
      const stock = bg ? null : await pexels(reel.bg?.queries ?? [], salt, used);
      if (stock) {
        try {
          await download(stock.url, join(dir, 'bg.mp4'));
          bg = { file: join(dir, 'bg.mp4'), kind: 'video' };
          bgUsed = { source: 'pexels', id: stock.id, credit: stock.credit, page: stock.page, query: stock.query };
          used.add(stock.id);
        } catch {
          bg = null;
        }
      }
      // No clip worked: photos still make a moving reel.
      if (!bg && reel.bg?.prefer !== 'photos') await trySlides();
      if (!bg && reel.bg?.photo) {
        try {
          const got = await download(reel.bg.photo, join(dir, 'bg.jpg'), 12_000_000);
          if (/image\/(jpeg|png)/.test(got.type)) {
            bg = { file: join(dir, 'bg.jpg'), kind: 'image' };
            bgUsed = { source: 'photo', credit: reel.bg.credit ?? null };
          }
        } catch {
          bg = null;
        }
      }
      if (!bg) {
        await download(reel.bg?.fallback, join(dir, 'bg.png'));
        bg = { file: join(dir, 'bg.png'), kind: 'image' };
        bgUsed = { source: 'gradient' };
      }

      // Sound.
      let audio = null;
      let track = null;
      let audioStart = 0;
      if (tracks.length) {
        track = pickTrack(tracks, reel.mood ?? 'upbeat', recentTracks, `${post.id}:music:${reel.bg?.salt ?? 0}`);
        try {
          const ext = track.toLowerCase().endsWith('.m4a') ? 'm4a' : 'mp3';
          await download(`${base}/storage/v1/object/public/social-videos/music/${encodeURIComponent(track)}`, join(dir, `music.${ext}`), 30_000_000);
          audio = join(dir, `music.${ext}`);
          audioStart = await findDrop(audio, reel.duration);
          recentTracks.unshift(track);
        } catch {
          audio = null;
          track = null;
        }
      }

      const out = join(dir, 'reel.mp4');
      try {
        await render({ bg, frame, layers, duration: reel.duration, out, audio, audioStart });
      } catch (e) {
        // A track ffmpeg can't read must not cost the reel — and neither must a slideshow it can't build.
        if (!audio && bg.kind !== 'slides') throw e;
        audio = null;
        track = null;
        if (bg.kind === 'slides') {
          bg = { file: bg.files[0], kind: 'image' };
          bgUsed = { source: 'photo', credit: bgUsed?.credit ?? null };
        }
        await render({ bg, frame, layers, duration: reel.duration, out });
      }
      const jpg = join(dir, 'cover.jpg');
      const coverAt = Math.min(reel.cover_at ?? 2.4, reel.duration - 0.5);
      let thumbMade = false;
      if (reel.thumb) {
        try {
          const layer = join(dir, 'thumb.png');
          const got = await download(reel.thumb, layer, 8_000_000);
          if (got.type.includes('png')) {
            // The cover sits on the footage from before the text appears (the first 0.2 s), so words don't overlap.
            await thumbnail(out, 0.2, layer, jpg);
            thumbMade = true;
          }
        } catch {
          thumbMade = false;
        }
      }
      if (!thumbMade) await cover(out, coverAt, jpg);
      const size = (await stat(out)).size;
      if (size < 150_000) throw new Error('The video came out empty');

      const name = `reels/${post.id}-${Date.now().toString(36)}`;
      for (const [ext, file, type] of [['mp4', out, 'video/mp4'], ['jpg', jpg, 'image/jpeg']]) {
        const up = await fetch(`${base}/storage/v1/object/social-videos/${name}.${ext}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': type, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }, body: await readFile(file) });
        if (!up.ok) throw new Error(`Upload failed: ${up.status} ${(await up.text()).slice(0, 200)} — has the migration 20261124090000_social_reels.sql been run?`);
      }
      const pub = `${base}/storage/v1/object/public/social-videos/${name}`;
      const patch = {
        status: reel.after === 'approved' ? 'approved' : 'awaiting_approval',
        video_url: `${pub}.mp4`,
        images: [{ url: `${pub}.jpg`, width: W, height: H }],
        meta: { ...post.meta, reel: { ...reel, bg_used: bgUsed, music: track, music_start: audioStart || null, thumb_made: thumbMade, rendered_at: new Date().toISOString(), seconds: reel.duration, bytes: size } },
        error: null,
      };
      // Only if it is still waiting for us (someone may have skipped or rewritten it meanwhile).
      const ok = await rest(`social_posts?id=eq.${post.id}&status=eq.rendering`, { method: 'PATCH', body: JSON.stringify(patch) });
      if (!ok.ok) throw new Error(`Saving failed: ${ok.status} ${(await ok.text()).slice(0, 200)}`);
      done++;
      console.log(`Rendered ${post.id} (${post.platform}): ${reel.duration}s, ${(size / 1e6).toFixed(1)} MB, background: ${bgUsed.source}${bgUsed.query ? ` “${bgUsed.query}”` : ''}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      problems.push(msg);
      console.error(`Failed ${post.id}: ${msg}`);
      await rest(`social_posts?id=eq.${post.id}&status=eq.rendering`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error: `The reel couldn’t be rendered: ${msg.slice(0, 300)}` }) });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // Old reel files: once published they live on the network; keep ten days here.
  try {
    const list = await (await fetch(`${base}/storage/v1/object/list/social-videos`, { method: 'POST', headers, body: JSON.stringify({ prefix: 'reels', limit: 1000, sortBy: { column: 'created_at', order: 'asc' } }) })).json();
    const cutoff = Date.now() - 10 * 86_400_000;
    const old = (Array.isArray(list) ? list : []).filter((o) => o.created_at && Date.parse(o.created_at) < cutoff).map((o) => `reels/${o.name}`);
    if (old.length) await fetch(`${base}/storage/v1/object/social-videos`, { method: 'DELETE', headers, body: JSON.stringify({ prefixes: old }) });
  } catch {
    /* housekeeping only */
  }

  await rest('social_program?id=eq.true', { method: 'PATCH', body: JSON.stringify({ reels_at: new Date().toISOString(), reels_note: problems.length ? `${done} rendered, ${problems.length} failed: ${problems[0].slice(0, 200)}` : `${done} rendered${env('PEXELS_API_KEY') ? '' : ' (no PEXELS_API_KEY: photos and the gradient are used as backgrounds)'}` }) });
  if (problems.length && !done) process.exitCode = 1;
}

// --- Entry ---------------------------------------------------------------------------
const local = process.argv.indexOf('--local');
if (local > 0) {
  const recipe = JSON.parse(await readFile(process.argv[local + 1], 'utf8'));
  const out = process.argv[process.argv.indexOf('--out') + 1] || 'reel.mp4';
  const audioStart = recipe.audio && recipe.audioStart == null ? await findDrop(recipe.audio, recipe.duration) : (recipe.audioStart ?? 0);
  await render({ ...recipe, out, audioStart });
  if (recipe.thumb) await thumbnail(out, 0.2, recipe.thumb, out.replace(/\.mp4$/, '.jpg'));
  else await cover(out, recipe.cover_at ?? 2.4, out.replace(/\.mp4$/, '.jpg'));
  if (audioStart) console.log('music starts at', audioStart.toFixed(2), 's (the drop)');
  console.log('wrote', out);
} else {
  await main();
}
