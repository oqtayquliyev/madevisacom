import { useEffect, useState } from 'react';
import { Building2, Check, FileSignature, Inbox, Loader2, MailWarning } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/lib/auth';
import { WRAP, nav } from '@/lib/pageLayout';
import { supabase } from '@/lib/supabase';
import { briefPath } from '@/lib/briefs';
import { rememberAuthIntent } from '@/lib/authIntent';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

type InboxPlan = { share_id: string; job_title: string; company_name: string; candidate_name: string; country_code: string; created_at: string; replied: boolean };
type OkInbox = { state: 'ok'; domain: string; companies: { id: string; name: string }[]; plans: InboxPlan[] };
type Inbox = { state: 'signed_out' | 'unconfirmed' | 'personal_email' | 'no_company'; domain?: string } | OkInbox;

/**
 * /employers/inbox — recruiters sign in with their work email and see every
 * Visa Plan candidates sent to their company. Access rules live in the
 * database (employer_inbox(), migration 20261121090000).
 */
export function EmployerInboxPage({ go, onAuth }: Props) {
  const { session } = useAuth();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);

  useSeo({
    title: 'Employer inbox — Visa Plans sent to your company | MadeVisa',
    description: 'Sign in with your work email to see every Visa Plan candidates sent to your company: the visa route, the steps and who pays what. Free for employers.',
    path: '/employers/inbox',
  });

  useEffect(() => {
    let alive = true;
    setInbox(null);
    setError(null);
    supabase.rpc('employer_inbox').then(({ data, error: e }) => {
      if (!alive) return;
      if (e) return setError(/employer_inbox|schema cache/i.test(e.message) ? 'The employer inbox isn’t switched on yet.' : e.message);
      setInbox(data as Inbox);
    });
    return () => {
      alive = false;
    };
  }, [session]);

  const ok: OkInbox | null = inbox?.state === 'ok' ? (inbox as OkInbox) : null;

  const signIn = () => {
    rememberAuthIntent({ next: '/employers/inbox' });
    onAuth?.('login');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />
      <main className={`${WRAP} py-10 sm:py-14`}>
        <p className="inline-flex items-center gap-2 rounded-full bg-[#1D4ED8]/10 px-3 py-1 text-[12px] font-bold text-[#1D4ED8]">
          <Inbox className="h-3.5 w-3.5" /> For employers · free
        </p>
        <h1 className="mt-4 max-w-3xl text-[30px] font-bold leading-tight tracking-tight text-ink-950 sm:text-[40px]">Visa Plans sent to your company</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-7 text-ink-600">
          Candidates attach a one-page Visa Plan to their application: the legal visa route, the few steps on your side, and which costs they share. See them all in one place, and reply in one
          click.
        </p>

        <div className="mt-8 max-w-3xl">
          {error ? (
            <Note icon={MailWarning} title="Not available" text={error} />
          ) : !inbox ? (
            <p className="flex items-center gap-2 text-[14px] text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : inbox.state === 'signed_out' ? (
            <div className="rounded-2xl bg-white p-6 ring-1 ring-ink-200">
              <p className="text-[16px] font-bold text-ink-950">Sign in with your work email</p>
              <p className="mt-1 text-[14px] leading-6 text-ink-600">We match your email’s domain (for example @yourcompany.com) to your company. Personal addresses like Gmail can’t be used.</p>
              <button onClick={signIn} className="mt-4 rounded-full bg-[#1D4ED8] px-5 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800">
                Sign in or create a free account
              </button>
            </div>
          ) : inbox.state === 'unconfirmed' ? (
            <Note icon={MailWarning} title="Confirm your email first" text={`Open the confirmation email we sent to your @${inbox.domain} address, then come back to this page.`} />
          ) : inbox.state === 'personal_email' ? (
            <Note icon={MailWarning} title="Use your work email" text={`You’re signed in with a personal address (@${inbox.domain}). Sign out and sign in with your company email to see your inbox.`} />
          ) : inbox.state === 'no_company' ? (
            <Note
              icon={Building2}
              title={`No company found for @${inbox.domain}`}
              text="Your company may not be on MadeVisa yet, or its website is listed under another domain. Write to hello@madevisa.com from your work email and we’ll link it."
            />
          ) : (
            <>
              <p className="text-[13px] text-ink-500">
                Signed in as @{ok?.domain} · {ok?.companies.map((c) => c.name).join(', ')}
              </p>
              {!ok || ok.plans.length === 0 ? (
                <div className="mt-3">
                  <Note icon={Inbox} title="No Visa Plans yet" text="When a candidate sends one to your company, it appears here." />
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200">
                  {ok.plans.map((p) => (
                    <li key={p.share_id}>
                      <a
                        href={briefPath(p.share_id)}
                        onClick={(e) => {
                          e.preventDefault();
                          nav(briefPath(p.share_id));
                        }}
                        className="flex items-center gap-3 px-4 py-3.5 hover:bg-ink-50"
                      >
                        <FileSignature className="h-5 w-5 shrink-0 text-[#1D4ED8]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-ink-950">{p.candidate_name}</span>
                          <span className="block truncate text-[13px] text-ink-500">
                            {p.job_title} · {p.company_name} · {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        </span>
                        {p.replied ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-emerald-700">
                            <Check className="h-3.5 w-3.5" /> Replied
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-[#1D4ED8] px-3 py-1 text-[12px] font-bold text-white">Open & reply</span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </main>
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function Note({ icon: Icon, title, text }: { icon: typeof Inbox; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white p-5 ring-1 ring-ink-200">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />
      <div>
        <p className="text-[15px] font-bold text-ink-950">{title}</p>
        <p className="mt-1 text-[14px] leading-6 text-ink-600">{text}</p>
      </div>
    </div>
  );
}
