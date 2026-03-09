import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

function runGit(repoPath, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn('git', ['-C', repoPath, ...args], {
      env: { ...process.env, ...(opts.env || {}) },
      cwd: repoPath,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })
  })
}

export async function validateRepo(repoPath) {
  const checks = []
  if (!repoPath) {
    return { ok: false, checks: [{ name: 'repoPath', ok: false, message: 'Chemin manquant' }] }
  }

  const inside = await runGit(repoPath, ['rev-parse', '--is-inside-work-tree'])
  const isRepo = inside.exitCode === 0 && inside.stdout.trim() === 'true'
  checks.push({ name: 'git_repo', ok: isRepo, message: isRepo ? undefined : inside.stderr.trim() || 'Pas un dépôt Git' })
  if (!isRepo) return { ok: false, checks }

  const head = await runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = head.exitCode === 0 ? head.stdout.trim() : ''
  const detached = branch === 'HEAD'
  checks.push({ name: 'head', ok: !detached, message: detached ? 'HEAD détaché' : undefined })

  const status = await runGit(repoPath, ['status', '--porcelain'])
  const dirty = status.exitCode === 0 && status.stdout.trim().length > 0
  checks.push({ name: 'working_tree_clean', ok: !dirty, message: dirty ? 'Working tree non clean' : undefined })

  const gitDir = (await runGit(repoPath, ['rev-parse', '--git-dir'])).stdout.trim()
  const absGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(repoPath, gitDir)
  const rebaseInProgress = fs.existsSync(path.join(absGitDir, 'rebase-merge')) || fs.existsSync(path.join(absGitDir, 'rebase-apply'))
  const cherryPickInProgress = fs.existsSync(path.join(absGitDir, 'CHERRY_PICK_HEAD'))
  checks.push({ name: 'rebase_in_progress', ok: !rebaseInProgress, message: rebaseInProgress ? 'Rebase en cours' : undefined })
  checks.push({ name: 'cherry_pick_in_progress', ok: !cherryPickInProgress, message: cherryPickInProgress ? 'Cherry-pick en cours' : undefined })

  return { ok: checks.every((c) => c.ok), checks, meta: { branch, dirty, absGitDir } }
}

export async function validateBeforeGitOp(op) {
  const base = await validateRepo(op.repoPath)
  const checks = [...base.checks]
  if (!base.ok) return { ok: false, checks }

  if (op.kind === 'rebase') {
    const clean = checks.find((c) => c.name === 'working_tree_clean')
    if (clean && !clean.ok) {
      return { ok: false, checks }
    }
  }

  if (op.kind === 'cherry-pick') {
    if (!op.commits || op.commits.length === 0) {
      checks.push({ name: 'commits', ok: false, message: 'Aucun commit fourni' })
      return { ok: false, checks }
    }
  }

  return { ok: checks.every((c) => c.ok), checks }
}

export async function executeGitOp(op, opts = {}) {
  if (op.kind === 'amend') {
    if (op.stageAll) {
      const add = await runGit(op.repoPath, ['add', '-A'], opts)
      if (add.exitCode !== 0) return add
    }
    const args = op.message ? ['commit', '--amend', '-m', op.message] : ['commit', '--amend', '--no-edit']
    return runGit(op.repoPath, args, opts)
  }

  if (op.kind === 'rebase') {
    const args = op.interactive ? ['rebase', '-i', op.upstream] : ['rebase', op.upstream]
    return runGit(op.repoPath, args, opts)
  }

  if (op.kind === 'cherry-pick') {
    const args = ['cherry-pick', ...(op.mainline ? ['-m', String(op.mainline)] : []), ...op.commits]
    return runGit(op.repoPath, args, opts)
  }

  return { exitCode: 1, stdout: '', stderr: 'Opération Git inconnue' }
}

