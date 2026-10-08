import { describe, expect, it } from 'vitest';
import { findAtsLinks, probeRoute } from '../../../../supabase/functions/apply/forms.ts';
import { GREENHOUSE_JSON } from './forms.test';

const respond = (body: string, init: { status?: number; url?: string; json?: boolean } = {}) => {
  const r = new Response(body, { status: init.status ?? 200, headers: { 'Content-Type': init.json ? 'application/json' : 'text/html' } });
  Object.defineProperty(r, 'url', { value: init.url ?? '' });
  return r;
};

/** A pretend internet: careers pages, and the Greenhouse API behind them. */
const web = (pages: Record<string, () => Response>) => {
  const seen: string[] = [];
  const fetcher = async (input: string) => {
    seen.push(input);
    const hit = Object.entries(pages).find(([k]) => input.startsWith(k));
    return hit ? hit[1]() : respond('not found', { status: 404 });
  };
  return { fetcher, seen };
};

describe('where an application really goes', () => {
  it('finds the hiring system behind a company careers page, best first', () => {
    const html = `<a href="https://acme.wd3.myworkdayjobs.com/en-US/careers/job/123">Apply (old)</a>
      <a class="apply" href="https://job-boards.greenhouse.io/acme/jobs/4455667">Apply now</a>`;
    expect(findAtsLinks(html, 'https://acme.com/careers/designer')[0]).toBe('https://job-boards.greenhouse.io/acme/jobs/4455667');
  });

  it('reads a Greenhouse board embedded in the company’s own page (?gh_jid=)', () => {
    const html = `<div id="grnhse_app"></div><script src="https://boards.greenhouse.io/embed/job_board/js?for=nortonlifelock"></script>`;
    expect(findAtsLinks(html, 'https://careers.example.com/jobs?gh_jid=7788')).toEqual(['https://boards.greenhouse.io/nortonlifelock/jobs/7788']);
  });

  it('a company page whose Apply goes to Greenhouse: MadeVisa can send it (auto)', async () => {
    const { fetcher } = web({
      'https://acme.com/careers/designer': () => respond(`<h1>Designer</h1><a href="https://boards.greenhouse.io/acme/jobs/1001">Apply</a>`, { url: 'https://acme.com/careers/designer' }),
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs/1001': () => respond(JSON.stringify(GREENHOUSE_JSON), { json: true }),
    });
    const r = await probeRoute(fetcher, 'https://acme.com/careers/designer');
    expect(r).toMatchObject({ route: 'auto', url: 'https://boards.greenhouse.io/acme/jobs/1001', platform: 'greenhouse' });
    expect(r.questions).toBeGreaterThan(3);
  });

  it('a company page whose Apply goes to Workday: needs the person’s login', async () => {
    const { fetcher } = web({
      'https://big.example/jobs/9': () => respond(`<a href="https://big.wd5.myworkdayjobs.com/External/job/X/apply">Apply</a>`, { url: 'https://big.example/jobs/9' }),
    });
    expect((await probeRoute(fetcher, 'https://big.example/jobs/9')).route).toBe('login');
  });

  it('a page that redirects straight to Lever is read as Lever', async () => {
    const { fetcher } = web({
      'https://co.example/apply': () => respond('<p>moved</p>', { url: 'https://jobs.lever.co/co/0f6c1a3e-1111-4222-8333-944455556666' }),
      'https://jobs.lever.co/co/0f6c1a3e-1111-4222-8333-944455556666/apply': () => respond('<form><input type="file" name="resume" required><input name="name" required></form>'),
    });
    expect((await probeRoute(fetcher, 'https://co.example/apply')).route).toBe('auto');
  });

  it('gone pages are closed; pages with no hiring system are “site”; email jobs are email', async () => {
    const { fetcher } = web({ 'https://plain.example/job': () => respond('<p>Send us your CV</p>', { url: 'https://plain.example/job' }) });
    expect((await probeRoute(fetcher, 'https://gone.example/job')).route).toBe('closed');
    expect((await probeRoute(fetcher, 'https://plain.example/job')).route).toBe('site');
    expect((await probeRoute(fetcher, 'https://plain.example/job', { email: true })).route).toBe('email');
    expect((await probeRoute(fetcher, null)).route).toBe('none');
  });
});

describe('the apply function’s "routes" action', () => {
  it('follows only the jobs not followed yet, and keeps what it found', async () => {
    const { routes } = await import('../../../../supabase/functions/apply/core.ts');
    const stored: unknown[] = [];
    const { fetcher } = web({ 'https://acme.com/careers/designer': () => respond(`<a href="https://big.wd5.myworkdayjobs.com/x/job/1">Apply</a>`, { url: 'https://acme.com/careers/designer' }) });
    const deps = {
      fetch: fetcher as unknown as typeof fetch,
      getUser: async () => ({ id: 'u', email: null }),
      rpc: async (name: string, args?: Record<string, unknown>) => {
        if (name === 'apply_routes_todo') return { data: [{ id: '11111111-1111-4111-8111-111111111111', url: 'https://acme.com/careers/designer', email: false }], error: null };
        if (name === 'apply_routes_store') stored.push(args?.p_items);
        return { data: null, error: null };
      },
    };
    const res = await routes(deps, { jobs: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'nope'] });
    const body = await res.json();
    expect(body.routes).toEqual({ '11111111-1111-4111-8111-111111111111': 'login' });
    expect(stored).toHaveLength(1);
  });
});

describe('the quick 3', () => {
  it('send-able first, sign-in sites after, dead ends never', async () => {
    const { quickPicks } = await import('@/lib/apply/login');
    const facts: Record<string, { route?: 'auto' | 'email' | 'site' | 'login' | 'none' | 'closed' | null; url?: string | null }> = {
      a: { route: 'login' },
      b: { route: null, url: 'https://x.wd1.myworkdayjobs.com/j' },
      c: { route: 'none' },
      d: { route: 'site' },
      e: { route: 'auto' },
      f: { route: 'email' },
    };
    expect(quickPicks(['a', 'b', 'c', 'd', 'e', 'f'], (x) => facts[x])).toEqual(['e', 'f', 'd']);
    expect(quickPicks(['a', 'c'], (x) => facts[x])).toEqual(['a']);
  });
});
