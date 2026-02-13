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

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-version-hooks-'));
try {
  sh('git init', tmpRoot);
  sh('git config user.email "test@example.com"', tmpRoot);
  sh('git config user.name "Test User"', tmpRoot);

  fs.writeFileSync(
    path.join(tmpRoot, 'package.json'),
    JSON.stringify({ name: 'tmp', version: '0.1.0' }, null, 2) + '\n'
  );
  sh('git add package.json', tmpRoot);
  sh('git commit -m "chore: init"', tmpRoot);

  const installRes = trySh(`node "${ghostPath}" version install-hooks --ci`, tmpRoot);
  assert.strictEqual(installRes.ok, true, installRes.out);

  fs.writeFileSync(path.join(tmpRoot, 'feature.txt'), 'hello\n');
  sh('git add feature.txt', tmpRoot);

  const commit1 = trySh('git commit -m "feat: add feature"', tmpRoot);
  assert.strictEqual(commit1.ok, false, 'commit should be blocked without version bump');
  assert.ok(commit1.out.includes('requires a minor version bump') || commit1.out.includes('requires a patch version bump') || commit1.out.includes('requires a major version bump'), commit1.out);

  const bumpRes = trySh(`node "${ghostPath}" version bump --bump minor --tag --ci`, tmpRoot);
  assert.strictEqual(bumpRes.ok, true, bumpRes.out);

  const tagList = sh('git tag', tmpRoot);
  const tags = tagList.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  assert.ok(tags.includes('v0.2.0'), tagList);

  const commit2 = trySh('git commit -m "feat: add feature"', tmpRoot);
  assert.strictEqual(commit2.ok, true, commit2.out);

  console.log('✅ version-hooks.integration.test.js passed');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
