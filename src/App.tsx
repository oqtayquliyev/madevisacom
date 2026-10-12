import { lazyPage } from '@/lib/lazyPage';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { AddNameStep, FinishAuth, goToNextAfterAuth, nameSkipped } from '@/components/auth/AfterSignIn';
import { AddCvStep, useCvRequirement } from '@/components/cv/CvGate';
import { readAuthIntent } from '@/lib/authIntent';
import { useReferralCapture } from '@/lib/referrals';
import { useAlertWishAfterSignIn } from '@/lib/jobAlerts';
import { LandingPage } from '@/pages/landing/LandingPage';
import { legalPageOrder } from '@/data/legalOrder';
import type { PendingSignup } from '@/pages/auth/RegisterPage';
import type { View } from '@/types';

// Pages load their code only when opened, so a visitor to /jobs doesn't
// download the admin panel, the blog, profiles… (Suspense is in main.tsx).
const LoginPage = lazyPage(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazyPage(() => import('@/pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const ResetPasswordPage = lazyPage(() => import('@/pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = lazyPage(() => import('@/pages/auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })));
const PendingConfirmationPage = lazyPage(() => import('@/pages/auth/PendingConfirmationPage').then((m) => ({ default: m.PendingConfirmationPage })));
const NotFoundPage = lazyPage(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const JobsPage = lazyPage(() => import('@/pages/landing/jobs/JobsPage').then((m) => ({ default: m.JobsPage })));
const JobDetailPage = lazyPage(() => import('@/pages/jobs/JobDetailPage').then((m) => ({ default: m.JobDetailPage })));
const CompaniesPage = lazyPage(() => import('@/pages/companies/CompaniesPage').then((m) => ({ default: m.CompaniesPage })));
const CompanyProfilePage = lazyPage(() => import('@/pages/companies/CompanyProfilePage').then((m) => ({ default: m.CompanyProfilePage })));
const FeedbackPage = lazyPage(() => import('@/pages/feedback/FeedbackPage').then((m) => ({ default: m.FeedbackPage })));
const ProgramsPage = lazyPage(() => import('@/pages/landing/programs/ProgramsPage').then((m) => ({ default: m.ProgramsPage })));
const SponsoredProgramsPage = lazyPage(() => import('@/pages/programs/SponsoredProgramsPage').then((m) => ({ default: m.SponsoredProgramsPage })));
const DestinationsPage = lazyPage(() => import('@/pages/destinations/DestinationsPage').then((m) => ({ default: m.DestinationsPage })));
const CountryPage = lazyPage(() => import('@/pages/destinations/CountryPage').then((m) => ({ default: m.CountryPage })));
const BriefPage = lazyPage(() => import('@/pages/brief/BriefPage').then((m) => ({ default: m.BriefPage })));
const NetworkPage = lazyPage(() => import('@/pages/network/NetworkPage').then((m) => ({ default: m.NetworkPage })));
const ProgramDetailPage = lazyPage(() => import('@/pages/programs/ProgramDetailPage').then((m) => ({ default: m.ProgramDetailPage })));
const AdminPanelPage = lazyPage(() => import('@/pages/admin/AdminPanelPage').then((m) => ({ default: m.AdminPanelPage })));
const AdminJobEditorPage = lazyPage(() => import('@/pages/admin/AdminJobEditorPage').then((m) => ({ default: m.AdminJobEditorPage })));
const CompanyManagerPage = lazyPage(() => import('@/pages/company/CompanyManagerPage').then((m) => ({ default: m.CompanyManagerPage })));
const UnsubscribePage = lazyPage(() => import('@/pages/alerts/UnsubscribePage').then((m) => ({ default: m.UnsubscribePage })));
const MyDashboardPage = lazyPage(() => import('@/pages/my/MyDashboardPage').then((m) => ({ default: m.MyDashboardPage })));
const EmployerInboxPage = lazyPage(() => import('@/pages/employers/EmployerInboxPage').then((m) => ({ default: m.EmployerInboxPage })));
const OfficialPartnersPage = lazyPage(() => import('@/pages/partners/OfficialPartnersPage').then((m) => ({ default: m.OfficialPartnersPage })));
const PublicProfilePage = lazyPage(() => import('@/pages/u/PublicProfilePage').then((m) => ({ default: m.PublicProfilePage })));
const LegalPage = lazyPage(() => import('@/pages/legal/LegalPage').then((m) => ({ default: m.LegalPage })));
const InfoPage = lazyPage(() => import('@/pages/info/InfoPage').then((m) => ({ default: m.InfoPage })));
const JobMarketPage = lazyPage(() => import('@/pages/info/JobMarketPage').then((m) => ({ default: m.JobMarketPage })));
const BlogPage = lazyPage(() => import('@/pages/blog/BlogPage').then((m) => ({ default: m.BlogPage })));
const ArticlePage = lazyPage(() => import('@/pages/blog/ArticlePage').then((m) => ({ default: m.ArticlePage })));
const SubmitJobPage = lazyPage(() => import('@/pages/submit/SubmitJobPage').then((m) => ({ default: m.SubmitJobPage })));
const OffersPage = lazyPage(() => import('@/pages/offers/OffersPage').then((m) => ({ default: m.OffersPage })));
const PricingPage = lazyPage(() => import('@/pages/pricing/PricingPage').then((m) => ({ default: m.PricingPage })));
const CheckoutPage = lazyPage(() => import('@/pages/checkout/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const CheckoutCompletePage = lazyPage(() => import('@/pages/checkout/CheckoutCompletePage').then((m) => ({ default: m.CheckoutCompletePage })));
const CvMatchPage = lazyPage(() => import('@/pages/cv/CvMatchPage').then((m) => ({ default: m.CvMatchPage })));
const ProfilePage = lazyPage(() => import('@/pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));

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
  experts: '/network',
  network: '/network',
  destinations: '/destinations',
  dashboard: '/dashboard',
  admin: '/admin',
  company: '/company',
  companies: '/companies',
  feedback: '/feedback',
  'official-partners': '/official-sources',
};

// Pages routed by view (plus home and sign-in). Paths with their own
// handlers above the 404 check (jobs, companies, legal, …) aren't needed here.
const KNOWN_PATHS = new Set<string>(['/', '/index.html', '/login', '/register', '/reset-password', ...Object.values(pathForView).filter((p): p is string => Boolean(p))]);

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
  useReferralCapture();
  useAlertWishAfterSignIn();
  // Job seekers add a CV as the last step of signing up (see components/cv/CvGate).
  const cvReq = useCvRequirement();
  // Bumped when a sign-up step finishes without changing the profile ("Skip for now"), to move on.
  const [, setAuthStep] = useState(0);

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


  // Google sign-in comes back to "/" — continue to the page saved before it.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (session && path === '/' && readAuthIntent().next) goToNextAfterAuth();
  }, [session, path]);

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

  if (path === '/verify-email') {
    return <VerifyEmailPage go={go} onAuth={goToAuth} />;
  }

  if (path === '/submit-job' || path === '/submit-program') {
    // /submit-program was the old listing form — old links land here.
    if (path === '/submit-program') window.history.replaceState({}, '', '/submit-job' + window.location.search);
    return <SubmitJobPage go={go} onAuth={goToAuth} />;
  }

  // Network replaced "Agencies & Experts"; /experts stays as an alias for old links.
  if (path === '/network' || path === '/experts') {
    return <NetworkPage go={go} onAuth={goToAuth} />;
  }

  // Hiring Briefs: public, unlisted pages a candidate sends to an employer.
  if (path.startsWith('/brief/')) {
    return <BriefPage shareId={path.slice('/brief/'.length).replace(/\/+$/, '')} go={go} onAuth={goToAuth} />;
  }

  if (path === '/destinations') {
    return <DestinationsPage go={go} onAuth={goToAuth} />;
  }

  // Country guides: /destinations/<country-slug> (see src/data/visa/).
  if (path.startsWith('/destinations/')) {
    return <CountryPage slug={path.slice('/destinations/'.length)} go={go} onAuth={goToAuth} />;
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

  // Hiring Feedback — /feedback, and a company's own link /feedback/<company>.
  if (path === '/feedback' || path.startsWith('/feedback/')) {
    const fslug = path.startsWith('/feedback/') ? path.slice('/feedback/'.length).replace(/\/$/, '') : '';
    return <FeedbackPage key={fslug || 'all'} slug={fslug || undefined} go={go} onAuth={goToAuth} />;
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

  if (path === '/alerts/unsubscribe') {
    return <UnsubscribePage />;
  }

  if (path === '/my') {
    return <MyDashboardPage go={go} onAuth={goToAuth} />;
  }

  if (path === '/employers/inbox') {
    return <EmployerInboxPage go={go} onAuth={goToAuth} />;
  }

  if (path === '/official-sources' || path === '/official-partners') {
    return <OfficialPartnersPage go={go} onAuth={goToAuth} />;
  }

  if (path.startsWith('/u/')) {
    return <PublicProfilePage username={path.slice(3)} go={go} onAuth={goToAuth} />;
  }

  if (path === '/about' || path === '/how-it-works') {
    return <InfoPage key={path} slug={path.slice(1) as 'about' | 'how-it-works'} go={go} onAuth={goToAuth} />;
  }

  if (path === '/offers' || path === '/offers/') {
    return <OffersPage go={go} onAuth={goToAuth} />;
  }

  if (path === '/pricing') {
    return <PricingPage go={go} onAuth={goToAuth} />;
  }

  // Checkout for Starter / Pro, and the page that waits for the payment to be confirmed.
  if (path === '/checkout' || path === '/checkout/') {
    return <CheckoutPage go={go} onAuth={goToAuth} />;
  }

  if (path === '/checkout/complete') {
    return <CheckoutCompletePage go={go} onAuth={goToAuth} />;
  }

  if (path === '/cv-match' || path === '/cv') {
    return <CvMatchPage go={go} onAuth={goToAuth} />;
  }

  if (path === '/job-market') {
    return <JobMarketPage go={go} onAuth={goToAuth} />;
  }

  if (path === '/blog' || path === '/blog/') {
    return <BlogPage go={go} onAuth={goToAuth} />;
  }

  if (path.startsWith('/blog/')) {
    return <ArticlePage slug={path.slice('/blog/'.length).replace(/\/+$/, '')} go={go} onAuth={goToAuth} />;
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

  // Anything else that isn't a known page → friendly 404 instead of
  // silently showing the homepage under a wrong address.
  const cleanPath = path.replace(/\/+$/, '') || '/';
  if (!KNOWN_PATHS.has(cleanPath)) {
    return <NotFoundPage go={go} onAuth={goToAuth} />;
  }

  // Just signed in (email code or Google) on the sign-in page: ask for a
  // name the first time, then for a CV, then go back to where they were.
  if (session && (path === '/login' || path === '/register')) {
    if (!profile) return <ProfileMissingScreen />;
    if (!profile.full_name?.trim() && !nameSkipped()) return <AddNameStep onDone={() => setAuthStep((n) => n + 1)} />;
    if (cvReq.loading) {
      return (
        <div className="grid min-h-screen place-items-center bg-[#f7f9fc]">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      );
    }
    if (cvReq.needed) return <AddCvStep req={cvReq} />;
    return <FinishAuth />;
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
    case 'network':
      return <NetworkPage go={go} />;
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
