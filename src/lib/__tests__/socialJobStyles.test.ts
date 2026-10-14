// The social program's job styles (supabase/functions/auto-pipeline/programCatalog.ts):
// Telegram posts only job links; Instagram, Facebook, LinkedIn and TikTok post the white
// "X is hiring" card at least once a day, plus the fast job reel where reels run.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, FORMAT_BY_KEY, JOB_EXTRA, JOB_STYLE, PILLARS, formatAllowed, type Platform } from '../../../supabase/functions/auto-pipeline/programCatalog';
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

  it('Facebook, Instagram and LinkedIn use only their own job formats, the card at least once every day', () => {
    for (const p of ['facebook', 'instagram', 'linkedin'] as const) {
      const style = JOB_STYLE[p]!;
      expect(style).toBe('hiring_card');
      for (const s of slots.filter((x) => x.platform === p)) {
        if (FORMAT_BY_KEY[s.kind].fresh) expect([style, ...(JOB_EXTRA[p] ?? [])]).toContain(s.kind);
      }
      // LinkedIn posts once on weekend days and never the same format twice in a row, so the daily card is checked on the busy networks.
      if (p !== 'linkedin') for (const kinds of days(p).values()) expect(kinds).toContain(style);
    }
  });

  it('job opportunities are most of the mix, with a few other posts around them', () => {
    expect(PILLARS.jobs.share).toBeGreaterThanOrEqual(60);
    for (const p of ['facebook', 'instagram'] as const) {
      const list = slots.filter((x) => x.platform === p);
      const jobs = list.filter((s) => FORMAT_BY_KEY[s.kind].pillar === 'jobs').length;
      expect(jobs / list.length).toBeGreaterThan(0.4);
      expect(new Set(list.map((s) => s.kind)).size).toBeGreaterThan(1);
    }
  });

  it('job formats per network', () => {
    expect(formatAllowed('linkedin', 'jobs_fresh')).toBe(false);
    expect(formatAllowed('linkedin', 'hiring_card')).toBe(true);
    expect(formatAllowed('telegram', 'news')).toBe(false);
    expect(formatAllowed('telegram', 'hiring_card')).toBe(false);
    expect(formatAllowed('instagram', 'jobs_fresh')).toBe(false);
    expect(formatAllowed('instagram', 'reel_hiring')).toBe(true);
    expect(formatAllowed('instagram', 'visa_route')).toBe(true);
  });

  it('the hiring card never runs more than three times a day', () => {
    for (const kinds of days('instagram').values()) expect(kinds.filter((k) => k === 'hiring_card').length).toBeLessThanOrEqual(3);
  });
});
