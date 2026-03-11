// run_audit_mock.js - lightweight helper to simulate audit invocation
const child = require('child_process');
const path = require('path');

const ghost = path.resolve(__dirname, '..', 'ghost.js');
try {
  const out = child.execSync(`node "${ghost}" audit`, { encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.error((e.stdout||'') + '\n' + (e.stderr||''));
}
