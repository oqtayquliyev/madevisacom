import { Facebook, Instagram, Linkedin } from 'lucide-react';
import { handleNavClick } from '@/lib/navLink';
import { SoonChip, SOON_VIEWS } from '@/components/common/SoonChip';
import type { View } from '@/types';
import { BrandMark } from '@/components/layout/Logo';
import { nav } from '@/lib/pageLayout';
import { CONTACT } from '@/lib/contact';

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
      { label: 'CV match', href: '/cv-match' },
      { label: 'Insights', view: 'companies' },
      { label: 'GhostGood · Hiring feedback', view: 'feedback' },
      { label: 'Visas by Country', view: 'destinations' },
      { label: 'Recruiters', view: 'network' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Pricing for employers', href: '/pricing/employers' },
      { label: 'Sponsorship document', href: '/offers' },
      { label: 'Programs (soon)', view: 'programs' },
      { label: 'Study (soon)', view: 'study' },
    ],
  },
  {
    title: 'Insights',
    links: [
      { label: 'Job market, live', href: '/job-market' },
      { label: 'Hiring reports', href: '/blog?c=insights' },
      { label: 'Visa guides', href: '/blog?c=visas' },
      { label: 'Career guides', href: '/blog?c=guides' },
      { label: 'All articles', href: '/blog' },
    ],
  },
  {
    title: 'MadeVisa',
    links: [
      { label: 'About', href: '/about' },
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Post a job', view: 'submit-job' },
      { label: 'Employer inbox', href: '/employers/inbox' },
      { label: 'Advertise', href: '/advertising-policy' },
      { label: 'Official institutions', view: 'official-partners' },
      { label: 'Contact', href: '/contact' },
    ],
  },
];

// Real addresses for footer links, so right-click → "Open link in new tab" works.
const FOOTER_HREF: Record<string, string> = {
  jobs: '/jobs',
  programs: '/programs',
  study: '/study',
  companies: '/companies',
  feedback: '/ghostgood',
  destinations: '/destinations',
  network: '/network',
  'submit-job': '/submit-job',
  'official-partners': '/official-sources',
};

const LEGAL = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Cookies', href: '/cookies' },
  { label: 'Disclaimer', href: '/disclaimer' },
  { label: 'Advertising policy', href: '/advertising-policy' },
  { label: 'Editorial policy', href: '/editorial-policy' },
  { label: 'Verification', href: '/verification-policy' },
  { label: 'Corrections', href: '/corrections' },
  { label: 'Sponsored listings', href: '/sponsored-listing-terms' },
  { label: 'Sponsorship documents', href: '/sponsorship-document-terms' },
];

export function LandingFooter({ go }: LandingFooterProps) {
  return (
    <footer className="border-t border-ink-800 bg-ink-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_2.7fr]">
          <div>
            <BrandMark variant="footer" onClick={() => go('home')} />
            <p className="mt-3 max-w-xs text-sm leading-6 text-ink-300">Live jobs from company career pages, a match score for your CV on every one, and the sponsorship document that helps an employer say yes to a visa.</p>
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

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">{column.title}</p>
                <ul className="mt-3 space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.view ? (
                        <a
                          href={FOOTER_HREF[link.view] ?? '/'}
                          onClick={(event) => handleNavClick(event, () => go(link.view as View))}
                          className={`flex items-center gap-2 text-left text-sm transition hover:text-white ${SOON_VIEWS.has(link.view) ? 'text-ink-500' : 'text-ink-300'}`}
                        >
                          {link.label}
                          {SOON_VIEWS.has(link.view) && <SoonChip className="!bg-white/10 !text-ink-400" />}
                        </a>
                      ) : (
                        <a href={link.href} onClick={(event) => handleNavClick(event, () => nav(link.href!))} className="text-sm text-ink-300 transition hover:text-white">
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
          <p>
            © {new Date().getFullYear()} MadeVisa · {CONTACT.address} ·{' '}
            <a href={`tel:${CONTACT.tel}`} className="hover:text-white">
              {CONTACT.phone}
            </a>{' '}
            ·{' '}
            <a href={`mailto:${CONTACT.email}`} className="hover:text-white">
              {CONTACT.email}
            </a>
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1.5">
            {LEGAL.map((l) => (
              <a key={l.href} href={l.href} onClick={(event) => handleNavClick(event, () => nav(l.href))} className="hover:text-white">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
