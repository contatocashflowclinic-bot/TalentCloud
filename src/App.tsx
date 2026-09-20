import React, { useState, useEffect } from 'react';
import { TenantProvider, useTenant } from './context/TenantContext.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LoginPage } from './components/auth/LoginPage.js';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal.js';
import { canAccessModule } from './access.js';
import { ShieldAlert } from 'lucide-react';
import { PlatformLayout } from './components/platform/PlatformLayout.js';
import { Header } from './components/Header.js';
import { Sidebar } from './components/Sidebar.js';
import { CareersPortalPage } from './components/careers/CareersPortalPage.js';

// Feature Modules 2 to 15
import { ModuleUsers } from './components/modules/ModuleUsers.js';
import { ModuleDNA } from './components/modules/ModuleDNA.js';
import { ModuleStructure } from './components/modules/ModuleStructure.js';
import { ModulePositions } from './components/modules/ModulePositions.js';
import { ModuleOpenings } from './components/modules/ModuleOpenings.js';
import { ModuleCandidates } from './components/modules/ModuleCandidates.js';
import { ModuleSelectionProcess } from './components/modules/ModuleSelectionProcess.js';
import { ModuleAIEvaluation } from './components/modules/ModuleAIEvaluation.js';
import { ModuleInterviews } from './components/modules/ModuleInterviews.js';
import { ModuleOffers } from './components/modules/ModuleOffers.js';
import { ModuleOnboarding } from './components/modules/ModuleOnboarding.js';
import { ModuleDevelopment } from './components/modules/ModuleDevelopment.js';
import { ModuleRetention } from './components/modules/ModuleRetention.js';
import { ModuleIndicators } from './components/modules/ModuleIndicators.js';

const MainLayout: React.FC = () => {
  const { activeTenant, isLoading, permissions } = useTenant();
  const { user } = useAuth();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<number>(3); // Default to Module 3 (DNA) or 1
  const [isCareersView, setIsCareersView] = useState(false);
  const [careersSlugFromUrl, setCareersSlugFromUrl] = useState<string | undefined>(undefined);

  // Cross-module states
  const [targetJobId, setTargetJobId] = useState<string | undefined>(undefined);
  const [targetCandidateId, setTargetCandidateId] = useState<string | undefined>(undefined);
  const [targetSearchTerm, setTargetSearchTerm] = useState<string | undefined>(undefined);

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

  const handleNavigateToCareersPortal = (jobId?: string) => {
    setTargetJobId(jobId);
    setIsCareersView(true);
  };

  if (isCareersView) {
    return (
      <CareersPortalPage
        tenantSlug={careersSlugFromUrl || activeTenant?.slug || ''}
        onBackToAdmin={() => {
          setIsCareersView(false);
          setActiveModule(6); // return to Openings module
        }}
        initialJobId={targetJobId}
      />
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
        onNavigateToCandidate={handleNavigateToCandidate}
        onNavigateToProcess={handleNavigateToProcess}
        onNavigateToAI={handleNavigateToAI}
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
          onSelectModule={(id) => {
            if (id === 16) {
              setIsCareersView(true);
            } else {
              setIsCareersView(false);
              setActiveModule(id);
            }
          }}
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
            <>
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
                  onSelectCandidateForAI={handleNavigateToAI}
                  onNavigateToProcess={handleNavigateToProcess}
                  initialSearchTerm={targetSearchTerm}
                  initialSelectedCandidateId={targetCandidateId}
                />
              )}
              {activeModule === 8 && (
                <ModuleSelectionProcess
                  initialJobId={targetJobId}
                  initialCandidateId={targetCandidateId}
                  onNavigateToAI={handleNavigateToAI}
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
              {activeModule === 13 && <ModuleDevelopment />}
              {activeModule === 14 && <ModuleRetention />}
              {activeModule === 15 && <ModuleIndicators />}
            </>
          )}
        </main>
      </div>

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
  const { user, isReady } = useAuth();
  const slug = publicCareersSlug();

  if (!user && slug) {
    return <CareersPortalPage tenantSlug={slug} initialJobId={new URLSearchParams(window.location.search).get('job') || undefined} />;
  }
  if (!isReady) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-xs animate-pulse">Validando sessão...</div>;
  }
  if (!user) return <LoginPage />;
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
      {user.type === 'super_admin' ? <PlatformLayout /> : <MainLayout />}
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
