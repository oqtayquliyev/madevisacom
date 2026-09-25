import { Facebook, Instagram, Linkedin } from 'lucide-react';
import { SoonChip, SOON_VIEWS } from '@/components/common/SoonChip';
import type { View } from '@/types';
import { BrandMark } from '@/components/layout/Logo';

type LandingFooterProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

const SOCIAL = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/madevisa', icon: Linkedin },
  { label: 'Instagram', href: 'https://www.instagram.com/madevisacom', icon: Instagram },
  { label: 'Facebook', href: 'https://www.facebook.com/madevisa', icon: Facebook },
];

const columns: { title: string; links: { label: string; view?: View; href?: string }[] }[] = [
  {
    title: 'Explore',
    links: [
      { label: 'Jobs', view: 'jobs' },
      { label: 'Programs', view: 'programs' },
      { label: 'Study & scholarships', view: 'study' },
      { label: 'Companies', view: 'companies' },
      { label: 'Visa experts', view: 'experts' },
    ],
  },
  {
    title: 'MadeVisa',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Post a job', view: 'submit-job' },
      { label: 'Advertise', href: 'mailto:hello@madevisa.com?subject=Advertising%20on%20MadeVisa' },
      { label: 'Official institutions', view: 'official-partners' },
    ],
  },
];

const LEGAL = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Cookies', href: '/cookies' },
  { label: 'Disclaimer', href: '/disclaimer' },
  { label: 'Advertising policy', href: '/advertising-policy' },
  { label: 'Editorial policy', href: '/editorial-policy' },
  { label: 'Verification', href: '/verification-policy' },
  { label: 'Corrections', href: '/corrections' },
];

export function LandingFooter({ go }: LandingFooterProps) {
  return (
    <footer className="border-t border-ink-800 bg-ink-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12">
        <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <BrandMark variant="footer" onClick={() => go('home')} />
            <p className="mt-3 max-w-xs text-sm leading-6 text-ink-300">Jobs, programs, study and visas from official sources — in one place.</p>
            <div className="mt-4 flex items-center gap-2.5">
              {SOCIAL.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`MadeVisa on ${label}`}
                  className="rounded-lg border border-ink-700 p-2 text-ink-400 transition hover:border-ink-500 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Two short columns, side by side even on mobile */}
          <div className="col-span-1 grid grid-cols-2 gap-6 sm:col-span-2">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">{column.title}</p>
                <ul className="mt-3 space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.view ? (
                        <button
                          onClick={() => go(link.view as View)}
                          className={`flex items-center gap-2 text-left text-sm transition hover:text-white ${SOON_VIEWS.has(link.view) ? 'text-ink-500' : 'text-ink-300'}`}
                        >
                          {link.label}
                          {SOON_VIEWS.has(link.view) && <SoonChip className="!bg-white/10 !text-ink-400" />}
                        </button>
                      ) : (
                        <a href={link.href} className="text-sm text-ink-300 transition hover:text-white">
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-ink-800 pt-5 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} MadeVisa</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1.5">
            {LEGAL.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-white">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
