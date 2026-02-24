#!/usr/bin/env node

const path = require('path');
const { ExtensionRuntime } = require('../runtime');

const demoManifest = {
    id: 'sample-subprocess',
    name: 'Sample Subprocess Extension',
    version: '1.0.0',
    main: 'sample-subprocess-extension.js',
    config: {
        rules: {
            maxLineLength: 100
        }
    },
    capabilities: {
        filesystem: {
            read: ['**/*.js', '**/*.ts']
        },
        hooks: ['pre-commit', 'commit-msg']
    }
};

async function main() {
    console.log('=== Ghost Extension Runtime Demo ===\n');

    const runtime = new ExtensionRuntime({
        heartbeatTimeout: 10000,
        responseTimeout: 5000,
        maxRestarts: 3,
        restartWindow: 60000
    });

    runtime.on('extension-state-change', (info) => {
        console.log(`[STATE] ${info.extensionId}: ${info.state}`);
    });

    runtime.on('extension-error', (info) => {
        console.error(`[ERROR] ${info.extensionId}:`, info.error);
    });

    runtime.on('extension-crashed', (info) => {
        console.error(`[CRASHED] ${info.extensionId}: code=${info.code}, signal=${info.signal}`);
    });

    runtime.on('extension-restarted', (info) => {
        console.log(`[RESTARTED] ${info.extensionId}: restart count=${info.count}`);
    });

    runtime.on('extension-unresponsive', (info) => {
        console.warn(`[UNRESPONSIVE] ${info.extensionId}: ${info.timeSinceLastHeartbeat}ms since last heartbeat`);
    });

    runtime.on('extension-stderr', (info) => {
        console.error(`[STDERR] ${info.extensionId}:`, info.line);
    });

    try {
        console.log('Starting extension...');
        const extensionPath = __dirname;
        await runtime.startExtension(
            'sample-subprocess',
            extensionPath,
            demoManifest
        );
        console.log('Extension started successfully!\n');

        console.log('Getting extension state:');
        const state = runtime.getExtensionState('sample-subprocess');
        console.log(JSON.stringify(state, null, 2));
        console.log();

        console.log('Calling analyzeCode method...');
        const analyzeResult = await runtime.callExtension(
            'sample-subprocess',
            'analyzeCode',
            {
                filePath: 'test.js',
                content: 'function test() {\n  // TODO: implement this\n  const veryLongLineOfCodeThatExceedsTheMaximumLineLengthConfiguredInTheManifestFileAndWillTriggerAWarning = true;\n  return true;\n}'
            }
        );
        console.log('Analysis result:');
        console.log(JSON.stringify(analyzeResult, null, 2));
        console.log();

        console.log('Calling onCommitMsg hook...');
        const commitMsgResult = await runtime.callExtension(
            'sample-subprocess',
            'onCommitMsg',
            { message: 'feat: add new feature' }
        );
        console.log('Commit message validation result:');
        console.log(JSON.stringify(commitMsgResult, null, 2));
        console.log();

        console.log('Calling onCommitMsg with invalid message...');
        const invalidCommitResult = await runtime.callExtension(
            'sample-subprocess',
            'onCommitMsg',
            { message: 'invalid commit message' }
        );
        console.log('Invalid commit message validation result:');
        console.log(JSON.stringify(invalidCommitResult, null, 2));
        console.log();

        console.log('Getting health status:');
        const health = runtime.getHealthStatus();
        console.log(JSON.stringify(health, null, 2));
        console.log();

        console.log('Waiting 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Testing restart...');
        await runtime.restartExtension('sample-subprocess');
        console.log('Extension restarted successfully!\n');

        console.log('Calling method after restart...');
        const afterRestartResult = await runtime.callExtension(
            'sample-subprocess',
            'analyzeCode',
            {
                filePath: 'test2.js',
                content: 'const x = 1;'
            }
        );
        console.log('Result after restart:');
        console.log(JSON.stringify(afterRestartResult, null, 2));
        console.log();

        console.log('Getting all extension states:');
        const allStates = runtime.getAllExtensionStates();
        console.log(JSON.stringify(allStates, null, 2));
        console.log();

        console.log('Shutting down runtime...');
        await runtime.shutdown();
        console.log('Runtime shut down successfully!');

    } catch (error) {
        console.error('Demo failed:', error.message);
        console.error(error.stack);
        await runtime.shutdown();
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = main;
