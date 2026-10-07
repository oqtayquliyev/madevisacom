import { useState } from 'react';
import { PROFILE_FIELDS, QUESTION_LABEL } from '@/lib/apply/profile';
import type { ApplyProfile, QuestionKey, SavedAnswer } from '@/lib/apply/types';
import { FIELD } from '@/components/apply/ui';

const SOURCE_TEXT: Record<SavedAnswer['source'], string> = { you: '', cv: 'from your CV', account: 'from your account' };

/**
 * The person's saved answers — entered once, reused on every application.
 * Each one can be marked "Ask me each time", which stops MadeVisa from
 * ever giving it without asking.
 */
export function ApplicationProfileFields({ value, onChange, only, askToggle = true }: { value: ApplyProfile; onChange: (p: ApplyProfile) => void; only?: QuestionKey[]; askToggle?: boolean }) {
  const fields = PROFILE_FIELDS.filter((f) => !only || only.includes(f.key));
  const setAnswer = (key: QuestionKey, patch: Partial<SavedAnswer>) => {
    const prev = value.answers[key] ?? { value: '', askEachTime: false, source: 'you' as const };
    // Typing over a suggestion makes it the person's own answer.
    onChange({ ...value, answers: { ...value.answers, [key]: { ...prev, ...patch, source: 'value' in patch ? 'you' : prev.source, question: QUESTION_LABEL[key] } } });
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const a = value.answers[f.key];
        const ask = Boolean(a?.askEachTime);
        return (
          <div key={f.key} className={f.kind === 'yesno' ? 'sm:col-span-2' : ''}>
            <label htmlFor={`ap-${f.key}`} className="flex items-baseline justify-between gap-2 text-[12.5px] font-semibold text-ink-800">
              <span>{QUESTION_LABEL[f.key]}</span>
              {a?.value && a.source !== 'you' && <span className="font-normal text-ink-400">{SOURCE_TEXT[a.source]}</span>}
            </label>
            {f.kind === 'yesno' ? (
              <div id={`ap-${f.key}`} role="radiogroup" aria-label={QUESTION_LABEL[f.key]} className="mt-1.5 flex flex-wrap items-center gap-2">
                {['Yes', 'No'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={!ask && a?.value === opt}
                    disabled={ask}
                    onClick={() => setAnswer(f.key, { value: opt })}
                    className={`rounded-full px-4 py-1.5 text-[13px] font-bold ring-1 transition disabled:opacity-40 ${!ask && a?.value === opt ? 'bg-ink-950 text-white ring-ink-950' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-400'}`}
                  >
                    {opt}
                  </button>
                ))}
                {f.hint && <span className="text-[12px] text-ink-500">{f.hint}</span>}
              </div>
            ) : (
              <input id={`ap-${f.key}`} value={a?.value ?? ''} disabled={ask} onChange={(e) => setAnswer(f.key, { value: e.target.value })} placeholder={f.hint} maxLength={200} className={`mt-1.5 ${FIELD} disabled:bg-ink-50 disabled:text-ink-400`} />
            )}
            {askToggle && !['full_name', 'email', 'phone'].includes(f.key) && (
              <label className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-600">
                <input type="checkbox" checked={ask} onChange={(e) => setAnswer(f.key, { askEachTime: e.target.checked })} className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-200" />
                Ask me each time
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Answers to questions MadeVisa didn't know and the person answered once — shown so they can be changed or removed. */
export function SavedCustomAnswers({ value, onChange }: { value: ApplyProfile; onChange: (p: ApplyProfile) => void }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(value.custom);
  if (!entries.length) return null;
  return (
    <div className="mt-4 rounded-xl bg-ink-50 p-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-[13px] font-bold text-ink-800 hover:underline">
        {entries.length} other saved {entries.length === 1 ? 'answer' : 'answers'}
      </button>
      {open && (
        <ul className="mt-2 space-y-2.5">
          {entries.map(([id, a]) => (
            <li key={id}>
              <p className="text-[12.5px] font-semibold text-ink-800">{a.question ?? id}</p>
              <div className="mt-1 flex items-start gap-2">
                <textarea value={a.value} rows={2} maxLength={4000} onChange={(e) => onChange({ ...value, custom: { ...value.custom, [id]: { ...a, value: e.target.value } } })} className={`${FIELD} min-h-[44px]`} />
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...value.custom };
                    delete next[id];
                    onChange({ ...value, custom: next });
                  }}
                  className="shrink-0 rounded-full px-2.5 py-2 text-[12px] font-semibold text-ink-500 hover:bg-ink-100 hover:text-rose-700"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
