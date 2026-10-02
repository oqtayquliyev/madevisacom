import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, Loader2, Search, Trash2, Wand2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { visaGuides } from '@/data/visa';
import { CircleFlag } from '@/components/common/CircleFlag';
import { FORMATS, PILLARS, PILLAR_ORDER, PLATFORM_LABEL, btn, card, inputAuto, isFormatOn, type FormatDef, type Pillar, type Platform, type PlatformRow, type ProgramRow } from './shared';

// The content library: every kind of post the program can make, what feeds
// it and where it sends people. Switch formats on and off, or "Try it" to see
// one written for a network (it lands in Up next and waits for approval).

function days(hours: number): string {
  if (hours < 20) return 'can return the same day';
  const d = Math.round(hours / 24);
  return d <= 1 ? 'at most once a day' : `at most every ${d} days`;
}

function FormatCard({ f, on, platforms, onToggle, onTry }: { f: FormatDef; on: boolean; platforms: PlatformRow[]; onToggle: (v: boolean) => void; onTry: (p: Platform) => Promise<string> }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const can = platforms.filter((p) => p.enabled && f.platforms.includes(p.platform));
  const [where, setWhere] = useState<Platform | ''>('');
  const target = where || can[0]?.platform || '';
  return (
    <div className={`rounded-xl border bg-white p-4 transition ${on ? 'border-ink-200' : 'border-ink-200 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-ink-950">{f.name}</p>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-600">
          <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} /> {on ? 'On' : 'Off'}
        </label>
      </div>
      <p className="mt-1 text-xs leading-5 text-ink-600">{f.idea}</p>
      <p className="mt-2 rounded-md bg-ink-50 px-2.5 py-1.5 text-[13px] leading-5 text-ink-800">“{f.example}”</p>
      <dl className="mt-2 space-y-0.5 text-[11px] leading-4 text-ink-500">
        <div>
          <dt className="inline font-semibold text-ink-600">From: </dt>
          <dd className="inline">{f.source}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink-600">Sends people to: </dt>
          <dd className="inline">{f.link}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink-600">Image: </dt>
          <dd className="inline">{f.visual}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink-600">Where and how often: </dt>
          <dd className="inline">
            {f.platforms.length === 5 ? 'every network' : f.platforms.map((p) => PLATFORM_LABEL[p]).join(', ')} · {days(f.cooldown)}
            {f.days ? ` · ${f.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')} only` : ''}
          </dd>
        </div>
      </dl>
      {f.needs && <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-900">{f.needs}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className={`${inputAuto} py-1 text-xs`} value={target} onChange={(e) => setWhere(e.target.value as Platform)} disabled={!can.length}>
          {can.length ? can.map((p) => <option key={p.platform} value={p.platform}>{PLATFORM_LABEL[p.platform]}</option>) : <option value="">No network on</option>}
        </select>
        <button
          disabled={busy || !target}
          onClick={async () => {
            setBusy(true);
            setNote(await onTry(target as Platform));
            setBusy(false);
          }}
          className={btn}
          title="Write one now. It appears in Up next and waits for your approval — nothing goes out by itself."
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Try it
        </button>
        {note && <span className="text-[11px] text-ink-500">{note}</span>}
      </div>
    </div>
  );
}

// --- Country photos -------------------------------------------------------------
// A photo behind "X is hiring", visa route and news images. JPEG, shrunk in the
// browser to 1600 px before upload. Without a photo the image uses the flag on
// the blue gradient, which always works.

type Photo = { code: string; url: string; credit: string | null };

async function shrink(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.86));
}

function CountryPhotos() {
  const [photos, setPhotos] = useState<Map<string, Photo>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [extra, setExtra] = useState('');
  const load = useCallback(async () => {
    const { data } = await supabase.from('social_country_photos').select('code, url, credit');
    setPhotos(new Map(((data ?? []) as Photo[]).map((p) => [p.code, p])));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (code: string, patch: Partial<Photo>) => {
    setErr(null);
    const row = { code, url: patch.url ?? photos.get(code)?.url ?? '', credit: (patch.credit ?? photos.get(code)?.credit ?? '') || null, updated_at: new Date().toISOString() };
    if (!/^https:\/\//.test(row.url)) return setErr('The photo needs an https:// address.');
    const { error } = await supabase.from('social_country_photos').upsert(row);
    if (error) setErr(error.message);
    void load();
  };
  const upload = async (code: string, file: File) => {
    setBusy(code);
    setErr(null);
    const blob = await shrink(file);
    if (!blob) {
      setBusy(null);
      return setErr('That file couldn’t be read as an image.');
    }
    const path = `countries/${code}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('social-images').upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
    if (error) {
      setBusy(null);
      return setErr(`${error.message} — has the migration 20261120090000_social_program.sql been run?`);
    }
    await save(code, { url: supabase.storage.from('social-images').getPublicUrl(path).data.publicUrl });
    setBusy(null);
  };

  const codes = [...new Set([...visaGuides.map((g) => g.code), ...photos.keys()])];
  const name = (code: string) => visaGuides.find((g) => g.code === code)?.name ?? code;
  return (
    <div className={`${card} p-5`}>
      <h3 className="text-base font-semibold text-ink-950">Country photos</h3>
      <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-600">
        Optional. A photo sits behind “X is hiring”, visa route and news images, under a blue fade so the text stays readable. Use photos you have the right to use (your own, or a free-licence site such as Unsplash or Pexels) and add the credit if the licence asks for one. Without a photo the image uses the flag on the MadeVisa gradient.
      </p>
      {err && <p className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">{err}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {codes.map((code) => {
          const p = photos.get(code);
          return (
            <div key={code} className="flex items-center gap-3 rounded-lg border border-ink-200 p-2">
              {p ? <img src={p.url} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-md object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-gradient-to-br from-brand-700 to-brand-500"><CircleFlag countryCode={code} size={28} /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-950">{name(code)}</p>
                {p ? (
                  <input className="mt-0.5 w-full border-0 border-b border-dashed border-ink-200 bg-transparent p-0 text-[11px] text-ink-600 focus:border-brand-500 focus:outline-none focus:ring-0" defaultValue={p.credit ?? ''} placeholder="Photo credit (optional)" maxLength={60} onBlur={(e) => e.target.value !== (p.credit ?? '') && void save(code, { credit: e.target.value })} />
                ) : (
                  <p className="text-[11px] text-ink-400">Flag on gradient</p>
                )}
              </div>
              <label className="cursor-pointer rounded-md p-2 text-ink-500 hover:bg-ink-100" title="Upload a photo">
                {busy === code ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(code, e.target.files[0])} />
              </label>
              {p && (
                <button
                  className="rounded-md p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                  title="Remove the photo"
                  onClick={async () => {
                    await supabase.from('social_country_photos').delete().eq('code', code);
                    void load();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-600">
        Another country:
        <input className={`${inputAuto} w-24`} value={extra} maxLength={2} onChange={(e) => setExtra(e.target.value.toUpperCase())} placeholder="ISO, e.g. PL" />
        <label className={`${btn} cursor-pointer ${/^[A-Z]{2}$/.test(extra) ? '' : 'pointer-events-none opacity-50'}`}>
          <ImagePlus className="h-3.5 w-3.5" /> Upload
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(extra, e.target.files[0]).then(() => setExtra(''))} />
        </label>
      </div>
    </div>
  );
}

export function IdeasPanel({ program, platforms, onChange, onTried }: { program: ProgramRow; platforms: PlatformRow[]; onChange: () => void; onTried: () => void }) {
  const [q, setQ] = useState('');
  const [pillar, setPillar] = useState<Pillar | 'all'>('all');
  const formats = program.formats ?? {};
  const shown = FORMATS.filter((f) => (pillar === 'all' || f.pillar === pillar) && (!q.trim() || `${f.name} ${f.idea} ${f.example} ${f.source}`.toLowerCase().includes(q.trim().toLowerCase())));
  const onCount = FORMATS.filter((f) => isFormatOn(f, { formats })).length;

  const toggle = async (key: string, v: boolean) => {
    await supabase.from('social_program').update({ formats: { ...formats, [key]: v }, updated_at: new Date().toISOString() }).eq('id', true);
    onChange();
  };

  /** Write one post of this kind now: a slot 30 minutes from now, marked as a test (it always waits for approval). */
  const tryIt = async (f: FormatDef, p: Platform): Promise<string> => {
    const at = new Date(Date.now() + 30 * 60_000);
    at.setSeconds(0, 0);
    const iso = at.toISOString();
    const { error } = await supabase.from('social_posts').insert({ origin: 'program', platform: p, status: 'planned', format: 'slot', kind: f.key, pillar: f.pillar, headline: '', caption: '', images: [], image_key: `slot:test:${f.key}:${iso}`, scheduled_at: iso, write_at: new Date().toISOString(), meta: { force: true, test: true } });
    if (error) return error.message;
    const run = await supabase.rpc('social_run_now');
    if (run.error) return run.error.message;
    onTried();
    return 'Being written — see Up next in about a minute.';
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setPillar('all')} className={`rounded-full px-3 py-1 text-xs font-semibold ${pillar === 'all' ? 'bg-ink-950 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'}`}>
          All {FORMATS.length}
        </button>
        {PILLAR_ORDER.map((k) => (
          <button key={k} onClick={() => setPillar(k)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${pillar === k ? 'bg-ink-950 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'}`}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PILLARS[k].color }} /> {PILLARS[k].name} <span className="tabular-nums opacity-70">{FORMATS.filter((f) => f.pillar === k).length}</span>
          </button>
        ))}
        <label className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-ink-400" />
          <input className={`${inputAuto} w-56 pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ideas" />
        </label>
      </div>
      <p className="text-xs text-ink-500">
        {onCount} of {FORMATS.length} formats are on. A format that has nothing to say (too little data, every topic used recently) is skipped for that slot and another takes its place.
      </p>

      {PILLAR_ORDER.filter((k) => shown.some((f) => f.pillar === k)).map((k) => (
        <section key={k}>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold" style={{ color: PILLARS[k].color }}>
              {PILLARS[k].name}
            </h3>
            <p className="text-xs text-ink-500">{PILLARS[k].why}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown
              .filter((f) => f.pillar === k)
              .map((f) => (
                <FormatCard key={f.key} f={f} on={isFormatOn(f, { formats })} platforms={platforms} onToggle={(v) => void toggle(f.key, v)} onTry={(p) => tryIt(f, p)} />
              ))}
          </div>
        </section>
      ))}

      <CountryPhotos />
    </div>
  );
}
