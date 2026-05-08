import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { AppMenuEvents } from './app/app-menu-events';
import { WelcomeScreen } from './app/welcome';
import { Workspace } from './app/workspace';
import { IntegrationsProvider } from './features/integrations/integrations-provider';
import { Onboarding } from './features/onboarding/onboarding';
import { useAccountSession } from './lib/hooks/useAccount';
import { useLegacyPortStatus } from './lib/hooks/useLegacyPort';
import { WorkspaceLayoutContextProvider } from './lib/layout/layout-provider';
import { WorkspaceViewProvider } from './lib/layout/provider';
import { FeatureFlagProvider } from './lib/providers/feature-flag-override-context';
import { GithubContextProvider } from './lib/providers/github-context-provider';
import { ThemeProvider } from './lib/providers/theme-provider';
import { TerminalPoolProvider } from './lib/pty/pty-pool-provider';
import { queryClient } from './lib/query-client';
import { RightSidebarProvider } from './lib/ui/right-sidebar';
import { TooltipProvider } from './lib/ui/tooltip';

export const HAS_SEEN_ONBOARDING = 'emdash:has-seen-onboarding:v1';

type AppView = 'onboarding' | 'welcome' | 'workspace';
type OnboardingStep = 'sign-in' | 'import';

function getOnboardingSteps(
  session: { isSignedIn?: boolean } | undefined,
  legacyStatus: { hasImportSources?: boolean; portStatus?: unknown } | undefined
): OnboardingStep[] {
  const computed: OnboardingStep[] = [];
  if (!session?.isSignedIn) computed.push('sign-in');
  const needsImport = legacyStatus?.hasImportSources && !legacyStatus.portStatus;
  if (needsImport) computed.push('import');
  return computed;
}

function AppShell({
  children,
  onOpenSettings,
}: {
  children: ReactNode;
  onOpenSettings: () => boolean;
}) {
  return (
    <TooltipProvider delay={300}>
      <WorkspaceLayoutContextProvider>
        <TerminalPoolProvider>
          <GithubContextProvider>
            <IntegrationsProvider>
              <WorkspaceViewProvider>
                <AppMenuEvents onOpenSettings={onOpenSettings} />
                <RightSidebarProvider>
                  <ThemeProvider>{children}</ThemeProvider>
                </RightSidebarProvider>
              </WorkspaceViewProvider>
            </IntegrationsProvider>
          </GithubContextProvider>
        </TerminalPoolProvider>
      </WorkspaceLayoutContextProvider>
    </TooltipProvider>
  );
}

function ReadyAppContent({ initialSteps }: { initialSteps: OnboardingStep[] }) {
  const [view, setView] = useState<AppView>(() =>
    localStorage.getItem(HAS_SEEN_ONBOARDING) === 'true' ? 'workspace' : 'onboarding'
  );

  // Computed once when queries first resolve while in onboarding. Never updated
  // after that so query refetches mid-onboarding (e.g. legacyPortStatus after
  // import completes) cannot shrink the step list and unmount active step components.
  const [stepsNeeded] = useState<OnboardingStep[]>(() => initialSteps);

  const handleOnboardingComplete = () => {
    localStorage.setItem(HAS_SEEN_ONBOARDING, 'true');
    setView('welcome');
  };

  const handleGetStarted = () => {
    setView('workspace');
  };

  const handleOpenSettingsFromMenu = useCallback(() => {
    if (view === 'onboarding' && stepsNeeded.length > 0) return false;
    setView('workspace');
    return true;
  }, [view, stepsNeeded.length]);

  const renderContent = () => {
    if (view === 'onboarding' && stepsNeeded.length > 0) {
      return <Onboarding steps={stepsNeeded} onComplete={handleOnboardingComplete} />;
    }
    return (
      <>
        <Workspace />
        {view === 'welcome' && <WelcomeScreen onGetStarted={handleGetStarted} />}
      </>
    );
  };

  return <AppShell onOpenSettings={handleOpenSettingsFromMenu}>{renderContent()}</AppShell>;
}

function AppContent() {
  const { data: session, isLoading: sessionLoading } = useAccountSession();
  const { data: legacyStatus, isLoading: legacyLoading } = useLegacyPortStatus();

  const isLoading = sessionLoading || legacyLoading;
  const handleOpenSettingsWhileLoading = useCallback(() => false, []);

  if (isLoading) {
    return <AppShell onOpenSettings={handleOpenSettingsWhileLoading}>{null}</AppShell>;
  }

  return <ReadyAppContent initialSteps={getOnboardingSteps(session, legacyStatus)} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FeatureFlagProvider>
        <AppContent />
      </FeatureFlagProvider>
    </QueryClientProvider>
  );
}
