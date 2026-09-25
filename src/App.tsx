import { useEffect, useState } from 'react';
import { CompaniesPage } from '@/pages/companies/CompaniesPage';
import { CompanyProfilePage } from '@/pages/companies/CompanyProfilePage';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { LandingPage } from '@/pages/landing/LandingPage';
import { JobsPage } from '@/pages/landing/jobs/JobsPage';
import { ProgramsPage } from '@/pages/landing/programs/ProgramsPage';
import { SponsoredProgramsPage } from '@/pages/programs/SponsoredProgramsPage';
import { ExpertsMarketplacePage } from '@/pages/experts/ExpertsMarketplacePage';
import { DestinationsPage } from '@/pages/destinations/DestinationsPage';
import { ProgramDetailPage } from '@/pages/programs/ProgramDetailPage';
import { JobDetailPage } from '@/pages/jobs/JobDetailPage';
import { AdminPanelPage } from '@/pages/admin/AdminPanelPage';
import { AdminJobEditorPage } from '@/pages/admin/AdminJobEditorPage';
import { CompanyManagerPage } from '@/pages/company/CompanyManagerPage';
import { OfficialPartnersPage } from '@/pages/partners/OfficialPartnersPage';
import { PublicProfilePage } from '@/pages/u/PublicProfilePage';
import { LegalPage } from '@/pages/legal/LegalPage';
import { legalPageOrder } from '@/data/legalContent';
import { SubmitJobPage } from '@/pages/submit/SubmitJobPage';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import { PendingConfirmationPage } from '@/pages/auth/PendingConfirmationPage';
import type { PendingSignup } from '@/pages/auth/RegisterPage';
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
  study: '/study',
  'sponsored-programs': '/sponsored-programs',
  'submit-job': '/submit-job',
  profile: '/profile',
  experts: '/experts',
  destinations: '/destinations',
  dashboard: '/dashboard',
  admin: '/admin',
  company: '/company',
  companies: '/companies',
  'official-partners': '/official-partners',
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

  // Tracks the URL itself, separately from `view`/`authPage`. Those two
  // can each coincidentally already equal the value being set (e.g.
  // `authPage` defaults to 'login' on every non-auth page, so clicking
  // "Sign in" from the homepage sets it to the same value it already
  // has) — React skips re-rendering for a no-op state update, so if
  // *both* updates happen to be no-ops at once, nothing re-renders at
  // all even though pushState changed the address bar. `path` always
  // genuinely changes on a real navigation, so setting it guarantees
  // the re-render actually happens.
  const [path, setPath] = useState(window.location.pathname);

  const [pendingSignup, setPendingSignup] = useState<PendingSignup | null>(null);

  const showPendingConfirmation = (info: PendingSignup) => {
    setPendingSignup(info);
    setAuthPage('pending-confirmation');
  };

  const go = (next: View) => {
    const nextPath = pathForView[next];
    // Clicking a nav item (e.g. the logo) while already on that exact
    // page previously still force-scrolled to top and re-set state,
    // which reads as "the page reloaded" even though nothing actually
    // changed. Treat it as a true no-op instead.
    if (view === next && (!nextPath || nextPath === window.location.pathname)) {
      return;
    }
    setView(next);
    if (nextPath && nextPath !== window.location.pathname) {
      window.history.pushState({}, '', nextPath);
    }
    setPath(nextPath ?? window.location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Dynamic detail-page navigation (program/job by id) — separate
  // from `go` because `View` is a fixed set of named pages, not
  // arbitrary ids. Pushes /programs/<id> or /jobs/<id> directly.
  const goToDetail = (kind: 'programs' | 'jobs', id: string) => {
    const nextPath = `/${kind}/${id}`;
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
    setView('home'); // clear any stale view match, same reasoning as goToAuth
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Job detail pages use readable public URLs built by jobPath()
  // (/jobs/<company>/<title>-<shortId>), so this pushes a full path.
  const goToPath = (nextPath: string) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
    setView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToAuth = (page: AuthPage) => {
    setAuthPage(page);

    // Clear the "sticky" current-page state — otherwise a public page
    // like /programs or /jobs keeps rendering itself even after the
    // URL changes to /login or /register, since those pages are
    // matched by `view` as well as by pathname.
    setView('home');

    const nextPath =
      page === 'login' ? '/login' : page === 'register' ? '/register' : page === 'reset-password' ? '/reset-password' : null;
    if (nextPath) window.history.pushState({}, '', nextPath);
    setPath(nextPath ?? window.location.pathname);
  };

  // Keep `view`/`authPage`/`path` in sync when the visitor uses the
  // browser's actual back/forward buttons, since pushState alone only
  // updates the URL bar — without this, clicking "back" changes the
  // address but leaves the previously-rendered page on screen.
  useEffect(() => {
    const onPopState = () => {
      const pathname = window.location.pathname;
      setPath(pathname);

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

  if (path === '/jobs') {
    return <JobsPage go={go} onAuth={goToAuth} goToJob={goToPath} />;
  }

  if (path === '/programs') {
    return <ProgramsPage go={go} onAuth={goToAuth} goToProgram={(id) => goToDetail('programs', id)} />;
  }

  if (path === '/study') {
    return <ProgramsPage mode="study" go={go} onAuth={goToAuth} goToProgram={(id) => goToDetail('programs', id)} />;
  }

  if (path === '/sponsored-programs') {
    return <SponsoredProgramsPage go={go} onAuth={goToAuth} goToProgram={(id) => goToDetail('programs', id)} />;
  }

  if (path === '/submit-job' || path === '/submit-program') {
    // /submit-program was the old listing form — old links land here.
    if (path === '/submit-program') window.history.replaceState({}, '', '/submit-job' + window.location.search);
    return <SubmitJobPage go={go} onAuth={goToAuth} />;
  }

  if (path === '/experts') {
    return <ExpertsMarketplacePage go={go} onAuth={goToAuth} />;
  }

  if (path === '/destinations') {
    return <DestinationsPage go={go} onAuth={goToAuth} />;
  }

  if (path.startsWith('/programs/')) {
    return <ProgramDetailPage id={path.slice('/programs/'.length)} go={go} onAuth={goToAuth} />;
  }

  if (path.startsWith('/jobs/')) {
    return <JobDetailPage id={path.slice('/jobs/'.length)} go={go} onAuth={goToAuth} />;
  }

  if (path === '/admin') {
    return <AdminPanelPage go={go} onAuth={goToAuth} />;
  }

  // Company managers (e.g. a company's HR) — self-gates: shows a sign-in
  // prompt when logged out, and "no access yet" when the account's email
  // hasn't been given access to any company.
  if (path === '/companies') {
    return <CompaniesPage go={go} onAuth={goToAuth} />;
  }

  if (path.startsWith('/companies/')) {
    return <CompanyProfilePage slug={path.slice('/companies/'.length)} go={go} onAuth={goToAuth} />;
  }

  if (path === '/company') {
    return <CompanyManagerPage go={go} onAuth={goToAuth} />;
  }

  // Full-page admin job editor (opened in its own tab via window.open
  // from the admin panel's "Preview & edit" buttons). Self-gates admin
  // access internally, same pattern as AdminPanelPage above.
  if (path.startsWith('/admin/jobs/')) {
    return <AdminJobEditorPage id={path.slice('/admin/jobs/'.length)} go={go} onAuth={goToAuth} />;
  }

  if (path === '/official-partners') {
    return <OfficialPartnersPage go={go} onAuth={goToAuth} />;
  }

  if (path.startsWith('/u/')) {
    return <PublicProfilePage username={path.slice(3)} go={go} onAuth={goToAuth} />;
  }

  if (legalPageOrder.includes(path.slice(1))) {
    return <LegalPage slug={path.slice(1)} go={go} onAuth={goToAuth} />;
  }

  // Checked ahead of the !session branch below: Supabase's password
  // recovery link establishes a session as soon as it redirects back
  // here, so gating this on "no session" would skip straight past the
  // "set a new password" form into the logged-in app.
  if (path === '/reset-password') {
    return <ResetPasswordPage onHome={() => go('home')} onSwitchToLogin={() => goToAuth('login')} />;
  }

  if (!session) {
    if (
      path !== '/login' &&
      path !== '/register'
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

  // Signed-in views. The old trip-planner prototype (planner, results,
  // My Trips, trip workspace, agency trip CRM, flights & stays) has been
  // removed — MadeVisa is jobs, programs, study, visas and experts. Old
  // URLs/views for it simply fall back to the home page.
  return renderPublicView(view, go);
}

function renderPublicView(view: View, go: (view: View) => void) {
  switch (view) {
    case 'jobs':
      return <JobsPage go={go} />; // /jobs is normally routed by path above; this is a fallback
    case 'programs':
      return <ProgramsPage go={go} />;
    case 'sponsored-programs':
      return <SponsoredProgramsPage go={go} />;
    case 'submit-job':
      return <SubmitJobPage go={go} />;
    // 'agencies' is kept as an alias: old "Find a visa expert" links land on the real experts page.
    case 'experts':
    case 'agencies':
      return <ExpertsMarketplacePage go={go} />;
    case 'destinations':
      return <DestinationsPage go={go} />;
    // /dashboard is a safe alias — the dashboard lives inside Profile as tabs.
    case 'profile':
    case 'dashboard':
      return <ProfilePage go={go} />;
    default:
      return <LandingPage go={go} />;
  }
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
