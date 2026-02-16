"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRepositories } from "@/hooks/use-repositories";
import { useSettings } from "@/hooks/use-settings";
import {
  useCompleteSetup,
  useDiscoverRepos,
  useVerifyGitHub,
  useVerifyRepository,
  useVerifyWorkspace,
} from "@/hooks/use-setup";
import type {
  DiscoveredRepo,
  VerifyGitHubResponse,
  VerifyRepositoryResponse,
  VerifyWorkspaceResponse,
} from "@/lib/api";
import { GitHubStep } from "./github-step";
import { RepositoryStep } from "./repository-step";
import { ReviewStep } from "./review-step";
import { type Step, StepIndicator } from "./step-indicator";
import { WorkspaceStep } from "./workspace-step";

const STORAGE_KEY = "gogo-setup";
const DISCOVERY_PATH_KEY = "gogo-scan-path";

export interface SelectedRepo {
  owner: string;
  name: string;
  triggerLabel: string;
  baseBranch: string;
  path?: string;
}

interface SetupState {
  githubToken: string;
  reuseTokenFromRepoId: string | null;
  selectedRepos: SelectedRepo[];
  workspacePath: string;
  discoveryPath: string;
}

interface VerificationState {
  github: VerifyGitHubResponse | null;
  repository: Map<string, VerifyRepositoryResponse>;
  workspace: VerifyWorkspaceResponse | null;
}

const defaultState: SetupState = {
  githubToken: "",
  reuseTokenFromRepoId: null,
  selectedRepos: [],
  workspacePath: "/tmp/agent-work",
  discoveryPath: "~",
};

const steps: Step[] = [
  { id: 1, title: "GitHub", description: "Connect your token" },
  { id: 2, title: "Repository", description: "Select repositories" },
  { id: 3, title: "Workspace", description: "Configure directory" },
  { id: 4, title: "Review", description: "Complete setup" },
];

function repoKey(owner: string, name: string) {
  return `${owner}/${name}`;
}

// Read localStorage once synchronously for initial state
function loadSavedState(): {
  state: SetupState;
  currentStep: number;
  completedSteps: number[];
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedState = parsed.state;
    // Migrate old format: single owner/name → selectedRepos[]
    if (savedState && !savedState.selectedRepos && savedState.owner) {
      savedState.selectedRepos = [
        {
          owner: savedState.owner,
          name: savedState.name || "",
          triggerLabel: savedState.triggerLabel || "agent",
          baseBranch: savedState.baseBranch || "main",
        },
      ];
      delete savedState.owner;
      delete savedState.name;
      delete savedState.triggerLabel;
      delete savedState.baseBranch;
    }
    return {
      state: { ...defaultState, ...savedState },
      currentStep: parsed.currentStep || 1,
      completedSteps: parsed.completedSteps || [],
    };
  } catch {
    return null;
  }
}

export function SetupWizard() {
  const router = useRouter();
  // Read localStorage snapshot (ref doesn't affect rendering, so no hydration issue)
  const saved = useRef(loadSavedState());

  // Initialize with defaults — loaded from localStorage in effect below to avoid hydration mismatch
  // (server returns null from loadSavedState, client returns data → different initial values)
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [state, setState] = useState<SetupState>(defaultState);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [verification, setVerification] = useState<VerificationState>({
    github: null,
    repository: new Map(),
    workspace: null,
  });
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [discoveredRepos, setDiscoveredRepos] = useState<DiscoveredRepo[]>([]);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const hasCheckedExisting = useRef(false);

  // Fetch existing settings and repositories
  const { data: existingSettings, isLoading: isLoadingSettings } = useSettings();
  const { data: existingRepos = [], isLoading: isLoadingRepos } = useRepositories();

  // Mutations
  const verifyGitHub = useVerifyGitHub();
  const discoverRepos = useDiscoverRepos();
  const verifyRepository = useVerifyRepository();
  const verifyWorkspace = useVerifyWorkspace();
  const completeSetup = useCompleteSetup();

  // Load saved state from localStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    if (saved.current) {
      setState(saved.current.state);
      setCurrentStep(saved.current.currentStep);
      setCompletedSteps(saved.current.completedSteps);
    }
    setHasHydrated(true);
  }, []);

  // Check for existing token and pre-fill/skip GitHub step
  useEffect(() => {
    if (hasCheckedExisting.current || isLoadingSettings || isLoadingRepos) return;

    const existingToken =
      existingRepos.length > 0 ? existingRepos[0].githubToken : (existingSettings?.personalAccessToken as string);

    const existingWorkspace =
      existingRepos.length > 0 ? existingRepos[0].workdirPath : (existingSettings?.workDirectory as string);

    if (existingToken && existingToken !== "***") {
      hasCheckedExisting.current = true;
      setState((prev) => ({
        ...prev,
        githubToken: existingToken,
        workspacePath: existingWorkspace || prev.workspacePath,
      }));
      verifyGitHub.mutate(existingToken, {
        onSuccess: (result) => {
          if (result.success) {
            setVerification((prev) => ({ ...prev, github: result }));
            setCompletedSteps([1]);
            setCurrentStep(2);
          }
        },
      });
    } else if (existingRepos.length > 0) {
      hasCheckedExisting.current = true;
      setState((prev) => ({
        ...prev,
        githubToken: "",
        reuseTokenFromRepoId: existingRepos[0].id,
        workspacePath: existingWorkspace || prev.workspacePath,
      }));
      setVerification((prev) => ({
        ...prev,
        github: {
          success: true,
          data: {
            username: "Connected",
            name: null,
            avatarUrl: "",
            scopes: ["repo"],
            rateLimit: {
              limit: 5000,
              remaining: 5000,
              reset: new Date().toISOString(),
            },
          },
        },
      }));
      setCompletedSteps([1]);
      setCurrentStep(2);
    } else {
      hasCheckedExisting.current = true;
    }
  }, [existingSettings, existingRepos, isLoadingSettings, isLoadingRepos, verifyGitHub]);

  // Save state to localStorage when it changes (only after initial hydration)
  useEffect(() => {
    if (!hasHydrated) return;
    const { githubToken: _token, ...safeState } = state;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: safeState,
        currentStep,
        completedSteps,
      }),
    );
    // Persist discovery path separately so it survives setup completion
    if (state.discoveryPath && state.discoveryPath !== defaultState.discoveryPath) {
      localStorage.setItem(DISCOVERY_PATH_KEY, state.discoveryPath);
    }
  }, [state, currentStep, completedSteps, hasHydrated]);

  const clearSavedState = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    // DISCOVERY_PATH_KEY intentionally preserved for future "Add repo" sessions
  }, []);

  // Step navigation
  const goToStep = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const markStepCompleted = useCallback((step: number) => {
    setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
  }, []);

  // GitHub step: verify-on-submit
  const handleGitHubContinue = useCallback(() => {
    verifyGitHub.mutate(state.githubToken, {
      onSuccess: (result) => {
        setVerification((prev) => ({ ...prev, github: result }));
        if (result.success) {
          markStepCompleted(1);
          goToStep(2);
        }
      },
    });
  }, [state.githubToken, verifyGitHub, markStepCompleted, goToStep]);

  // Repository step handlers
  const handleToggleRepo = useCallback((repo: DiscoveredRepo) => {
    setState((prev) => {
      const key = repoKey(repo.owner || "", repo.name || "");
      const exists = prev.selectedRepos.some((r) => repoKey(r.owner, r.name) === key);
      if (exists) {
        return {
          ...prev,
          selectedRepos: prev.selectedRepos.filter((r) => repoKey(r.owner, r.name) !== key),
        };
      }
      return {
        ...prev,
        selectedRepos: [
          ...prev.selectedRepos,
          {
            owner: repo.owner || "",
            name: repo.name || "",
            triggerLabel: "agent",
            baseBranch: repo.currentBranch || "main",
            path: repo.path,
          },
        ],
      };
    });
    // Clear verification for this repo when toggled
    setVerification((prev) => {
      const newMap = new Map(prev.repository);
      newMap.delete(repoKey(repo.owner || "", repo.name || ""));
      return { ...prev, repository: newMap };
    });
  }, []);

  const handleUpdateRepo = useCallback((index: number, updates: Partial<SelectedRepo>) => {
    setState((prev) => {
      const newRepos = [...prev.selectedRepos];
      newRepos[index] = { ...newRepos[index], ...updates };
      return { ...prev, selectedRepos: newRepos };
    });
  }, []);

  const handleRemoveRepo = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      selectedRepos: prev.selectedRepos.filter((_, i) => i !== index),
    }));
  }, []);

  // Verify all selected repos sequentially, then advance
  const [isVerifyingRepos, setIsVerifyingRepos] = useState(false);
  const [repoVerifyError, setRepoVerifyError] = useState<string | null>(null);

  const handleRepositoryContinue = useCallback(async () => {
    setIsVerifyingRepos(true);
    setRepoVerifyError(null);

    const tokenToUse = state.githubToken || undefined;
    const reuseId = state.reuseTokenFromRepoId || (existingRepos.length > 0 ? existingRepos[0].id : undefined);

    const newResults = new Map<string, VerifyRepositoryResponse>();
    let allPassed = true;

    for (const repo of state.selectedRepos) {
      try {
        const result = await verifyRepository.mutateAsync({
          owner: repo.owner,
          name: repo.name,
          token: tokenToUse,
          reuseTokenFromRepoId: !tokenToUse ? reuseId : undefined,
        });
        newResults.set(repoKey(repo.owner, repo.name), result);
        if (!result.success) {
          allPassed = false;
        }
        // Update base branch from actual default
        if (result.success && result.data?.defaultBranch) {
          setState((prev) => ({
            ...prev,
            selectedRepos: prev.selectedRepos.map((r) =>
              repoKey(r.owner, r.name) === repoKey(repo.owner, repo.name)
                ? {
                    ...r,
                    baseBranch: result.data?.defaultBranch ?? r.baseBranch,
                  }
                : r,
            ),
          }));
        }
      } catch (err) {
        newResults.set(repoKey(repo.owner, repo.name), {
          success: false,
          error: err instanceof Error ? err.message : "Verification failed",
        });
        allPassed = false;
      }
    }

    setVerification((prev) => ({ ...prev, repository: newResults }));
    setIsVerifyingRepos(false);

    if (allPassed) {
      markStepCompleted(2);
      goToStep(3);
    } else {
      setRepoVerifyError("Some repositories failed verification");
    }
  }, [
    state.githubToken,
    state.reuseTokenFromRepoId,
    state.selectedRepos,
    existingRepos,
    verifyRepository,
    markStepCompleted,
    goToStep,
  ]);

  // Discovery handlers
  const handleDiscover = useCallback(() => {
    setDiscoveryError(null);
    discoverRepos.mutate(
      { path: state.discoveryPath },
      {
        onSuccess: (result) => {
          if (result.success && result.data) {
            setDiscoveredRepos(result.data.repos);
            if (result.data.repos.length === 0) {
              setDiscoveryError("No git repositories found in this directory");
            }
          } else {
            setDiscoveryError(result.error || "Failed to discover repositories");
          }
        },
        onError: (error) => {
          setDiscoveryError(error.message);
        },
      },
    );
  }, [state.discoveryPath, discoverRepos]);

  // Auto-scan when reaching step 2 if a discovery path was persisted
  const discoverReposRef = useRef(discoverRepos);
  discoverReposRef.current = discoverRepos;
  const hasAutoScanned = useRef(false);
  useEffect(() => {
    if (currentStep !== 2 || hasAutoScanned.current) return;
    const path =
      state.discoveryPath !== defaultState.discoveryPath
        ? state.discoveryPath
        : localStorage.getItem(DISCOVERY_PATH_KEY);
    if (!path || path === defaultState.discoveryPath) return;
    hasAutoScanned.current = true;
    if (state.discoveryPath !== path) {
      setState((prev) => ({ ...prev, discoveryPath: path }));
    }
    discoverReposRef.current.mutate(
      { path },
      {
        onSuccess: (result) => {
          if (result.success && result.data) {
            setDiscoveredRepos(result.data.repos);
            if (result.data.repos.length === 0) {
              setDiscoveryError("No git repositories found in this directory");
            }
          } else {
            setDiscoveryError(result.error || "Failed to discover repositories");
          }
        },
        onError: (error) => {
          setDiscoveryError(error.message);
        },
      },
    );
  }, [currentStep, state.discoveryPath]);

  // Auto-scan after directory selection
  const handleDiscoveryPathChangeAndScan = useCallback(
    (path: string, autoScan?: boolean) => {
      setState((prev) => ({ ...prev, discoveryPath: path }));
      if (autoScan) {
        setDiscoveryError(null);
        discoverRepos.mutate(
          { path },
          {
            onSuccess: (result) => {
              if (result.success && result.data) {
                setDiscoveredRepos(result.data.repos);
                if (result.data.repos.length === 0) {
                  setDiscoveryError("No git repositories found in this directory");
                }
              } else {
                setDiscoveryError(result.error || "Failed to discover repositories");
              }
            },
            onError: (error) => {
              setDiscoveryError(error.message);
            },
          },
        );
      }
    },
    [discoverRepos],
  );

  // Workspace step: verify-on-submit
  const handleWorkspaceContinue = useCallback(() => {
    verifyWorkspace.mutate(state.workspacePath, {
      onSuccess: (result) => {
        setVerification((prev) => ({ ...prev, workspace: result }));
        const isVerified = result?.success === true && (result.data?.writable || result.data?.canCreate);
        if (isVerified) {
          markStepCompleted(3);
          goToStep(4);
        }
      },
    });
  }, [state.workspacePath, verifyWorkspace, markStepCompleted, goToStep]);

  // Complete setup — loop through all selected repos
  const handleComplete = useCallback(async () => {
    setCompleteError(null);

    const tokenToUse = state.githubToken || undefined;
    const reuseId = state.reuseTokenFromRepoId || (existingRepos.length > 0 ? existingRepos[0].id : undefined);

    for (const repo of state.selectedRepos) {
      try {
        const result = await completeSetup.mutateAsync({
          githubToken: tokenToUse,
          reuseTokenFromRepoId: !tokenToUse ? reuseId : undefined,
          owner: repo.owner,
          name: repo.name,
          triggerLabel: repo.triggerLabel,
          baseBranch: repo.baseBranch,
          workdirPath: state.workspacePath,
        });
        if (!result.success) {
          setCompleteError(`Setup failed for ${repo.owner}/${repo.name}: ${result.error || "Unknown error"}`);
          return;
        }
      } catch (err) {
        setCompleteError(
          `Setup failed for ${repo.owner}/${repo.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
        return;
      }
    }

    clearSavedState();
    router.push("/");
  }, [state, existingRepos, completeSetup, clearSavedState, router]);

  // Set of already-saved repo keys (owner/name) to disable in the picker
  const existingRepoKeys = useMemo(() => new Set(existingRepos.map((r) => repoKey(r.owner, r.name))), [existingRepos]);

  // State updaters
  const updateState = <K extends keyof SetupState>(key: K, value: SetupState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    if (key === "githubToken") {
      setVerification((prev) => ({
        ...prev,
        github: null,
        repository: new Map(),
      }));
    } else if (key === "workspacePath") {
      setVerification((prev) => ({ ...prev, workspace: null }));
    }
  };

  // Show loading state while hydrating from localStorage, checking for existing settings/repos,
  // or while auto-verifying an existing token — avoids flashing step 1
  const isAutoVerifying = hasCheckedExisting.current && verifyGitHub.isPending && currentStep === 1;
  if (!hasHydrated || isLoadingSettings || isLoadingRepos || !hasCheckedExisting.current || isAutoVerifying) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <StepIndicator steps={steps} currentStep={currentStep} completedSteps={completedSteps} />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <StepIndicator steps={steps} currentStep={currentStep} completedSteps={completedSteps} />

      {currentStep === 1 && (
        <GitHubStep
          token={state.githubToken}
          onTokenChange={(v) => updateState("githubToken", v)}
          onContinue={handleGitHubContinue}
          isVerifying={verifyGitHub.isPending}
          verificationResult={verification.github}
        />
      )}

      {currentStep === 2 && (
        <RepositoryStep
          selectedRepos={state.selectedRepos}
          existingRepoKeys={existingRepoKeys}
          onToggleRepo={handleToggleRepo}
          onUpdateRepo={handleUpdateRepo}
          onRemoveRepo={handleRemoveRepo}
          onBack={() => goToStep(1)}
          onContinue={handleRepositoryContinue}
          isVerifying={isVerifyingRepos}
          verificationResults={verification.repository}
          verifyError={repoVerifyError}
          discoveryPath={state.discoveryPath}
          onDiscoveryPathChange={(v) => handleDiscoveryPathChangeAndScan(v, false)}
          onDiscoveryPathSelect={(v) => handleDiscoveryPathChangeAndScan(v, true)}
          onDiscover={handleDiscover}
          isDiscovering={discoverRepos.isPending}
          discoveredRepos={discoveredRepos}
          discoveryError={discoveryError}
        />
      )}

      {currentStep === 3 && (
        <WorkspaceStep
          path={state.workspacePath}
          onPathChange={(v) => updateState("workspacePath", v)}
          onContinue={handleWorkspaceContinue}
          onBack={() => goToStep(2)}
          isVerifying={verifyWorkspace.isPending}
          verificationResult={verification.workspace}
        />
      )}

      {currentStep === 4 && (
        <ReviewStep
          githubUsername={verification.github?.data?.username || "Unknown"}
          selectedRepos={state.selectedRepos}
          workspacePath={state.workspacePath}
          onBack={() => goToStep(3)}
          onComplete={handleComplete}
          isCompleting={completeSetup.isPending}
          error={completeError}
        />
      )}
    </div>
  );
}
