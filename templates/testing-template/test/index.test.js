const assert = require('assert');
const TestingExtension = require('../index');

describe('Testing Extension', () => {
    let extension;

    beforeEach(async () => {
        extension = new TestingExtension();
        await extension.init({});
    });

    describe('Initialization', () => {
        it('should initialize with mock RPC client', () => {
            assert.ok(extension.mockRPCClient);
            assert.ok(typeof extension.mockRPCClient.call === 'function');
        });

        it('should initialize test results array', () => {
            assert.ok(Array.isArray(extension.testResults));
            assert.strictEqual(extension.testResults.length, 0);
        });
    });

    describe('Mock RPC Client', () => {
        it('should handle successful calls', async () => {
            const result = await extension.mockRPCClient.call('test.method', { data: 'test' });
            
            assert.strictEqual(result.jsonrpc, '2.0');
            assert.ok(result.result.success);
            assert.strictEqual(result.result.data.data, 'test');
        });

        it('should handle error calls', async () => {
            const result = await extension.mockRPCClient.callWithError('test.method', {});
            
            assert.strictEqual(result.jsonrpc, '2.0');
            assert.ok(result.error);
            assert.strictEqual(result.error.code, -32603);
        });

        it('should handle timeout calls', async () => {
            const result = await extension.mockRPCClient.callWithTimeout('test.method', {}, 1000);
            
            assert.ok(result.result);
        });

        it('should timeout when specified', async () => {
            try {
                await extension.mockRPCClient.callWithTimeout('test.method', {}, 1);
                assert.fail('Should have timed out');
            } catch (error) {
                assert(error.message.includes('timeout'));
            }
        });
    });

    describe('Test Execution', () => {
        it('should execute tests successfully', async () => {
            const results = await extension.executeTests({
                coverage: false,
                pattern: '**/*.test.js'
            });

            assert.ok(results.tests);
            assert.ok(results.total > 0);
            assert.ok(results.passed >= 0);
            assert.ok(results.duration > 0);
        });

        it('should include coverage when requested', async () => {
            const results = await extension.executeTests({
                coverage: true
            });

            assert.ok(results.coverage);
            assert.ok(results.coverage.statements);
            assert.ok(results.coverage.branches);
            assert.ok(results.coverage.functions);
            assert.ok(results.coverage.lines);
        });
    });

    describe('Coverage Reporting', () => {
        it('should generate text report', () => {
            const coverage = {
                statements: 85,
                branches: 75,
                functions: 90,
                lines: 84,
                total: 83.5
            };

            const report = extension.generateTextReport(coverage);
            
            assert(report.includes('85%'));
            assert(report.includes('75%'));
            assert(report.includes('90%'));
        });

        it('should generate HTML report', () => {
            const coverage = {
                statements: 85,
                branches: 75,
                functions: 90,
                lines: 84
            };

            const report = extension.generateHTMLReport(coverage);
            
            assert(report.includes('<!DOCTYPE html>'));
            assert(report.includes('Coverage Report'));
            assert(report.includes('85%'));
        });
    });

    describe('Mock Scenarios', () => {
        it('should run success scenario', async () => {
            const result = await extension.runMockScenario('success', 1);
            
            assert.strictEqual(result.success, true);
            assert.ok(result.result);
        });

        it('should run error scenario', async () => {
            const result = await extension.runMockScenario('error', 1);
            
            assert.strictEqual(result.success, false);
            assert.ok(result.error);
        });

        it('should run timeout scenario', async () => {
            const result = await extension.runMockScenario('timeout', 1);
            
            assert.strictEqual(result.success, true);
        });
    });

    describe('Commands', () => {
        it('should run tests command', async () => {
            const result = await extension['run-tests']({
                flags: {}
            });

            assert.ok(result.results);
            assert.ok(result.results.total > 0);
        });

        it('should run mock test command', async () => {
            const result = await extension['mock-test']({
                flags: {
                    scenario: 'success',
                    iterations: 2
                }
            });

            assert.ok(result.results);
            assert.strictEqual(result.results.length, 2);
        });
    });

    describe('Cleanup', () => {
        it('should clear test results on cleanup', async () => {
            extension.testResults = [1, 2, 3];
            await extension.cleanup();
            
            assert.strictEqual(extension.testResults.length, 0);
        });
    });
});
