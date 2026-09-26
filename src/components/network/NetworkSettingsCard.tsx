import { useEffect, useState } from 'react';
import { Check, Loader2, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { INTENT_LABEL, ROLE_LABEL, updateMyNetworkProfile, type NetworkIntent, type NetworkRole } from '@/lib/network';

/**
 * "Show me in the Network" — opt-in, off by default. Needs a username,
 * because Network cards link to the public profile at /u/<username>.
 */
export function NetworkSettingsCard({ onNeedUsername }: { onNeedUsername: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [role, setRole] = useState<NetworkRole | ''>('');
  const [intent, setIntent] = useState<NetworkIntent | ''>('');
  const [headline, setHeadline] = useState('');
  const [hasSponsored, setHasSponsored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!profile) return;
    setVisible(Boolean(profile.network_visible));
    setRole(profile.network_role ?? '');
    setIntent(profile.network_intent ?? '');
    setHeadline(profile.network_headline ?? '');
    setHasSponsored(Boolean(profile.has_sponsored));
  }, [profile]);

  // Arriving from "Join the Network" (/profile?tab=settings#network).
  useEffect(() => {
    if (window.location.hash === '#network') {
      window.setTimeout(() => document.getElementById('network')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
  }, []);

  if (!profile) return null;
  const hiringSide = role === 'hiring_manager' || role === 'recruiter' || intent === 'hiring';

  const save = async () => {
    if (visible && !profile.username) {
      setMsg({ ok: false, text: 'Create your profile link first — your Network card links to it.' });
      onNeedUsername();
      return;
    }
    setSaving(true);
    setMsg(null);
    const res = await updateMyNetworkProfile(profile.id, {
      network_visible: visible,
      network_role: role || null,
      network_intent: intent || null,
      network_headline: headline,
      has_sponsored: hiringSide && hasSponsored,
    });
    setSaving(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error ?? 'Could not save.' });
      return;
    }
    await refreshProfile();
    setMsg({ ok: true, text: visible ? 'Saved. You’re listed in the Network.' : 'Saved. You’re not listed in the Network.' });
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-2 text-[14px] font-semibold transition-colors ${active ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8]' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'}`;

  return (
    <section id="network" className="scroll-mt-28 rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#1D4ED8]/10 text-[#1D4ED8]">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-ink-950">Network profile</h2>
          <p className="mt-0.5 text-[14px] leading-6 text-ink-600">
            Appear in the MadeVisa Network so hiring managers, recruiters and job seekers can find you. Your email, phone and nationality are never shown.
          </p>
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-ink-50 px-4 py-3">
        <span>
          <span className="block text-[15px] font-semibold text-ink-900">Show me in the Network</span>
          <span className="block text-[13px] text-ink-500">Shows your name, photo, headline, where you live and the tags below.</span>
        </span>
        <input type="checkbox" role="switch" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#1D4ED8]" />
      </label>

      <div className="mt-5 space-y-5">
        <fieldset>
          <legend className="text-[14px] font-semibold text-ink-800">Right now I'm…</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['looking', 'hiring'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setIntent(intent === v ? '' : v)} aria-pressed={intent === v} className={chip(intent === v)}>
                {INTENT_LABEL[v]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[14px] font-semibold text-ink-800">My role</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['job_seeker', 'hiring_manager', 'recruiter', 'visa_expert'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setRole(role === v ? '' : v)} aria-pressed={role === v} className={chip(role === v)}>
                {ROLE_LABEL[v]}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-[14px] font-semibold text-ink-800">Headline</span>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={120}
            placeholder={hiringSide ? 'e.g. Engineering manager at Acme, hiring in Berlin' : 'e.g. Data analyst, 5 years, open to Germany and the Netherlands'}
            className="mt-1.5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[15px] text-ink-900 outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
          />
          <span className="mt-1 block text-right text-[12px] text-ink-400">{headline.length}/120</span>
        </label>

        {hiringSide && (
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={hasSponsored} onChange={(e) => setHasSponsored(e.target.checked)} className="mt-1 h-4 w-4 accent-[#1D4ED8]" />
            <span>
              <span className="block text-[15px] font-semibold text-ink-900">I've hired someone on a sponsored visa before</span>
              <span className="block text-[13px] text-ink-500">Shown as "Has sponsored visas" and marked as self-reported.</span>
            </span>
          </label>
        )}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {msg && (
          <p className={`flex items-center gap-1.5 text-[14px] ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {msg.ok && <Check className="h-4 w-4" />} {msg.text}
          </p>
        )}
        <button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-800 disabled:opacity-60 sm:ml-auto">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Network profile
        </button>
      </div>
    </section>
  );
}
