// GET /api/og/profile?u=<username> → 1200×630 "profile pass": a boarding-pass
// style card (the visa motif) with the person's photo, name and headline, an
// ink stamp for what they're doing now (HIRING / OPEN TO WORK), and the
// application stats they chose to make public. Nothing private is shown.

import { fetchShareProfile, type ShareProfile } from '../_supa';
import { BLUE, brandLogo, clip, fmt, h, icon, img, logoDataUrl, shareImage, stamp, type El } from '../_og';

export const config = { runtime: 'edge' };

const INK = '#0F172A';
const ROLE: Record<string, string> = { job_seeker: 'Job seeker', hiring_manager: 'Hiring manager', recruiter: 'Recruiter', visa_expert: 'Immigration expert' };

/** Decorative barcode, the same for the same username. */
function barcode(seed: string): El {
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const bars: El[] = [];
  for (let i = 0; i < 34; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    bars.push(h('div', { width: 2 + (x % 4), height: 46, backgroundColor: INK, marginRight: 2 + ((x >> 3) % 3) }));
  }
  return h('div', { alignItems: 'flex-end' }, ...bars);
}

function field(label: string, value: string, big = true): El {
  return h(
    'div',
    { flexDirection: 'column', marginBottom: 18, flexShrink: 0 },
    h('div', { fontSize: 15, fontWeight: 700, color: '#94A3B8', letterSpacing: 2.5 }, label),
    h('div', { fontSize: big ? 38 : 26, fontWeight: 800, color: INK, marginTop: 2, letterSpacing: -1 }, value)
  );
}

function render(p: ShareProfile | null, avatar: string | null, brand: string | null): El {
  const name = p?.name ?? 'Your profile';
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const status = p?.intent === 'hiring' ? 'Hiring' : p?.intent === 'looking' ? 'Open to work' : p?.role && ROLE[p.role] ? ROLE[p.role] : 'Member';
  const stampEl =
    p?.intent === 'hiring'
      ? stamp(['HIRING'], { color: '#047857', size: 200, rotate: -14, sub: 'MADEVISA' })
      : p?.intent === 'looking'
        ? stamp(['OPEN TO', 'WORK'], { color: '#1D4ED8', size: 200, rotate: -12, sub: 'MADEVISA' })
        : null;

  // Pass body (left) | perforation | stub (right).
  const main = h(
    'div',
    { flexDirection: 'column', width: 790, height: 510, padding: '38px 46px', position: 'relative', flexShrink: 0 },
    h(
      'div',
      { alignItems: 'center', justifyContent: 'space-between' },
      h('div', { alignItems: 'center' }, icon('plane', 26, BLUE, 2.2), h('div', { fontSize: 18, fontWeight: 700, color: '#64748B', letterSpacing: 3, marginLeft: 12 }, 'PROFILE PASS')),
      brand ? img(brand, { width: 180, height: 37 }) : null
    ),
    h(
      'div',
      { alignItems: 'center', marginTop: 34 },
      avatar
        ? img(avatar, { width: 164, height: 164, borderRadius: 999, objectFit: 'cover', border: `6px solid ${BLUE}`, flexShrink: 0 })
        : h('div', { width: 164, height: 164, borderRadius: 999, backgroundColor: BLUE, color: 'white', fontSize: 64, fontWeight: 800, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, initials),
      h(
        'div',
        { flexDirection: 'column', marginLeft: 32, width: 500 },
        h('div', { fontSize: name.length > 18 ? 48 : 58, fontWeight: 800, color: INK, letterSpacing: -2, lineHeight: 1.04 }, clip(name, 30)),
        p ? h('div', { fontSize: 24, color: '#64748B', marginTop: 6 }, `@${p.username}`) : null,
        p?.company ? h('div', { alignItems: 'center', marginTop: 10, fontSize: 22, fontWeight: 600, color: '#334155' }, clip(p.company, 30), p.companyVerified ? h('div', { marginLeft: 8 }, icon('check', 22, BLUE, 2.4)) : null) : null
      )
    ),
    p?.headline ? h('div', { fontSize: 26, color: '#334155', lineHeight: 1.35, marginTop: 26, width: 560, maxHeight: 72, overflow: 'hidden' }, clip(p.headline, 96)) : null,
    h(
      'div',
      { marginTop: 'auto', alignItems: 'center' },
      h('div', { fontSize: 22, fontWeight: 700, color: INK }, p ? `madevisa.com/u/${p.username}` : 'madevisa.com'),
      h('div', { fontSize: 22, fontWeight: 700, color: BLUE, marginLeft: 18 }, 'View profile →')
    ),
    stampEl ? h('div', { position: 'absolute', right: 26, bottom: 64 }, stampEl) : null
  );

  const stub = h(
    'div',
    { flexDirection: 'column', width: 318, height: 510, padding: '38px 36px', borderLeft: '4px dashed #CBD5E1', flexShrink: 0 },
    field('STATUS', status, false),
    p && p.tracked > 0 ? field('APPLIED', fmt(p.tracked)) : null,
    p && p.tracked > 0 ? field('REPLIES', fmt(p.replies)) : null,
    p && p.tracked > 0 ? field(p.offers > 0 ? 'OFFERS' : 'INTERVIEWS', fmt(p.offers > 0 ? p.offers : p.interviews)) : null,
    p && p.tracked === 0 && p.role && ROLE[p.role] && status !== ROLE[p.role] ? field('ROLE', ROLE[p.role], false) : null,
    h('div', { marginTop: 'auto' }, barcode(p?.username ?? 'madevisa'))
  );

  const notch = (top: number) => h('div', { position: 'absolute', left: 790 - 24, top, width: 48, height: 48, borderRadius: 999, backgroundColor: BLUE });

  return h(
    'div',
    { width: 1200, height: 630, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" },
    h('div', { width: 1112, height: 510, backgroundColor: 'white', borderRadius: 30, position: 'relative', overflow: 'hidden', flexShrink: 0 }, main, stub, notch(-24), notch(510 - 24))
  );
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const u = url.searchParams.get('u') ?? '';
  const p = u ? await fetchShareProfile(u).catch(() => null) : null;
  const [avatar, brand] = await Promise.all([p?.avatar ? logoDataUrl(p.avatar) : Promise.resolve(null), brandLogo(url.origin)]);
  return shareImage(render(p, avatar, brand), { maxAge: 3600 });
}
