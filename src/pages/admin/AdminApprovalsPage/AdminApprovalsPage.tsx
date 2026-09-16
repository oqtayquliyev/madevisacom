import { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  Landmark,
  Loader2,
  ShieldAlert,
  Sparkles,
  UserRound,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { View } from '@/types';

// This page is only reachable at /admin (wired up in App.tsx) and only
// once the visitor's own profile has `role === 'admin'`. To make your
// own account an admin, run in Supabase:
//
//   update profiles set role = 'admin' where email = 'oqtayquliyev4@gmail.com';
//
// It reads/writes the columns added in supabase_migration.sql.

type AdminApprovalsPageProps = {
  profile: { id: string; role: string | null };
  go: (view: View) => void;
};

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  company_name: string | null;
  institution_name: string | null;
  institution_type: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  approval_status: string | null;
  is_expert: boolean | null;
  expert_approval_status: string | null;
  requested_role: string | null;
  requested_role_status: string | null;
  requested_role_org_name: string | null;
  requested_role_website: string | null;
  created_at: string | null;
};

type Tab = 'organizations' | 'experts' | 'role-requests';

export function AdminApprovalsPage({ profile, go }: AdminApprovalsPageProps) {
  const [tab, setTab] = useState<Tab>('organizations');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState('');

  const isAdmin = profile.role === 'admin';

  const load = async () => {
    setLoading(true);
    let query = supabase.from('profiles').select('*');

    if (tab === 'organizations') {
      query = query.in('role', ['agency', 'government']).eq('approval_status', 'pending');
    } else if (tab === 'experts') {
      query = query.eq('expert_approval_status', 'pending');
    } else {
      query = query.eq('requested_role_status', 'pending');
    }

    const { data } = await query.order('created_at', { ascending: true });
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc] px-5 text-center">
        <div>
          <ShieldAlert className="mx-auto h-10 w-10 text-rose-500" />
          <p className="mt-3 text-sm font-semibold text-ink-900">You don't have access to this page.</p>
          <button onClick={() => go('home')} className="mt-3 text-sm font-medium text-brand-600 underline">
            Back to home
          </button>
        </div>
      </div>
    );
  }

  const approveOrganization = async (row: Row) => {
    setBusyId(row.id);
    await supabase
      .from('profiles')
      .update({ approval_status: 'approved', is_public: true, approved_at: new Date().toISOString(), approved_by: profile.id })
      .eq('id', row.id);
    setBusyId(null);
    load();
  };

  const rejectOrganization = async (row: Row, reason: string) => {
    setBusyId(row.id);
    await supabase
      .from('profiles')
      .update({ approval_status: 'rejected', is_public: false, rejection_reason: reason || null })
      .eq('id', row.id);
    setBusyId(null);
    setReasonFor(null);
    setReasonText('');
    load();
  };

  const approveExpert = async (row: Row) => {
    setBusyId(row.id);
    await supabase.from('profiles').update({ expert_approval_status: 'approved' }).eq('id', row.id);
    setBusyId(null);
    load();
  };

  const rejectExpert = async (row: Row, reason: string) => {
    setBusyId(row.id);
    await supabase
      .from('profiles')
      .update({ expert_approval_status: 'rejected', expert_rejection_reason: reason || null })
      .eq('id', row.id);
    setBusyId(null);
    setReasonFor(null);
    setReasonText('');
    load();
  };

  const approveRoleRequest = async (row: Row) => {
    if (!row.requested_role) return;
    setBusyId(row.id);
    await supabase
      .from('profiles')
      .update({
        role: row.requested_role,
        approval_status: 'approved',
        is_public: true,
        company_name: row.requested_role === 'agency' ? row.requested_role_org_name : row.company_name,
        institution_name: row.requested_role === 'government' ? row.requested_role_org_name : row.institution_name,
        website: row.requested_role_website ?? row.website,
        requested_role_status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: profile.id,
      })
      .eq('id', row.id);
    setBusyId(null);
    load();
  };

  const rejectRoleRequest = async (row: Row, reason: string) => {
    setBusyId(row.id);
    await supabase
      .from('profiles')
      .update({ requested_role_status: 'rejected', requested_role_rejection_reason: reason || null })
      .eq('id', row.id);
    setBusyId(null);
    setReasonFor(null);
    setReasonText('');
    load();
  };

  const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
    { id: 'organizations', label: 'Agencies & institutions', icon: Landmark },
    { id: 'experts', label: 'Expert applications', icon: Sparkles },
    { id: 'role-requests', label: 'Account switch requests', icon: UserRound },
  ];

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      <header className="border-b border-ink-100 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-lg font-bold text-ink-950">Admin · Approvals</h1>
          <button onClick={() => go('home')} className="text-sm font-medium text-ink-500 hover:text-ink-900">
            Back to app
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex gap-2 border-b border-ink-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold ${
                tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-400 hover:text-ink-700'
              }`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {loading && (
            <div className="grid place-items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          )}

          {!loading && rows.length === 0 && (
            <p className="py-16 text-center text-sm text-ink-400">Nothing pending here right now.</p>
          )}

          {!loading &&
            rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-ink-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
                      {tab === 'organizations' && (row.role === 'government' ? <Landmark className="h-4 w-4 text-brand-600" /> : <Building2 className="h-4 w-4 text-brand-600" />)}
                      {tab === 'experts' && <Sparkles className="h-4 w-4 text-violet-600" />}
                      {tab === 'role-requests' && (row.requested_role === 'government' ? <Landmark className="h-4 w-4 text-brand-600" /> : <Building2 className="h-4 w-4 text-brand-600" />)}
                      {tab === 'organizations' && (row.role === 'government' ? row.institution_name : row.company_name)}
                      {tab === 'experts' && (row.full_name || row.email)}
                      {tab === 'role-requests' && row.requested_role_org_name}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      {row.full_name} · {row.email}
                      {row.city ? ` · ${row.city}` : ''}
                      {row.country ? `, ${row.country}` : ''}
                    </p>
                    {tab === 'organizations' && row.institution_type && (
                      <p className="mt-1 text-xs text-ink-400">{row.institution_type}</p>
                    )}
                    {tab === 'role-requests' && (
                      <p className="mt-1 text-xs text-ink-400">
                        Requesting: {row.requested_role === 'government' ? 'Government institution' : 'Agency / Company'}
                      </p>
                    )}
                    {(row.website || row.requested_role_website) && (
                      <a
                        href={row.website || row.requested_role_website || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-brand-600 underline"
                      >
                        {row.website || row.requested_role_website}
                      </a>
                    )}
                  </div>
                  <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                    <Clock className="h-3 w-3" /> Pending
                  </span>
                </div>

                {reasonFor === row.id ? (
                  <div className="mt-4 space-y-2">
                    <textarea
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                      placeholder="Reason for rejection (shown to the applicant)"
                      className="h-20 w-full rounded-lg border border-ink-200 p-2.5 text-sm outline-none focus:border-brand-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (tab === 'organizations') rejectOrganization(row, reasonText);
                          if (tab === 'experts') rejectExpert(row, reasonText);
                          if (tab === 'role-requests') rejectRoleRequest(row, reasonText);
                        }}
                        disabled={busyId === row.id}
                        className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        Confirm rejection
                      </button>
                      <button
                        onClick={() => { setReasonFor(null); setReasonText(''); }}
                        className="text-xs font-medium text-ink-500 hover:text-ink-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => {
                        if (tab === 'organizations') approveOrganization(row);
                        if (tab === 'experts') approveExpert(row);
                        if (tab === 'role-requests') approveRoleRequest(row);
                      }}
                      disabled={busyId === row.id}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busyId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Approve
                    </button>
                    <button
                      onClick={() => setReasonFor(row.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      </main>
    </div>
  );
}
