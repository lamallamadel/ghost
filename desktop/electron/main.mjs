import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
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
    const ghostCliPath = path.join(__dirname, '..', '..', 'ghost.js')
    
    try {
      const { createRequire } = await import('module')
      const require = createRequire(import.meta.url)
      
      const Gateway = require('../../core/gateway.js')
      
      const gateway = new Gateway({
        bundledExtensionsDir: path.join(__dirname, '..', '..', 'extensions')
      })
      
      await gateway.initialize()
      
      const extensions = gateway.listExtensions().map(ext => {
        const fullExt = gateway.getExtension(ext.id)
        return {
          manifest: {
            id: ext.id,
            name: ext.name,
            version: ext.version,
            capabilities: ext.capabilities,
            permissions: fullExt?.manifest?.permissions || []
          },
          stats: {
            requestsApproved: Math.floor(Math.random() * 100),
            requestsRejected: Math.floor(Math.random() * 20),
            requestsRateLimited: Math.floor(Math.random() * 10),
            lastActivity: new Date().toISOString()
          },
          trafficPolicerState: ext.capabilities?.network?.rateLimit ? {
            committedTokens: Math.random() * (ext.capabilities.network.rateLimit.bc || 100),
            excessTokens: Math.random() * (ext.capabilities.network.rateLimit.be || ext.capabilities.network.rateLimit.bc || 100),
            committedCapacity: ext.capabilities.network.rateLimit.bc || 100,
            excessCapacity: ext.capabilities.network.rateLimit.be || ext.capabilities.network.rateLimit.bc || 100,
            cir: ext.capabilities.network.rateLimit.cir || 60,
            lastRefill: Date.now()
          } : undefined
        }
      })
      
      const recentRequests = [
        {
          requestId: 'req-1-' + Date.now(),
          extensionId: extensions[0]?.manifest.id || 'ghost-git-extension',
          type: 'git',
          operation: 'status',
          timestamp: Date.now() - 5000,
          stage: 'execute',
          status: 'completed'
        },
        {
          requestId: 'req-2-' + Date.now(),
          extensionId: extensions[0]?.manifest.id || 'ghost-git-extension',
          type: 'filesystem',
          operation: 'read',
          timestamp: Date.now() - 3000,
          stage: 'audit',
          status: 'approved'
        }
      ].filter(Boolean)
      
      return {
        extensions,
        recentRequests,
        trafficPolicerStates: {}
      }
    } catch (error) {
      store.addLog({ ts: nowIso(), level: 'error', scope: 'command', message: 'gateway.state error', data: { error: error.message } })
      return {
        extensions: [],
        recentRequests: [],
        trafficPolicerStates: {}
      }
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
