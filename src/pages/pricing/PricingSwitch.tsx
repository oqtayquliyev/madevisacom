import { Building2, UserRound } from 'lucide-react';
import { nav } from '@/lib/pageLayout';

/** Job seekers / Employers: the two pricing pages. */
export function PricingSwitch({ active }: { active: 'seekers' | 'employers' }) {
  const tabs = [
    { id: 'seekers', label: 'For job seekers', href: '/pricing', Icon: UserRound },
    { id: 'employers', label: 'For employers', href: '/pricing/employers', Icon: Building2 },
  ] as const;
  return (
    <nav aria-label="Pricing for" className="inline-flex rounded-xl bg-ink-100 p-1">
      {tabs.map(({ id, label, href, Icon }) => (
        <a
          key={id}
          href={href}
          aria-current={active === id ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            if (active !== id) nav(href);
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${active === id ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}
        >
          <Icon className="h-4 w-4" aria-hidden /> {label}
        </a>
      ))}
    </nav>
  );
}
