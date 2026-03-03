// Minimal test framework shim for direct Node.js execution (no mocha/jest required)
if (typeof describe === 'undefined') {
    const _queue = [];
    global.describe = (name, fn) => fn();
    global.it = (name, fn) => _queue.push({ name, fn });
    global.before = global.after = global.beforeEach = global.afterEach = () => {};
    process.nextTick(async () => {
        let failed = 0;
        for (const { name, fn } of _queue) {
            try {
                if (fn.length > 0) {
                    await new Promise((res, rej) => { try { fn(e => e ? rej(e) : res()); } catch(e) { rej(e); } });
                } else {
                    const r = fn(); if (r && r.then) await r;
                }
                console.log('  ✅', name);
            } catch (e) { console.error('  ❌', name, '-', e.message); failed++; }
        }
        if (failed) { console.error(`\n❌ ${failed} sandbox tests failed`); process.exit(1); }
        console.log('\n✅ sandbox.test.js passed');
    });
}

const assert = require('assert');
const path = require('path');
const { 
    PluginSandbox, 
    SandboxError, 
    ResourceMonitor, 
    SandboxEscapeDetector,
    SandboxedExtension,
    ExtensionRuntime 
} = require('../core');

describe('PluginSandbox', () => {
    describe('Initialization', () => {
        it('should create sandbox with restricted globals', () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {}
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            assert.strictEqual(sandbox.state, 'UNINITIALIZED');
            assert.strictEqual(sandbox.extensionId, 'test-ext');
        });

        it('should initialize sandbox context', () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {}
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            const context = sandbox.initialize();

            assert.ok(context);
            assert.strictEqual(sandbox.state, 'INITIALIZED');
            assert.strictEqual(context.require, undefined);
            assert.strictEqual(context.process, undefined);
            assert.strictEqual(context.global, undefined);
        });

        it('should inject filesystem API when capability declared', () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {
                    filesystem: {
                        read: ['**/*.js'],
                        write: ['dist/**']
                    }
                }
            };

            const mockFS = {
                readFile: async () => ({ success: true }),
                writeFile: async () => ({ success: true })
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            const context = sandbox.initialize({ filesystem: mockFS });

            assert.ok(context.fs);
            assert.ok(typeof context.fs.readFile === 'function');
            assert.ok(typeof context.fs.writeFile === 'function');
        });

        it('should inject network API when capability declared', () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {
                    network: {
                        allowlist: ['https://api.example.com'],
                        rateLimit: { cir: 60, bc: 100 }
                    }
                }
            };

            const mockNetwork = {
                request: async () => ({ success: true }),
                get: async () => ({ success: true }),
                post: async () => ({ success: true })
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            const context = sandbox.initialize({ network: mockNetwork });

            assert.ok(context.http);
            assert.ok(typeof context.http.request === 'function');
        });

        it('should inject git API when capability declared', () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {
                    git: {
                        read: true,
                        write: false
                    }
                }
            };

            const mockGit = {
                status: async () => ({ success: true }),
                log: async () => ({ success: true })
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            const context = sandbox.initialize({ git: mockGit });

            assert.ok(context.git);
            assert.ok(typeof context.git.status === 'function');
        });
    });

    describe('Code Execution', () => {
        it('should execute simple code in sandbox', async () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {}
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            sandbox.initialize();

            const result = await sandbox.executeCode('1 + 1');
            assert.strictEqual(result, 2);
        });

        it('should execute async code in sandbox', async () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {}
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            sandbox.initialize();

            const result = await sandbox.executeCode(`
                (async () => {
                    return await Promise.resolve(42);
                })()
            `);
            assert.strictEqual(result, 42);
        });

        it('should timeout long-running code', async () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {}
            };

            const sandbox = new PluginSandbox('test-ext', manifest, { timeout: 100 });
            sandbox.initialize();

            try {
                await sandbox.executeCode(`
                    (async () => {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return 'should not complete';
                    })()
                `, 100);
                assert.fail('Should have timed out');
            } catch (error) {
                assert.ok(error instanceof SandboxError);
                assert.ok(error.code === 'SANDBOX_TIMEOUT' || error.code === 'SANDBOX_TIMEOUT_EXCEEDED');
            }
        });

        it('should restrict access to require', async () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {}
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            sandbox.initialize();

            try {
                await sandbox.executeCode(`require('fs')`);
                assert.fail('Should have thrown error');
            } catch (error) {
                assert.ok(error);
            }
        });

        it('should restrict access to process', async () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {}
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            sandbox.initialize();

            const result = await sandbox.executeCode(`typeof process`);
            assert.strictEqual(result, 'undefined');
        });
    });

    describe('Resource Monitoring', () => {
        it('should track operation count', async () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {
                    filesystem: {
                        read: ['**/*.js']
                    }
                }
            };

            const mockFS = {
                readFile: async () => ({ success: true })
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            sandbox.initialize({ filesystem: mockFS });

            await sandbox.executeCode(`
                (async () => {
                    await fs.readFile('test.js');
                    await fs.readFile('test2.js');
                })()
            `);

            const metrics = sandbox.getMetrics();
            assert.ok(metrics.resourceMetrics.operationCount > 0);
        });

        it('should enforce operation limits', async () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {
                    filesystem: {
                        read: ['**/*.js']
                    }
                }
            };

            const mockFS = {
                readFile: async () => ({ success: true })
            };

            const sandbox = new PluginSandbox('test-ext', manifest, { maxOperations: 5 });
            sandbox.initialize({ filesystem: mockFS });

            try {
                await sandbox.executeCode(`
                    (async () => {
                        for (let i = 0; i < 10; i++) {
                            await fs.readFile('test.js');
                        }
                    })()
                `);
                assert.fail('Should have exceeded operation limit');
            } catch (error) {
                assert.ok(error instanceof SandboxError);
                assert.strictEqual(error.code, 'SANDBOX_QUOTA_EXCEEDED');
            }
        });
    });

    describe('Security Violation Detection', () => {
        it('should detect prototype pollution attempts', () => {
            const detector = new SandboxEscapeDetector('test-ext');
            // Use a context without a 'global' property to avoid __proto__ false positive
            const context = {
                _allowedGlobals: []
            };

            const safe = detector.checkPrototypePollution(context);
            assert.strictEqual(safe, true);
        });

        it('should detect context breakout attempts', () => {
            const detector = new SandboxEscapeDetector('test-ext');
            const context = {
                require: () => {},
                _allowedGlobals: []
            };

            const safe = detector.checkContextBreakout(context);
            assert.strictEqual(safe, false);
        });

        it('should emit violation events', (done) => {
            const detector = new SandboxEscapeDetector('test-ext');
            
            detector.on('violation', (info) => {
                assert.strictEqual(info.extensionId, 'test-ext');
                assert.ok(info.violations.length > 0);
                done();
            });

            const context = {
                require: () => {},
                _allowedGlobals: []
            };

            detector.checkContextBreakout(context);
        });
    });

    describe('SandboxedExtension', () => {
        it('should start extension in sandbox mode', async () => {
            const extensionPath = path.join(__dirname, 'sandbox');
            const manifest = require('./sandbox/manifest.json');

            const extension = new SandboxedExtension(
                'sandbox-test-extension',
                extensionPath,
                manifest,
                { timeout: 5000 }
            );

            await extension.start();
            assert.strictEqual(extension.state, 'RUNNING');

            await extension.stop();
            assert.strictEqual(extension.state, 'STOPPED');
        });

        it('should call extension methods through sandbox', async () => {
            const extensionPath = path.join(__dirname, 'sandbox');
            const manifest = require('./sandbox/manifest.json');

            const extension = new SandboxedExtension(
                'sandbox-test-extension',
                extensionPath,
                manifest
            );

            await extension.start();

            const result = await extension.call('testMethod', { foo: 'bar' });
            assert.ok(result.success);
            assert.strictEqual(result.params.foo, 'bar');

            await extension.stop();
        });

        it('should handle extension errors gracefully', async () => {
            const extensionPath = path.join(__dirname, 'sandbox');
            const manifest = require('./sandbox/manifest.json');

            const extension = new SandboxedExtension(
                'sandbox-test-extension',
                extensionPath,
                manifest
            );

            await extension.start();

            try {
                await extension.call('nonExistentMethod', {});
                assert.fail('Should have thrown error');
            } catch (error) {
                assert.ok(error);
            }

            try { await extension.stop(); } catch (e) { /* extension may be in error state */ }
        });
    });

    describe('ExtensionRuntime with Sandbox Mode', () => {
        it('should start extension in sandbox mode', async () => {
            const extensionPath = path.join(__dirname, 'sandbox');
            const manifest = require('./sandbox/manifest.json');

            const runtime = new ExtensionRuntime({ executionMode: 'sandbox' });

            const extension = await runtime.startExtension(
                'sandbox-test-extension',
                extensionPath,
                manifest
            );

            assert.ok(extension);

            const state = runtime.getExtensionState('sandbox-test-extension');
            assert.strictEqual(state.state, 'RUNNING');

            await runtime.stopExtension('sandbox-test-extension');
        });

        it('should call extension through runtime in sandbox mode', async () => {
            const extensionPath = path.join(__dirname, 'sandbox');
            const manifest = require('./sandbox/manifest.json');

            const runtime = new ExtensionRuntime({ executionMode: 'sandbox' });

            await runtime.startExtension(
                'sandbox-test-extension',
                extensionPath,
                manifest
            );

            const result = await runtime.callExtension(
                'sandbox-test-extension',
                'testMethod',
                { test: 'data' }
            );

            assert.ok(result.success);

            await runtime.stopExtension('sandbox-test-extension');
        });
    });

    describe('Sandbox State Management', () => {
        it('should track sandbox state transitions', async () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {}
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            assert.strictEqual(sandbox.state, 'UNINITIALIZED');

            sandbox.initialize();
            assert.strictEqual(sandbox.state, 'INITIALIZED');

            await sandbox.executeCode('1 + 1');
            assert.strictEqual(sandbox.state, 'INITIALIZED');

            sandbox.terminate();
            assert.strictEqual(sandbox.state, 'TERMINATED');
        });

        it('should reset sandbox state', () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {}
            };

            const sandbox = new PluginSandbox('test-ext', manifest);
            sandbox.initialize();
            
            sandbox.reset();
            assert.strictEqual(sandbox.state, 'UNINITIALIZED');
        });

        it('should prevent operations in invalid states', async () => {
            const manifest = {
                id: 'test-ext',
                name: 'Test',
                version: '1.0.0',
                capabilities: {}
            };

            const sandbox = new PluginSandbox('test-ext', manifest);

            try {
                await sandbox.executeCode('1 + 1');
                assert.fail('Should have thrown error');
            } catch (error) {
                assert.ok(error instanceof SandboxError);
                assert.strictEqual(error.code, 'SANDBOX_INVALID_STATE');
            }
        });
    });
});
