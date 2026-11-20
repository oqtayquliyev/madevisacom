// Pixel-art flags (18 × 12 grid, square pixels) for the visa-guide countries.
// Simplified on purpose — the old-web look, not an exact reproduction of each flag.

import { esc } from './html';

const W = 18;
const H = 12;
type Px = [x: number, y: number, w: number, h: number, color: string];

const R = (x: number, y: number, w: number, h: number, c: string): Px => [x, y, w, h, c];
const hStripes = (...colors: string[]) => colors.map((c, i) => R(0, Math.round((i * H) / colors.length), W, Math.round(((i + 1) * H) / colors.length) - Math.round((i * H) / colors.length), c));
const vStripes = (...colors: string[]) => colors.map((c, i) => R(Math.round((i * W) / colors.length), 0, Math.round(((i + 1) * W) / colors.length) - Math.round((i * W) / colors.length), H, c));
const nordic = (bg: string, cross: string, inner?: string): Px[] => [
  R(0, 0, W, H, bg),
  R(5, 0, 3, H, cross),
  R(0, 4, W, 3, cross),
  ...(inner ? [R(6, 0, 1, H, inner), R(0, 5, W, 1, inner)] : []),
];
const dots = (pts: [number, number][], c: string) => pts.map(([x, y]) => R(x, y, 1, 1, c));

/** A small Union Jack inside a w × h box at (ox, oy). */
function unionJack(ox: number, oy: number, w: number, h: number): Px[] {
  const out: Px[] = [R(ox, oy, w, h, '#012169')];
  const diag = (x: number) => Math.round((x * (h - 1)) / (w - 1));
  for (let x = 0; x < w; x++) {
    const y = diag(x);
    for (const yy of [y, y + 1]) {
      if (yy < 0 || yy >= h) continue;
      out.push(R(ox + x, oy + yy, 1, 1, '#fff'), R(ox + x, oy + h - 1 - yy, 1, 1, '#fff'));
    }
  }
  const cx = ox + Math.floor(w / 2) - 1;
  const cy = oy + Math.floor(h / 2) - 1;
  out.push(R(cx - 1, oy, 4, h, '#fff'), R(ox, cy - 1, w, 4, '#fff'), R(cx, oy, 2, h, '#c8102e'), R(ox, cy, w, 2, '#c8102e'));
  return out;
}

const FLAGS: Record<string, Px[]> = {
  DE: hStripes('#000', '#dd0000', '#ffce00'),
  AT: hStripes('#ed2939', '#fff', '#ed2939'),
  NL: hStripes('#ae1c28', '#fff', '#21468b'),
  EE: hStripes('#0072ce', '#000', '#fff'),
  FR: vStripes('#0055a4', '#fff', '#ef4135'),
  BE: vStripes('#000', '#fdda24', '#ef3340'),
  IT: vStripes('#009246', '#fff', '#ce2b37'),
  IE: vStripes('#169b62', '#fff', '#ff883e'),
  DK: nordic('#c8102e', '#fff'),
  SE: nordic('#006aa7', '#fecc00'),
  FI: nordic('#fff', '#002f6c'),
  ES: [R(0, 0, W, H, '#aa151b'), R(0, 3, W, 6, '#f1bf00'), R(4, 4, 2, 4, '#aa151b'), R(4, 5, 2, 1, '#f1bf00')],
  PT: [R(0, 0, 7, H, '#046a38'), R(7, 0, 11, H, '#da291c'), R(5, 3, 5, 6, '#ffe900'), R(6, 4, 3, 4, '#da291c'), R(7, 5, 1, 2, '#fff')],
  JP: [R(0, 0, W, H, '#fff'), R(7, 3, 4, 6, '#bc002d'), R(6, 4, 6, 4, '#bc002d')],
  CA: [
    R(0, 0, W, H, '#fff'), R(0, 0, 4, H, '#d80621'), R(14, 0, 4, H, '#d80621'),
    R(8, 2, 2, 8, '#d80621'), R(6, 4, 6, 3, '#d80621'), R(5, 3, 1, 2, '#d80621'), R(12, 3, 1, 2, '#d80621'), R(7, 7, 4, 1, '#d80621'),
  ],
  US: [
    ...Array.from({ length: 6 }, (_, i) => R(0, i * 2, W, 1, '#b22234')),
    ...Array.from({ length: 6 }, (_, i) => R(0, i * 2 + 1, W, 1, '#fff')),
    R(0, 0, 8, 6, '#3c3b6e'),
    ...dots([[1, 1], [3, 1], [5, 1], [2, 3], [4, 3], [6, 3], [1, 5], [3, 5], [5, 5]].map(([x, y]) => [x, y - (y === 5 ? 1 : 0)] as [number, number]), '#fff'),
  ],
  GB: unionJack(0, 0, W, H),
  AU: [
    R(0, 0, W, H, '#012169'),
    ...unionJack(0, 0, 9, 6),
    ...dots([[4, 9], [14, 2], [12, 5], [16, 5], [14, 9], [15, 7]], '#fff'),
  ],
  SG: [R(0, 0, W, 6, '#ee2536'), R(0, 6, W, 6, '#fff'), R(2, 1, 1, 4, '#fff'), R(3, 0, 2, 1, '#fff'), R(3, 5, 2, 1, '#fff'), ...dots([[7, 1], [9, 2], [6, 3], [8, 4], [10, 4]], '#fff')],
  AE: [R(0, 0, W, 4, '#00732f'), R(0, 4, W, 4, '#fff'), R(0, 8, W, 4, '#000'), R(0, 0, 5, H, '#ff0000')],
  CY: [
    R(0, 0, W, H, '#fff'),
    R(5, 3, 8, 2, '#d57800'), R(4, 4, 3, 2, '#d57800'), R(11, 2, 3, 2, '#d57800'), R(14, 1, 2, 1, '#d57800'),
    R(6, 8, 2, 1, '#4e5b31'), R(8, 9, 2, 1, '#4e5b31'), R(10, 8, 2, 1, '#4e5b31'),
  ],
};

/** Inline SVG flag. `size` is the drawn width in px (height follows 3:2). Empty string for unknown codes. */
export function flag(code: string, size = 36, label = ''): string {
  const px = FLAGS[code];
  if (!px) return '';
  const h = Math.round((size * H) / W);
  return `<svg class="flag" width="${size}" height="${h}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${px
    .map(([x, y, w, hh, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${c}"/>`)
    .join('')}<rect x="0.25" y="0.25" width="${W - 0.5}" height="${H - 0.5}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".5"/></svg>`;
}

export const hasFlag = (code: string) => code in FLAGS;
