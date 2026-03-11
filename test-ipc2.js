const { spawn } = require('child_process');

const child = spawn('node', ['extensions/ghost-cli-extension/index.js'], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
});

child.on('message', (msg) => {
    console.log('Received:', msg);
    if (msg.result && msg.result.success) {
        console.log('Sending invoke...');
        child.send({ method: 'invoke', id: 2, jsonrpc: '2.0', params: {} });
    }
});

console.log('Sending init...');
child.send({ method: 'init', id: 1, jsonrpc: '2.0', params: {} });
