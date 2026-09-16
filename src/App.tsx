import { useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { LandingPage } from '@/pages/landing/LandingPage';
import { AgencyDashboard } from '@/pages/agency/AgencyDashboard';
import { AgencyProfilePage } from '@/pages/agency/AgencyProfilePage';
import { AgenciesPage } from '@/pages/agencies/AgenciesPage';
import { CustomerDashboard } from '@/pages/customer/CustomerDashboard';
import { TripWorkspace } from '@/pages/customer/TripWorkspace';
import { ExplorePage } from '@/pages/explore/ExplorePage';
import { PlannerPage } from '@/pages/planner/PlannerPage';
import { ResultsPage } from '@/pages/results/ResultsPage';
import { JobsPage } from '@/pages/landing/jobs/JobsPage';
import { ProgramsPage } from '@/pages/landing/programs/ProgramsPage';
import { SponsoredProgramsPage } from '@/pages/programs/SponsoredProgramsPage';
import { ExpertsMarketplacePage } from '@/pages/experts/ExpertsMarketplacePage';
import { DestinationsPage } from '@/pages/destinations/DestinationsPage';
import { SubmitProgramPage } from '@/pages/programs/SubmitProgramPage';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import { PendingConfirmationPage } from '@/pages/auth/PendingConfirmationPage';
import type { PendingSignup } from '@/pages/auth/RegisterPage';
import { WelcomeModal } from '@/components/common/WelcomeModal';
import { TravelPage } from '@/pages/travel/TravelPage';
import type { View } from '@/types';

type AuthPage = 'login' | 'register' | 'reset-password' | 'pending-confirmation';

// Single source of truth for View <-> URL path, used by both `go()`
// (pushes history so the URL bar/back button reflect the app state)
// and the popstate listener below (keeps state in sync when the user
// actually uses the browser's back/forward buttons).
const pathForView: Partial<Record<View, string>> = {
  home: '/',
  jobs: '/jobs',
  programs: '/programs',
  'sponsored-programs': '/sponsored-programs',
  'submit-program': '/submit-program',
  travel: '/travel',
  profile: '/profile',
  experts: '/experts',
  destinations: '/destinations',
};

const authPathToPage: Record<string, AuthPage> = {
  '/login': 'login',
  '/register': 'register',
  '/reset-password': 'reset-password',
};

function viewForPath(pathname: string): View | null {
  const entry = Object.entries(pathForView).find(([, path]) => path === pathname);
  return entry ? (entry[0] as View) : null;
}

export default function App() {
  const { session, profile, loading } = useAuth();

  const [view, setView] = useState<View>(
    viewForPath(window.location.pathname) ?? 'home'
  );

  const [authPage, setAuthPage] = useState<AuthPage>(
    authPathToPage[window.location.pathname] ?? 'login'
  );

  const [pendingSignup, setPendingSignup] = useState<PendingSignup | null>(null);

  const showPendingConfirmation = (info: PendingSignup) => {
    setPendingSignup(info);
    setAuthPage('pending-confirmation');
  };

  const go = (next: View) => {
    setView(next);
    const path = pathForView[next];
    if (path && path !== window.location.pathname) {
      window.history.pushState({}, '', path);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToAuth = (page: AuthPage) => {
    setAuthPage(page);

    // Clear the "sticky" current-page state — otherwise a public page
    // like /programs or /jobs keeps rendering itself even after the
    // URL changes to /login or /register, since those pages are
    // matched by `view` as well as by pathname.
    setView('home');

    const path =
      page === 'login' ? '/login' : page === 'register' ? '/register' : page === 'reset-password' ? '/reset-password' : null;
    if (path) window.history.pushState({}, '', path);
  };

  // Keep `view`/`authPage` in sync when the visitor uses the browser's
  // actual back/forward buttons, since pushState alone only updates the
  // URL bar — without this, clicking "back" changes the address but
  // leaves the previously-rendered page on screen.
  useEffect(() => {
    const onPopState = () => {
      const pathname = window.location.pathname;
      const matchedAuthPage = authPathToPage[pathname];
      if (matchedAuthPage) {
        setAuthPage(matchedAuthPage);
        return;
      }
      setView(viewForPath(pathname) ?? 'home');
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);


  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center gap-4 bg-[#f7f9fc]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="text-xs font-medium text-ink-400 underline hover:text-ink-700"
        >
          Taking too long? Sign out and try again
        </button>
      </div>
    );
  }

  if (window.location.pathname === '/jobs') {
    return <JobsPage go={go} onAuth={goToAuth} />;
  }

  if (window.location.pathname === '/programs') {
    return <ProgramsPage go={go} onAuth={goToAuth} />;
  }

  if (window.location.pathname === '/sponsored-programs') {
    return <SponsoredProgramsPage go={go} onAuth={goToAuth} />;
  }

  if (window.location.pathname === '/submit-program') {
    return <SubmitProgramPage go={go} onAuth={goToAuth} />;
  }

  if (window.location.pathname === '/travel') {
    return <TravelPage go={go} onAuth={goToAuth} />;
  }

  if (window.location.pathname === '/experts') {
    return <ExpertsMarketplacePage go={go} onAuth={goToAuth} />;
  }

  if (window.location.pathname === '/destinations') {
    return <DestinationsPage go={go} onAuth={goToAuth} />;
  }

  // Checked ahead of the !session branch below: Supabase's password
  // recovery link establishes a session as soon as it redirects back
  // here, so gating this on "no session" would skip straight past the
  // "set a new password" form into the logged-in app.
  if (window.location.pathname === '/reset-password') {
    return <ResetPasswordPage onHome={() => go('home')} onSwitchToLogin={() => goToAuth('login')} />;
  }

  if (!session) {
    if (
      window.location.pathname !== '/login' &&
      window.location.pathname !== '/register'
    ) {
      return (
        <LandingPage
          go={go}
          onAuth={goToAuth}
        />
      );
    }

    if (authPage === 'reset-password') {
      // Unreachable in practice (handled above), kept as a safe fallback.
      return <ResetPasswordPage onHome={() => go('home')} onSwitchToLogin={() => goToAuth('login')} />;
    }

    if (authPage === 'pending-confirmation' && pendingSignup) {
      return <PendingConfirmationPage info={pendingSignup} go={go} onAuth={goToAuth} />;
    }

    return authPage === 'login' ? (
      <LoginPage
        onSwitchToRegister={() => goToAuth('register')}
        onHome={() => go('home')}
      />
    ) : (
      <RegisterPage
        onSwitchToLogin={() => goToAuth('login')}
        onHome={() => go('home')}
        onPendingConfirmation={showPendingConfirmation}
      />
    );
  }

  if (!profile) {
    return <ProfileMissingScreen />;
  }

  const role = profile.role;

  const withWelcome = (node: ReactNode) => (
    <>
      {node}
      <WelcomeModal go={go} />
    </>
  );

if (
  view === 'home' ||
  view === 'planner' ||
  view === 'results' ||
  view === 'agencies' ||
  view === 'explore' ||
  view === 'profile'
) {
  return withWelcome(renderPublicView(view, go));
}

  if (
    view === 'customer-dashboard' ||
    view === 'trip-workspace'
  ) {
    if (
      role === 'agency' ||
      role === 'admin'
    ) {
      return withWelcome(renderRoleHome(role, go));
    }

    return withWelcome(renderPublicView(view, go));
  }

  if (
    view === 'agency-dashboard' ||
    view === 'agency-profile'
  ) {
    if (role === 'customer') {
      return withWelcome(renderPublicView(
        'customer-dashboard',
        go
      ));
    }

    return withWelcome(renderPublicView(view, go));
  }

  if (role === 'admin') {
    return withWelcome(
      <AgencyDashboard
        view="agency-dashboard"
        go={go}
      />
    );
  }

  return withWelcome(renderPublicView('home', go));
}

function renderPublicView(
  view: View,
  go: (view: View) => void
) {
  switch (view) {
    case 'home':
      return <LandingPage go={go} />;

    case 'planner':
      return (
        <PlannerPage
          view={view}
          go={go}
        />
      );

    case 'results':
      return (
        <ResultsPage
          view={view}
          go={go}
        />
      );

    case 'agencies':
      return (
        <AgenciesPage
          view={view}
          go={go}
        />
      );

    case 'explore':
      return (
        <ExplorePage
          view={view}
          go={go}
        />
      );

    case 'jobs':
      return <JobsPage go={go} />;

    case 'programs':
      return <ProgramsPage go={go} />;

    case 'sponsored-programs':
      return <SponsoredProgramsPage go={go} />;

    case 'submit-program':
      return <SubmitProgramPage go={go} />;

    case 'travel':
      return <TravelPage go={go} />;

    case 'experts':
      return <ExpertsMarketplacePage go={go} />;

    case 'destinations':
      return <DestinationsPage go={go} />;

    case 'profile':
      return <ProfilePage go={go} />;

    case 'customer-dashboard':
      return (
        <CustomerDashboard
          view={view}
          go={go}
        />
      );

    case 'trip-workspace':
      return (
        <TripWorkspace
          view={view}
          go={go}
        />
      );

    case 'agency-dashboard':
      return (
        <AgencyDashboard
          view={view}
          go={go}
        />
      );

    case 'agency-profile':
      return (
        <AgencyProfilePage
          view={view}
          go={go}
        />
      );

    default:
      return <LandingPage go={go} />;
  }
}

function renderRoleHome(
  role: 'customer' | 'agency' | 'admin',
  go: (view: View) => void
) {
  if (
    role === 'agency' ||
    role === 'admin'
  ) {
    return (
      <AgencyDashboard
        view="agency-dashboard"
        go={go}
      />
    );
  }

  return (
    <CustomerDashboard
      view="customer-dashboard"
      go={go}
    />
  );
}
function ProfileMissingScreen() {
  const { refreshProfile, signOut } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    // Give the profile fetch a moment (it may just be catching up right
    // after a fresh signup/sign-in) before offering retry/sign-out —
    // but always show it eventually, unlike the old bare spinner here.
    const timer = window.setTimeout(() => setShowHelp(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    await refreshProfile();
    setRetrying(false);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#f7f9fc] px-5">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />

        {showHelp && (
          <div className="max-w-sm">
            <p className="text-sm font-medium text-ink-700">
              This is taking longer than expected.
            </p>
            <p className="mt-1 text-xs text-ink-400">
              You're signed in, but your profile hasn't loaded yet.
            </p>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {retrying ? 'Retrying…' : 'Retry'}
              </button>
              <button
                type="button"
                onClick={signOut}
                className="text-xs font-medium text-ink-400 underline hover:text-ink-700"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
