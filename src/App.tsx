import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { LandingPage } from '@/pages/landing/LandingPage';
import { AgencyDashboard } from '@/pages/agency/AgencyDashboard';
import { AgencyProfilePage } from '@/pages/agency/AgencyProfilePage';
import { AgenciesPage } from '@/pages/agencies/AgenciesPage';
import { CustomerDashboard } from '@/pages/customer/CustomerDashboard';
import { TripWorkspace } from '@/pages/customer/TripWorkspace';
import { ExplorePage } from '@/pages/explore/ExplorePage';
import { PlannerPage } from '@/pages/planner/PlannerPage';
import { ResultsPage } from '@/pages/results/ResultsPage';
import type { View } from '@/types';

type AuthPage = 'login' | 'register';

export default function App() {
  const { session, profile, loading } = useAuth();
  const [view, setView] = useState<View>('home');
  const [authPage, setAuthPage] = useState<AuthPage>(() => window.location.pathname === '/register' ? 'register' : 'login');

  const go = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToAuth = (page: AuthPage) => {
    setAuthPage(page);
    window.history.pushState({}, '', page === 'login' ? '/login' : '/register');
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f9fc]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  // Not signed in → show the landing page unless an auth route was requested.
  if (!session) {
    if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
      return <LandingPage go={go} onAuth={goToAuth} />;
    }

    return authPage === 'login' ? (
      <LoginPage onSwitchToRegister={() => goToAuth('register')} />
    ) : (
      <RegisterPage onSwitchToLogin={() => goToAuth('login')} />
    );
  }

  // Signed in but profile not loaded yet → show loading
  if (!profile) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f9fc]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  // Role-based routing after authentication
  const role = profile.role;

  // Public views accessible to everyone
  if (view === 'home' || view === 'planner' || view === 'results' || view === 'agencies' || view === 'explore') {
    return renderPublicView(view, go);
  }

  // Customer-only views
  if (view === 'customer-dashboard' || view === 'trip-workspace') {
    if (role === 'agency' || role === 'admin') {
      return renderRoleHome(role, go);
    }
    return renderPublicView(view, go);
  }

  // Agency-only views
  if (view === 'agency-dashboard' || view === 'agency-profile') {
    if (role === 'customer') {
      return renderPublicView('customer-dashboard', go);
    }
    return renderPublicView(view, go);
  }

  // Admin → admin home (for now, agency dashboard)
  if (role === 'admin') {
    return <AgencyDashboard view="agency-dashboard" go={go} />;
  }

  return renderPublicView('home', go);
}

function renderPublicView(view: View, go: (view: View) => void) {
  switch (view) {
    case 'home': return <LandingPage go={go} />;
    case 'planner': return <PlannerPage view={view} go={go} />;
    case 'results': return <ResultsPage view={view} go={go} />;
    case 'agencies': return <AgenciesPage view={view} go={go} />;
    case 'customer-dashboard': return <CustomerDashboard view={view} go={go} />;
    case 'trip-workspace': return <TripWorkspace view={view} go={go} />;
    case 'explore': return <ExplorePage view={view} go={go} />;
    case 'agency-dashboard': return <AgencyDashboard view={view} go={go} />;
    case 'agency-profile': return <AgencyProfilePage view={view} go={go} />;
    default: return <LandingPage go={go} />;
  }
}

function renderRoleHome(role: 'customer' | 'agency' | 'admin', go: (view: View) => void) {
  if (role === 'agency' || role === 'admin') return <AgencyDashboard view="agency-dashboard" go={go} />;
  return <CustomerDashboard view="customer-dashboard" go={go} />;
}
