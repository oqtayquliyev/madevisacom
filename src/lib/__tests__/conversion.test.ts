import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: () => Promise.resolve({ data: null, error: null }), functions: { invoke: () => Promise.resolve({ data: null }) }, auth: {} } }));

import { looksEnglish, maskEmail, quotesFor } from '@/lib/conversion';
import { monthlyUsd, moveMath } from '@/lib/moveMath';
import { replyOdds } from '@/lib/replyOdds';
import { isSaleMessage } from '@/lib/gumroadOverlay';
import { withOfferCode } from '@/lib/gumroad';
import { decodeText, parseIndRegister, parseUscisHub, pickUscisCsv } from '../../../supabase/functions/_shared/sponsorParsers';
import { moodFor, thumbLines } from '../../../supabase/functions/auto-pipeline/programCatalog';

describe('paywall quotes', () => {
  it('tells English from Bahasa', () => {
    expect(looksEnglish('I finally got my visa and the job in Berlin')).toBe(true);
    expect(looksEnglish('Saya tidak mau cuma bermimpi kerja di Eropa. Saya ingin mulai mencari peluang yang cocok.')).toBe(false);
  });
  it('puts the visitor’s own country first and drops other languages', () => {
    const q = (headline: string, code: string) => ({ headline, from: { code, name: code } });
    const all = [q('Saya tidak mau cuma bermimpi kerja di Eropa', 'ID'), q('I got three replies in a week', 'IN'), q('My first interview abroad', 'AZ')];
    expect(quotesFor(all, 'AZ').map((x) => x.from.code)).toEqual(['AZ', 'IN']);
    expect(quotesFor(all, 'ID').map((x) => x.from.code)).toEqual(['ID', 'IN', 'AZ']);
  });
});

describe('masking', () => {
  it('shows the shape of an email, not the email', () => {
    expect(maskEmail('uma.arun@formue.no')).toBe('u••••••@f•••••.no');
    expect(maskEmail('not an email')).toBeNull();
  });
});

describe('move math', () => {
  it('reads a yearly euro salary', () => {
    expect(monthlyUsd({ min: 50000, max: 70000, currency: 'EUR', period: 'year' })).toBe(5400);
  });
  it('compares with home', () => {
    const m = moveMath({ min: 60000, max: 60000, currency: 'EUR', period: 'year' }, 'DE', 'AZ')!;
    expect(m.left).toBeGreaterThan(1500);
    expect(m.delta).toBe(m.left - (450 - 350));
  });
  it('says nothing without a salary or for the same country', () => {
    expect(moveMath({ min: null, max: null, currency: null, period: null }, 'DE', 'AZ')).toBeNull();
    expect(moveMath({ min: 60000, max: 60000, currency: 'EUR', period: 'year' }, 'DE', 'DE')).toBeNull();
  });
});

describe('reply odds', () => {
  it('needs at least two signals', () => {
    expect(replyOdds({ ageDays: 1 })).toBeNull();
  });
  it('is high for a fresh job at a responsive company that matches', () => {
    expect(replyOdds({ responseRate: 60, ageDays: 1, match: 85 })?.level).toBe('high');
  });
  it('is low for an old job, no visa offered, weak match', () => {
    expect(replyOdds({ ageDays: 90, needsVisa: true, match: 20 })?.level).toBe('low');
  });
});

describe('checkout', () => {
  it('recognises Gumroad sale messages only from Gumroad', () => {
    expect(isSaleMessage('https://gumroad.com', { post_message_name: 'sale' })).toBe(true);
    expect(isSaleMessage('https://app.gumroad.com', '{"type":"purchase_completed"}')).toBe(true);
    expect(isSaleMessage('https://evil.example', { post_message_name: 'sale' })).toBe(false);
    expect(isSaleMessage('https://gumroad.com', { post_message_name: 'resize' })).toBe(false);
  });
  it('adds an offer code to the product path', () => {
    expect(withOfferCode('https://madevisa.gumroad.com/l/membership?wanted=true', 'FIRST099')).toBe('https://madevisa.gumroad.com/l/membership/FIRST099?wanted=true');
    expect(withOfferCode('https://madevisa.gumroad.com/l/membership?wanted=true', null)).toBe('https://madevisa.gumroad.com/l/membership?wanted=true');
    expect(withOfferCode('https://madevisa.gumroad.com/l/membership', 'bad code!')).toBe('https://madevisa.gumroad.com/l/membership');
  });
});

describe('sponsor registers', () => {
  it('reads the IND table', () => {
    const html = `<table><tr><th>Organisation</th><th>KvK</th></tr><tr><td>ASML Netherlands B.V.</td><td>17085815</td></tr><tr><td><a href="#">Booking.com B.V.</a></td><td>31047344</td></tr><tr><td>Booking.com B.V.</td><td>31047344</td></tr></table>`;
    const rows = parseIndRegister(html, 'Highly skilled migrants');
    expect(rows.map((r) => r.n)).toEqual(['ASML Netherlands B.V.', 'Booking.com B.V.']);
    expect(rows[0].d).toEqual({ category: 'Highly skilled migrants', kvk: '17085815' });
  });
  it('picks the newest USCIS file', () => {
    const html = '<a href="/sites/default/files/document/data/h1b_datahubexport-2022.csv">22</a><a href="/sites/default/files/document/data/h1b_datahubexport-2024.csv">24</a>';
    expect(pickUscisCsv(html)).toBe('https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-2024.csv');
  });
  it('reads the new USCIS columns (tab-separated, UTF-16)', () => {
    const text = 'Line by line\tFiscal Year   \tEmployer (Petitioner) Name\tPetitioner City\tNew Employment Approval\tNew Employment Denial\tContinuation Approval\n1\t2024\tACME CORP\tAUSTIN\t12\t3\t30\n2\t2024\tNOBODY LLC\tX\t0\t2\t0\n';
    const bytes = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...text].map((ch) => ch.charCodeAt(0))).buffer)]);
    const r = parseUscisHub(decodeText(bytes));
    expect(r.error).toBeUndefined();
    expect(r.year).toBe(2024);
    expect(r.rows).toEqual([{ n: 'ACME CORP', c: 'AUSTIN', d: { approvals: 42, new_approvals: 12, year: 2024 } }]);
  });
  it('reads the old USCIS columns (comma-separated)', () => {
    const r = parseUscisHub('Fiscal Year,Employer,Initial Approval,Initial Denial,Continuing Approval,Continuing Denial,City\n2023,"BIG, INC",5,1,7,0,NYC\n');
    expect(r.rows[0]).toEqual({ n: 'BIG, INC', c: 'NYC', d: { approvals: 12, new_approvals: 5, year: 2023 } });
  });
});

describe('reel covers and music', () => {
  it('turns a headline into 2–4 short cover lines, the number in yellow', () => {
    expect(thumbLines('Here are $1,900 a month left in Germany')).toBe('!$1,900 a month~left in~Germany');
    expect(thumbLines('Spotify is hiring: Backend Engineer')).toBe('Spotify is~hiring:~Backend~!Engineer');
  });
  it('picks a mood per kind of post', () => {
    expect(moodFor('jobs', false)).toBe('energetic');
    expect(moodFor('proof', false)).toBe('emotional');
    expect(moodFor('visa', false)).toBe('chill');
  });
});

import { headlineForJob } from '@/lib/lastSearch';
describe('popup headline follows the job', () => {
  const last = { q: 'graphic designer', n: 1858, at: Date.now() };
  it('uses the last search only when the job fits it', () => {
    expect(headlineForJob({ title: 'Senior Graphic Designer' }, { label: 'Design', n: 900 }, last, 6000)).toBe('1,857 more graphic designer jobs');
  });
  it('otherwise talks about the job’s own field', () => {
    expect(headlineForJob({ title: '2027 Internship - Frontend Engineer (UI)' }, { label: 'Engineering', n: 2432 }, last, 6000)).toBe('2,431 more engineering jobs');
  });
  it('falls back to every live job', () => {
    expect(headlineForJob({ title: 'Something' }, null, last, 5979)).toBe('5,978 more jobs');
  });
});

import { maskEmailShort } from '@/lib/conversion';
describe('recruiter email for non-members', () => {
  it('keeps two letters and the domain', () => {
    expect(maskEmailShort('asif.k@mail.com')).toBe('as***@mail.com');
    expect(maskEmailShort('a@x.io')).toBe('a***@x.io');
    expect(maskEmailShort('nope')).toBeNull();
  });
});

import { coveredPeriods } from '@/components/pro/Paywall';
describe('the 3 months on the membership card', () => {
  it('runs from the day of payment', () => {
    const { ends, label } = coveredPeriods(new Date(2026, 9, 29));
    expect(ends.map(label)).toEqual(['29 Nov', '29 Dec', '29 Jan']);
    expect(ends[2].getFullYear()).toBe(2027);
  });
  it('keeps to the last day of short months', () => {
    expect(coveredPeriods(new Date(2026, 10, 30)).ends.map((d) => d.getDate())).toEqual([30, 30, 28]);
  });
});
