/// <reference types="vite/client" />

interface GhostAPI {
  repoSelect: () => Promise<unknown>;
  repoValidate: (repoPath: string) => Promise<unknown>;
  commandRun: (req: unknown) => Promise<unknown>;
  historyList: (req: unknown) => Promise<unknown>;
  gitValidateBefore: (req: unknown) => Promise<unknown>;
  gitExecute: (req: unknown) => Promise<unknown>;
  logsList: (req: unknown) => Promise<unknown>;
  logsExport: (req: unknown) => Promise<unknown>;
  appInfo: () => Promise<unknown>;
  gatewayState: () => Promise<unknown>;
  manualOverride: (req: unknown) => Promise<unknown>;
  reloadExtension: (extensionId: string) => Promise<unknown>;
  analyticsGetMetrics: (req?: { timeRange?: string }) => Promise<unknown>;
  analyticsGetDashboard: (req?: { timeRange?: string }) => Promise<unknown>;
  analyticsGetExtensionCallGraph: (req: { extensionId: string }) => Promise<unknown>;
  analyticsGetRecommendations: () => Promise<unknown>;
}

declare global {
  interface Window {
    ghost: GhostAPI;
  }
}

export {};
