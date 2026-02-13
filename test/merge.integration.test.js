const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ghostPath = path.resolve(__dirname, '..', 'ghost.js');

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function trySh(cmd, cwd) {
  try {
    return { ok: true, out: sh(cmd, cwd) };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
  }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-merge-'));
try {
  sh('git init', tmpRoot);
  sh('git config user.email "test@example.com"', tmpRoot);
  sh('git config user.name "Test User"', tmpRoot);

  fs.writeFileSync(path.join(tmpRoot, 'file.txt'), 'line\n');
  sh('git add file.txt', tmpRoot);
  sh('git commit -m "chore: base"', tmpRoot);

  sh('git checkout -b branch-a', tmpRoot);
  fs.writeFileSync(path.join(tmpRoot, 'file.txt'), 'ours\n');
  sh('git add file.txt', tmpRoot);
  sh('git commit -m "feat: ours"', tmpRoot);

  sh('git checkout master', tmpRoot);
  fs.writeFileSync(path.join(tmpRoot, 'file.txt'), 'theirs\n');
  sh('git add file.txt', tmpRoot);
  sh('git commit -m "feat: theirs"', tmpRoot);

  const mergeRes = trySh('git merge branch-a', tmpRoot);
  assert.strictEqual(mergeRes.ok, false, 'merge should conflict');

  const statusRes = trySh(`node "${ghostPath}" merge status --ci`, tmpRoot);
  assert.strictEqual(statusRes.ok, false, statusRes.out);
  assert.ok(statusRes.out.includes('file.txt'), statusRes.out);

  const resolveRes = trySh(`node "${ghostPath}" merge resolve --strategy ours --ci`, tmpRoot);
  assert.strictEqual(resolveRes.ok, true, resolveRes.out);

  const remaining = sh('git diff --name-only --diff-filter=U', tmpRoot).trim();
  assert.strictEqual(remaining, '', remaining);

  const content = fs.readFileSync(path.join(tmpRoot, 'file.txt'), 'utf8');
  assert.strictEqual(content, 'theirs\n');

  console.log('✅ merge.integration.test.js passed');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
