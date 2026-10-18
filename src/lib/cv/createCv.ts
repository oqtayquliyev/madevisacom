// "I don't have a CV": a simple CV made only from the person's own answers (name, field, years, skills),
// plus the close job titles they kept, as roles they are open to (not as past jobs).
// Enough for matching; they can replace it with their real CV at any time.

/** A simple, honest CV from the person's own answers — enough for matching; they can replace it any time. */
export function cvFromAnswers(a: { name: string; field: string; years: number; skills: string; student: boolean; related?: string[] }): string {
  const related = (a.related ?? []).map((r) => r.trim()).filter((r) => r && r.toLowerCase() !== a.field.toLowerCase()).slice(0, 4);
  const now = new Date().getFullYear();
  const start = now - Math.max(0, a.years);
  const skills = a.skills
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  return [
    ...(a.name ? [a.name] : []),
    a.field,
    // One per line, so each is read as a role they want.
    ...related,
    '',
    'Summary',
    a.student
      ? `${a.field} student looking for an Ausbildung, internship or traineeship abroad with visa sponsorship. Motivated, reliable and ready to learn. Open to relocation and available to start soon.`
      : `${a.field} with ${a.years} ${a.years === 1 ? 'year' : 'years'} of experience, looking for a full-time job abroad with visa sponsorship. Reliable, hard-working and ready to relocate. Available to start within one to three months.`,
    ...(related.length ? [`Open to roles as ${[a.field, ...related].join(', ')}.`] : []),
    '',
    'Experience',
    a.years > 0 ? `${a.field} — ${start} – Present` : `${a.field} — trainee, ${now} – Present`,
    `Worked as a ${a.field.toLowerCase()}, taking care of daily tasks, working with a team and with customers, and learning new tools and methods on the job.`,
    '',
    'Skills',
    skills.length ? skills.join(', ') : a.field,
    '',
    'Languages',
    'English',
  ].join('\n');
}

