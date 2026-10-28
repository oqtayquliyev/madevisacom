import { describe, expect, it } from 'vitest';
import { jobReality, scanScam } from '@/lib/jobReality';

const now = Date.parse('2026-10-28T12:00:00Z');
const hAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

describe('scam shield', () => {
  it('flags fees, guarantees, chat-only contact and passport requests', () => {
    expect(scanScam('A registration fee of $200 is required before the interview.').map((f) => f.id)).toEqual(['fee']);
    expect(scanScam('Guaranteed visa and no interview needed!').map((f) => f.id)).toContain('guarantee');
    expect(scanScam('Apply via WhatsApp to +44…').map((f) => f.id)).toEqual(['chat']);
    expect(scanScam('Please send your passport copy to start.').map((f) => f.id)).toEqual(['documents']);
  });
  it('does not flag fees the employer pays', () => {
    expect(scanScam('Visa fees are paid by the company. Relocation support included.')).toEqual([]);
  });
  it('flags a free email address only when the job is not straight from the careers page', () => {
    expect(scanScam('Hello', 'jobs.hr2024@gmail.com', 'company_submitted').map((f) => f.id)).toEqual(['freemail']);
    expect(scanScam('Hello', 'jobs.hr2024@gmail.com', 'company_careers')).toEqual([]);
  });
});

describe('job reality score', () => {
  it('is verified live when checked on the careers page today', () => {
    const r = jobReality({ sourceType: 'company_careers', lastSeenAt: hAgo(3), postedAt: hAgo(30), company: 'Formue', text: 'A normal job ad.', now });
    expect(r.level).toBe('verified');
    expect(r.reasons[0]).toBe('Checked live on Formue’s careers page 3 hours ago');
  });
  it('drops when not re-checked for days', () => {
    expect(jobReality({ sourceType: 'company_careers', lastSeenAt: hAgo(24 * 9), postedAt: hAgo(24 * 90), now }).level).toBe('careful');
  });
  it('says be careful when the ad asks for money, whatever the source', () => {
    expect(jobReality({ sourceType: 'company_careers', lastSeenAt: hAgo(1), text: 'Pay a deposit to reserve your place.', now }).level).toBe('careful');
  });
  it('is closed when taken down', () => {
    expect(jobReality({ closed: true, now }).level).toBe('closed');
  });
});
