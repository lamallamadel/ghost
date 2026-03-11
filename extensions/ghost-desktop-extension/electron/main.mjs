import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createStore } from './storage.mjs'
import { executeGitOp, validateBeforeGitOp, validateRepo } from './git.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const devServerUrl = process.env.VITE_DEV_SERVER_URL
const isDev = Boolean(devServerUrl)

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#00000000',
    transparent: true,
    title: 'Ghost Console',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  if (isDev) {
    win.loadURL(devServerUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  return win
}

function nowIso() {
  return new Date().toISOString()
}

function getStorePath() {
  const userData = app.getPath('userData')
  return path.join(userData, 'ghost-console-store.json')
}

function safePreview(s, max = 4000) {
  if (!s) return ''
  if (s.length <= max) return s
  return s.slice(0, max) + '\n…'
}

function runCommand({ repoPath, command, args = [], env = {} }) {
  return new Promise((resolve) => {
    const startedAt = nowIso()
    const child = spawn(command, args, {
      cwd: repoPath || process.cwd(),
      env: { ...process.env, ...env },
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('close', (code) => {
      const finishedAt = nowIso()
      resolve({
        runId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        startedAt,
        finishedAt,
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      })
    })
  })
}

const ANALYTICS_API_PORT = 9876
const GHOST_CLI_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ghost.js')

function analyticsRequest(urlPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'localhost',
      port: ANALYTICS_API_PORT,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error('Invalid JSON from analytics server')) }
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function ghostCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [GHOST_CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env },
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
  })
}

app.whenReady().then(() => {
  const store = createStore(getStorePath())
  createMainWindow()

  ipcMain.handle('app.info', async () => {
    return {
      platform: os.platform(),
      arch: os.arch(),
      versions: process.versions,
      userDataPath: app.getPath('userData'),
      ghostCliPath: path.join(__dirname, '..', '..', 'ghost.js'),
    }
  })

  ipcMain.handle('repo.select', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const repoPath = res.filePaths[0]
    const validation = await validateRepo(repoPath)
    if (validation.ok) {
      store.upsertRepo({ path: repoPath, name: path.basename(repoPath) })
    }
    return { canceled: false, repoPath, validation }
  })

  ipcMain.handle('repo.validate', async (_, { repoPath }) => {
    const validation = await validateRepo(repoPath)
    if (validation.ok) {
      store.upsertRepo({ path: repoPath, name: path.basename(repoPath) })
    }
    return validation
  })

  ipcMain.handle('command.run', async (_, req) => {
    const startedAt = nowIso()
    store.addLog({ ts: startedAt, level: 'info', scope: 'command', message: 'command.run', data: { repoPath: req.repoPath, command: req.command, args: req.args } })
    const result = await runCommand(req)
    const item = store.addHistory({
      repoPath: req.repoPath,
      command: req.command,
      args: req.args || [],
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      stdoutPreview: safePreview(result.stdout),
      stderrPreview: safePreview(result.stderr),
    })
    store.addLog({ ts: nowIso(), level: result.exitCode === 0 ? 'info' : 'error', scope: 'command', message: 'command.finished', data: { historyId: item.id, exitCode: result.exitCode } })
    return { result, historyItem: item }
  })

  ipcMain.handle('history.list', async (_, req) => {
    const { repoPath, q = '', limit = 100, offset = 0 } = req || {}
    const state = store.getState()
    const list = state.history
      .filter((h) => (repoPath ? h.repoPath === repoPath : true))
      .filter((h) => (q ? (h.command + ' ' + (h.args || []).join(' ') + ' ' + (h.stdoutPreview || '') + ' ' + (h.stderrPreview || '')).toLowerCase().includes(String(q).toLowerCase()) : true))

    const total = list.length
    const items = list.slice(offset, offset + limit)
    return { items, total }
  })

  ipcMain.handle('git.validateBefore', async (_, req) => {
    return validateBeforeGitOp(req)
  })

  ipcMain.handle('git.execute', async (_, req) => {
    const validation = await validateBeforeGitOp(req)
    if (!validation.ok) {
      store.addLog({ ts: nowIso(), level: 'warn', scope: 'validation', message: 'git.validation_failed', data: { kind: req.kind, repoPath: req.repoPath, checks: validation.checks } })
      return { ok: false, validation, result: { exitCode: 1, stdout: '', stderr: 'Validation échouée' } }
    }

    const startedAt = nowIso()
    store.addLog({ ts: startedAt, level: 'info', scope: 'git', message: 'git.execute', data: req })

    const result = await executeGitOp(req)
    store.addGitOp({ repoPath: req.repoPath, kind: req.kind, request: req, startedAt, finishedAt: nowIso(), exitCode: result.exitCode, stdoutPreview: safePreview(result.stdout), stderrPreview: safePreview(result.stderr) })
    store.addLog({ ts: nowIso(), level: result.exitCode === 0 ? 'info' : 'error', scope: 'git', message: 'git.finished', data: { kind: req.kind, exitCode: result.exitCode } })
    return { ok: result.exitCode === 0, validation, result }
  })

  ipcMain.handle('logs.list', async (_, req) => {
    const { level, scope, limit = 500 } = req || {}
    const logs = store.getState().logs
      .filter((l) => (level ? l.level === level : true))
      .filter((l) => (scope ? l.scope === scope : true))
      .slice(0, limit)
    return { items: logs }
  })

  ipcMain.handle('logs.export', async (_, req) => {
    const { format = 'jsonl' } = req || {}
    const res = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('documents'), `ghost-console-logs.${format === 'json' ? 'json' : 'log'}`),
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    const state = store.getState()
    if (format === 'json') {
      fs.writeFileSync(res.filePath, JSON.stringify(state.logs, null, 2), 'utf8')
    } else {
      const jsonl = state.logs.map((l) => JSON.stringify(l)).join('\n')
      fs.writeFileSync(res.filePath, jsonl, 'utf8')
    }
    return { canceled: false, filePath: res.filePath }
  })

  ipcMain.handle('gateway.state', async () => {
    try {
      const { exitCode, stdout } = await ghostCli(['gateway', 'extensions', '--json'])
      if (exitCode !== 0) throw new Error('CLI exited with code ' + exitCode)

      const extensionsData = JSON.parse(stdout)
      const extensions = extensionsData.map((ext) => ({
        manifest: {
          id: ext.id,
          name: ext.name,
          version: ext.version,
          capabilities: ext.manifest?.capabilities,
          permissions: ext.manifest?.permissions || [],
        },
        stats: {
          requestsApproved: 0,
          requestsRejected: 0,
          requestsRateLimited: 0,
          lastActivity: new Date().toISOString(),
        },
        trafficPolicerState: ext.manifest?.capabilities?.network?.rateLimit
          ? {
              committedTokens: ext.manifest.capabilities.network.rateLimit.bc || 0,
              excessTokens: ext.manifest.capabilities.network.rateLimit.be || 0,
              committedCapacity: ext.manifest.capabilities.network.rateLimit.bc || 100,
              excessCapacity: ext.manifest.capabilities.network.rateLimit.be || 100,
              cir: ext.manifest.capabilities.network.rateLimit.cir || 60,
              lastRefill: Date.now(),
            }
          : undefined,
      }))

      return { extensions, recentRequests: [], trafficPolicerStates: {} }
    } catch (error) {
      store.addLog({ ts: nowIso(), level: 'error', scope: 'command', message: 'gateway.state error', data: { error: error.message } })
      return { extensions: [], recentRequests: [], trafficPolicerStates: {} }
    }
  })

  ipcMain.handle('gateway.manualOverride', async (_, req) => {
    const { extensionId, type, operation, reason, params } = req
    
    if (!reason || reason.trim().length < 10) {
      return {
        approved: false,
        reason: 'Justification insuffisante (minimum 10 caractères)'
      }
    }
    
    const auditLogId = `audit-override-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    store.addLog({
      ts: nowIso(),
      level: 'warn',
      scope: 'validation',
      message: 'SI-10(1) Manual Override',
      data: {
        auditLogId,
        extensionId,
        type,
        operation,
        reason,
        params,
        operator: 'system',
        timestamp: new Date().toISOString()
      }
    })
    
    return {
      approved: true,
      auditLogId
    }
  })

  ipcMain.handle('gateway.reloadExtension', async (_, { extensionId }) => {
    try {
      store.addLog({ ts: nowIso(), level: 'info', scope: 'command', message: 'gateway.reloadExtension', data: { extensionId } })

      const { exitCode, stderr } = await ghostCli(['gateway', 'reload', extensionId, '--force'])

      if (exitCode !== 0) {
        const msg = stderr.trim() || `Extension ${extensionId} introuvable`
        store.addLog({ ts: nowIso(), level: 'error', scope: 'command', message: 'gateway.reloadExtension.error', data: { extensionId, error: msg } })
        return { success: false, error: msg }
      }

      store.addLog({ ts: nowIso(), level: 'info', scope: 'command', message: 'gateway.reloadExtension.success', data: { extensionId } })
      return { success: true }
    } catch (error) {
      store.addLog({ ts: nowIso(), level: 'error', scope: 'command', message: 'gateway.reloadExtension.error', data: { extensionId, error: error.message } })
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('analytics.getMetrics', async (_, { timeRange = '6h' } = {}) => {
    try {
      const data = await analyticsRequest(`/api/analytics/metrics?timeRange=${timeRange}`)
      store.addLog({ ts: nowIso(), level: 'info', scope: 'analytics', message: 'analytics.getMetrics', data: { timeRange } })
      return data
    } catch (error) {
      store.addLog({ ts: nowIso(), level: 'error', scope: 'analytics', message: 'analytics.getMetrics.error', data: { error: error.message } })
      return { metrics: {}, timestamp: Date.now(), error: error.message }
    }
  })

  ipcMain.handle('analytics.getDashboard', async (_, { timeRange = '6h' } = {}) => {
    try {
      const data = await analyticsRequest(`/api/analytics/dashboard?timeRange=${timeRange}`)
      store.addLog({ ts: nowIso(), level: 'info', scope: 'analytics', message: 'analytics.getDashboard', data: { timeRange } })
      return data
    } catch (error) {
      store.addLog({ ts: nowIso(), level: 'error', scope: 'analytics', message: 'analytics.getDashboard.error', data: { error: error.message } })
      return { timestamp: Date.now(), metrics: {}, behavior: null, cost: null, performance: { alerts: [] }, tracing: null, error: error.message }
    }
  })

  ipcMain.handle('analytics.getExtensionCallGraph', async (_, { extensionId }) => {
    try {
      const data = await analyticsRequest(`/api/analytics/extension/${encodeURIComponent(extensionId)}/callgraph`)
      store.addLog({ ts: nowIso(), level: 'info', scope: 'analytics', message: 'analytics.getExtensionCallGraph', data: { extensionId } })
      return data
    } catch (error) {
      store.addLog({ ts: nowIso(), level: 'error', scope: 'analytics', message: 'analytics.getExtensionCallGraph.error', data: { extensionId, error: error.message } })
      return { extensionId, callGraph: null, timestamp: Date.now(), error: error.message }
    }
  })

  ipcMain.handle('analytics.getRecommendations', async () => {
    try {
      const data = await analyticsRequest('/api/analytics/recommendations')
      store.addLog({ ts: nowIso(), level: 'info', scope: 'analytics', message: 'analytics.getRecommendations', data: {} })
      return data
    } catch (error) {
      store.addLog({ ts: nowIso(), level: 'error', scope: 'analytics', message: 'analytics.getRecommendations.error', data: { error: error.message } })
      return { recommendations: [], timestamp: Date.now(), error: error.message }
    }
  })

  ipcMain.handle('recommendations.analyzeRepo', async (_, { repoPath }) => {
    try {
      const data = await analyticsRequest('/api/analytics/recommendations/analyze', 'POST', { repoPath })
      store.addLog({ ts: nowIso(), level: 'info', scope: 'recommendations', message: 'recommendations.analyzeRepo', data: { repoPath } })
      return data
    } catch (error) {
      store.addLog({ ts: nowIso(), level: 'error', scope: 'recommendations', message: 'recommendations.analyzeRepo.error', data: { repoPath, error: error.message } })
      return { profile: null, recommendations: [], timestamp: Date.now(), error: error.message }
    }
  })

  ipcMain.handle('recommendations.recordFeedback', async (_, { extensionId, feedback }) => {
    try {
      const data = await analyticsRequest('/api/analytics/recommendations/feedback', 'POST', { extensionId, feedback })
      store.addLog({ ts: nowIso(), level: 'info', scope: 'recommendations', message: 'recommendations.recordFeedback', data: { extensionId, feedback } })
      return data
    } catch (error) {
      store.addLog({ ts: nowIso(), level: 'error', scope: 'recommendations', message: 'recommendations.recordFeedback.error', data: { extensionId, error: error.message } })
      return { success: false, timestamp: Date.now(), error: error.message }
    }
  })

  ipcMain.handle('recommendations.getConversionRates', async () => {
    try {
      const data = await analyticsRequest('/api/analytics/recommendations/conversion-rates')
      store.addLog({ ts: nowIso(), level: 'info', scope: 'recommendations', message: 'recommendations.getConversionRates', data: {} })
      return data
    } catch (error) {
      store.addLog({ ts: nowIso(), level: 'error', scope: 'recommendations', message: 'recommendations.getConversionRates.error', data: { error: error.message } })
      return { rates: {}, timestamp: Date.now(), error: error.message }
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
