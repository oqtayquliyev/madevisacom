import { useEffect, useState } from 'react';
import { Building2, Check, Landmark, ShieldAlert, UserRound, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  fetchPendingAgencies,
  fetchPendingPrograms,
  fetchPendingPublishers,
  setAgencyStatus,
  setProgramStatus,
  setPublisherStatus,
  type PendingAgency,
  type PendingProgram,
  type PendingPublisher,
} from '@/lib/admin';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import type { View } from '@/types';
import type { OrgType } from '@/lib/programs';

type AdminPanelPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

const orgIcon: Record<OrgType, typeof Building2> = {
  agency: Building2,
  company: Building2,
  government: Landmark,
  expert: UserRound,
};

export function AdminPanelPage({ go, onAuth }: AdminPanelPageProps) {
  const { profile, loading } = useAuth();

  const [publishers, setPublishers] = useState<PendingPublisher[]>([]);
  const [programs, setPrograms] = useState<PendingProgram[]>([]);
  const [agencies, setAgencies] = useState<PendingAgency[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const isAdmin = profile?.role === 'admin';

  const loadAll = () => {
    setDataLoading(true);
    Promise.all([fetchPendingPublishers(), fetchPendingPrograms(), fetchPendingAgencies()]).then(
      ([p, pr, a]) => {
        setPublishers(p);
        setPrograms(pr);
        setAgencies(a);
        setDataLoading(false);
      }
    );
  };

  useEffect(() => {
    if (isAdmin) loadAll();
    else setDataLoading(false);
  }, [isAdmin]);

  if (loading) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-ink-900">
        <LandingHeader go={go} onAuth={onAuth} active="home" />
        <main className="mx-auto max-w-lg px-5 py-24 text-center sm:px-8">
          <ShieldAlert className="mx-auto h-10 w-10 text-ink-300" />
          <h1 className="mt-4 text-xl font-bold text-ink-900">Admins only</h1>
          <p className="mt-2 text-sm text-ink-500">You don't have access to this page.</p>
          <button onClick={() => go('home')} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Back to MadeVisa
          </button>
        </main>
        <LandingFooter go={go} onAuth={onAuth} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink-950">Admin panel</h1>
        <p className="mt-1 text-sm text-ink-500">Approve or reject pending publisher accounts, programs, and agencies.</p>

        {dataLoading ? (
          <p className="mt-8 text-sm text-ink-400">Loading…</p>
        ) : (
          <>
            {/* PENDING PUBLISHERS (agency / company / government / expert) */}
            <Section title="Pending publisher accounts" count={publishers.length}>
              {publishers.map((p) => {
                const Icon = orgIcon[p.org_type];
                return (
                  <Row key={p.id}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-900">{p.name}</p>
                      <p className="text-xs text-ink-500">
                        {p.org_type} · {p.contact_email} {p.country ? `· ${p.country.name}` : ''}
                        {p.website ? ` · ${p.website}` : ''}
                      </p>
                    </div>
                    <Actions
                      onApprove={async () => {
                        if (await setPublisherStatus(p.id, 'verified')) loadAll();
                      }}
                      onReject={async () => {
                        if (await setPublisherStatus(p.id, 'rejected')) loadAll();
                      }}
                    />
                  </Row>
                );
              })}
            </Section>

            {/* PENDING PROGRAMS */}
            <Section title="Pending sponsored programs" count={programs.length}>
              {programs.map((p) => (
                <Row key={p.id}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{p.title}</p>
                    <p className="text-xs text-ink-500">
                      {p.category} · {p.publisher?.name ?? 'Unknown publisher'}
                      {p.country ? ` · ${p.country.name}` : ''}
                    </p>
                  </div>
                  <Actions
                    onApprove={async () => {
                      if (await setProgramStatus(p.id, 'published')) loadAll();
                    }}
                    onReject={async () => {
                      if (await setProgramStatus(p.id, 'rejected')) loadAll();
                    }}
                  />
                </Row>
              ))}
            </Section>

            {/* PENDING AGENCIES */}
            <Section title="Pending travel agencies" count={agencies.length}>
              {agencies.map((a) => (
                <Row key={a.id}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{a.name}</p>
                    <p className="text-xs text-ink-500">
                      {[a.city, a.country].filter(Boolean).join(', ')}{a.website ? ` · ${a.website}` : ''}
                    </p>
                  </div>
                  <Actions
                    onApprove={async () => {
                      if (await setAgencyStatus(a.id, 'verified')) loadAll();
                    }}
                    onReject={async () => {
                      if (await setAgencyStatus(a.id, 'rejected')) loadAll();
                    }}
                  />
                </Row>
              ))}
            </Section>
          </>
        )}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">
        {title} <span className="text-ink-400">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="mt-3 text-xs text-ink-400">Nothing pending.</p>
      ) : (
        <div className="mt-3 divide-y divide-ink-100 border border-ink-200 bg-white">{children}</div>
      )}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 p-4">{children}</div>;
}

function Actions({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        onClick={onApprove}
        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
      >
        <Check className="h-3.5 w-3.5" />
        Approve
      </button>
      <button
        onClick={onReject}
        className="flex items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-rose-50 hover:text-rose-700"
      >
        <X className="h-3.5 w-3.5" />
        Reject
      </button>
    </div>
  );
}
