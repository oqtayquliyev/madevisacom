import { Facebook, Instagram, Linkedin, Twitter } from 'lucide-react';
import type { View } from '@/types';
import { BrandMark } from '@/components/layout/Logo';

type LandingFooterProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

const columns: { title: string; links: { label: string; view?: View; href?: string }[] }[] = [
  {
    title: 'Opportunities',
    links: [
      { label: 'Jobs abroad', view: 'jobs' },
      { label: 'Programs', view: 'programs' },
      { label: 'Study & scholarships', view: 'study' },
      { label: 'Find a visa expert', view: 'agencies' },
      { label: 'Explore destinations', view: 'explore' },
      { label: 'Official institutions', view: 'official-partners' },
    ],
  },
  {
    title: 'Travel',
    links: [
      { label: 'Stays', view: 'travel' },
      { label: 'Flights', view: 'travel' },
      { label: 'Travel packages', view: 'travel' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'For agencies', view: 'agency-profile' },
      { label: 'For advertisers', href: '/advertising-policy' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Cookie Policy', href: '/cookies' },
      { label: 'Disclaimer', href: '/disclaimer' },
      { label: 'Affiliate Disclosure', href: '/affiliate-disclosure' },
      { label: 'Editorial Policy', href: '/editorial-policy' },
      { label: 'Corrections', href: '/corrections' },
      { label: 'Verification Policy', href: '/verification-policy' },
    ],
  },
];

export function LandingFooter({ go, onAuth }: LandingFooterProps) {
  return (
    <footer className="border-t border-ink-800 bg-ink-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <BrandMark variant="footer" onClick={() => go('home')} />

            <p className="mt-4 max-w-xs text-sm leading-6 text-ink-300">
              The all-in-one opportunity library. Jobs, programs, study options,
              visas, travel and verified experts, at home or abroad, in one place.
            </p>

            <div className="mt-5 flex items-center gap-3 text-ink-400">
              <a href="#" aria-label="Facebook" className="rounded-lg border border-ink-700 p-2 transition hover:border-ink-500 hover:text-white">
                <Facebook className="h-4 w-4" />
              </a>
              <a href="#" aria-label="Instagram" className="rounded-lg border border-ink-700 p-2 transition hover:border-ink-500 hover:text-white">
                <Instagram className="h-4 w-4" />
              </a>
              <a href="#" aria-label="Twitter" className="rounded-lg border border-ink-700 p-2 transition hover:border-ink-500 hover:text-white">
                <Twitter className="h-4 w-4" />
              </a>
              <a href="#" aria-label="LinkedIn" className="rounded-lg border border-ink-700 p-2 transition hover:border-ink-500 hover:text-white">
                <Linkedin className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">{column.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.view ? (
                        <button onClick={() => go(link.view as View)} className="text-sm text-ink-300 transition hover:text-white">
                          {link.label}
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

        <div className="mt-12 flex flex-col gap-4 border-t border-ink-800 pt-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} MadeVisa. All rights reserved.</p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href="/privacy" className="hover:text-white">Privacy Policy</a>
            <a href="/terms" className="hover:text-white">Terms of Service</a>
            <button onClick={() => onAuth?.('register')} className="font-medium text-ink-300 hover:text-white">
              List your agency
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
