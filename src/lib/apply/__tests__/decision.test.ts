import { describe, expect, it } from 'vitest';
import { assess, normTitle, plan, qualityOf, sponsorshipFor, timeSaved, twinsIn } from '@/lib/apply/decision';
import { NOW, daysAgo, facts, prefs } from './fixtures';

const run = (over = {}, p = {}, extra = {}) => assess({ job: facts(over), place: 'abroad', prefs: prefs(p), now: NOW, ...extra });

describe('application scoring (quality)', () => {
  it('is strong for a high match with sponsorship and nothing missing', () => {
    const q = qualityOf(facts(), 'likely', prefs(), 1, 1);
    expect(q.band).toBe('strong');
    expect(q.score).toBeGreaterThanOrEqual(80);
    expect(q.unknown).toEqual(['location']);
  });

  it('drops when required skills are missing and the role is more senior', () => {
    const base = qualityOf(facts(), 'likely', prefs(), 1, 1).score!;
    const f = facts();
    const worse = qualityOf({ ...f, q: { ...f.q!, must: 4, gap: 2 } }, 'likely', prefs(), 1, 1).score!;
    expect(worse).toBeLessThan(base);
  });

  it('counts sponsorship that is not compatible as zero, not as unknown', () => {
    const q = qualityOf(facts(), 'not_compatible', prefs(), 1, 1);
    expect(q.parts.sponsorship).toBe(0);
    expect(q.unknown).not.toContain('sponsorship');
  });

  it('marks what it cannot judge as unknown instead of guessing', () => {
    const q = qualityOf(facts({ q: null }), 'unclear', prefs(), null, null);
    expect(q.unknown).toEqual(expect.arrayContaining(['experience', 'keywords', 'required', 'seniority', 'sponsorship', 'completeness', 'confidence']));
    // Only the match score itself is known: too little to put a number on.
    expect(q.score).toBeNull();
    expect(q.band).toBe('unknown');
  });

  it('the same input always gives the same score', () => {
    expect(qualityOf(facts(), 'likely', prefs(), 1, 0.5)).toEqual(qualityOf(facts(), 'likely', prefs(), 1, 0.5));
  });
});

describe('auto apply selection', () => {
  it('87% → auto apply, 74% → review, 52% → skip (with the default 75% minimum)', () => {
    expect(run({ score: 87 }).decision).toBe('auto');
    expect(run({ score: 74 }).decision).toBe('review');
    expect(run({ score: 52 }).decision).toBe('skip');
  });

  it('follows the person’s own minimum', () => {
    expect(run({ score: 74 }, { minScore: 70 }).decision).toBe('auto');
    expect(run({ score: 82 }, { minScore: 90 }).decision).toBe('review');
    expect(run({ score: 79 }, { minScore: 90 }).decision).toBe('skip');
  });

  it('never applies below the match floor, whatever the minimum', () => {
    expect(run({ score: 44 }, { minScore: 60 }).decision).toBe('skip');
  });

  it('sends a strong score to review when something needs a look', () => {
    const f = facts();
    expect(run({ q: { ...f.q!, must: 3 } }).codes).toContain('missing_required');
    expect(run({ q: { ...f.q!, must: 3 } }).decision).toBe('review');
    expect(run({ q: { ...f.q!, gap: 2 } }).decision).toBe('review');
    expect(run({ q: { ...f.q!, capped: true } }).decision).toBe('review');
    expect(run({ postedAt: daysAgo(90) }).codes).toEqual(['old_ad']);
  });

  it('skips an ad that says it does not sponsor, when sponsorship is needed', () => {
    const a = run({ visa: 'not_offered' });
    expect(a.decision).toBe('skip');
    expect(a.codes).toContain('no_sponsorship');
    // …but not for someone who doesn’t need it.
    expect(assess({ job: facts({ visa: 'not_offered' }), place: 'free', prefs: prefs(), now: NOW }).decision).toBe('auto');
  });

  it('respects roles, countries, work arrangement, relocation and the salary floor', () => {
    expect(run({}, { roles: ['Software Engineer'] }).codes).toContain('outside_roles');
    expect(run({}, { countries: ['NL'] }).codes).toContain('outside_countries');
    expect(run({ remote: true }, { countries: ['NL'] }).decision).toBe('auto');
    expect(run({}, { arrangements: ['remote'] }).codes).toContain('arrangement');
    expect(run({}, { relocate: false }).codes).toContain('no_relocation');
    expect(run({ payUsdYear: 40_000 }, {}, { salaryFloorUsd: 60_000 }).codes).toContain('below_salary');
  });

  it('does not hold unknown facts against a job', () => {
    // No pay on the ad, no arrangement, no category: the preferences can't be checked, so they don't exclude it.
    const a = run({ payUsdYear: null, arrangement: null, role: null }, { roles: ['Data Analyst'], arrangements: ['remote'] }, { salaryFloorUsd: 90_000 });
    expect(a.decision).toBe('auto');
  });

  it('puts a high match with sponsorship and a fresh ad first', () => {
    const best = run({ score: 84, visa: 'offered', postedAt: daysAgo(3) });
    const noWord = run({ score: 84, visa: null, postedAt: daysAgo(3) });
    const stale = run({ score: 84, visa: 'offered', postedAt: daysAgo(45) });
    expect(best.priority).toBe('strong');
    expect(noWord.priority).toBe('good');
    expect(stale.priority).toBe('good');
    expect(best.rank).toBeGreaterThan(noWord.rank);
    expect(best.rank).toBeGreaterThan(stale.rank);
    expect(run({ score: 66 }, { minScore: 60 }).priority).toBe('backup');
  });

  it('plans a list: counts, and the queue in priority order', () => {
    const jobs = [
      facts({ id: 'a', score: 78, visa: null }),
      facts({ id: 'b', score: 91 }),
      facts({ id: 'c', score: 70 }),
      facts({ id: 'd', score: 50 }),
      facts({ id: 'e', score: 83, visa: 'not_offered' }),
    ];
    const p = plan(jobs, (j) => ({ place: 'abroad', prefs: prefs(), now: NOW, server: { channel: j.id === 'b' ? 'madevisa' : 'employer_site' } }));
    expect(p.auto.map((x) => x.job.id)).toEqual(['b', 'a']);
    expect(p.review.map((x) => x.job.id)).toEqual(['c']);
    expect(p.skip.map((x) => x.job.id).sort()).toEqual(['d', 'e']);
    expect(p.bySend).toEqual({ madevisa: 1, you: 1 });
  });
});

describe('sponsorship', () => {
  it('only says what is known', () => {
    expect(sponsorshipFor(facts(), 'here', prefs()).state).toBe('not_needed');
    expect(sponsorshipFor(facts(), 'free', prefs()).state).toBe('not_needed');
    expect(sponsorshipFor(facts({ visa: 'offered' }), 'abroad', prefs()).state).toBe('likely');
    expect(sponsorshipFor(facts({ visa: null }), 'abroad', prefs()).state).toBe('not_indicated');
    expect(sponsorshipFor(facts({ visa: null }), 'abroad', prefs(), true).state).toBe('likely');
    expect(sponsorshipFor(facts({ visa: 'not_offered' }), 'abroad', prefs()).state).toBe('not_compatible');
    expect(sponsorshipFor(facts({ visa: null }), 'unknown', prefs()).state).toBe('unclear');
    expect(sponsorshipFor(facts({ visa: 'not_offered' }), 'abroad', prefs({ sponsorship: 'no_need' })).state).toBe('not_needed');
    // "I need sponsorship" overrides what the passport rules would say.
    expect(sponsorshipFor(facts({ visa: null }), 'free', prefs({ sponsorship: 'need' })).state).toBe('not_indicated');
  });
});

describe('duplicate protection (before anything is queued)', () => {
  it('skips a job already applied to, and the same role at the same company', () => {
    expect(run({}, {}, { server: { applied: true } }).codes).toEqual(['already_applied']);
    expect(run({}, {}, { server: { twin: true } }).codes).toEqual(['same_role']);
    expect(run({}, {}, { server: { applied: true } }).decision).toBe('skip');
    // A role listed twice in one result: one of the two is left out, and the reason says so (nothing was applied to yet).
    const twice = run({}, {}, { duplicateListing: true });
    expect(twice.codes).toEqual(['duplicate_listing']);
    expect(twice.reason).toBe('Hansa Freight lists this role more than once. MadeVisa applies to one of them.');
  });

  it('skips a job that has closed', () => {
    expect(run({}, {}, { server: { closed: true } }).codes).toEqual(['closed']);
  });

  it('finds duplicate listings in one result and keeps the best', () => {
    const twins = twinsIn([
      { id: '1', title: 'Senior Data Analyst (m/f/d)', company: 'Hansa', publisherId: 'p', score: 80 },
      { id: '2', title: 'Senior Data Analyst – Berlin', company: 'Hansa', publisherId: 'p', score: 84 },
      { id: '3', title: 'Senior Data Analyst', company: 'Other', publisherId: 'q', score: 70 },
    ]);
    expect([...twins]).toEqual(['1']);
    expect(normTitle('Senior Data Analyst (m/f/d) – Berlin')).toBe('senior data analyst');
  });
});

describe('time saved', () => {
  it('is an estimate with a range, and smaller for applications the person still sends', () => {
    expect(timeSaved(32, 0).text).toBe('about 8 to 10 hours');
    expect(timeSaved(0, 32).high).toBeLessThan(timeSaved(32, 0).low);
    expect(timeSaved(1, 0).text).toBe('about 15 minutes');
  });
});
