const fs = require('fs');
const path = require('path');
const child = require('child_process');

(async ()=>{
  const repoRoot = path.resolve(__dirname, '..');
  const td = path.join(repoRoot, 'test_missing_ignore');
  if (fs.existsSync(td)) fs.rmSync(td, {recursive:true, force:true});
  fs.mkdirSync(td, { recursive: true });
  process.chdir(td);
  child.execSync('git init');
  child.execSync('git config user.email "test@example.com"');
  child.execSync('git config user.name "Test User"');
  const fake = 'AKIA' + 'T'.repeat(16);
  fs.writeFileSync('secrets.conf', `api_key = \"${fake}\"`);
  if (fs.existsSync('.ghostignore')) fs.unlinkSync('.ghostignore');

  try {
    const out = child.execSync('node "'+path.join(repoRoot,'ghost.js')+'" audit', { encoding: 'utf8', cwd: td });
    console.log('AUDIT OUTPUT:\n', out);
  } catch (e) {
    console.log('AUDIT ERROR OUTPUT:\n', (e.stdout || '') + '\n' + (e.stderr || ''));
  }
})();
