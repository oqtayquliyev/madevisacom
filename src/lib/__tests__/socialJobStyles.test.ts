// The social program's job styles (supabase/functions/auto-pipeline/programCatalog.ts):
// Telegram posts only job links, Facebook's job posts are the same link list and
// Instagram's are the hiring card — each at least once a day.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, FORMAT_BY_KEY, JOB_STYLE, formatAllowed, type Platform } from '../../../supabase/functions/auto-pipeline/programCatalog';
import { localTime, planRange } from '../../../supabase/functions/auto-pipeline/programSchedule';

const settings = { ...DEFAULT_SETTINGS, timezone: 'Asia/Baku', reels: true };
const now = Date.parse('2026-10-09T02:00:00Z');
const slots = planRange({ platforms: ['telegram', 'facebook', 'instagram', 'linkedin'], settings, now, days: 5 });
const days = (p: Platform) => {
  const m = new Map<string, string[]>();
  for (const s of slots.filter((x) => x.platform === p)) {
    const k = localTime(s.at, settings.timezone).key;
    m.set(k, [...(m.get(k) ?? []), s.kind]);
  }
  return m;
};

describe('job styles per network', () => {
  it('Telegram plans nothing but job links, several a day', () => {
    const tg = slots.filter((s) => s.platform === 'telegram');
    expect(tg.length).toBeGreaterThan(10);
    expect(new Set(tg.map((s) => s.kind))).toEqual(new Set(['jobs_links']));
    for (const kinds of days('telegram').values()) expect(kinds.length).toBeGreaterThanOrEqual(2);
  });

  it('Facebook and Instagram use only their own job format, at least once every day', () => {
    for (const p of ['facebook', 'instagram'] as const) {
      const style = JOB_STYLE[p]!;
      for (const s of slots.filter((x) => x.platform === p)) {
        if (FORMAT_BY_KEY[s.kind].fresh) expect(s.kind).toBe(style);
      }
      for (const kinds of days(p).values()) expect(kinds).toContain(style);
    }
  });

  it('Facebook and Instagram keep the rest of their mix', () => {
    for (const p of ['facebook', 'instagram'] as const) {
      const kinds = new Set(slots.filter((x) => x.platform === p).map((s) => s.kind));
      expect(kinds.size).toBeGreaterThan(3);
    }
  });

  it('other networks are unchanged', () => {
    expect(formatAllowed('linkedin', 'jobs_fresh')).toBe(true);
    expect(formatAllowed('telegram', 'news')).toBe(false);
    expect(formatAllowed('instagram', 'jobs_fresh')).toBe(false);
    expect(formatAllowed('instagram', 'visa_route')).toBe(true);
  });

  it('the hiring card never runs more than twice a day', () => {
    for (const kinds of days('instagram').values()) expect(kinds.filter((k) => k === 'hiring_card').length).toBeLessThanOrEqual(2);
  });
});
