// Deciding what to put in each field of a live application form.
//
// The worker opens the employer's form and reads every field on it (see
// page.ts). This file decides, for each field, what goes in — using only
// what the application was prepared with:
//   • the exact answers saved for this application (by the form's own field
//     id, or the same question in the same words),
//   • the person's answers by concept for this job (`concepts`),
//   • the tailored CV and the letter.
// Same rules as the page (src/lib/apply/concepts.ts): nothing is guessed,
// demographic questions are never answered, optional consents never ticked.
// A required field nothing covers is returned as `missing` — that one
// application then needs the person, and the batch carries on.
//
// Pure: no browser, no network. Tested in src/lib/apply/__tests__/worker.test.ts.

import { checkboxValue, classifyQuestion, declineOption, fitAnswer, questionId } from '../../src/lib/apply/concepts';
import type { Question, QuestionKey } from '../../src/lib/apply/types';

/** One field as read from the live page. */
export type LiveField = {
  /** Our handle on it in the page (data-mv attribute). */
  ref: string;
  kind: 'text' | 'long' | 'email' | 'tel' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'multi' | 'file' | 'combobox' | 'buttons';
  name: string;
  id: string;
  label: string;
  required: boolean;
  options?: string[];
  /** For radio, multi-checkbox and button groups: the handle on each option, in the order of `options`. */
  optionRefs?: string[];
  accept?: string;
  /** Already has a value (some forms prefill). */
  filled?: boolean;
};

export type Pack = {
  answers: { id: string; label: string; value: string; key: string | null }[];
  concepts: Record<string, string>;
  hasLetter: boolean;
  letterText: string | null;
};

export type Action =
  | { ref: string; do: 'type'; value: string; label: string }
  | { ref: string; do: 'select'; value: string; label: string }
  | { ref: string; do: 'combo'; value: string; label: string }
  | { ref: string; do: 'check'; on: boolean; label: string }
  | { ref: string; do: 'click'; value: string; label: string }
  | { ref: string; do: 'file'; file: 'cv' | 'cover_letter'; label: string };

export type Missing = { id: string; label: string; key: QuestionKey | null; kind: Question['kind']; options?: string[]; why: string };
export type FillPlan = { actions: Action[]; missing: Missing[]; filled: { label: string; value: string; source: string }[] };

const stripPrefix = (id: string) => id.replace(/^(gh|lever|ashby|basic):/, '');

const asQuestionKind = (f: LiveField): Question['kind'] => {
  if (f.kind === 'file') return 'file';
  if (f.kind === 'long') return 'long';
  if (f.kind === 'checkbox') return 'checkbox';
  if (f.kind === 'multi') return 'multi';
  if (f.kind === 'number') return 'number';
  if (f.kind === 'date') return 'date';
  if (f.kind === 'select' || f.kind === 'radio' || f.kind === 'buttons' || f.kind === 'combobox') {
    return f.options?.length === 2 && f.options.every((o) => /^(yes|no)$/i.test(o.trim())) ? 'yesno' : 'select';
  }
  return 'text';
};

/** The saved answer for this exact field: same field id, then the same question in the same words. */
function savedFor(f: LiveField, pack: Pack): { value: string; source: string } | null {
  const ids = new Set([f.name, f.id].filter(Boolean));
  const byId = pack.answers.find((a) => ids.has(stripPrefix(a.id)) || (f.name && stripPrefix(a.id).endsWith(f.name) && f.name.length > 6));
  if (byId?.value.trim()) return { value: byId.value, source: 'answer' };
  const qid = questionId(f.label);
  const byWords = qid ? pack.answers.find((a) => questionId(a.label) === qid) : undefined;
  if (byWords?.value.trim()) return { value: byWords.value, source: 'answer' };
  return null;
}

function conceptFor(key: QuestionKey | null, f: LiveField, pack: Pack): { value: string; source: string } | null {
  if (!key) return null;
  const c = pack.concepts;
  const fromAnswers = pack.answers.find((a) => a.key === key)?.value;
  const v = fromAnswers ?? c[key];
  if (v?.trim()) {
    // "Location" fields usually want the city with its country.
    if (key === 'city' && /location/i.test(f.label) && c.country && !v.includes(c.country)) return { value: `${v}, ${c.country}`, source: 'concept' };
    return { value: v, source: 'concept' };
  }
  if (key === 'full_name' && c.first_name && c.last_name) return { value: `${c.first_name} ${c.last_name}`, source: 'concept' };
  if (key === 'first_name' && c.full_name) return { value: c.full_name.split(/\s+/)[0], source: 'concept' };
  if (key === 'last_name' && c.full_name?.trim().includes(' ')) return { value: c.full_name.trim().split(/\s+/).slice(1).join(' '), source: 'concept' };
  return null;
}

/** Which of a field's options a value means, with the field's own wording. */
function optionAction(f: LiveField, value: string, key: QuestionKey | null): Action | null {
  const picked = fitAnswer(value, { kind: asQuestionKind(f), options: f.options }, key);
  if (!picked) return null;
  if (f.kind === 'select') return { ref: f.ref, do: 'select', value: picked, label: f.label };
  const i = f.options!.indexOf(picked);
  const ref = f.optionRefs?.[i];
  return ref ? { ref, do: 'click', value: picked, label: f.label } : null;
}

export function planFill(fields: LiveField[], pack: Pack): FillPlan {
  const out: FillPlan = { actions: [], missing: [], filled: [] };
  const miss = (f: LiveField, key: QuestionKey | null, why: string) => {
    if (f.required) out.missing.push({ id: f.name || f.id || f.ref, label: f.label, key, kind: asQuestionKind(f), ...(f.options?.length ? { options: f.options } : {}), why });
  };
  const put = (a: Action, value: string, source: string) => {
    out.actions.push(a);
    out.filled.push({ label: a.label, value, source });
  };

  for (const f of fields) {
    if (!f.label && f.kind !== 'file') continue;

    if (f.kind === 'file') {
      const text = `${f.label} ${f.name} ${f.id}`;
      const isLetter = /cover|letter|anschreiben|motivation/i.test(text);
      const isCv = !isLetter && (/resume|\bcv\b|curriculum|lebenslauf/i.test(text) || f.required || fields.filter((x) => x.kind === 'file').length === 1);
      if (isCv) put({ ref: f.ref, do: 'file', file: 'cv', label: f.label || 'Resume/CV' }, 'Tailored CV', 'cv');
      else if (isLetter && pack.hasLetter) put({ ref: f.ref, do: 'file', file: 'cover_letter', label: f.label }, 'Cover letter', 'letter');
      else if (isLetter && f.required) miss(f, null, 'The employer asks for a cover letter and none was prepared for this application.');
      else miss(f, null, `The employer asks for a document MadeVisa doesn’t have: “${f.label}”.`);
      continue;
    }

    const key = classifyQuestion(f.label) ?? (/^(first_?name|fname)$/i.test(f.name) ? 'first_name' : /^(last_?name|lname|surname)$/i.test(f.name) ? 'last_name' : /^e?-?mail$/i.test(f.name) ? 'email' : /^(phone|mobile)$/i.test(f.name) ? 'phone' : null);

    // A text box for the letter: the letter's own text.
    if ((f.kind === 'long' || f.kind === 'text') && /cover letter|anschreiben/i.test(f.label)) {
      if (pack.letterText) put({ ref: f.ref, do: 'type', value: pack.letterText, label: f.label }, '(cover letter)', 'letter');
      else miss(f, null, 'The employer asks for a cover letter and none was prepared for this application.');
      continue;
    }

    // Voluntary self-identification: never answered. A required one gets "I'd rather not say" where it offers it.
    if (key === 'demographic') {
      const decline = declineOption(f.options);
      if (f.required && decline) {
        const a = optionAction(f, decline, null);
        if (a) put(a, decline, 'madevisa');
        else miss(f, key, `“${f.label}” is a personal question MadeVisa never answers for you.`);
      } else miss(f, key, `“${f.label}” is a personal question MadeVisa never answers for you.`);
      continue;
    }

    // Consent: only a required one, and only with the person's yes for this batch.
    if (key === 'consent' && (f.kind === 'checkbox' || f.kind === 'buttons' || f.kind === 'radio' || f.kind === 'select')) {
      if (!f.required) continue;
      if (checkboxValue(pack.concepts.consent ?? '') !== true) {
        miss(f, key, 'This employer requires you to accept its privacy notice, and you haven’t let MadeVisa accept it for you.');
        continue;
      }
      if (f.kind === 'checkbox') put({ ref: f.ref, do: 'check', on: true, label: f.label }, 'Yes', 'you');
      else {
        const a = optionAction(f, 'Yes', 'consent');
        if (a) put(a, 'Yes', 'you');
        else miss(f, key, 'The consent on this form couldn’t be matched to a yes.');
      }
      continue;
    }

    const found = savedFor(f, pack) ?? conceptFor(key, f, pack) ?? (key === 'source' ? { value: 'MadeVisa', source: 'madevisa' } : null);
    if (!found) {
      // Already filled by the employer's form (a prefill) — leave it.
      if (f.filled) continue;
      miss(f, key, key ? 'You haven’t saved an answer to this yet.' : 'This is a question only you can answer.');
      continue;
    }

    if (f.kind === 'checkbox') {
      const b = checkboxValue(found.value);
      if (b == null) miss(f, key, 'Your answer isn’t a clear yes or no.');
      else if (b || f.required) put({ ref: f.ref, do: 'check', on: b, label: f.label }, b ? 'Yes' : 'No', found.source);
      continue;
    }
    if (f.kind === 'select' || f.kind === 'radio' || f.kind === 'buttons') {
      let a = optionAction(f, found.value, key);
      // "How did you hear about us?": MadeVisa if listed, otherwise a job board / website / other.
      if (!a && key === 'source' && f.options) {
        const alt = f.options.find((o) => /madevisa/i.test(o)) ?? f.options.find((o) => /job board|website|online|internet|other/i.test(o));
        if (alt) a = optionAction(f, alt, null);
      }
      if (a) put(a, a.do === 'select' || a.do === 'click' ? a.value : found.value, found.source);
      else miss(f, key, `Your answer “${found.value}” doesn’t match the choices on this form.`);
      continue;
    }
    if (f.kind === 'multi') {
      // Several choices: only an exact list MadeVisa was given.
      const want = found.value.split(/\s*[,;]\s*/).filter(Boolean);
      const refs = want.map((w) => f.options?.findIndex((o) => o.toLowerCase() === w.toLowerCase()) ?? -1);
      if (want.length && refs.every((i) => i >= 0)) refs.forEach((i) => put({ ref: f.optionRefs![i], do: 'click', value: f.options![i], label: f.label }, f.options![i], found.source));
      else miss(f, key, 'This question has several choices; MadeVisa only picks them when you have.');
      continue;
    }
    if (f.kind === 'combobox') {
      const v = fitAnswer(found.value, { kind: 'text' }, key);
      if (v) put({ ref: f.ref, do: 'combo', value: v, label: f.label }, v, found.source);
      else miss(f, key, 'No answer to pick.');
      continue;
    }
    const v = fitAnswer(found.value, { kind: f.kind === 'number' ? 'number' : 'text' }, key);
    if (v == null) miss(f, key, 'Your saved answer doesn’t fit this field.');
    else put({ ref: f.ref, do: 'type', value: v, label: f.label }, v, found.source);
  }
  return out;
}

// --- Reading the result ---------------------------------------------------------------------

const SUCCESS_TEXT = /thank(s| you)[^.!]{0,40}\b(for )?(applying|your application|your interest|submitting)|application (has been |was )?(successfully )?(submitted|received|sent)|we(’|'|)ve received your application|we have received your application|successfully (submitted|applied)|your application is (on its way|complete|in)|bewerbung (wurde )?(erfolgreich )?(gesendet|eingegangen|übermittelt)|candidature (a bien été )?(envoyée|reçue)/i;
const SUCCESS_URL = /\/(confirmation|thank-?you|thanks|success|submitted|applied|application-submitted)(\/|$|\?|#)|[?&](submitted|success)=/i;
const CLOSED_TEXT = /\b(no longer (available|accepting|open)|position (has been )?filled|job (is )?(closed|expired)|posting (has )?(closed|expired)|this job (has )?expired|page (you are looking for )?(was )?not found)\b/i;
const LOGIN_TEXT = /\b(sign in|log in|login|create (an |your )?account|register to apply)\b/i;

export const isSuccess = (url: string, text: string) => SUCCESS_URL.test(url) || SUCCESS_TEXT.test(text);
export const isClosed = (text: string) => CLOSED_TEXT.test(text);
export const asksLogin = (text: string) => LOGIN_TEXT.test(text);

/** A confirmation or reference number the employer showed, if any. */
export function confirmationId(text: string): string | null {
  const m = text.match(/\b(?:application|reference|confirmation|candidate)\s*(?:id|number|no\.?|#|code)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,40})\b/i);
  return m ? m[1] : null;
}

/** A short, readable piece of the confirmation text, for the receipt. */
export function successSnippet(text: string): string | null {
  const m = text.match(SUCCESS_TEXT);
  if (!m || m.index == null) return null;
  const start = Math.max(0, text.lastIndexOf('.', m.index) + 1);
  return text.slice(start, Math.min(text.length, m.index + m[0].length + 120)).replace(/\s+/g, ' ').trim().slice(0, 300);
}
