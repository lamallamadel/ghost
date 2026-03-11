const { spawn } = require('child_process');

const child = spawn('node', ['extensions/ghost-cli-extension/index.js'], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
});

child.on('message', (msg) => {
    console.log('Received:', msg);
    child.kill();
});

console.log('Sending init...');
child.send({ method: 'init', id: 1, jsonrpc: '2.0', params: {} });
