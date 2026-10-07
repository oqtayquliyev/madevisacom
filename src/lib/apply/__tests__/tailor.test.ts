import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseCv } from '@/lib/cv/cvProfile';
import { parseJob } from '@/lib/cv/jobProfile';
import { bestLines, coverLetter, letterReason } from '@/lib/apply/coverLetter';
import { docxBytes, toBase64 } from '@/lib/apply/docx';
import { tailorCv, tailoredName, verifyTailored } from '@/lib/apply/tailor';
import { AD_HTML, CV_TEXT, cv, job, profile } from './fixtures';

const t = tailorCv(CV_TEXT, cv, job);
const bulletsOf = (company: string) => {
  const at = t.lines.findIndex((l) => l.text.includes(company));
  const out: string[] = [];
  for (let i = at + 1; i < t.lines.length && t.lines[i].kind === 'bullet'; i += 1) out.push(t.lines[i].text);
  return out;
};

describe('role specific CV', () => {
  it('puts the skills the ad asks for first', () => {
    const skills = t.lines.find((l) => l.text.startsWith('Tools:'))!.text;
    // The ad asks for Tableau, SQL and Python; Excel, Power BI and Git were listed before or between them.
    expect(skills).toBe('Tools: Tableau, SQL, Python, Excel, Power BI, Git');
  });

  it('puts the most relevant results first inside each role — and keeps them in their role', () => {
    const caspian = bulletsOf('Caspian Retail Group');
    expect(caspian[0]).toMatch(/Tableau dashboards/);
    expect(caspian).toHaveLength(4);
    expect(caspian[caspian.length - 1]).toMatch(/stock meeting|onboarding guide/);
    const silk = bulletsOf('Silk Way Logistics');
    expect(silk).toHaveLength(3);
    expect(silk[silk.length - 1]).toMatch(/ad-hoc requests/);
    // Nothing moved from one employer to another.
    expect(caspian.join(' ')).not.toMatch(/customs|shipping volumes/);
  });

  it('adds one headline, made only of the CV’s own title, years and skills', () => {
    expect(t.headline).toBe('Senior Data Analyst · 8 years of experience · SQL, Python, Tableau');
    expect(t.lines.filter((l) => l.kind === 'headline')).toHaveLength(1);
    // dbt is required by the ad and not in the CV: it must not appear anywhere.
    expect(t.text).not.toMatch(/dbt/i);
  });

  it('says what it changed', () => {
    expect(t.changes).toEqual([
      'Added a one-line headline from your own title, years and skills.',
      'Moved 3 skills the ad asks for to the front of your skills.',
      'Put the results closest to this ad first in 2 roles.',
    ]);
  });

  it('adds nothing and drops nothing: the same words, the same number of times', () => {
    expect(verifyTailored(CV_TEXT, cv, t)).toEqual({ ok: true });
    for (const fact of ['Caspian Retail Group', 'Silk Way Logistics', 'Mar 2021 – Present', 'Jun 2018 – Feb 2021', 'BSc in Statistics', 'Baku State University', '35%', '40 managers', '4% of actuals', 'English (C1)']) expect(t.text).toContain(fact);
  });

  it('the check catches an invented skill, employer, date or headline', () => {
    const withSkill = { ...t, lines: t.lines.map((l) => (l.text.startsWith('Tools:') ? { ...l, text: `${l.text}, dbt` } : l)) };
    expect(verifyTailored(CV_TEXT, cv, withSkill).ok).toBe(false);
    const withEmployer = { ...t, lines: [...t.lines, { kind: 'text' as const, text: 'Lead Analyst | Invented GmbH | 2015 – 2018' }] };
    expect(verifyTailored(CV_TEXT, cv, withEmployer).ok).toBe(false);
    const withDate = { ...t, lines: t.lines.map((l) => ({ ...l, text: l.text.replace('Jun 2018', 'Jun 2016') })) };
    expect(verifyTailored(CV_TEXT, cv, withDate).ok).toBe(false);
    expect(verifyTailored(CV_TEXT, cv, { ...t, headline: 'Head of Data · 8 years of experience · SQL' }).ok).toBe(false);
    expect(verifyTailored(CV_TEXT, cv, { ...t, headline: 'Senior Data Analyst · 12 years of experience · SQL' }).ok).toBe(false);
    expect(verifyTailored(CV_TEXT, cv, { ...t, headline: 'Senior Data Analyst · 8 years of experience · SQL, dbt' }).ok).toBe(false);
    const dropped = { ...t, lines: t.lines.filter((l) => !l.text.includes('onboarding guide')) };
    expect(verifyTailored(CV_TEXT, cv, dropped).ok).toBe(false);
  });

  it('leaves a CV alone when the ad shares nothing with it', () => {
    const other = parseJob({ title: 'Pastry Chef', description: '<p>We need a pastry chef for our hotel kitchen. Experience with viennoiserie and chocolate work.</p>' });
    const u = tailorCv(CV_TEXT, cv, other);
    expect(u.headline).toBeNull();
    expect(u.changes).toEqual([]);
    expect(verifyTailored(CV_TEXT, cv, u)).toEqual({ ok: true });
  });

  it('holds for CVs with other layouts', () => {
    const plain = `Tom Okafor\ntom@example.com\n\nEXPERIENCE\nSoftware Engineer, Acme Ltd, 2019 - 2023\n- Built billing services in Java and Kotlin\n- Deployed with Docker on AWS\n\nSKILLS\nJava; Kotlin; Docker; AWS; PostgreSQL\n\nEDUCATION\nBEng Computer Science, 2019`;
    const p = parseCv(plain);
    const j = parseJob({ title: 'Backend Engineer', description: '<h2>Requirements</h2><ul><li>Docker and AWS</li><li>PostgreSQL</li><li>Go</li></ul>' });
    const r = tailorCv(plain, p, j);
    expect(verifyTailored(plain, p, r)).toEqual({ ok: true });
    expect(r.text).toContain('Docker; AWS; PostgreSQL; Java; Kotlin');
    expect(r.text).not.toMatch(/\bGo\b/);
  });

  it('names the file after the person and the role', () => {
    expect(tailoredName('Oqtay Quliyev', 'Senior Product Designer (m/f/d) – Berlin')).toBe('Oqtay Product Designer CV');
    expect(tailoredName(null, 'Data Analyst')).toBe('Data Analyst CV');
  });

  it('makes a Word file that holds exactly the tailored text', () => {
    const bytes = docxBytes(t.lines, 'Leyla Data Analyst CV');
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/document.xml']);
    const xml = strFromU8(files['word/document.xml']);
    const texts = [...xml.matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    expect(texts).toHaveLength(t.lines.length);
    expect(texts[0]).toBe('Leyla Mammadova');
    expect(xml).toContain('Senior Data Analyst | Caspian Retail Group | Mar 2021 – Present');
    // Well-formed: every opened paragraph and run is closed.
    expect(xml.match(/<w:p>/g)!.length).toBe(xml.match(/<\/w:p>/g)!.length);
    expect(xml.match(/<w:r>/g)!.length).toBe(xml.match(/<\/w:r>/g)!.length);
    expect(toBase64(bytes).length).toBeGreaterThan(1000);
  });

  it('escapes text that would break the file', () => {
    const xml = strFromU8(unzipSync(docxBytes([{ kind: 'text', text: 'R&D <lead> \u0007' }], 'x'))['word/document.xml']);
    expect(xml).toContain('R&amp;D &lt;lead&gt; ');
  });
});

describe('cover letter', () => {
  const base = { cvText: CV_TEXT, cv, job, jobTitle: 'Senior Data Analyst (m/f/d)', company: 'Hansa Freight', profile: profile(), sponsorship: 'likely' as const, jobCountry: 'Germany' };

  it('is written when the ad asks, for senior roles and for the strongest matches — not otherwise', () => {
    expect(letterReason(AD_HTML, job, 'backup')).toBe('asked');
    expect(letterReason('<p>No letter needed.</p>', { seniority: 4 }, 'backup')).toBe('senior');
    expect(letterReason('<p>Apply now.</p>', { seniority: 2 }, 'strong')).toBe('priority');
    expect(letterReason('<p>Apply now.</p>', { seniority: 2 }, 'good')).toBeNull();
  });

  it('quotes the CV’s own closest lines, numbers first', () => {
    const lines = bestLines(CV_TEXT, job);
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(CV_TEXT).toContain(l);
    expect(lines.join(' ')).toMatch(/Tableau|Python/);
  });

  it('says only what the CV and the saved answers say', () => {
    const letter = coverLetter(base)!;
    expect(letter).toContain('Dear Hansa Freight hiring team,');
    expect(letter).toContain('I am applying for the Senior Data Analyst role.');
    expect(letter).toContain('My most recent role is Senior Data Analyst, and my CV shows 8 years of work.');
    expect(letter).toContain('Your ad asks for SQL, Python and Tableau — these are on my CV.');
    expect(letter).toContain('Leyla Mammadova');
    // Not in the CV, not saved: not in the letter.
    expect(letter).not.toMatch(/dbt/i);
    expect(letter).not.toMatch(/sponsorship|relocate|notice/i);
    expect(letter).not.toMatch(/passionate|excited|perfect fit|guarantee/i);
  });

  it('mentions sponsorship, relocation and notice only from saved answers', () => {
    const p = profile({
      sponsorship: { value: 'Yes', askEachTime: false, source: 'you' },
      relocation: { value: 'Yes', askEachTime: false, source: 'you' },
      notice_period: { value: '1 month', askEachTime: false, source: 'you' },
    });
    const letter = coverLetter({ ...base, profile: p, sponsorship: 'not_indicated' })!;
    expect(letter).toContain('I would need visa sponsorship to work in Germany.');
    expect(letter).toContain('I am willing to relocate.');
    expect(letter).toContain('My notice period: 1 month.');
    // A job that needs no visa: sponsorship isn't raised.
    expect(coverLetter({ ...base, profile: p, sponsorship: 'not_needed' })).not.toMatch(/sponsorship|relocate/);
    // "Ask me each time" keeps it out of the letter too.
    const ask = profile({ sponsorship: { value: 'Yes', askEachTime: true, source: 'you' } });
    expect(coverLetter({ ...base, profile: ask, sponsorship: 'not_indicated' })).not.toMatch(/sponsorship/);
  });

  it('is not written at all when there is nothing true and specific to say', () => {
    const other = parseJob({ title: 'Pastry Chef', description: '<p>Viennoiserie and chocolate work.</p>' });
    expect(coverLetter({ ...base, job: other })).toBeNull();
    expect(coverLetter({ ...base, profile: { answers: {}, custom: {} } })).toBeNull();
  });
});
