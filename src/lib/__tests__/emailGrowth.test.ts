import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(() => Promise.resolve({ data: true, error: null })), auth: { getSession: () => Promise.resolve({ data: { session: null } }) } } }));

import { makeHandler, sign, verify } from '../../../supabase/functions/resend-webhook/core.ts';
import { readEmailParams, stripEmailParams } from '../emailAttribution';

const SECRET = 'whsec_' + btoa('a-test-secret-of-some-length!!');
const NOW = 1_800_000_000_000;

async function signedRequest(body: string, opts: { ts?: number; secret?: string; id?: string } = {}) {
  const ts = String(Math.floor((opts.ts ?? NOW) / 1000));
  const id = opts.id ?? 'msg_1';
  const sig = await sign(opts.secret ?? SECRET, id, ts, body);
  return new Request('https://x/functions/v1/resend-webhook', {
    method: 'POST',
    body,
    headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` },
  });
}

describe('Resend webhook', () => {
  it('accepts a correctly signed event and passes only what the database needs', async () => {
    const rpc = vi.fn(async () => ({ data: 'applied', error: null }));
    const h = makeHandler({ secret: SECRET, rpc, now: () => NOW });
    const body = JSON.stringify({ type: 'email.bounced', created_at: 'x', data: { email_id: 'e1', to: ['a@b.com', 'c@d.com'], subject: 'secret subject', bounce: { type: 'Permanent' } } });
    const res = await h(await signedRequest(body));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('email_provider_event', { p: { id: 'msg_1', type: 'email.bounced', created_at: 'x', data: { email_id: 'e1', to: ['a@b.com'], bounce: { type: 'Permanent' } } } });
  });

  it('refuses a wrong signature, a wrong secret and an old timestamp', async () => {
    const rpc = vi.fn(async () => ({ data: 'applied', error: null }));
    const h = makeHandler({ secret: SECRET, rpc, now: () => NOW });
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'e1' } });
    const tampered = await signedRequest(body);
    expect((await h(new Request(tampered.url, { method: 'POST', body: body + ' ', headers: tampered.headers }))).status).toBe(401);
    expect((await h(await signedRequest(body, { secret: 'whsec_' + btoa('another-secret') }))).status).toBe(401);
    expect((await h(await signedRequest(body, { ts: NOW - 10 * 60_000 }))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('ignores events it does not use, and asks for a retry when the database fails', async () => {
    const h1 = makeHandler({ secret: SECRET, rpc: async () => ({ data: null, error: null }), now: () => NOW });
    expect(await (await h1(await signedRequest(JSON.stringify({ type: 'email.opened', data: {} })))).text()).toBe('ignored');
    const h2 = makeHandler({ secret: SECRET, rpc: async () => ({ data: null, error: { message: 'down' } }), now: () => NOW });
    expect((await h2(await signedRequest(JSON.stringify({ type: 'email.delivered', data: { email_id: 'e' } })))).status).toBe(500);
  });

  it('verify() checks every v1 signature given', async () => {
    const body = '{}';
    const ts = String(NOW / 1000);
    const good = await sign(SECRET, 'm', ts, body);
    const headers = new Headers({ 'svix-id': 'm', 'svix-timestamp': ts, 'svix-signature': `v1,AAAA v1,${good}` });
    expect(await verify(SECRET, headers, body, NOW)).toBe(true);
  });
});

describe('email link parameters', () => {
  it('reads a valid token and template, rejects anything else', () => {
    expect(readEmailParams('https://madevisa.com/jobs?q=x&s=auto&mc=auto_seeker_1.b&mt=0123456789abcdef0123')).toEqual({ mt: '0123456789abcdef0123', mc: 'auto_seeker_1.b' });
    expect(readEmailParams('https://madevisa.com/?mt=<script>&mc=x.c')).toEqual({ mt: null, mc: null });
  });

  it('removes only mc and mt, keeping the rest and the anchor', () => {
    expect(stripEmailParams('https://madevisa.com/pricing?s=aa1&mc=nurture_1.a&mt=0123456789abcdef0123#pro')).toBe('/pricing?s=aa1#pro');
    expect(stripEmailParams('https://madevisa.com/cv-match?mt=0123456789abcdef0123')).toBe('/cv-match');
  });
});
