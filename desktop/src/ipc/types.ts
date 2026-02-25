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

export type ExtensionManifest = {
  id: string
  name: string
  version: string
  capabilities?: {
    filesystem?: { read?: string[]; write?: string[] }
    network?: { allowlist?: string[]; rateLimit?: { cir: number; bc: number; be?: number } }
    git?: { read?: boolean; write?: boolean }
  }
  permissions?: string[]
}

export type ExtensionStats = {
  requestsApproved: number
  requestsRejected: number
  requestsRateLimited: number
  lastActivity?: string
}

export type ExtensionInfo = {
  manifest: ExtensionManifest
  stats: ExtensionStats
  trafficPolicerState?: TrafficPolicerState
}

export type TrafficPolicerState = {
  committedTokens: number
  excessTokens: number
  committedCapacity: number
  excessCapacity: number
  cir: number
  lastRefill: number
}

export type PipelineRequest = {
  requestId: string
  extensionId: string
  type: string
  operation: string
  timestamp: number
  stage: 'intercept' | 'auth' | 'audit' | 'execute'
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed'
  dropReason?: string
  dropLayer?: 'auth' | 'audit'
}

export type GatewayState = {
  extensions: ExtensionInfo[]
  recentRequests: PipelineRequest[]
  trafficPolicerStates: Record<string, TrafficPolicerState>
}

export type ManualOverrideRequest = {
  extensionId: string
  type: string
  operation: string
  reason: string
  params: Record<string, unknown>
}

export type ManualOverrideResult = {
  approved: boolean
  auditLogId?: string
  reason?: string
}
