// GET /api/og/profile?u=<username> → 1200×630 share image for a public profile:
// photo, name, headline, what they're doing now (hiring / looking), and the
// application stats they chose to make public. Nothing private is shown.

import { fetchShareProfile, type ShareProfile } from '../_supa';
import { BLUE, brandLogo, chip, clip, fmt, footer, frame, h, img, logoDataUrl, shareImage, type El } from '../_og';

export const config = { runtime: 'edge' };

const ROLE: Record<string, string> = { job_seeker: 'Job seeker', hiring_manager: 'Hiring manager', recruiter: 'Recruiter', visa_expert: 'Immigration expert' };

function badge(text: string, tone: 'green' | 'blue' | 'grey'): El {
  const t = { green: ['#ECFDF5', '#047857', '#A7F3D0'], blue: ['#EFF6FF', '#1D4ED8', '#BFDBFE'], grey: ['#F1F5F9', '#334155', '#E2E8F0'] }[tone];
  return h('div', { fontSize: 22, fontWeight: 700, color: t[1], backgroundColor: t[0], border: `2px solid ${t[2]}`, borderRadius: 999, padding: '6px 18px', marginRight: 10 }, text);
}

function render(p: ShareProfile | null, avatar: string | null, brand: string | null): El {
  const top = h(
    'div',
    { alignItems: 'center', justifyContent: 'space-between' },
    brand ? img(brand, { width: 223, height: 46 }) : h('div', { fontSize: 36, fontWeight: 700, color: '#0F172A' }, 'madevisa'),
    h('div', { fontSize: 22, fontWeight: 700, color: '#1D4ED8', backgroundColor: '#EFF6FF', border: '2px solid #BFDBFE', borderRadius: 999, padding: '8px 20px' }, 'Profile')
  );
  if (!p) return frame(top, h('div', { fontSize: 64, fontWeight: 700, color: '#0F172A', marginTop: 60 }, 'MadeVisa profiles'), footer('madevisa.com', 'Jobs · Company scores · Visas', 'Join MadeVisa'));

  const initials = p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const badges: El[] = [];
  if (p.intent === 'hiring') badges.push(badge("I'm hiring", 'green'));
  if (p.intent === 'looking') badges.push(badge('Open to work', 'blue'));
  if (p.role && ROLE[p.role]) badges.push(badge(ROLE[p.role], 'grey'));
  if (p.company) badges.push(badge(`${clip(p.company, 28)}${p.companyVerified ? ' · Verified' : ''}`, 'grey'));

  const facts: El[] = [];
  if (p.tracked > 0) {
    facts.push(chip('Applications tracked', fmt(p.tracked), true));
    facts.push(chip('Replies', fmt(p.replies)));
    facts.push(chip('Interviews', fmt(p.interviews)));
    if (p.offers > 0) facts.push(chip('Offers', fmt(p.offers)));
  }

  return frame(
    top,
    h(
      'div',
      { alignItems: 'center', marginTop: 34 },
      avatar
        ? img(avatar, { width: 150, height: 150, borderRadius: 999, objectFit: 'cover', border: `6px solid ${BLUE}`, marginRight: 36 })
        : h('div', { width: 150, height: 150, borderRadius: 999, backgroundColor: BLUE, color: 'white', fontSize: 62, fontWeight: 700, alignItems: 'center', justifyContent: 'center', marginRight: 36 }, initials),
      h(
        'div',
        { flexDirection: 'column', flex: 1 },
        h('div', { fontSize: p.name.length > 22 ? 52 : 62, fontWeight: 700, color: '#0F172A', letterSpacing: -2, lineHeight: 1.05 }, clip(p.name, 34)),
        h('div', { fontSize: 26, color: '#64748B', marginTop: 6 }, `@${p.username}`),
        p.headline ? h('div', { fontSize: 28, color: '#334155', marginTop: 12, lineHeight: 1.3 }, clip(p.headline, 90)) : null
      )
    ),
    badges.length ? h('div', { marginTop: 24 }, ...badges) : null,
    facts.length ? h('div', { flexWrap: 'wrap', marginTop: 22 }, ...facts) : null,
    footer(`madevisa.com/u/${p.username}`, 'On MadeVisa', p.intent === 'hiring' ? 'See who’s hiring' : 'View profile')
  );
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const u = url.searchParams.get('u') ?? '';
  const p = u ? await fetchShareProfile(u).catch(() => null) : null;
  const [avatar, brand] = await Promise.all([p?.avatar ? logoDataUrl(p.avatar) : Promise.resolve(null), brandLogo(url.origin)]);
  const text = p
    ? [p.name, `@${p.username}`, p.headline, "I'm hiring Open to work Job seeker Hiring manager Recruiter Immigration expert", p.company, '· Verified', 'Profile Applications tracked Replies Interviews Offers', fmt(p.tracked), fmt(p.replies), fmt(p.interviews), fmt(p.offers),
       `madevisa.com/u/${p.username}`, 'On MadeVisa View profile See who’s hiring', p.name.split(/\s+/).map((w) => w[0]).join('').toUpperCase()].filter(Boolean).join(' ')
    : 'MadeVisa profiles madevisa.com Jobs · Company scores · Visas Join MadeVisa Profile';
  return shareImage(render(p, avatar, brand), text, { maxAge: 3600 });
}
