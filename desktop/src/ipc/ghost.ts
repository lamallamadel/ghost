import type {
  AppInfo,
  CommandRunRequest,
  CommandRunResult,
  GitOperationRequest,
  GitOperationResult,
  GitValidation,
  HistoryItem,
  HistoryListRequest,
  HistoryListResult,
  LogsExportRequest,
  LogsExportResult,
  LogsListRequest,
  LogsListResult,
  RepoSelectResult,
} from './types'

function ensure() {
  if (!window.ghost) throw new Error('Bridge Electron indisponible')
  return window.ghost
}

export const ghost = {
  repoSelect(): Promise<RepoSelectResult> {
    return ensure().repoSelect() as Promise<RepoSelectResult>
  },
  repoValidate(repoPath: string): Promise<GitValidation> {
    return ensure().repoValidate(repoPath) as Promise<GitValidation>
  },
  commandRun(req: CommandRunRequest): Promise<{ result: CommandRunResult; historyItem: HistoryItem }> {
    return ensure().commandRun(req) as Promise<{ result: CommandRunResult; historyItem: HistoryItem }>
  },
  historyList(req: HistoryListRequest): Promise<HistoryListResult> {
    return ensure().historyList(req) as Promise<HistoryListResult>
  },
  gitValidateBefore(req: GitOperationRequest): Promise<GitValidation> {
    return ensure().gitValidateBefore(req) as Promise<GitValidation>
  },
  gitExecute(req: GitOperationRequest): Promise<GitOperationResult> {
    return ensure().gitExecute(req) as Promise<GitOperationResult>
  },
  logsList(req: LogsListRequest): Promise<LogsListResult> {
    return ensure().logsList(req) as Promise<LogsListResult>
  },
  logsExport(req: LogsExportRequest): Promise<LogsExportResult> {
    return ensure().logsExport(req) as Promise<LogsExportResult>
  },
  appInfo(): Promise<AppInfo> {
    return ensure().appInfo() as Promise<AppInfo>
  },
}
