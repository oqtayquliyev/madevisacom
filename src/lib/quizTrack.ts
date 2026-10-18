// The CV match quiz, step by step, for Admin → Quiz funnel: which screens a visitor reaches and what they answer.
// Anonymous (a random id kept in this browser), never the email or the CV text. Fire-and-forget: a failure never
// shows, and nothing waits for it.
import { supabase } from '@/lib/supabase';

const VID_KEY = 'mv:vid';
const SRC_KEY = 'mv:quizSource';
const SEEN_KEY = 'mv:quizSeen';

function visitorId(): string {
  try {
    let v = window.localStorage.getItem(VID_KEY);
    if (!v) {
      v = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 24);
      window.localStorage.setItem(VID_KEY, v);
    }
    return v;
  } catch {
    return 'nostorage0';
  }
}

// Where they came from — read once, before the quiz rewrites the address (?step=…).
(function rememberSource() {
  try {
    const q = new URLSearchParams(window.location.search);
    const utm = [q.get('utm_source'), q.get('utm_medium'), q.get('utm_campaign')].filter(Boolean).join(' / ');
    const fb = q.get('fbclid') ? 'facebook / instagram' : '';
    const ref = document.referrer && !document.referrer.includes(window.location.host) ? new URL(document.referrer).host : '';
    const src = utm || fb || ref;
    if (src && !window.sessionStorage.getItem(SRC_KEY)) window.sessionStorage.setItem(SRC_KEY, src.slice(0, 160));
  } catch {
    /* ignore */
  }
})();

let from: string | null = null;
/** The visitor's country (from the location guess), sent with every event. */
export function setQuizCountry(cc: string | null) {
  from = cc;
}

type Detail = Record<string, string | number | boolean | null | string[]>;

/** One step or answer. */
export function quizTrack(step: string, detail: Detail = {}): void {
  try {
    void supabase
      .rpc('cv_quiz_track', { p_visitor: visitorId(), p_step: step, p_detail: detail, p_from: from, p_source: window.sessionStorage.getItem(SRC_KEY) })
      .then(() => undefined, () => undefined);
  } catch {
    /* tracking never breaks the page */
  }
}

/** A screen seen — once per screen per visit, so going back and forth doesn't count twice. */
export function quizView(screen: string, detail: Detail = {}): void {
  try {
    const seen = new Set(JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
    if (seen.has(screen)) return;
    seen.add(screen);
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* count it anyway */
  }
  quizTrack(`view:${screen}`, detail);
}
