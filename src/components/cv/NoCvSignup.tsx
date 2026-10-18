import { useEffect, useState } from 'react';
import { ArrowRight, Briefcase, FileText, Loader2, User, Zap } from 'lucide-react';
import { QuickSignup } from '@/components/cv/QuickSignup';
import { CircleFlag } from '@/components/common/CircleFlag';
import { Num } from '@/components/cv/DocReady';
import { CATEGORIES_BY_GROUP } from '@/lib/jobTaxonomy';
import { rememberAlertWish } from '@/lib/jobAlerts';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { priceLabel } from '@/lib/plans';
import { checkoutHref, trackBilling } from '@/lib/billing';
import { jobPath } from '@/lib/jobUrl';
import { nav } from '@/lib/pageLayout';

const clean = (label: string) => label.replace(/\s*\(other\)/i, '').trim();
const FLOW = 'mv:noCvFlow';
type Plan = 'starter' | 'pro';
type Flow = { plan: Plan; field: string };
type Role = { id: string; title: string; company: string | null; country: string | null; cc: string | null };

const readFlow = (): Flow | null => {
  try {
    return JSON.parse(window.sessionStorage.getItem(FLOW) ?? 'null') as Flow | null;
  } catch {
    return null;
  }
};
const saveFlow = (f: Flow) => {
  try {
    window.sessionStorage.setItem(FLOW, JSON.stringify(f));
  } catch {
    /* ignore */
  }
};

/** Live jobs whose title has the words of this field ("UX/UI designer" → ux, ui, designer). */
async function rolesFor(field: string): Promise<Role[]> {
  const words = [...new Set(field.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length >= 2 && !['and', 'of', 'the', 'other'].includes(w)))];
  if (!words.length) return [];
  const { data, error } = await supabase.rpc('cv_job_shortlist', { p_title_words: words, p_skill_words: [], p_limit: 60 });
  if (error || !Array.isArray(data)) return [];
  return (data as Role[]).filter((r) => r.title);
}

/** After the email is approved: the roles for their field, on the same page, and the plan they chose. */
function RolesForYou({ flow }: { flow: Flow }) {
  const [roles, setRoles] = useState<Role[] | null>(null);
  useEffect(() => {
    let alive = true;
    void rolesFor(flow.field).then((r) => alive && setRoles(r));
    return () => {
      alive = false;
    };
  }, [flow.field]);
  const countries = roles ? [...new Map(roles.filter((r) => r.cc).map((r) => [r.cc!, r.country ?? r.cc!])).entries()] : [];
  const href = checkoutHref(flow.plan, flow.plan === 'pro' ? 'no_cv_auto_apply' : 'no_cv_starter');
  return (
    <section className="mx-auto max-w-xl animate-fade-up rounded-3xl bg-white px-5 py-6 text-left text-ink-900 shadow-soft motion-reduce:animate-none sm:px-7">
      <h2 className="text-[21px] font-bold leading-tight tracking-tight text-ink-950">
        {roles === null ? (
          'Finding roles for you…'
        ) : (
          <>
            <Num className="text-[26px]">{roles.length}</Num> {flow.field} {roles.length === 1 ? 'role' : 'roles'} for you
            {countries.length > 0 && (
              <>
                {' '}
                in <Num className="text-[26px]">{countries.length}</Num> {countries.length === 1 ? 'country' : 'countries'}
              </>
            )}
          </>
        )}
      </h2>
      {roles === null && <Loader2 className="mt-4 h-5 w-5 animate-spin text-brand-600" aria-hidden />}
      {roles && roles.length > 0 && (
        <ul className="mt-4 space-y-2">
          {roles.slice(0, 5).map((r) => (
            <li key={r.id}>
              <a
                href={jobPath({ id: `sponsored-${r.id}`, title: r.title, company: r.company ?? '' })}
                className="flex items-center gap-3 rounded-xl bg-ink-50 px-3.5 py-2.5 hover:bg-brand-50"
              >
                {r.cc && <CircleFlag countryCode={r.cc} size={20} label={r.country ?? r.cc} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold text-ink-950">{r.title}</span>
                  <span className="block truncate text-[12.5px] text-ink-600">{[r.company, r.country].filter(Boolean).join(' · ')}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
      {roles && roles.length === 0 && <p className="mt-3 text-[14.5px] text-ink-700">We’ll email you new {flow.field} jobs abroad as they come in.</p>}
      <button
        onClick={() => {
          trackBilling('plan_selected', { plan: flow.plan, source: flow.plan === 'pro' ? 'no_cv_auto_apply' : 'no_cv_starter' });
          nav(href);
        }}
        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[15px] font-bold ${flow.plan === 'pro' ? 'bg-ink-950 text-white hover:bg-ink-800' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
      >
        {flow.plan === 'pro' ? <Zap className="h-4 w-4 text-amber-300" fill="currentColor" aria-hidden /> : null}
        {flow.plan === 'pro' ? `Auto Apply for 30 days · ${priceLabel('pro')}` : `See all matches · ${priceLabel('starter')}`}
      </button>
      <p className="mt-2 text-center text-[12.5px] text-ink-500">New {flow.field} jobs abroad also come to your inbox.</p>
    </section>
  );
}

/**
 * /cv-match without a CV: two ways in — Starter (see jobs for your field) or Pro (Auto Apply for 30 days).
 * Name, field and email; the email is approved with a 6-digit code; then the roles for that field open
 * on the same page, and a job alert for it is created.
 */
export function NoCvSignup() {
  const { session } = useAuth();
  const [flow, setFlow] = useState<Flow | null>(() => readFlow());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [name, setName] = useState('');
  const [field, setField] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');

  // Approved: show the roles. (Signed-in visitors who never started this flow see nothing here.)
  if (session && flow) return <RolesForYou flow={flow} />;
  if (session) return null;

  if (!plan) {
    return (
      <button onClick={() => setPlan('starter')} className="mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl bg-white/10 px-4 py-3.5 text-left text-white ring-1 ring-white/25 hover:bg-white/15">
        <FileText className="h-5 w-5 shrink-0 text-white/80" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-snug">I don’t have a CV / Resume</span>
          <span className="block text-[12.5px] text-white/75">Get sponsored jobs for your field</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
      </button>
    );
  }

  return (
    <section className="mx-auto max-w-xl animate-fade-up rounded-3xl bg-white px-5 py-6 text-left text-ink-900 shadow-soft motion-reduce:animate-none sm:px-7">
      <h2 className="flex items-center gap-2 text-[19px] font-bold leading-tight tracking-tight text-ink-950">
        {plan === 'pro' && <Zap className="h-5 w-5 text-amber-500" fill="currentColor" aria-hidden />}
        {step === 'code' ? 'Write your code — your roles open next' : plan === 'pro' ? 'Auto Apply to jobs abroad for 30 days' : 'Find jobs abroad for your field'}
      </h2>

      {step === 'email' && (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-700">Name and surname</span>
            <span className="relative mt-1.5 block">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Your full name"
                className="h-12 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-[15px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </span>
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-700">Your field of work</span>
            <span className="relative mt-1.5 block">
              <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <select
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="h-12 w-full appearance-none rounded-xl border border-ink-200 bg-white pl-9 pr-8 text-[15px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                <option value="">Choose your field…</option>
                {CATEGORIES_BY_GROUP.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {[...new Set(g.labels.map(clean))].map((l) => (
                      <option key={`${g.group}:${l}`} value={l}>
                        {l}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </span>
          </label>
        </div>
      )}

      <QuickSignup
        onStep={setStep}
        back="/cv-match"
        sendLabel="Approve your email"
        beforeSend={() => {
          if (name.trim().split(/\s+/).length < 2) return 'Write your name and surname.';
          if (!field) return 'Choose your field of work.';
          rememberAlertWish({ keywords: field, country: null });
          saveFlow({ plan, field });
          return null;
        }}
        onVerified={() => {
          void supabase.auth.getUser().then(({ data }) => {
            if (data.user) void supabase.from('profiles').update({ full_name: name.trim().slice(0, 120) }).eq('id', data.user.id);
          });
          setFlow({ plan, field });
        }}
      />
      {step === 'email' && (
        <button onClick={() => setPlan(null)} className="mt-3 text-[13px] font-semibold text-ink-500 hover:text-ink-800">
          ← Back
        </button>
      )}
    </section>
  );
}
