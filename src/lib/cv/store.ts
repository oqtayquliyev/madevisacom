// The visitor's CV — one per person.
//
// Where it lives
//   • In this browser (localStorage), so a guest can upload a CV and see
//     their match before creating an account, and so every page has it
//     instantly.
//   • With the account (table `user_cvs` + the private `cvs` bucket,
//     migration 20261126090000) once signed in — the same CV on every device.
// A CV uploaded as a guest is attached to the account at sign-up. Signing
// out removes the local copy of an account's CV.

import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { parseCv, type CvProfile } from '@/lib/cv/cvProfile';
import { CV_MAX_CHARS, CV_MIME, cvExt, extractCvText, tidy } from '@/lib/cv/extract';

export type StoredCv = {
  name: string;
  size: number;
  text: string;
  profile: CvProfile;
  /** When it was added (ISO). A new upload resets saved match results. */
  at: string;
  /** Account it belongs to; null while the visitor is a guest. */
  owner: string | null;
};

const KEY = 'mv:cv';
const PROFILE_VERSION = 2;

/** `synced`: the account whose CV has been looked up (so "no CV" is a fact, not "not loaded yet"). */
type State = { cv: StoredCv | null; loading: boolean; synced: string | null };
let state: State = { cv: readLocal(), loading: false, synced: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  emit();
};

function readLocal(): StoredCv | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as StoredCv | null;
    if (!v || typeof v.text !== 'string' || !v.text) return null;
    // Parsed with an older reader → read it again with this one.
    if (v.profile?.v !== PROFILE_VERSION) v.profile = parseCv(v.text);
    return v;
  } catch {
    return null;
  }
}
function writeLocal(cv: StoredCv | null) {
  try {
    if (cv) window.localStorage.setItem(KEY, JSON.stringify(cv));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage full or private mode: the CV still works for this visit */
  }
}

type Row = { file_name: string | null; file_size: number | null; text: string; updated_at: string };

/** Is the CV table there? (False until migration 20261126090000 is run.) */
let remoteOk: boolean | null = null;

async function pushRemote(cv: StoredCv, userId: string, file?: File): Promise<void> {
  if (remoteOk === false) return;
  let storage_path: string | null = null;
  const kind = file ? cvExt(file.name) : null;
  if (file && kind) {
    // Fixed name per person: a new upload replaces the old file.
    const path = `${userId}/cv.${kind}`;
    const up = await supabase.storage.from('cvs').upload(path, file, { upsert: true, contentType: CV_MIME[kind], cacheControl: '0' });
    if (!up.error) storage_path = path;
  }
  const { error } = await supabase.from('user_cvs').upsert(
    { user_id: userId, file_name: cv.name.slice(0, 200), file_size: cv.size, text: cv.text.slice(0, CV_MAX_CHARS), profile: cv.profile, ...(storage_path ? { storage_path } : {}) },
    { onConflict: 'user_id' },
  );
  remoteOk = !error || !/relation|schema cache|does not exist/i.test(error.message);
  if (error && remoteOk) console.error('CV save failed', error);
}

let syncedFor: string | null = null;

/** After sign-in: use the account's CV, or attach the one uploaded as a guest. */
async function syncWithAccount(userId: string): Promise<void> {
  if (syncedFor === userId) return;
  syncedFor = userId;
  set({ loading: true });
  const { data, error } = await supabase.from('user_cvs').select('file_name, file_size, text, updated_at').eq('user_id', userId).maybeSingle();
  if (error) {
    remoteOk = !/relation|schema cache|does not exist/i.test(error.message);
    return set({ loading: false, synced: userId });
  }
  remoteOk = true;
  const row = data as Row | null;
  const local = state.cv;
  if (row) {
    // The account's CV wins — unless this browser holds a newer one for the same account.
    if (local && local.owner === userId && local.text === row.text) {
      // Same CV as the account's: keep this browser's copy (and the match results saved against it).
    } else if (local && local.owner === userId && local.at > (row.updated_at ?? '')) {
      await pushRemote(local, userId);
    } else if (local && local.owner === null && Date.now() - Date.parse(local.at) < 30 * 60_000) {
      // Uploaded as a guest just before signing in: that's the CV they mean.
      const cv = { ...local, owner: userId };
      writeLocal(cv);
      set({ cv });
      await pushRemote(cv, userId);
    } else {
      const cv: StoredCv = { name: row.file_name ?? 'CV', size: row.file_size ?? row.text.length, text: row.text, profile: parseCv(row.text), at: row.updated_at ?? new Date().toISOString(), owner: userId };
      writeLocal(cv);
      return set({ cv, loading: false, synced: userId });
    }
  } else if (local && (local.owner === null || local.owner === userId)) {
    const cv = { ...local, owner: userId };
    writeLocal(cv);
    set({ cv });
    await pushRemote(cv, userId);
  } else if (local) {
    // Someone else's CV left in this browser.
    writeLocal(null);
    return set({ cv: null, loading: false, synced: userId });
  }
  set({ loading: false, synced: userId });
}

function onSignedOut() {
  syncedFor = null;
  if (state.cv?.owner) {
    writeLocal(null);
    set({ cv: null, synced: null });
  } else if (state.synced) set({ synced: null });
}

export type SaveResult = { ok: true; cv: StoredCv } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function saveText(text: string, name: string, size: number, file?: File): Promise<SaveResult> {
  const clean = tidy(text);
  const words = clean.split(/\s+/).filter(Boolean).length;
  if (words < 60) return { ok: false, error: 'That’s too short to be a CV. Paste the whole thing: your roles with dates, education and skills.' };
  const profile = parseCv(clean);
  const signals = [profile.has.email || profile.has.phone, profile.has.dates, profile.has.experience || profile.has.education, Object.keys(profile.skills).length >= 3, profile.titles.length > 0];
  if (signals.filter(Boolean).length < 2) return { ok: false, error: 'This doesn’t look like a CV — we found no roles, dates, education or skills in it. Check you picked the right file.' };
  const userId = await currentUserId();
  const cv: StoredCv = { name, size, text: clean, profile, at: new Date().toISOString(), owner: userId };
  writeLocal(cv);
  set({ cv });
  if (userId) void pushRemote(cv, userId, file);
  return { ok: true, cv };
}

/** Read a CV file, check it is one, keep it. */
export async function saveCvFile(file: File): Promise<SaveResult> {
  const res = await extractCvText(file);
  if (!res.ok) return res;
  return saveText(res.text, file.name.slice(0, 200), file.size, file);
}

/** Same, for text pasted in (no file on a phone, or a scanned PDF). */
export const saveCvText = (text: string): Promise<SaveResult> => saveText(text, 'Pasted CV', text.length);

export async function removeCv(): Promise<void> {
  const userId = await currentUserId();
  writeLocal(null);
  set({ cv: null });
  if (!userId || remoteOk === false) return;
  const { data } = await supabase.from('user_cvs').select('storage_path').eq('user_id', userId).maybeSingle();
  const path = (data as { storage_path: string | null } | null)?.storage_path;
  if (path) await supabase.storage.from('cvs').remove([path]);
  await supabase.from('user_cvs').delete().eq('user_id', userId);
}

/** A short-lived link to the original file (owner only). */
export async function cvDownloadUrl(): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data } = await supabase.from('user_cvs').select('storage_path').eq('user_id', userId).maybeSingle();
  const path = (data as { storage_path: string | null } | null)?.storage_path;
  if (!path) return null;
  const signed = await supabase.storage.from('cvs').createSignedUrl(path, 120);
  return signed.data?.signedUrl ?? null;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;

/** The visitor's CV, shared by every component on the page. */
export function useCv(): { cv: StoredCv | null; loading: boolean; hasCv: boolean; ready: boolean } {
  const { user, loading: authLoading } = useAuth();
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (authLoading) return;
    if (user) void syncWithAccount(user.id);
    else onSignedOut();
  }, [user, authLoading]);
  // `ready`: we know whether this person has a CV (guests: straight away; accounts: once looked up).
  const ready = !authLoading && (!user || s.synced === user.id);
  return { cv: s.cv, loading: s.loading, hasCv: Boolean(s.cv), ready };
}

/** "cv.pdf · 412 words · added 3 Oct". */
export function cvSummary(cv: StoredCv): string {
  const date = new Date(cv.at);
  const when = Number.isNaN(date.getTime()) ? '' : ` · added ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  return `${cv.profile.words} words${when}`;
}
