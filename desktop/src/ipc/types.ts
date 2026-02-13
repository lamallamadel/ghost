export type RepoSelectResult = {
  canceled: boolean
  repoPath?: string
  validation?: GitValidation
}

export type GitValidation = {
  ok: boolean
  checks: Array<{ name: string; ok: boolean; message?: string }>
  meta?: { branch?: string; dirty?: boolean }
}

export type CommandRunRequest = {
  repoPath?: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

export type CommandRunResult = {
  runId: string
  startedAt: string
  finishedAt: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

export type HistoryItem = {
  id: string
  repoPath?: string
  command: string
  args: string[]
  startedAt: string
  finishedAt: string
  exitCode: number
  durationMs: number
  stdoutPreview: string
  stderrPreview: string
}

export type HistoryListRequest = {
  repoPath?: string
  q?: string
  limit?: number
  offset?: number
}

export type HistoryListResult = {
  items: HistoryItem[]
  total: number
}

export type GitOpKind = 'amend' | 'rebase' | 'cherry-pick'

export type GitOperationRequest =
  | { kind: 'amend'; repoPath: string; message?: string; stageAll?: boolean }
  | { kind: 'rebase'; repoPath: string; upstream: string; interactive: boolean }
  | { kind: 'cherry-pick'; repoPath: string; commits: string[]; mainline?: number }

export type GitOperationResult = {
  ok: boolean
  validation: GitValidation
  result: { exitCode: number; stdout: string; stderr: string }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogScope = 'command' | 'git' | 'validation' | 'storage'

export type LogEvent = {
  id?: string
  ts: string
  level: LogLevel
  scope: LogScope
  message: string
  data?: unknown
}

export type LogsListRequest = { level?: LogLevel; scope?: LogScope; limit?: number }
export type LogsListResult = { items: LogEvent[] }

export type LogsExportRequest = { format?: 'jsonl' | 'json' }
export type LogsExportResult = { canceled: boolean; filePath?: string }

export type AppInfo = {
  platform: string
  arch: string
  versions: Record<string, string>
  userDataPath: string
  ghostCliPath: string
}
