// Resend → MadeVisa: delivery, bounce, complaint and click events.
// Pure part (signature check and the handler), shared with the tests.
//
// Resend signs webhooks the Svix way:
//   headers svix-id, svix-timestamp, svix-signature ("v1,<base64> v1,<base64>")
//   signature = HMAC-SHA256(base64-decoded secret after "whsec_", `${id}.${timestamp}.${body}`)
// Events older or newer than 5 minutes are refused (replays).

export type Deps = {
  secret: string | undefined;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  now?: () => number;
};

const HANDLED = new Set(['email.delivered', 'email.bounced', 'email.complained', 'email.clicked']);

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The base64 signature Svix would send for this message. */
export async function sign(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', b64ToBytes(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToB64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
}

export async function verify(secret: string, headers: Headers, body: string, nowMs: number): Promise<boolean> {
  const id = headers.get('svix-id') ?? headers.get('webhook-id') ?? '';
  const ts = headers.get('svix-timestamp') ?? headers.get('webhook-timestamp') ?? '';
  const sigs = headers.get('svix-signature') ?? headers.get('webhook-signature') ?? '';
  if (!id || !/^\d{9,11}$/.test(ts) || !sigs) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > 300) return false;
  let expected: string;
  try {
    expected = await sign(secret, id, ts, body);
  } catch {
    return false;
  }
  return sigs.split(' ').some((part) => {
    const [v, sig] = part.split(',');
    return v === 'v1' && typeof sig === 'string' && sameString(sig, expected);
  });
}

export function makeHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (!deps.secret) return new Response('RESEND_WEBHOOK_SECRET is not set', { status: 500 });
    const body = await req.text();
    if (body.length > 200_000) return new Response('Too large', { status: 413 });
    if (!(await verify(deps.secret, req.headers, body, (deps.now ?? Date.now)()))) return new Response('Bad signature', { status: 401 });
    let event: { type?: string; created_at?: string; data?: Record<string, unknown> };
    try {
      event = JSON.parse(body);
    } catch {
      return new Response('Bad JSON', { status: 400 });
    }
    const type = String(event.type ?? '');
    if (!HANDLED.has(type)) return new Response('ignored', { status: 200 });
    // Only what the database needs: no email content.
    const data = event.data ?? {};
    const p = {
      id: req.headers.get('svix-id') ?? req.headers.get('webhook-id'),
      type,
      created_at: event.created_at ?? null,
      data: { email_id: data.email_id ?? null, to: Array.isArray(data.to) ? data.to.slice(0, 1) : [], bounce: data.bounce ?? null },
    };
    const res = await deps.rpc('email_provider_event', { p });
    // 500 makes Resend retry later; the database applies each event once.
    if (res.error) return new Response('Not applied', { status: 500 });
    return new Response(String(res.data ?? 'ok'), { status: 200 });
  };
}
