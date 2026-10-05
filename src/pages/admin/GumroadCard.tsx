import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { dollars, manageUrl, resetCardPayments } from '@/lib/gumroad';

// Admin → Plans → Card payments.
//
// Connect the Gumroad membership once; from then on "Get Pro" opens Gumroad's
// checkout and Pro switches on and off by itself. Shown here: the connection,
// the switch for everyone, members who pay by card, and what Gumroad sent
// lately (so a payment that didn't switch Pro on can be seen and explained).
//
// Server side: the `gumroad` function and migration 20261203090000.

type Member = {
  subscription_id: string;
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
type Event = { id: number; at: string; resource: string; email: string | null; ok: boolean | null; note: string | null };
type State = {
  enabled: boolean;
  connected: boolean;
  product_url: string | null;
  product_name: string | null;
  monthly_cents: number | null;
  yearly_cents: number | null;
  hooks: number;
  connected_at: string | null;
  last_ping_at: string | null;
  last_error: string | null;
  checkouts_7d?: number;
  checkouts_unknown_7d?: number;
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
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<'connect' | 'switch' | 'disconnect' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [reconnect, setReconnect] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('gumroad_admin');
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
  const connect = async () => {
    setBusy('connect');
    setErr(null);
    setNotes([]);
    const res = await call({ action: 'connect', product_url: link.trim() || state?.product_url || '' });
    setBusy(null);
    if (typeof res.error === 'string') return setErr(res.error);
    setNotes(Array.isArray(res.warnings) ? (res.warnings as string[]) : []);
    setReconnect(false);
    setLink('');
    resetCardPayments();
    void load();
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect Gumroad? "Get Pro" goes back to the request form. People who already pay keep Pro until their paid period ends, but renewals and cancellations will no longer reach MadeVisa.')) return;
    setBusy('disconnect');
    setErr(null);
    const res = await call({ action: 'disconnect' });
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
        <strong>Card payments are not set up yet.</strong> Run the migration <span className="font-mono text-[13px]">20261203090000_gumroad_checkout.sql</span> in the Supabase SQL Editor, then this card shows how to connect Gumroad.
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
            <input type="checkbox" checked={state.enabled} disabled={busy !== null} onChange={(e) => void setEnabled(e.target.checked)} /> “Get Pro” opens the card checkout
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
      {(state.checkouts_unknown_7d ?? 0) >= 3 && (state.checkouts_unknown_7d ?? 0) * 2 > (state.checkouts_7d ?? 0) && (
        <p className="mt-3 flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> In the last 7 days the server could not tell the buyer’s country for {state.checkouts_unknown_7d} of {state.checkouts_7d} checkouts, so they were given the middle price instead of their country’s. Country prices are not working as intended; this needs a look.
        </p>
      )}

      {state.connected && !reconnect ? (
        <>
          <p className="mt-3 text-xs leading-5 text-ink-600">
            <a href={state.product_url ?? '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
              {state.product_name || 'The product'} <ExternalLink className="h-3 w-3" />
            </a>{' '}
            · {state.monthly_cents ? dollars(state.monthly_cents) : '—'} a month, {state.yearly_cents ? dollars(state.yearly_cents) : '—'} a year (list price; people in lower-income countries pay their country’s price through a one-time discount code) · connected {day(state.connected_at)} ·{' '}
            {state.last_ping_at ? `last notification from Gumroad ${when(state.last_ping_at)}` : 'no notification from Gumroad yet'}
          </p>
          {!state.enabled && (
            <p className="mt-2 rounded-md bg-ink-100 px-3 py-2 text-xs leading-5 text-ink-600">
              Try it first: open Pricing while signed in as an admin and press Get Pro; you get the card checkout, everyone else still gets the request form. Buying your own product while signed in to Gumroad as the seller is a free test purchase. Then tick the box above.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => void connect()} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50" title="Reads the prices from Gumroad again and repairs the notifications">
              {busy === 'connect' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Check the connection
            </button>
            <button onClick={() => setReconnect(true)} disabled={busy !== null} className="rounded-md px-3 py-1.5 text-xs font-semibold text-ink-500 hover:bg-ink-100">
              Use another product
            </button>
            <button onClick={() => void disconnect()} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-ink-500 hover:bg-ink-100">
              {busy === 'disconnect' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-5 text-ink-600">
            <li>
              In Gumroad, create the product: type <strong>Membership</strong>, one tier, with a monthly and a yearly price, and publish it.
            </li>
            <li>
              Gumroad → Settings → Advanced → Applications: create an application (any name; for the redirect address use https://madevisa.com) and press <strong>Generate access token</strong>.
            </li>
            <li>
              Supabase → Edge Functions → Secrets: add <span className="font-mono">GUMROAD_ACCESS_TOKEN</span> with that token, and deploy the function: <span className="font-mono">supabase functions deploy gumroad --no-verify-jwt</span>
            </li>
            <li>Paste the product’s link here and press Connect.</li>
          </ol>
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://yourname.gumroad.com/l/…" aria-label="Gumroad product link" className="min-w-[240px] flex-1 rounded-md border border-ink-200 px-3 py-2 text-sm" />
            <button disabled={busy !== null || !link.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === 'connect' && <Loader2 className="h-4 w-4 animate-spin" />} Connect
            </button>
            {reconnect && (
              <button type="button" onClick={() => setReconnect(false)} className="rounded-md px-3 py-2 text-xs font-semibold text-ink-500 hover:bg-ink-100">
                Cancel
              </button>
            )}
          </form>
        </>
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
                  {m.test && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">Test</span>}
                  {!m.linked && !m.ended_at && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800" title="Paid on Gumroad without the Get Pro button, and no MadeVisa account has this email verified. Pro switches on when they sign in with it, verify the email and press Get Pro → “Check my payment”.">
                      No account
                    </span>
                  )}
                  {mismatch && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900" title="The price was set for one country and the payment came from another. If it looks like a VPN discount, refund it in Gumroad; Pro then ends by itself.">
                      Priced for {m.priced_country}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.tone}`}>{st.label}</span>
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
