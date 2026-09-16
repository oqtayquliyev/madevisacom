import { useState } from 'react';
import {
  Briefcase,
  Building2,
  ChevronDown,
  GraduationCap,
  LayoutDashboard,
  LogIn,
  LogOut,
  Luggage,
  MapPin,
  Menu,
  Plane,
  ShieldCheck,
  User,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { handleNavClick } from '@/lib/navLink';
import type { View } from '@/types';
import { BrandMark } from '@/components/layout/Logo';
import { TravelerAvatar } from '@/components/common/TravelerAvatar';

type LandingHeaderProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
  active?: View;
};

const primaryLinks: { view: View; label: string; icon: typeof Briefcase }[] = [
  { view: 'programs', label: 'Programs', icon: GraduationCap },
  { view: 'jobs', label: 'Jobs', icon: Briefcase },
];

const travelLinks: { label: string; description: string; icon: typeof Plane; view: View }[] = [
  { label: 'Stays', description: 'Hotels, apartments & rooms', icon: Building2, view: 'travel' },
  { label: 'Flights', description: 'Compare fares for your route', icon: Plane, view: 'travel' },
];

export function LandingHeader({ go, onAuth, active }: LandingHeaderProps) {
  const { profile, signOut } = useAuth();
  const [openMenu, setOpenMenu] = useState(false);
  const [openTravel, setOpenTravel] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);

  const linkClass = (view: View) =>
    `flex items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
      active === view ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <BrandMark onClick={() => go('home')} />

        <nav
          className={`${
            openMenu
              ? 'absolute left-4 right-4 top-16 z-50 flex flex-col border border-ink-200 bg-white p-3 shadow-xl'
              : 'hidden'
          } gap-1 md:static md:z-auto md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none`}
        >
          {primaryLinks.map((link) => {
            const Icon = link.icon;
            return (
              <button key={link.view} onClick={() => { go(link.view); setOpenMenu(false); }} className={linkClass(link.view)}>
                <Icon className="h-3.5 w-3.5" />
                {link.label}
              </button>
            );
          })}

          <div
            className="relative"
            onMouseEnter={() => setOpenTravel(true)}
            onMouseLeave={() => setOpenTravel(false)}
          >
            <button
              type="button"
              onClick={() => go('travel')}
              className={`flex items-center gap-1 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                active === 'travel' ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50'
              }`}
            >
              <Luggage className="h-3.5 w-3.5" />
              Flights &amp; Stays
              <ChevronDown className={`h-3.5 w-3.5 transition ${openTravel ? 'rotate-180' : ''}`} />
            </button>

            <div
              className={`${
                openTravel ? 'md:block' : 'md:hidden'
              } static mt-1 flex flex-col gap-1 border border-ink-100 bg-white p-2 shadow-xl md:absolute md:left-0 md:top-full md:w-64 md:border`}
            >
              {travelLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => { go(item.view); setOpenMenu(false); setOpenTravel(false); }}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-ink-50"
                  >
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink-900">{item.label}</span>
                      <span className="block text-xs text-ink-500">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <a
            href="/experts"
            onClick={(event) => handleNavClick(event, () => { go('experts'); setOpenMenu(false); })}
            className={linkClass('experts')}
          >
            <Users className="h-3.5 w-3.5" />
            Agencies &amp; Experts
          </a>

          <a
            href="/destinations"
            onClick={(event) => handleNavClick(event, () => { go('destinations'); setOpenMenu(false); })}
            className={linkClass('destinations')}
          >
            <MapPin className="h-3.5 w-3.5" />
            Destinations
          </a>

          <div className="my-1 h-px bg-ink-100 md:hidden" />

          <div className="flex items-center gap-1 text-xs text-ink-400 md:hidden">
            <GraduationCap className="h-3.5 w-3.5" />
            <Briefcase className="h-3.5 w-3.5" />
            More opportunities added every week
          </div>
        </nav>

        <div className="flex items-center gap-2">
          {!profile && (
            <>
              <a
                href="/login"
                onClick={(event) => handleNavClick(event, () => onAuth?.('login'))}
                className="hidden px-3 py-2 text-sm text-ink-600 sm:block"
              >
                Sign in
              </a>

              <a
                href="/register"
                onClick={(event) => handleNavClick(event, () => onAuth?.('register'))}
                className="hidden rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:block"
              >
                Get started
              </a>
            </>
          )}

          {/* Profile / guest menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenProfile((v) => !v)}
              aria-label="Account menu"
              className={`grid place-items-center rounded-full transition ${
                profile
                  ? 'h-9 w-9 ring-2 ring-transparent hover:ring-brand-200'
                  : 'h-9 w-9 border border-ink-200 bg-ink-50 text-ink-500 hover:border-brand-300 hover:text-brand-600'
              }`}
            >
              {profile ? <TravelerAvatar seed={profile.id} size={36} /> : <User className="h-4 w-4" />}
            </button>

            {openProfile && (
              <>
                <button type="button" aria-label="close" onClick={() => setOpenProfile(false)} className="fixed inset-0 z-30" />
                <div className="absolute right-0 top-full z-40 mt-2 w-56 border border-ink-200 bg-white p-1.5 shadow-xl">
                  <div className="flex items-center gap-3 px-3 py-2">
                    {profile && <TravelerAvatar seed={profile.id} size={32} />}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                        {profile ? 'Account' : 'Guest'}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-ink-900">
                        {profile ? profile.full_name ?? profile.email : 'Browsing as guest'}
                      </p>
                    </div>
                  </div>
                  <div className="my-1 h-px bg-ink-100" />

                  {profile ? (
                    <>
                      <button
                        onClick={() => { go('profile'); setOpenProfile(false); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                      >
                        <UserRound className="h-4 w-4 text-ink-400" />
                        My profile
                      </button>
                      <button
                        onClick={() => { go('dashboard'); setOpenProfile(false); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                      >
                        <LayoutDashboard className="h-4 w-4 text-ink-400" />
                        Dashboard
                      </button>
                      {profile.role === 'admin' && (
                        <button
                          onClick={() => { go('admin'); setOpenProfile(false); }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                        >
                          <ShieldCheck className="h-4 w-4 text-ink-400" />
                          Admin panel
                        </button>
                      )}
                      <button
                        onClick={() => { signOut(); setOpenProfile(false); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </>
                  ) : (
                    <>
                      <a
                        href="/login"
                        onClick={(event) => handleNavClick(event, () => { onAuth?.('login'); setOpenProfile(false); })}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                      >
                        <LogIn className="h-4 w-4 text-ink-400" />
                        Sign in
                      </a>
                      <a
                        href="/register"
                        onClick={(event) => handleNavClick(event, () => { onAuth?.('register'); setOpenProfile(false); })}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                      >
                        <UserPlus className="h-4 w-4 text-ink-400" />
                        Create account
                      </a>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setOpenMenu(!openMenu)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-ink-200 md:hidden"
            aria-label="Toggle navigation"
          >
            {openMenu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
