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
//   1. Pexels stock video for the city / country (needs PEXELS_API_KEY — free
//      at pexels.com/api; the Pexels licence allows this use)
//   2. the country photo added in Admin → Social media → Content ideas
//   3. MadeVisa's blue gradient with the flag
// A photo or the gradient gets a slow zoom, so it still moves.
//
// Sound: a track from the bucket folder social-videos/music/ (MP3 or M4A you
// have the right to use — upload them in Admin → Social media → Content
// ideas), a different one each time. No tracks → a silent audio track.
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
 * bg:      { file, kind: 'video' | 'image' }
 * frame:   PNG path — the always-on layer (logo, fades)
 * layers:  [{ file, at, end, last }] — text layers; `last` = the final step of a scene (it fades out)
 * audio:   optional music file (looped, faded in and out); none → silence
 */
export async function render({ bg, frame, layers, duration, out, audio = null }) {
  const D = Number(duration.toFixed(2));
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  if (bg.kind === 'video') args.push('-stream_loop', '-1', '-i', bg.file);
  else args.push('-loop', '1', '-framerate', String(FPS), '-t', String(D), '-i', bg.file);
  args.push('-loop', '1', '-framerate', String(FPS), '-t', String(D), '-i', frame);
  for (const l of layers) args.push('-loop', '1', '-framerate', String(FPS), '-t', (l.end - l.at).toFixed(2), '-i', l.file);
  if (audio) args.push('-stream_loop', '-1', '-i', audio);
  else args.push('-f', 'lavfi', '-t', String(D), '-i', 'anullsrc=r=44100:cl=stereo');

  const f = [];
  // Background: fill the frame; a still gets a slow push-in (drawn at 2× so the zoom is smooth).
  if (bg.kind === 'video') f.push(`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,trim=duration=${D},setpts=PTS-STARTPTS[bg]`);
  else f.push(`[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='1+0.14*on/${Math.round(D * FPS)}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=${FPS},setsar=1[bg]`);
  f.push(`[1:v]format=rgba[fr]`, `[bg][fr]overlay=0:0:format=auto[v0]`);
  layers.forEach((l, i) => {
    const len = l.end - l.at;
    // Each layer fades in; only the last step of a scene fades out (earlier steps are covered by the next one).
    const fadeOut = l.last ? `,fade=t=out:st=${Math.max(0, len - 0.28).toFixed(2)}:d=0.28:alpha=1` : '';
    f.push(`[${i + 2}:v]format=rgba,fade=t=in:st=0:d=0.32:alpha=1${fadeOut},setpts=PTS-STARTPTS+${l.at.toFixed(2)}/TB[l${i}]`);
    f.push(`[v${i}][l${i}]overlay=0:0:eof_action=pass:format=auto[v${i + 1}]`);
  });
  const a = layers.length + 2;
  if (audio) f.push(`[${a}:a]atrim=duration=${D},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.5,afade=t=out:st=${Math.max(0, D - 1).toFixed(2)}:d=1,aresample=44100[au]`);
  args.push('-filter_complex', f.join(';'), '-map', `[v${layers.length}]`, '-map', audio ? '[au]' : `${a}:a`);
  // Capped bitrate: busy footage stays under ~9 MB (Telegram fetches videos up to 20 MB by link).
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-maxrate', '5M', '-bufsize', '10M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), '-g', String(FPS * 2), '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-t', String(D), '-movflags', '+faststart', out);
  await run('ffmpeg', args);
}

export const cover = (video, at, out) => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '3', out]);

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
      const stock = await pexels(reel.bg?.queries ?? [], salt, used);
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
      if (tracks.length) {
        track = tracks[hash(`${post.id}:music:${reel.bg?.salt ?? 0}`) % tracks.length];
        try {
          const ext = track.toLowerCase().endsWith('.m4a') ? 'm4a' : 'mp3';
          await download(`${base}/storage/v1/object/public/social-videos/music/${encodeURIComponent(track)}`, join(dir, `music.${ext}`), 30_000_000);
          audio = join(dir, `music.${ext}`);
        } catch {
          audio = null;
          track = null;
        }
      }

      const out = join(dir, 'reel.mp4');
      try {
        await render({ bg, frame, layers, duration: reel.duration, out, audio });
      } catch (e) {
        // A track ffmpeg can't read must not cost the reel.
        if (!audio) throw e;
        audio = null;
        track = null;
        await render({ bg, frame, layers, duration: reel.duration, out });
      }
      const jpg = join(dir, 'cover.jpg');
      await cover(out, Math.min(reel.cover_at ?? 2.4, reel.duration - 0.5), jpg);
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
        meta: { ...post.meta, reel: { ...reel, bg_used: bgUsed, music: track, rendered_at: new Date().toISOString(), seconds: reel.duration, bytes: size } },
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
  await render({ ...recipe, out });
  await cover(out, recipe.cover_at ?? 2.4, out.replace(/\.mp4$/, '.jpg'));
  console.log('wrote', out);
} else {
  await main();
}
