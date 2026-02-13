/// <reference types="vite/client" />

declare global {
  interface Window {
    ghost: {
      repoSelect: () => Promise<{ canceled: boolean; repoPath?: string; validation?: unknown }>
      repoValidate: (repoPath: string) => Promise<unknown>
      commandRun: (req: unknown) => Promise<unknown>
      historyList: (req: unknown) => Promise<unknown>
      gitValidateBefore: (req: unknown) => Promise<unknown>
      gitExecute: (req: unknown) => Promise<unknown>
      logsList: (req: unknown) => Promise<unknown>
      logsExport: (req: unknown) => Promise<unknown>
      appInfo: () => Promise<unknown>
    }
  }
}

export {}
