import fs from 'node:fs'
import path from 'node:path'

export function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf8')
    if (!raw.trim()) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

export function createStore(filePath) {
  const base = {
    repos: [],
    history: [],
    gitOps: [],
    logs: [],
  }
  let state = readJson(filePath, base)

  function save() {
    writeJsonAtomic(filePath, state)
  }

  function getState() {
    return state
  }

  function setState(next) {
    state = next
    save()
  }

  function upsertRepo(repo) {
    const now = new Date().toISOString()
    const existingIdx = state.repos.findIndex((r) => r.path === repo.path)
    const nextRepo = { ...repo, lastOpenedAt: now }
    const nextRepos = existingIdx >= 0
      ? [nextRepo, ...state.repos.filter((r) => r.path !== repo.path)]
      : [nextRepo, ...state.repos]
    state = { ...state, repos: nextRepos.slice(0, 20) }
    save()
    return nextRepo
  }

  function addHistory(item) {
    const next = { ...item, id: `${Date.now()}-${Math.random().toString(16).slice(2)}` }
    state = { ...state, history: [next, ...state.history].slice(0, 2000) }
    save()
    return next
  }

  function addGitOp(item) {
    const next = { ...item, id: `${Date.now()}-${Math.random().toString(16).slice(2)}` }
    state = { ...state, gitOps: [next, ...state.gitOps].slice(0, 2000) }
    save()
    return next
  }

  function addLog(ev) {
    const next = { ...ev, id: `${Date.now()}-${Math.random().toString(16).slice(2)}` }
    state = { ...state, logs: [next, ...state.logs].slice(0, 10000) }
    save()
    return next
  }

  return { getState, setState, upsertRepo, addHistory, addGitOp, addLog }
}

