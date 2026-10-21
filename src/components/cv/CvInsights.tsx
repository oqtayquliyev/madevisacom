import type { StoredCv } from '@/lib/cv/store';

// Who the CV says you are: the name at the top of it, and its photo (or initials).

const NAME_LINE = /^[A-ZÀ-ÝƏÜÖĞÇŞİ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÝƏÜÖĞÇŞİ][\p{L}'’.-]+){1,3}$/u;

/** The name at the top of a CV: the first short line of capitalised words (no digits, no @). */
export function nameFromCv(text: string): string | null {
  for (const raw of text.split(/\n/).slice(0, 8)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line || line.length > 40 || /[\d@|/:]/.test(line)) continue;
    // Headings and taglines that look like names: "Open To Work", "Curriculum Vitae", "Product Designer".
    if (/\b(open|work|curriculum|vitae|resume|résumé|cv|profile|contact|summary|about|personal|designer|developer|engineer|manager|consultant|specialist|analyst|portfolio|page)\b/i.test(line)) continue;
    const t = line.toLowerCase() === line || line.toUpperCase() === line ? line.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()) : line;
    if (NAME_LINE.test(t)) return t;
  }
  return null;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** The photo from the CV in a circle — or the initials when it has none. */
export function CvAvatar({ cv, name, size = 56, className = '' }: { cv: StoredCv; name?: string | null; size?: number; className?: string }) {
  const who = (name?.trim() || nameFromCv(cv.text) || 'CV').replace(/\s+/g, ' ');
  if (cv.photo) {
    return <img src={cv.photo} alt="" width={size} height={size} className={`shrink-0 rounded-full object-cover ring-2 ring-brand-100 ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700 ring-2 ring-brand-100 ${className}`} style={{ width: size, height: size, fontSize: Math.round(size / 3.1) }}>
      {initials(who)}
    </span>
  );
}
