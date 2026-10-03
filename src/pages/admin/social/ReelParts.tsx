import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clapperboard, Loader2, Music, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { btn, card, input, reelLayers, reelsAlive, when, type Post, type ProgramRow, type ReelRecipe, type ReelScene } from './shared';

// Reels in the admin panel: the preview while the video is being made, the
// editor for the words on each screen, and the set-up card (renderer + music).
//
// A reel is a post whose meta.reel holds a recipe: the screens (each a URL of
// /api/og/post?t=reel — every word is a parameter), the background to look
// for and the timing. scripts/render-reels.mjs (GitHub Actions) turns it into
// the MP4. Editing a word = rewriting the screen's URL and rendering again.

type Screen = 'hook' | 'list' | 'cta';
const screenOf = (url: string): Screen => (new URL(url, window.location.origin).searchParams.get('sc') as Screen) ?? 'hook';
const SCREEN_NAME: Record<Screen, string> = { hook: 'Big lines', list: 'List', cta: 'Last screen' };
const LINES_HELP = 'One line per row. Start a line with * for the blue box, ! for yellow, - for dark.';

const linesToText = (raw: string) => raw.split('~').join('\n');
const textToLines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/~/g, ' ').trim())
    .filter(Boolean)
    .join('~');
const rowsToText = (raw: string) => raw.split('~').map((r) => r.split('|').join(' | ')).join('\n');
const textToRows = (text: string) =>
  text
    .split('\n')
    .map((l) => l.split('|').map((c) => c.replace(/~/g, ' ').trim()).join('|'))
    .filter((l) => l.replace(/\|/g, '').trim())
    .join('~');

/** A text layer over a stand-in background — what the screen says, not the final footage. */
export function ReelScreen({ url, className = '' }: { url: string; className?: string }) {
  return (
    <div className={`relative aspect-[9/16] overflow-hidden rounded-lg bg-gradient-to-b from-brand-600 via-brand-800 to-ink-950 ${className}`}>
      <img key={url} src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full" />
    </div>
  );
}

/** The video once it exists; until then the opening screen and where things stand. */
export function ReelPreview({ post, rendererAlive }: { post: Post; rendererAlive: boolean }) {
  const reel = post.meta?.reel;
  if (post.video_url) {
    return (
      <div>
        <video key={post.video_url} src={post.video_url} poster={post.images[0]?.url} controls playsInline loop preload="none" className="aspect-[9/16] w-full rounded-lg border border-ink-200 bg-ink-950" />
        {reel && (
          <p className="mt-1.5 text-[11px] leading-4 text-ink-500">
            {Math.round(reel.duration)} seconds ·{' '}
            {reel.bg_used?.source === 'pexels' ? (
              <>
                footage:{' '}
                {reel.bg_used.page ? (
                  <a href={reel.bg_used.page} target="_blank" rel="noreferrer" className="underline">
                    {reel.bg_used.credit ?? 'Pexels'}
                  </a>
                ) : (
                  reel.bg_used.credit ?? 'Pexels'
                )}{' '}
                on Pexels{reel.bg_used.query ? ` (“${reel.bg_used.query}”)` : ''}
              </>
            ) : reel.bg_used?.source === 'library' ? (
              `footage: ${reel.bg_used.credit ?? 'a clip'} (from Photos & clips)`
            ) : reel.bg_used?.source === 'photo' ? (
              `background: your country photo${reel.bg_used.credit ? ` (${reel.bg_used.credit})` : ''}`
            ) : (
              'background: MadeVisa gradient'
            )}
            {reel.music ? ` · music: ${reel.music.replace(/\.(mp3|m4a)$/i, '')}` : ' · no music'}
          </p>
        )}
      </div>
    );
  }
  if (!reel?.scenes?.length) return null;
  return (
    <div>
      <ReelScreen url={reel.scenes[0].url} className="border border-ink-200" />
      {post.status === 'rendering' && (
        <p className={`mt-1.5 flex gap-1.5 text-[11px] leading-4 ${rendererAlive ? 'text-ink-500' : 'text-amber-800'}`}>
          <Loader2 className={`mt-0.5 h-3 w-3 shrink-0 ${rendererAlive ? 'animate-spin' : ''}`} />
          {rendererAlive
            ? 'The video is being made: footage is added behind these screens. Usually ready within a few minutes, at the latest on the next hourly run.'
            : 'Waiting for the renderer, which hasn’t reported in. See Content ideas → Reels for the set-up; a reel that isn’t rendered three hours after its time is dropped.'}
        </p>
      )}
    </div>
  );
}

/** Edit the words on each screen, or ask for another background. Saving renders the video again. */
export function ReelEditor({ post, onDone }: { post: Post; onDone: () => void }) {
  const reel = post.meta!.reel!;
  const [scenes, setScenes] = useState<ReelScene[]>(() => reel.scenes);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[] | null>(null);
  const scene = scenes[Math.min(at, scenes.length - 1)];
  const q = new URL(scene.url, window.location.origin).searchParams;
  const sc = screenOf(scene.url);

  const setParam = (key: string, value: string) => {
    setNotes(null);
    setScenes((list) =>
      list.map((s, i) => {
        if (i !== at) return s;
        const u = new URL(s.url, window.location.origin);
        if (value) u.searchParams.set(key, value);
        else u.searchParams.delete(key);
        // A list shows its rows one by one; big lines too, when they did before.
        const count = key === 'rows' ? value.split('~').filter(Boolean).length : key === 'l' && sc === 'hook' && s.steps > 1 ? value.split('~').filter(Boolean).length + (u.searchParams.get('s') ? 1 : 0) : null;
        return { ...s, url: u.toString(), steps: count === null ? s.steps : Math.max(1, count) };
      })
    );
  };

  const render = async (recipe: ReelRecipe | null) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('social_reel_render', { p_id: post.id, p_reel: recipe });
    setBusy(false);
    if (error) return setNotes([`ERROR: ${error.message}`]);
    if (typeof data === 'string' && data.startsWith('not changed')) return setNotes(['ERROR: this reel can’t be changed any more (already published).']);
    onDone();
  };
  const save = async () => {
    setBusy(true);
    const out: string[] = [];
    try {
      for (const [i, s] of scenes.entries()) {
        const r = await (await fetch(`${s.url}&check=1`)).json();
        for (const it of (r.issues ?? []) as { level: string; message: string }[]) out.push(`${it.level === 'error' ? 'ERROR: ' : ''}Screen ${i + 1}: ${it.message}`);
      }
    } catch {
      out.push('The check couldn’t run — look at the previews before saving.');
    }
    setNotes(out);
    setBusy(false);
    if (out.some((n) => n.startsWith('ERROR'))) return;
    await render({ ...reel, scenes, ...reelLayers(scenes) });
  };

  const field = (key: string, label: string, max: number, hint?: string) => (
    <label className="text-xs font-medium text-ink-700">
      {label}
      <input className={`${input} mt-1`} value={q.get(key) ?? ''} maxLength={max} placeholder={hint ?? 'Empty = hidden'} onChange={(e) => setParam(key, e.target.value)} />
    </label>
  );

  return (
    <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-medium text-ink-600">Screen</span>
        {scenes.map((s, i) => (
          <button key={i} onClick={() => setAt(i)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${i === at ? 'bg-ink-950 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200'}`}>
            {i + 1} · {SCREEN_NAME[screenOf(s.url)]}
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px]">
        <div className="grid content-start gap-2">
          {sc !== 'list' && field('k', 'Small label above', 28)}
          <label className="text-xs font-medium text-ink-700">
            {sc === 'list' ? 'Heading' : `Lines. ${LINES_HELP}`}
            {sc === 'list' ? (
              <input className={`${input} mt-1`} value={q.get('l') ?? ''} maxLength={60} onChange={(e) => setParam('l', e.target.value.replace(/~/g, ' '))} />
            ) : (
              <textarea className={`${input} mt-1 text-[13px] leading-5`} rows={Math.min(7, Math.max(3, (q.get('l') ?? '').split('~').length + 1))} value={linesToText(q.get('l') ?? '')} onChange={(e) => setParam('l', textToLines(e.target.value))} />
            )}
          </label>
          {sc === 'list' && (
            <label className="text-xs font-medium text-ink-700">
              Rows, up to 4. One per line: text | small line under it
              <textarea className={`${input} mt-1 font-mono text-[12px] leading-5`} rows={5} value={rowsToText(q.get('rows') ?? '')} onChange={(e) => setParam('rows', textToRows(e.target.value))} />
            </label>
          )}
          {sc === 'cta' && field('link', 'Address in the blue pill', 60, 'madevisa.com/…')}
          {sc === 'cta' && field('c', 'Comment prompt (yellow)', 44, 'e.g. Comment “GERMANY”')}
          {sc !== 'list' && field('s', 'Small line', 160)}
        </div>
        <ReelScreen url={scene.url} className="border border-ink-200" />
      </div>
      {notes && (notes.length ? <ul className="mt-2 space-y-0.5 text-xs text-amber-800">{notes.map((n) => <li key={n}>• {n}</li>)}</ul> : <p className="mt-2 text-xs font-medium text-emerald-700">Everything fits.</p>)}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-ink-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save and render again
        </button>
        <button onClick={() => void render({ ...reel, bg: { ...reel.bg, salt: (reel.bg.salt ?? 0) + 1 } })} disabled={busy} className={btn} title="Same words, different footage (and a different track, if you added music)">
          <RefreshCw className="h-3.5 w-3.5" /> Another background
        </button>
        <span className="text-[11px] text-ink-500">The preview shows the words; the footage is added when the video is rendered (a few minutes).</span>
      </div>
    </div>
  );
}

// --- Set-up card: is the renderer alive, and the music it may use ------------------------

type Track = { name: string; created_at?: string };

export function ReelsSetup({ program }: { program: ProgramRow }) {
  const alive = reelsAlive(program);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.storage.from('social-videos').list('music', { limit: 100, sortBy: { column: 'name', order: 'asc' } });
    setTracks(((data ?? []) as Track[]).filter((t) => /\.(mp3|m4a)$/i.test(t.name)));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File) => {
    setErr(null);
    const ext = /\.m4a$/i.test(file.name) ? 'm4a' : /\.mp3$/i.test(file.name) ? 'mp3' : null;
    if (!ext) return setErr('Music must be an MP3 or M4A file.');
    if (file.size > 15_000_000) return setErr('That file is over 15 MB — a 30-second cut is plenty.');
    setBusy(true);
    const name =
      file.name
        .replace(/\.(mp3|m4a)$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) || 'track';
    const { error } = await supabase.storage.from('social-videos').upload(`music/${name}.${ext}`, file, { contentType: ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4', upsert: true });
    setBusy(false);
    if (error) setErr(`${error.message} — has the migration 20261124090000_social_reels.sql been run?`);
    void load();
  };

  return (
    <div className={`${card} p-5`}>
      <div className="flex flex-wrap items-center gap-2">
        <Clapperboard className="h-4 w-4 text-brand-600" />
        <h3 className="text-base font-semibold text-ink-950">Reels</h3>
        {alive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> Renderer is running
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">{program.reels_at ? 'Renderer has gone quiet' : 'Renderer not set up yet'}</span>
        )}
        {program.reels_at && <span className="text-xs text-ink-500">last reported in {when(program.reels_at)}</span>}
      </div>
      <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-600">
        Six kinds of post are 12–16 second vertical videos: text boxes that appear one by one over footage of the city or country, with the links in the caption. While the renderer is running, each network gets about one reel a day in place of an image post. Instagram and Facebook publish them as Reels, Telegram as a video; for TikTok you download the video and post it by hand.
      </p>
      {program.reels_note && <p className="mt-2 rounded-md bg-ink-50 px-2.5 py-1.5 text-xs text-ink-700">Last run: {program.reels_note}</p>}
      {!alive && (
        <ol className="mt-3 max-w-3xl list-decimal space-y-1 pl-5 text-xs leading-5 text-ink-700">
          <li>
            Make sure <span className="font-mono">scripts/render-reels.mjs</span> and <span className="font-mono">.github/workflows/render-reels.yml</span> are pushed to GitHub (they came with this update).
          </li>
          <li>
            On GitHub: Settings → Secrets and variables → Actions → add <span className="font-mono">SUPABASE_URL</span> and <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>. Optional: <span className="font-mono">PEXELS_API_KEY</span> (free at pexels.com/api) for real city footage; without it your country photos or the blue gradient are used.
          </li>
          <li>Actions → Render reels → Run workflow. When it finishes, this card turns green and reels join the plan within the hour. It then runs by itself every hour.</li>
          <li>
            Optional, for speed: add the Supabase secrets <span className="font-mono">GITHUB_DISPATCH_TOKEN</span> (a fine-grained token for this repository with “Contents: read and write”) and <span className="font-mono">GITHUB_REPO</span> (<span className="font-mono">owner/name</span>), and a reel is rendered minutes after it is written instead of on the hour.
          </li>
        </ol>
      )}

      <div className="mt-4 border-t border-ink-100 pt-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          <Music className="h-4 w-4 text-ink-500" /> Music
        </p>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-600">
          Optional. Upload a few tracks you have the right to use (royalty-free libraries such as Pixabay Music or the YouTube Audio Library; not chart songs). Each reel gets one of them, faded in and out. With no tracks, reels are silent — Instagram’s own music library can’t be added through the API.
        </p>
        {err && <p className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">{err}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {tracks.map((t) => (
            <span key={t.name} className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 py-1 pl-3 pr-1.5 text-xs font-medium text-ink-800">
              {t.name}
              <button
                className="rounded-full p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                title="Remove this track"
                onClick={async () => {
                  await supabase.storage.from('social-videos').remove([`music/${t.name}`]);
                  void load();
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
          <label className={`${btn} cursor-pointer`}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Add a track
            <input type="file" accept="audio/mpeg,audio/mp4,.mp3,.m4a" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          </label>
        </div>
      </div>
    </div>
  );
}
