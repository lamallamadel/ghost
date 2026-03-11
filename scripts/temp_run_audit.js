const fs=require('fs'),path=require('path'),child=require('child_process');
(async ()=>{
  const repoRoot=process.cwd();
  const td=path.join(repoRoot,'test_run_debug');
  if(fs.existsSync(td)) fs.rmSync(td,{recursive:true,force:true});
  fs.mkdirSync(td);
  process.chdir(td);
  child.execSync('git init');
  child.execSync('git config user.email "test@example.com"');
  child.execSync('git config user.name "Test User"');
  const fake='AKIA'+ 'T'.repeat(16);
  fs.writeFileSync('secrets.conf', `api_key = \"${fake}\"`);
  fs.writeFileSync('.ghostignore', 'secrets.conf');
  process.chdir(repoRoot);
  try {
    const out = child.execSync('node "'+path.join(repoRoot,'ghost.js')+'" audit', { encoding:'utf8', cwd: path.join(repoRoot,'test_run_debug') });
    fs.writeFileSync(path.join(repoRoot,'extensions','ghost-git-extension','last_audit_run.log'), out, 'utf8');
    console.log('WROTE LOG');
  } catch (e) {
    fs.writeFileSync(path.join(repoRoot,'extensions','ghost-git-extension','last_audit_run.log'), (e.stdout||'') + '\n' + (e.stderr||''), 'utf8');
    console.log('WROTE LOG WITH ERROR');
  }
})();
