import React, { Suspense, lazy, useState, useEffect } from 'react';
import { TenantProvider, useTenant } from './context/TenantContext.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LoginPage } from './components/auth/LoginPage.js';
import { OrganizationPickerPage } from './components/auth/OrganizationPickerPage.js';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal.js';
import { canAccessModule } from './access.js';
import { useAiAccess } from './hooks/useAiAccess.js';
import { ShieldAlert } from 'lucide-react';
import { Header } from './components/Header.js';
import { Sidebar } from './components/Sidebar.js';
import { AppFooter } from './components/AppFooter.js';
import { ClimatePendingBanner } from './components/retention/ClimatePendingBanner.js';
import { SalesLandingPage } from './components/SalesLandingPage.js';

// Each screen is its own chunk: the browser only downloads the modules (and heavy libs such as charts / PDF) that are opened.
const PlatformLayout = lazy(() => import('./components/platform/PlatformLayout.js').then(m => ({ default: m.PlatformLayout })));
const CareersPortalPage = lazy(() => import('./components/careers/CareersPortalPage.js').then(m => ({ default: m.CareersPortalPage })));

// Feature Modules 1 to 15 (+ Agenda)
const ModuleWelcome = lazy(() => import('./components/modules/ModuleWelcome.js').then(m => ({ default: m.ModuleWelcome })));
const ModuleAgenda = lazy(() => import('./components/modules/ModuleAgenda.js').then(m => ({ default: m.ModuleAgenda })));
const ModuleUsers = lazy(() => import('./components/modules/ModuleUsers.js').then(m => ({ default: m.ModuleUsers })));
const ModuleDNA = lazy(() => import('./components/modules/ModuleDNA.js').then(m => ({ default: m.ModuleDNA })));
const ModuleStructure = lazy(() => import('./components/modules/ModuleStructure.js').then(m => ({ default: m.ModuleStructure })));
const ModulePositions = lazy(() => import('./components/modules/ModulePositions.js').then(m => ({ default: m.ModulePositions })));
const ModuleOpenings = lazy(() => import('./components/modules/ModuleOpenings.js').then(m => ({ default: m.ModuleOpenings })));
const ModuleCandidates = lazy(() => import('./components/modules/ModuleCandidates.js').then(m => ({ default: m.ModuleCandidates })));
const ModuleSelectionProcess = lazy(() => import('./components/modules/ModuleSelectionProcess.js').then(m => ({ default: m.ModuleSelectionProcess })));
const ModuleAIEvaluation = lazy(() => import('./components/modules/ModuleAIEvaluation.js').then(m => ({ default: m.ModuleAIEvaluation })));
const ModuleInterviews = lazy(() => import('./components/modules/ModuleInterviews.js').then(m => ({ default: m.ModuleInterviews })));
const ModuleOffers = lazy(() => import('./components/modules/ModuleOffers.js').then(m => ({ default: m.ModuleOffers })));
const ModuleOnboarding = lazy(() => import('./components/modules/ModuleOnboarding.js').then(m => ({ default: m.ModuleOnboarding })));
const ModuleHR = lazy(() => import('./components/modules/ModuleHR.js').then(m => ({ default: m.ModuleHR })));
const ModuleDevelopment = lazy(() => import('./components/modules/ModuleDevelopment.js').then(m => ({ default: m.ModuleDevelopment })));
const ModuleRetention = lazy(() => import('./components/modules/ModuleRetention.js').then(m => ({ default: m.ModuleRetention })));
const ModuleIndicators = lazy(() => import('./components/modules/ModuleIndicators.js').then(m => ({ default: m.ModuleIndicators })));

const ScreenFallback: React.FC = () => (
  <div className="flex items-center justify-center h-64 text-slate-400 text-xs animate-pulse">Carregando...</div>
);

const MainLayout: React.FC = () => {
  const { activeTenant, isLoading, permissions } = useTenant();
  const { canOpenAI } = useAiAccess();
  const { user } = useAuth();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<number>(1); // Default to Module 1 (Boas-vindas)
  const [isCareersView, setIsCareersView] = useState(false);
  const [careersSlugFromUrl, setCareersSlugFromUrl] = useState<string | undefined>(undefined);

  // Cross-module states
  const [targetJobId, setTargetJobId] = useState<string | undefined>(undefined);
  const [targetCandidateId, setTargetCandidateId] = useState<string | undefined>(undefined);
  const [targetSearchTerm, setTargetSearchTerm] = useState<string | undefined>(undefined);
  const [targetDevelopmentId, setTargetDevelopmentId] = useState<string | undefined>(undefined);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check URL params for direct link to careers page
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const view = searchParams.get('view');
      const jobId = searchParams.get('job');
      if (view === 'careers' || view === 'vagas') {
        setIsCareersView(true);
        setCareersSlugFromUrl(searchParams.get('tenant') || undefined);
        if (jobId) setTargetJobId(jobId);
      }
    } catch {
      // safe fallback
    }
  }, []);

  const handleNavigateToProcess = (jobId: string, candidateId?: string) => {
    setTargetJobId(jobId);
    if (candidateId) setTargetCandidateId(candidateId);
    setIsCareersView(false);
    setActiveModule(8); // Module 8: Processo Seletivo
  };

  const handleNavigateToCandidate = (candidateId: string, searchTerm?: string) => {
    setTargetCandidateId(candidateId);
    if (searchTerm) setTargetSearchTerm(searchTerm);
    setIsCareersView(false);
    setActiveModule(7); // Module 7: Candidatos (Banco de Talentos)
  };

  const handleNavigateToAI = (candidateId: string, jobId?: string) => {
    setTargetCandidateId(candidateId);
    if (jobId) setTargetJobId(jobId);
    setIsCareersView(false);
    setActiveModule(9); // Module 9: Avaliação Assistida por IA
  };

  const handleNavigateToDevelopment = (recordId: string) => {
    setTargetDevelopmentId(recordId);
    setIsCareersView(false);
    setActiveModule(13); // Module 13: Desenvolvimento (PDI)
  };

  const handleNavigateToCareersPortal = (jobId?: string) => {
    setTargetJobId(jobId);
    setIsCareersView(true);
  };

  const handleSelectModule = (id: number) => {
    setTargetDevelopmentId(undefined);
    if (id === 16) {
      setIsCareersView(true);
    } else {
      setIsCareersView(false);
      setActiveModule(id);
    }
  };

  if (isCareersView) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <CareersPortalPage
          tenantSlug={careersSlugFromUrl || activeTenant?.slug || ''}
          onBackToAdmin={() => {
            setIsCareersView(false);
            setActiveModule(6); // return to Openings module
          }}
          initialJobId={targetJobId}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Header with Dynamic Routing and Tenant Switcher */}
      <Header
        onOpenCareersPortal={() => {
          setCareersSlugFromUrl(undefined);
          setIsCareersView(true);
        }}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
        onNavigateHome={() => handleSelectModule(1)}
        onOpenAgenda={() => handleSelectModule(17)}
        onNavigateToCandidate={handleNavigateToCandidate}
        onNavigateToProcess={handleNavigateToProcess}
        onNavigateToAI={canOpenAI ? handleNavigateToAI : undefined}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => {
          // lg+: collapse the fixed sidebar; below lg the menu is an off-canvas drawer
          if (window.matchMedia('(min-width: 1024px)').matches) setIsSidebarCollapsed(prev => !prev);
          else setIsMobileMenuOpen(prev => !prev);
        }}
      />

      {/* Main Work Area - Expanded Widescreen Layout */}
      <div className="flex-1 flex w-full max-w-[1820px] mx-auto">
        {/* Navigation Sidebar */}
        <Sidebar
          activeModule={activeModule}
          isCollapsed={isSidebarCollapsed}
          mobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
          onSelectModule={handleSelectModule}
        />

        {/* Content View */}
        <main className="flex-1 min-w-0 p-3 sm:p-6 lg:p-8 xl:p-9 overflow-y-auto max-w-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-xs animate-pulse">
              Conectando dinamicamente ao banco do tenant...
            </div>
          ) : !canAccessModule(permissions, activeModule) ? (
            <div className="flex flex-col items-center justify-center h-64 text-center text-slate-500 gap-2">
              <ShieldAlert className="w-8 h-8 text-slate-300" />
              <div className="text-sm font-semibold text-slate-700">Seu perfil de acesso não libera este módulo</div>
              <div className="text-xs">Solicite ao administrador da organização, se necessário.</div>
            </div>
          ) : (
            <Suspense fallback={<ScreenFallback />}>
              {activeModule !== 14 && permissions.includes('climate:view') && (
                <ClimatePendingBanner tenantId={activeTenant?.id} onOpen={() => handleSelectModule(14)} />
              )}
              {activeModule === 1 && <ModuleWelcome onNavigate={handleSelectModule} />}
              {activeModule === 2 && <ModuleUsers />}
              {activeModule === 3 && <ModuleDNA />}
              {activeModule === 4 && <ModuleStructure />}
              {activeModule === 5 && <ModulePositions />}
              {activeModule === 6 && (
                <ModuleOpenings
                  onNavigateToProcess={handleNavigateToProcess}
                  onNavigateToCareersPortal={handleNavigateToCareersPortal}
                />
              )}
              {activeModule === 7 && (
                <ModuleCandidates
                  onSelectCandidateForAI={canOpenAI ? handleNavigateToAI : undefined}
                  onNavigateToProcess={handleNavigateToProcess}
                  initialSearchTerm={targetSearchTerm}
                  initialSelectedCandidateId={targetCandidateId}
                />
              )}
              {activeModule === 8 && (
                <ModuleSelectionProcess
                  initialJobId={targetJobId}
                  initialCandidateId={targetCandidateId}
                  onNavigateToAI={canOpenAI ? handleNavigateToAI : undefined}
                  onNavigateToCandidate={handleNavigateToCandidate}
                />
              )}
              {activeModule === 9 && (
                <ModuleAIEvaluation
                  preselectedCandidateId={targetCandidateId}
                  preselectedJobId={targetJobId}
                />
              )}
              {activeModule === 10 && <ModuleInterviews />}
              {activeModule === 11 && <ModuleOffers />}
              {activeModule === 12 && <ModuleOnboarding />}
              {activeModule === 18 && <ModuleHR />}
              {activeModule === 13 && <ModuleDevelopment initialRecordId={targetDevelopmentId} />}
              {activeModule === 14 && <ModuleRetention onOpenDevelopment={handleNavigateToDevelopment} />}
              {activeModule === 15 && <ModuleIndicators />}
              {activeModule === 17 && <ModuleAgenda />}
            </Suspense>
          )}
        </main>
      </div>

      <AppFooter />

      {isChangePasswordOpen && !user?.mustChangePassword && (
        <ChangePasswordModal onClose={() => setIsChangePasswordOpen(false)} />
      )}
    </div>
  );
};

/** Public careers link (?view=careers&tenant=slug) is reachable without an account. */
function publicCareersSlug(): string | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const view = q.get('view');
    return (view === 'careers' || view === 'vagas') ? q.get('tenant') : null;
  } catch {
    return null;
  }
}

function Gate() {
  const { user, isReady, needsOrgSelection } = useAuth();
  const slug = publicCareersSlug();

  if (!user && slug) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <CareersPortalPage tenantSlug={slug} initialJobId={new URLSearchParams(window.location.search).get('job') || undefined} />
      </Suspense>
    );
  }
  if (!isReady) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-xs animate-pulse">Validando sessão...</div>;
  }
  if (!user && new URLSearchParams(window.location.search).get('view') !== 'login') return <SalesLandingPage />;
  if (!user) return <LoginPage />;
  if (needsOrgSelection) return <OrganizationPickerPage />;
  if (user.mustChangePassword) {
    return (
      <div className="min-h-screen bg-slate-50">
        <ChangePasswordModal forced />
      </div>
    );
  }
  // Conta Mãe gets its own environment (platform routines only); organization users get the workspace
  return (
    <TenantProvider>
      <Suspense fallback={<ScreenFallback />}>
        {user.type === 'super_admin' ? <PlatformLayout /> : <MainLayout />}
      </Suspense>
    </TenantProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

export default App;
