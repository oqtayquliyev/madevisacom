// The person's email, read from their CV text (used to pre-fill the email field on /cv-match).

/** The first email address written in the CV (the person's own, almost always), or ''. */
export function emailFromCv(text: string): string {
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi)) {
    const e = m[0].toLowerCase().replace(/^[._-]+|[._-]+$/g, '');
    if (!/@(example|test|domain|email)\./.test(e)) return e;
  }
  return '';
}
