import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { dollars, manageUrl, resetCardPayments } from '@/lib/gumroad';
import { MEMBERSHIP_URL } from '@/lib/plans';

// Admin → Plans → Card payments.
//
// Connect the membership's Gumroad product (stored as plan 'starter', $2.29); from then on
// the checkout page sends buyers to it and the plan switches on and off by
// itself. Shown here: each plan's product and whether its price matches, the
// switch for everyone, the checkout funnel, members who pay by card, and what
// Gumroad sent lately (so a payment that didn't switch a plan on can be seen
// and explained). The old single Pro product is still read for its members.
//
// Server side: the `gumroad` function, migrations 20261203090000 and 20261219090000.

type Member = {
  subscription_id: string;
  plan?: 'starter' | 'pro';
  access_until?: string | null;
  email: string | null;
  name: string | null;
  linked: boolean;
  recurrence: string | null;
  status: string;
  price_cents: number | null;
  paid_until: string | null;
  cancel_at: string | null;
  ended_at: string | null;
  card_country: string | null;
  priced_country: string | null;
  test: boolean;
};
type PlanRow = { plan: 'starter' | 'pro'; name: string; price_cents: number; product_url: string | null; product_name: string | null; provider_price_cents: number | null; connected_at: string | null; members: number };
type Event = { id: number; at: string; resource: string; email: string | null; ok: boolean | null; note: string | null };
type Usage = { subscription_id: string; started_at: string | null; used_at: string | null; what: string | null; refundable_until: string | null };

type State = {
  enabled: boolean;
  connected: boolean;
  product_url: string | null;
  product_name: string | null;
  legacy_product_url?: string | null;
  legacy_product_name?: string | null;
  monthly_cents: number | null;
  yearly_cents: number | null;
  hooks: number;
  connected_at: string | null;
  last_ping_at: string | null;
  last_error: string | null;
  checkouts_7d?: number;
  plans?: PlanRow[];
  funnel_30d?: { plan: string; source: string; started: number; paid: number }[];
  members: Member[];
  events: Event[];
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
const STATUS: Record<string, { label: string; tone: string }> = {
  alive: { label: 'Paying', tone: 'bg-emerald-100 text-emerald-800' },
  pending_cancellation: { label: 'Cancelled, running out', tone: 'bg-amber-100 text-amber-900' },
  pending_failure: { label: 'Payment failing', tone: 'bg-amber-100 text-amber-900' },
  payment_method_update_required: { label: 'Card needs updating', tone: 'bg-amber-100 text-amber-900' },
  cancelled: { label: 'Ended', tone: 'bg-ink-100 text-ink-600' },
  failed_payment: { label: 'Ended: payment failed', tone: 'bg-ink-100 text-ink-600' },
  fixed_subscription_period_ended: { label: 'Ended', tone: 'bg-ink-100 text-ink-600' },
};
const EVENT_NAME: Record<string, string> = {
  sale: 'Payment',
  refund: 'Refund',
  dispute: 'Dispute',
  dispute_won: 'Dispute won',
  cancellation: 'Cancelled',
  subscription_updated: 'Changed',
  subscription_ended: 'Ended',
  subscription_restarted: 'Restarted',
  check: 'Checked by the member',
};

export function GumroadCard() {
  const [state, setState] = useState<State | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  // Refund terms: has the member used a paid feature yet? (migration 20261226090000_refund_usage.sql)
  const [usage, setUsage] = useState<Record<string, Usage>>({});
  const load = useCallback(async () => {
    const [{ data, error }, u] = await Promise.all([supabase.rpc('gumroad_admin'), supabase.rpc('admin_plan_usage')]);
    if (!u.error && Array.isArray(u.data)) setUsage(Object.fromEntries((u.data as Usage[]).map((x) => [x.subscription_id, x])));
    if (error) return setMissing(/function|schema cache|does not exist/i.test(error.message));
    setMissing(false);
    setState(data as State);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const call = async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    try {
      const { data, error } = await supabase.functions.invoke('gumroad', { body });
      if (error || !data) return { error: 'The gumroad function did not answer. Is it deployed? (supabase functions deploy gumroad --no-verify-jwt)' };
      return data as Record<string, unknown>;
    } catch {
      return { error: 'The gumroad function could not be reached.' };
    }
  };
  const connect = async (plan: 'starter' | 'pro', productUrl: string): Promise<boolean> => {
    setBusy(`connect:${plan}`);
    setErr(null);
    setNotes([]);
    const res = await call({ action: 'connect', plan, product_url: productUrl.trim() });
    setBusy(null);
    if (typeof res.error === 'string') {
      setErr(res.error);
      return false;
    }
    setNotes(Array.isArray(res.warnings) ? (res.warnings as string[]) : []);
    resetCardPayments();
    void load();
    return true;
  };
  const disconnect = async (plan: 'starter' | 'pro') => {
    if (!window.confirm(`Disconnect the ${plan === 'starter' ? 'membership' : 'Pro'} product? Its checkout goes back to the request form. Members who already pay keep their plan; their renewals and cancellations keep reaching MadeVisa while any product is connected.`)) return;
    setBusy(`disconnect:${plan}`);
    setErr(null);
    const res = await call({ action: 'disconnect', plan });
    setBusy(null);
    if (typeof res.error === 'string') return setErr(res.error);
    resetCardPayments();
    void load();
  };
  const setEnabled = async (on: boolean) => {
    setBusy('switch');
    setErr(null);
    const { data, error } = await supabase.rpc('gumroad_admin_enable', { p_enabled: on });
    setBusy(null);
    if (error) return setErr(error.message);
    setState(data as State);
    resetCardPayments();
  };

  if (missing) {
    return (
      <section aria-label="Card payments" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <strong>Card payments are not set up yet.</strong> Run the migrations <span className="font-mono text-[13px]">20261203090000_gumroad_checkout.sql</span> and <span className="font-mono text-[13px]">20261219090000_starter_pro_plans.sql</span> in the Supabase SQL Editor, then this card shows how to connect Gumroad.
      </section>
    );
  }
  if (!state) return null;

  const paying = state.members.filter((m) => !m.ended_at && !m.test);
  const unlinked = state.members.filter((m) => !m.linked && !m.ended_at);

  return (
    <section aria-label="Card payments" className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-ink-950">
          <CreditCard className="h-4 w-4 text-ink-400" /> Card payments · Gumroad
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${!state.connected ? 'bg-amber-100 text-amber-900' : state.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-100 text-ink-600'}`}>
          {!state.connected ? 'Not connected' : state.enabled ? 'On for everyone' : 'Connected · off (only admins see it)'}
        </span>
        {state.connected && (
          <label className="ml-auto flex items-center gap-2 text-xs font-medium text-ink-700">
            <input type="checkbox" checked={state.enabled} disabled={busy !== null} onChange={(e) => void setEnabled(e.target.checked)} /> Card checkout on for everyone
          </label>
        )}
      </div>

      {err && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{err}</p>}
      {notes.map((n) => (
        <p key={n} className="mt-3 flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {n}
        </p>
      ))}
      {state.last_error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">Last problem: {state.last_error}</p>}
      <p className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-xs leading-5 text-brand-900">
        Every “Subscribe” button on the site opens one link:{' '}
        <a href={MEMBERSHIP_URL} target="_blank" rel="noopener noreferrer" className="break-all font-mono font-semibold underline">
          {MEMBERSHIP_URL}
        </a>
        . Connect that product below so Gumroad’s payments switch the membership on.
      </p>

      {!state.connected && (
        <p className="mt-3 rounded-md bg-ink-100 px-3 py-2 text-xs leading-5 text-ink-600">
          Once: Gumroad → Settings → Advanced → Applications → create an application (redirect address https://madevisa.com) → <strong>Generate access token</strong>. Put it in Supabase → Edge Functions → Secrets as{' '}
          <span className="font-mono">GUMROAD_ACCESS_TOKEN</span>, and deploy: <span className="font-mono">supabase functions deploy gumroad --no-verify-jwt</span>. Then connect each plan below.
        </p>
      )}
      <div className="mt-3 grid gap-3">
        {/* One product: the membership ('starter'). Members of retired plans keep theirs on the server; nothing to manage here. */}
        {(state.plans ?? []).filter((p) => p.plan === 'starter').map((p) => (
          <PlanProduct key={p.plan} p={p} busy={busy} onConnect={(url) => connect(p.plan, url)} onDisconnect={() => void disconnect(p.plan)} />
        ))}
      </div>
      {!(state.plans ?? []).length && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Run the migrations 20261219090000_starter_pro_plans.sql and 20261231090000_single_membership_guest_checkout.sql to sell the membership.</p>}
      {state.connected && !state.enabled && (
        <p className="mt-3 rounded-md bg-ink-100 px-3 py-2 text-xs leading-5 text-ink-600">
          Try it first: open /checkout while signed in as an admin; you go straight to Gumroad. Guests (the paywall) can pay only once card payments are on for everyone. Buying your own product while signed in to Gumroad as the seller is a free test purchase. Then tick the box above.
        </p>
      )}
      <p className="mt-2 text-xs leading-5 text-ink-500">{state.last_ping_at ? `Last notification from Gumroad ${when(state.last_ping_at)}.` : 'No notification from Gumroad yet.'}</p>

      {(state.funnel_30d ?? []).length > 0 && (
        <div className="mt-4 border-t border-ink-100 pt-3">
          <p className="text-xs font-semibold text-ink-500">Checkouts, last 30 days (people who opened Gumroad’s checkout → paid)</p>
          <table className="mt-1 w-full text-left text-xs">
            <thead>
              <tr className="text-ink-400">
                <th className="py-1 font-semibold">Plan</th>
                <th className="py-1 font-semibold">From</th>
                <th className="py-1 text-right font-semibold">Started</th>
                <th className="py-1 text-right font-semibold">Paid</th>
                <th className="py-1 text-right font-semibold">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-ink-700">
              {state.funnel_30d!.map((f) => (
                <tr key={`${f.plan}-${f.source}`}>
                  <td className="py-1 capitalize">{f.plan}</td>
                  <td className="py-1">{f.source.replace(/_/g, ' ')}</td>
                  <td className="py-1 text-right tabular-nums">{f.started}</td>
                  <td className="py-1 text-right tabular-nums">{f.paid}</td>
                  <td className="py-1 text-right tabular-nums">{f.started ? `${Math.round((f.paid / f.started) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.members.length > 0 && (
        <div className="mt-4 border-t border-ink-100 pt-3">
          <p className="text-xs font-semibold text-ink-500">
            Members paying by card · {paying.length}
            {unlinked.length ? ` · ${unlinked.length} paid without a matching account` : ''}
          </p>
          <ul className="mt-1 divide-y divide-ink-100 text-sm">
            {state.members.map((m) => {
              const st = STATUS[m.status] ?? { label: m.status, tone: 'bg-ink-100 text-ink-600' };
              const mismatch = m.priced_country && m.card_country && m.priced_country !== m.card_country;
              return (
                <li key={m.subscription_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0 flex-1 basis-full sm:basis-0">
                    <span className="block truncate font-medium text-ink-900">{m.name || m.email || 'A buyer'}</span>
                    <span className="block truncate text-xs text-ink-500">
                      {[m.name ? m.email : null, m.price_cents != null ? `${dollars(m.price_cents)} ${m.recurrence === 'yearly' ? 'a year' : 'a month'}` : m.recurrence, m.card_country ? `paid from ${m.card_country}` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.plan === 'starter' ? 'bg-sky-100 text-sky-800' : 'bg-brand-100 text-brand-800'}`}>{m.plan === 'starter' ? 'Starter' : 'Pro'}</span>
                  {m.test && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">Test</span>}
                  {!m.linked && !m.ended_at && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800" title="Paid on Gumroad without MadeVisa’s checkout, and no MadeVisa account has this email verified. The plan switches on when they sign in with it, verify the email and press “Check my payment” (checkout page or Settings → Billing).">
                      No account
                    </span>
                  )}
                  {mismatch && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900" title="Old Pro product: the price was set for one country and the payment came from another. If it looks like a VPN discount, refund it in Gumroad; Pro then ends by itself.">
                      Priced for {m.priced_country}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.tone}`}>{st.label}</span>
                  {(() => {
                    const u = usage[m.subscription_id];
                    if (!u || m.ended_at) return null;
                    if (u.used_at)
                      return (
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700" title={`First paid feature used: ${u.what ?? 'a paid feature'}, ${day(u.used_at)}. Under the Subscription Terms this month is not refundable.`}>
                          Used {day(u.used_at)} · no refund
                        </span>
                      );
                    if (u.refundable_until && new Date(u.refundable_until) > new Date())
                      return (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800" title="No paid feature used yet: a full refund is due if they ask before this date (Subscription Terms).">
                          Not used · refundable until {day(u.refundable_until)}
                        </span>
                      );
                    return null;
                  })()}
                  <span className="ml-auto text-right text-xs tabular-nums text-ink-500 sm:ml-0 sm:w-36">{m.ended_at ? `ended ${day(m.ended_at)}` : m.cancel_at ? `until ${day(m.cancel_at)}` : `paid until ${day(m.paid_until)}`}</span>
                  <a href={manageUrl(m.subscription_id)} target="_blank" rel="noopener noreferrer" className="text-ink-400 hover:text-brand-700" title="Open on Gumroad" aria-label="Open on Gumroad">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {state.events.length > 0 && (
        <details className="mt-3 border-t border-ink-100 pt-3">
          <summary className="cursor-pointer text-xs font-semibold text-ink-500">What Gumroad sent lately · {state.events.length}</summary>
          <ul className="mt-2 space-y-1.5 text-xs">
            {state.events.map((e) => (
              <li key={e.id} className="flex gap-2">
                {e.ok === false ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" /> : e.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />}
                <span className="min-w-0 flex-1 text-ink-700">
                  <strong className="font-semibold text-ink-900">{EVENT_NAME[e.resource] ?? e.resource}</strong> · {e.note ?? 'Received; being handled.'}
                </span>
                <span className="shrink-0 tabular-nums text-ink-400">{when(e.at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const MEMBERSHIP_PRODUCT = MEMBERSHIP_URL.split('?')[0];
const isMembershipLink = (url: string | null) => Boolean(url && /\/l\/membership(\b|$|\?)/.test(url));

/** One plan's Gumroad product: connected or not, and whether Gumroad charges the plan's price. */
function PlanProduct({ p, busy, onConnect, onDisconnect }: { p: PlanRow; busy: string | null; onConnect: (url: string) => Promise<boolean>; onDisconnect: () => void }) {
  const [link, setLink] = useState(MEMBERSHIP_PRODUCT);
  const [editing, setEditing] = useState(false);
  const connected = Boolean(p.connected_at && p.product_url);
  const priceOk = p.provider_price_cents === p.price_cents;
  const name = p.plan === 'starter' ? 'MadeVisa Membership' : 'Pro (retired — not sold, members keep it)';
  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-ink-950">
          {name} · {dollars(p.price_cents)} a month
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${!connected ? 'bg-amber-100 text-amber-900' : priceOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
          {!connected ? 'Not connected' : priceOk ? 'Connected' : 'Price on Gumroad differs — checkout off'}
        </span>
        {connected && <span className="text-xs text-ink-500">{p.members} active</span>}
      </div>
      {connected && !editing ? (
        <>
          <p className="mt-1.5 text-xs leading-5 text-ink-600">
            <a href={p.product_url ?? '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
              {p.product_name || 'The product'} <ExternalLink className="h-3 w-3" />
            </a>{' '}
            · Gumroad charges {p.provider_price_cents != null ? dollars(p.provider_price_cents) : '—'} a month · connected {day(p.connected_at)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => void onConnect(p.product_url ?? '')} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50" title="Reads the product from Gumroad again and repairs the notifications">
              {busy === `connect:${p.plan}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Check the connection
            </button>
            {!isMembershipLink(p.product_url) && (
              <button onClick={() => void onConnect(MEMBERSHIP_PRODUCT)} disabled={busy !== null} className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                Connect madevisa.gumroad.com/l/membership instead
              </button>
            )}
            <button onClick={onDisconnect} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-ink-500 hover:bg-ink-100">
              {busy === `disconnect:${p.plan}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-ink-600">
            <li>
              The product is <strong>madevisa.gumroad.com/l/membership</strong>: a <strong>Membership</strong> with one tier at a <strong>monthly price of {dollars(p.price_cents)}</strong>. Switch Gumroad’s purchasing-power discount off for it. Publish it.
            </li>
            <li>Optional: in the product’s content, add a button to https://madevisa.com/checkout/complete so buyers can come back.</li>
            <li>Press Connect (the link is already filled in).</li>
          </ol>
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void onConnect(link).then((ok) => {
                if (ok) {
                  setLink(MEMBERSHIP_PRODUCT);
                  setEditing(false);
                }
              });
            }}
          >
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://yourname.gumroad.com/l/…" aria-label={`Gumroad product link for ${name}`} className="min-w-[200px] flex-1 rounded-md border border-ink-200 px-3 py-2 text-sm" />
            <button disabled={busy !== null || !link.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === `connect:${p.plan}` && <Loader2 className="h-4 w-4 animate-spin" />} Connect
            </button>
            {editing && (
              <button type="button" onClick={() => setEditing(false)} className="rounded-md px-3 py-2 text-xs font-semibold text-ink-500 hover:bg-ink-100">
                Cancel
              </button>
            )}
          </form>
        </>
      )}
    </div>
  );
}
