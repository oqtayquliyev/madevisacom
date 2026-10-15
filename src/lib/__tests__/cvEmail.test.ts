import { describe, expect, it } from 'vitest';
import { emailFromCv } from '../cv/cvEmail.ts';

describe('emailFromCv', () => {
  it('finds the address in the contact line', () => {
    expect(emailFromCv('Anna Lee\nProduct Designer · Berlin · Anna.Lee@Gmail.com · +49 151 000')).toBe('anna.lee@gmail.com');
  });
  it('skips placeholder addresses and takes the next real one', () => {
    expect(emailFromCv('Write to name@example.com\nContact: leyla.m@outlook.de')).toBe('leyla.m@outlook.de');
  });
  it('returns nothing when the CV has no email', () => {
    expect(emailFromCv('Senior accountant, 8 years, IFRS')).toBe('');
  });
  it('drops punctuation around the address', () => {
    expect(emailFromCv('Email: (jo.doe@company.co.uk).')).toBe('jo.doe@company.co.uk');
  });
});
