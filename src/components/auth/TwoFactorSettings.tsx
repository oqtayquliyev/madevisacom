import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { listTotpFactors, removeTotp, startTotpSetup, verifyTotpCode, type TotpFactor } from '@/lib/mfa';

/**
 * Profile → Settings: turn on two-step login with an authenticator app
 * (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).
 */
export function TwoFactorSettings({ isAdmin }: { isAdmin: boolean }) {
  const [factors, setFactors] = useState<TotpFactor[] | null>(null);
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  const load = () => listTotpFactors().then(({ verified }) => setFactors(verified));
  useEffect(() => {
    load();
  }, []);

  const begin = async () => {
    setBusy(true);
    setError(null);
    const res = await startTotpSetup();
    setBusy(false);
    if (res.ok) setSetup({ factorId: res.factorId, qr: res.qr, secret: res.secret });
    else setError(res.error);
  };

  const confirm = async () => {
    if (!setup) return;
    setBusy(true);
    setError(null);
    const res = await verifyTotpCode(setup.factorId, code);
    setBusy(false);
    if (res.ok) {
      setSetup(null);
      setCode('');
      setJustEnabled(true);
      load();
    } else setError(res.error ?? 'Could not verify.');
  };

  const turnOff = async (f: TotpFactor) => {
    if (!window.confirm(isAdmin ? 'Turn off two-step login? Your admin account will then be protected by the password only.' : 'Turn off two-step login?')) return;
    setBusy(true);
    setError(null);
    const res = await removeTotp(f.id);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Could not turn it off.');
    setJustEnabled(false);
    load();
  };

  const enabled = (factors?.length ?? 0) > 0;

  return (
    <section className="rounded-md border border-ink-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
            Two-step login
            {enabled && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">On</span>}
          </h2>
          <p className="mt-1 max-w-lg text-xs leading-5 text-ink-500">
            After your password, MadeVisa asks for a 6-digit code from an authenticator app on your phone — so a leaked password alone can't get into your account.
            {isAdmin && <strong className="text-ink-700"> For admins, admin access only works after the code.</strong>}
          </p>
        </div>
        <ShieldCheck className={`h-6 w-6 shrink-0 ${enabled ? 'text-emerald-600' : 'text-ink-300'}`} />
      </div>

      {isAdmin && factors !== null && !enabled && !setup && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Recommended now: this is an admin account. Until two-step login is on, anyone with your password has full admin access.
        </p>
      )}

      {factors === null ? (
        <Loader2 className="mt-4 h-4 w-4 animate-spin text-ink-300" />
      ) : enabled ? (
        <div className="mt-4 space-y-2">
          {justEnabled && (
            <p className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Two-step login is on. Next time you sign in, have your phone ready.
            </p>
          )}
          {factors.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-md border border-ink-100 px-3 py-2.5 text-sm">
              <Smartphone className="h-4 w-4 text-ink-400" />
              <span className="min-w-0 flex-1 truncate text-ink-700">{f.friendly_name || 'Authenticator app'}</span>
              <span className="text-[11px] text-ink-400">added {new Date(f.created_at).toLocaleDateString()}</span>
              <button onClick={() => turnOff(f)} disabled={busy} className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50">
                Turn off
              </button>
            </div>
          ))}
        </div>
      ) : setup ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr]">
          <div className="grid place-items-center rounded-md border border-ink-200 bg-white p-2">
            <img src={setup.qr} alt="QR code for your authenticator app" className="h-40 w-40" />
          </div>
          <div className="text-sm">
            <ol className="space-y-2 text-xs leading-5 text-ink-600">
              <li>
                <strong className="text-ink-900">1.</strong> Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy or 1Password) and scan this QR code.
              </li>
              <li>
                <strong className="text-ink-900">2.</strong> Can't scan? Enter this key instead:
                <span className="mt-1 flex items-center gap-2">
                  <code className="break-all rounded bg-ink-50 px-2 py-1 font-mono text-[11px] text-ink-800">{setup.secret}</code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(setup.secret);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    }}
                    className="shrink-0 text-ink-400 hover:text-ink-700"
                    aria-label="Copy key"
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </span>
              </li>
              <li>
                <strong className="text-ink-900">3.</strong> Enter the 6-digit code the app shows:
              </li>
            </ol>
            <div className="mt-2 flex gap-2">
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && confirm()}
                placeholder="000000"
                className="h-10 w-32 rounded-md border border-ink-200 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <button
                onClick={confirm}
                disabled={busy || code.length !== 6}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Turn on
              </button>
              <button onClick={() => setSetup(null)} className="px-2 text-xs font-medium text-ink-500 hover:text-ink-800">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={begin}
          disabled={busy}
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Set up authenticator app
        </button>
      )}

      {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
    </section>
  );
}
