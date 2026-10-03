import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, ExternalLink, ImageIcon, Loader2, Play, Plus, Sparkles, Trash2, Video } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { visaGuides } from '@/data/visa';
import { CircleFlag } from '@/components/common/CircleFlag';
import { btnPrimary, card, input, inputAuto, when, type ProgramRow } from './shared';

// Social media → Photos & clips.
//
// The library of real photos and video clips of the countries MadeVisa posts
// about. Everything that needs a picture takes it from here: the photo that
// opens a post, the footage behind a reel, the cover of a blog article.
// "Fill the library" asks the server to look them up for every main
// destination; each post carries the photographer's name.
//
// Three shapes per country: upright photos (posts, reels), wide photos
// (article covers) and clips (reels). There is no "any country" group: a post
// about no country in particular takes its turn through all of them.
//
// Table social_media, migration 20261127090000. Filled by the pipeline
// (media.ts), which needs the secret PIXABAY_API_KEY (or PEXELS_API_KEY).
// Pixabay photos are copied into social-images/library/; Pexels ones are linked.

type Item = {
  id: number;
  code: string;
  kind: 'photo' | 'video';
  url: string;
  thumb: string | null;
  credit: string | null;
  page: string | null;
  query: string | null;
  source: string;
  seconds: number | null;
  width: number | null;
  height: number | null;
  enabled: boolean;
  uses: number;
  last_used_at: string | null;
};

/** The retired "any country" code: such rows are hidden here and removed at the next fill. */
const RETIRED = 'ZZ';
const countryName = (code: string) => visaGuides.find((g) => g.code === code)?.name ?? new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
const isWide = (it: Pick<Item, 'kind' | 'width' | 'height'>) => it.kind === 'photo' && Boolean(it.width && it.height && it.width > it.height);
type Shape = 'photo' | 'wide' | 'video';
const shapeOf = (it: Item): Shape => (it.kind === 'video' ? 'video' : isWide(it) ? 'wide' : 'photo');

export function MediaLibrary({ program, onChange }: { program: ProgramRow; onChange: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [code, setCode] = useState<string>('all');
  const [kind, setKind] = useState<'all' | Shape>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [add, setAdd] = useState({ code: '', kind: 'photo' as Shape, url: '', credit: '' });

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('social_media').select('id, code, kind, url, thumb, credit, page, query, source, seconds, width, height, enabled, uses, last_used_at').neq('code', RETIRED).order('code').order('id').limit(5000);
    if (error) return setMissing(true);
    setItems((data ?? []) as Item[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const fill = async () => {
    setBusy('fill');
    setMsg(null);
    const { error } = await supabase.rpc('social_media_fill_now');
    setBusy(null);
    setMsg(error ? error.message : 'Looking them up on the server — this takes up to two minutes. The result appears above; press again to continue with the countries that are still short.');
    if (!error) {
      for (const ms of [45_000, 125_000]) {
        window.setTimeout(() => {
          void load();
          onChange();
        }, ms);
      }
    }
  };
  const patch = async (item: Item, change: Partial<Item>) => {
    setItems((list) => list?.map((x) => (x.id === item.id ? { ...x, ...change } : x)) ?? null);
    const { error } = await supabase.from('social_media').update(change).eq('id', item.id);
    if (error) setMsg(error.message);
  };
  const remove = async (item: Item) => {
    setItems((list) => list?.filter((x) => x.id !== item.id) ?? null);
    const { error } = await supabase.from('social_media').delete().eq('id', item.id);
    if (error) setMsg(error.message);
  };
  const addOne = async () => {
    const cc = add.code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc) || cc === RETIRED) return setMsg('Country: its two letters, e.g. DE for Germany.');
    if (!/^https:\/\/\S+$/.test(add.url.trim())) return setMsg('The file needs an https:// address.');
    setBusy('add');
    const { error } = await supabase.from('social_media').insert({ code: cc, kind: add.kind === 'video' ? 'video' : 'photo', url: add.url.trim(), thumb: add.kind === 'video' ? null : add.url.trim(), credit: add.credit.trim().slice(0, 80) || null, source: 'manual', ...(add.kind === 'wide' ? { width: 1600, height: 900 } : {}) });
    setBusy(null);
    setMsg(error ? error.message : 'Added.');
    if (!error) {
      setAdd({ code: cc, kind: add.kind, url: '', credit: '' });
      void load();
    }
  };

  const byCode = useMemo(() => {
    const m = new Map<string, Record<Shape, number>>();
    for (const it of items ?? []) {
      const c = m.get(it.code) ?? { photo: 0, wide: 0, video: 0 };
      c[shapeOf(it)]++;
      m.set(it.code, c);
    }
    return m;
  }, [items]);

  if (missing) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        Run the migration <span className="font-mono text-[13px]">20261127090000_control_room_cvs_media.sql</span> in the Supabase SQL Editor, then deploy the function (<span className="font-mono text-[13px]">supabase functions deploy auto-pipeline --no-verify-jwt</span>) to turn on the photo and clip library.
      </p>
    );
  }

  const codes = [...byCode.keys()].sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const shown = (items ?? []).filter((it) => (code === 'all' || it.code === code) && (kind === 'all' || shapeOf(it) === kind));
  const count = (sh: Shape) => (items ?? []).filter((x) => shapeOf(x) === sh).length;
  const failed = Boolean(program.media_note && /add the secret|nothing added|run the migration|answered \d/i.test(program.media_note));

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-ink-950">Photos and clips</h3>
            <p className="mt-1 text-xs leading-5 text-ink-600">
              Real photos and short videos of every main destination — streets, skylines, people in the city. Everything that needs a picture takes it from here: with the look set to <strong>Photo first</strong> (Strategy) each post opens with one under its headline, reels play the clips behind the text, and blog articles without a cover get a wide photo. A post about a country uses that country’s pictures only; a post about no country in particular takes its turn through all of them. The one used least recently goes first, so nothing repeats.
            </p>
            <p className="mt-2 text-xs leading-5 text-ink-600">
              They come from Pixabay (or Pexels, if you have a key for it) — free stock sites — and each post carries the photographer’s name. The people in them are strangers: posts never name them, and never say or suggest they are MadeVisa users or that the caption is their story.
            </p>
          </div>
          <div className="shrink-0 md:max-w-[220px] md:text-right">
            <button onClick={() => void fill()} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === 'fill' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Fill the library
            </button>
            <p className="mt-1.5 text-[11px] text-ink-500">About 15 countries per press · tops itself up daily while the program runs</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 text-sm sm:max-w-xl sm:grid-cols-4">
          {[
            [count('photo'), 'upright photos'],
            [count('wide'), 'wide photos'],
            [count('video'), 'clips'],
            [codes.length, 'countries'],
          ].map(([n, l]) => (
            <div key={String(l)}>
              <dd className="text-2xl font-bold tabular-nums text-ink-950">{Number(n).toLocaleString('en-US')}</dd>
              <dt className="text-xs text-ink-500">{l}</dt>
            </div>
          ))}
        </dl>
        {program.media_note && (
          <p className={`mt-3 rounded-md px-3 py-2 text-xs leading-5 ${failed ? 'bg-amber-50 text-amber-900' : 'bg-ink-50 text-ink-700'}`}>
            <span className="text-ink-400">Last fill {when(program.media_at ?? null)}:</span> {program.media_note}
          </p>
        )}
        {!program.media_note && !items?.length && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            The library is empty. Before the first fill, add the secret <span className="font-mono">PIXABAY_API_KEY</span> to the function (Supabase → Edge Functions → Secrets), then deploy the function. The key is free: log in at pixabay.com and open pixabay.com/api/docs — your key is shown on that page. A <span className="font-mono">PEXELS_API_KEY</span> works too if you already have one.
          </p>
        )}
        {msg && <p className="mt-2 text-xs font-medium text-emerald-700">{msg}</p>}
      </div>

      {items && items.length > 0 && (
        <div className={`${card} p-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <select className={inputAuto} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Country">
              <option value="all">Every country ({items.length})</option>
              {codes.map((c) => (
                <option key={c} value={c}>
                  {countryName(c)} · {(byCode.get(c)?.photo ?? 0) + (byCode.get(c)?.wide ?? 0)} photos, {byCode.get(c)?.video ?? 0} clips
                </option>
              ))}
            </select>
            <div className="flex rounded-lg border border-ink-200 bg-white p-0.5 text-xs font-semibold">
              {(['all', 'photo', 'wide', 'video'] as const).map((k) => (
                <button key={k} onClick={() => setKind(k)} className={`rounded-md px-3 py-1.5 ${kind === k ? 'bg-ink-950 text-white' : 'text-ink-600 hover:bg-ink-50'}`}>
                  {k === 'all' ? 'All' : k === 'photo' ? 'Upright' : k === 'wide' ? 'Wide' : 'Clips'}
                </button>
              ))}
            </div>
            <span className="text-xs text-ink-500">
              {shown.length} shown{shown.length > 240 ? ' · first 240 below, pick a country to see the rest' : ''}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {shown.slice(0, 240).map((it) => (
              <figure key={it.id} className={`group overflow-hidden rounded-lg border border-ink-200 bg-ink-50 ${it.enabled ? '' : 'opacity-50'}`}>
                <div className="relative aspect-[4/5] bg-ink-200">
                  {it.thumb ? <img src={it.thumb} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-ink-400">{it.kind === 'video' ? <Video className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}</span>}
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-ink-950/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    <CircleFlag countryCode={it.code} size={11} />
                    {it.code}
                  </span>
                  {isWide(it) && <span className="absolute right-1.5 top-1.5 rounded-full bg-ink-950/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">Wide · articles</span>}
                  {it.kind === 'video' && (
                    <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-ink-950/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      <Play className="h-2.5 w-2.5 fill-current" /> {it.seconds ? `${it.seconds}s` : 'clip'}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-ink-950/70 to-transparent p-1.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <a href={it.page ?? it.url} target="_blank" rel="noreferrer" className="rounded-md bg-white/90 p-1.5 text-ink-800 hover:bg-white" title={it.kind === 'video' ? 'Watch it on its page' : 'Open the photo'}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button onClick={() => void patch(it, { enabled: !it.enabled })} className="rounded-md bg-white/90 p-1.5 text-ink-800 hover:bg-white" title={it.enabled ? 'Don’t use this one' : 'Use it again'}>
                      {it.enabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => void remove(it)} className="rounded-md bg-white/90 p-1.5 text-rose-700 hover:bg-white" title="Remove from the library">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <figcaption className="px-2 py-1.5 text-[11px] leading-4 text-ink-600">
                  <span className="block truncate">{it.credit ? `${it.kind === 'video' ? 'Video' : 'Photo'}: ${it.credit}` : it.source === 'manual' ? 'Added by hand' : 'No credit'}</span>
                  <span className="block truncate text-ink-400">{it.enabled ? (it.uses ? `Used ${it.uses}× · last ${when(it.last_used_at)}` : 'Not used yet') : 'Switched off'}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          {!shown.length && <p className="mt-4 text-sm text-ink-500">Nothing here yet for this choice.</p>}
        </div>
      )}

      <details className={`${card} p-5`}>
        <summary className="cursor-pointer text-sm font-semibold text-ink-900">Add your own photo or clip</summary>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-ink-600">
          Your own footage is the most convincing thing you can post: a team member on camera, your office, an event. Upload it anywhere public (for example Supabase Storage → social-images) and paste its address. Use only material you have the right to use, and only faces of people who agreed to be in MadeVisa’s posts.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[70px_140px_1fr_180px_auto]">
          <input className={input} value={add.code} maxLength={2} onChange={(e) => setAdd((a) => ({ ...a, code: e.target.value.toUpperCase() }))} placeholder="DE" aria-label="Country code" />
          <select className={input} value={add.kind} onChange={(e) => setAdd((a) => ({ ...a, kind: e.target.value as Shape }))} aria-label="Kind">
            <option value="photo">Upright photo</option>
            <option value="wide">Wide photo</option>
            <option value="video">Clip (MP4)</option>
          </select>
          <input className={input} value={add.url} onChange={(e) => setAdd((a) => ({ ...a, url: e.target.value }))} placeholder="https://… (JPG, PNG or a vertical MP4)" aria-label="File address" />
          <input className={input} value={add.credit} maxLength={80} onChange={(e) => setAdd((a) => ({ ...a, credit: e.target.value }))} placeholder="Credit (optional)" aria-label="Credit" />
          <button onClick={() => void addOne()} disabled={busy !== null} className={btnPrimary}>
            {busy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
          </button>
        </div>
        <p className="mt-2 text-[11px] text-ink-500">
          Upright photos (4:5 or taller, at least 1080 px wide) open posts and sit behind reels; wide photos (about 16:9) become article covers; clips should be vertical, 6–90 seconds. Give each one the country it shows.
        </p>
      </details>
    </div>
  );
}
