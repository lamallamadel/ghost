const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createExtension, GitExtension, ExtensionRPCClient } = require('../../extensions/ghost-git-extension/extension');
const { IOPipeline } = require('../../core/pipeline');

console.log('🧪 Testing Git Extension End-to-End via Gateway...\n');

// Mock RPC client for testing
class MockRPCClient extends ExtensionRPCClient {
    constructor() {
        super();
        this.logs = [];
        this.gitCommands = [];
        this.fileReads = new Map();
        this.fileWrites = new Map();
        this.fileExists = new Set();
    }

    async call(method, params = {}) {
        if (method === 'log.write') {
            this.logs.push({ level: params.level, message: params.message, meta: params.meta });
            return { success: true };
        }

        if (method === 'fs.readFile') {
            if (this.fileReads.has(params.path)) {
                return this.fileReads.get(params.path);
            }
            throw new Error(`File not found: ${params.path}`);
        }

        if (method === 'fs.writeFile') {
            this.fileWrites.set(params.path, params.content);
            return { success: true };
        }

        if (method === 'fs.exists') {
            return this.fileExists.has(params.path);
        }

        if (method === 'git.exec') {
            this.gitCommands.push({ args: params.args, suppressError: params.suppressError });
            
            // Mock git responses
            const cmd = params.args[0];
            if (cmd === 'rev-parse' && params.args[1] === '--is-inside-work-tree') {
                return 'true';
            }
            if (cmd === 'diff' && params.args[1] === '--cached' && params.args[2] === '--name-only') {
                return 'test.js\nREADME.md';
            }
            if (cmd === 'diff' && params.args[1] === '--cached') {
                return '+++ test.js\n@@ -1,1 +1,2 @@\n+console.log("hello");';
            }
            if (cmd === 'status') {
                return 'On branch main\nNothing to commit';
            }
            
            return '';
        }

        throw new Error(`Unknown RPC method: ${method}`);
    }
}

// Test 1: Extension initialization
console.log('▶ Test 1: Git extension initialization');
const mockRPC = new MockRPCClient();
const gitExt = new GitExtension(mockRPC);

assert.ok(gitExt.rpc, 'Extension should have RPC client');
assert.ok(gitExt.SECRET_REGEXES, 'Extension should have secret patterns');
assert.ok(gitExt.AI_PROVIDERS, 'Extension should have AI providers');
console.log('✅ Git extension initialized\n');

// Test 2: Check Git repository
console.log('▶ Test 2: Check Git repository');
(async () => {
    try {
        const isGitRepo = await gitExt.checkGitRepo();
        assert.strictEqual(isGitRepo, true, 'Should detect git repo');
        assert.ok(mockRPC.gitCommands.length > 0, 'Should have called git command');
        console.log('✅ Git repo check works\n');

        // Test 3: Get staged diff
        console.log('▶ Test 3: Get staged diff');
        const diff = await gitExt.getStagedDiff();
        assert.ok(diff.text, 'Should return diff text');
        assert.ok(diff.files.length > 0, 'Should have files');
        assert.ok(diff.map, 'Should have file map');
        console.log('✅ Staged diff retrieval works\n');

        // Test 4: Entropy calculation
        console.log('▶ Test 4: Shannon entropy calculation');
        const lowEntropy = gitExt.calculateShannonEntropy('aaaaaaa');
        const highEntropy = gitExt.calculateShannonEntropy('aB3$xZ9#');
        assert.ok(lowEntropy < 2, 'Low entropy string should have low entropy');
        assert.ok(highEntropy > 3, 'High entropy string should have high entropy');
        console.log(`✅ Entropy calculation (low: ${lowEntropy.toFixed(2)}, high: ${highEntropy.toFixed(2)})\n`);

        // Test 5: Secret scanning
        console.log('▶ Test 5: Secret scanning');
        const awsKey = 'AKIAIOSFODNN7EXAMPLE';
        const secrets = gitExt.scanForSecrets(`AWS_KEY=${awsKey}`);
        assert.ok(secrets.length > 0, 'Should detect AWS key');
        console.log('✅ Secret scanning works\n');

        // Test 6: Semver parsing
        console.log('▶ Test 6: Semver parsing and manipulation');
        const version = gitExt.semverParse('1.2.3');
        assert.strictEqual(version.major, 1, 'Major version should be 1');
        assert.strictEqual(version.minor, 2, 'Minor version should be 2');
        assert.strictEqual(version.patch, 3, 'Patch version should be 3');
        
        const bumpedPatch = gitExt.semverBump(version, 'patch');
        assert.strictEqual(bumpedPatch.patch, 4, 'Patch should bump to 4');
        
        const bumpedMinor = gitExt.semverBump(version, 'minor');
        assert.strictEqual(bumpedMinor.minor, 3, 'Minor should bump to 3');
        assert.strictEqual(bumpedMinor.patch, 0, 'Patch should reset to 0');
        
        const bumpedMajor = gitExt.semverBump(version, 'major');
        assert.strictEqual(bumpedMajor.major, 2, 'Major should bump to 2');
        assert.strictEqual(bumpedMajor.minor, 0, 'Minor should reset to 0');
        console.log('✅ Semver operations work\n');

        // Test 7: Conventional commit parsing
        console.log('▶ Test 7: Conventional commit message parsing');
        const featBump = gitExt.conventionalRequiredBumpFromMessage('feat: add new feature');
        assert.strictEqual(featBump, 'minor', 'feat should require minor bump');
        
        const fixBump = gitExt.conventionalRequiredBumpFromMessage('fix: resolve bug');
        assert.strictEqual(fixBump, 'patch', 'fix should require patch bump');
        
        const breakingBump = gitExt.conventionalRequiredBumpFromMessage('feat!: breaking change');
        assert.strictEqual(breakingBump, 'major', 'breaking change should require major bump');
        console.log('✅ Conventional commit parsing works\n');

        // Test 8: RPC request handling
        console.log('▶ Test 8: RPC request handling');
        const checkRepoRequest = {
            jsonrpc: "2.0",
            id: 1,
            method: 'git.checkRepo',
            params: {}
        };
        
        const response = await gitExt.handleRPCRequest(checkRepoRequest);
        assert.strictEqual(response.jsonrpc, "2.0", 'Should return JSON-RPC response');
        assert.strictEqual(response.id, 1, 'Should preserve request ID');
        assert.strictEqual(response.result, true, 'Should return git repo check result');
        console.log('✅ RPC request handling works\n');

        // Test 9: Error handling in RPC
        console.log('▶ Test 9: RPC error handling');
        const invalidRequest = {
            jsonrpc: "2.0",
            id: 2,
            method: 'invalid.method',
            params: {}
        };
        
        const errorResponse = await gitExt.handleRPCRequest(invalidRequest);
        assert.ok(errorResponse.error, 'Should return error object');
        assert.strictEqual(errorResponse.error.code, -32603, 'Should have correct error code');
        assert.ok(errorResponse.error.message.includes('Unknown method'), 'Should have error message');
        console.log('✅ RPC error handling works\n');

        // Test 10: Extension factory function
        console.log('▶ Test 10: Extension factory function');
        const mockCoreHandler = async (request) => {
            return { jsonrpc: "2.0", id: request.id, result: true };
        };
        
        const extInstance = createExtension(mockCoreHandler);
        assert.ok(extInstance.handleRequest, 'Should have handleRequest method');
        assert.ok(extInstance.extension, 'Should have extension instance');
        assert.ok(extInstance.rpcClient, 'Should have RPC client');
        console.log('✅ Extension factory works\n');

        // Test 11: Gateway integration - extension registration
        console.log('▶ Test 11: Gateway integration - extension registration');
        const pipeline = new IOPipeline({
            auditLogPath: path.join(os.tmpdir(), 'ghost-git-test-audit.log')
        });
        
        const gitManifest = {
            id: 'ghost-git-extension',
            capabilities: {
                git: {
                    read: true,
                    write: false
                }
            }
        };
        
        pipeline.registerExtension('ghost-git-extension', gitManifest);
        console.log('✅ Extension registered with gateway\n');

        // Test 12: Gateway - authorized git read
        console.log('▶ Test 12: Gateway - authorized git read operation');
        const gitReadIntent = {
            type: 'git',
            operation: 'status',
            params: { args: [] },
            extensionId: 'ghost-git-extension',
            requestId: 'git-req-001'
        };
        
        const gitReadResult = await pipeline.process(gitReadIntent);
        assert.strictEqual(gitReadResult.success, true, 'Git read should be authorized');
        console.log('✅ Git read operation authorized\n');

        // Test 13: Gateway - unauthorized git write
        console.log('▶ Test 13: Gateway - unauthorized git write operation');
        const gitWriteIntent = {
            type: 'git',
            operation: 'commit',
            params: { args: ['-m', 'test'] },
            extensionId: 'ghost-git-extension',
            requestId: 'git-req-002'
        };
        
        const gitWriteResult = await pipeline.process(gitWriteIntent);
        assert.strictEqual(gitWriteResult.success, false, 'Git write should be denied');
        assert.strictEqual(gitWriteResult.code, 'AUTH_PERMISSION_DENIED', 'Should have permission denied code');
        console.log('✅ Git write operation blocked\n');

        // Test 14: Version file operations
        console.log('▶ Test 14: Version file operations');
        const packageJson = JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2);
        const versionRead = gitExt.readPackageJsonVersionFromText(packageJson);
        assert.ok(versionRead, 'Should read version from package.json');
        assert.strictEqual(versionRead.major, 1, 'Should parse major version');
        
        const updatedJson = gitExt.setPackageJsonVersionText(packageJson, '1.1.0');
        assert.ok(updatedJson.includes('"version": "1.1.0"'), 'Should update version in package.json');
        console.log('✅ Version file operations work\n');

        // Test 15: GhostIgnore loading
        console.log('▶ Test 15: GhostIgnore pattern loading');
        mockRPC.fileExists.add(path.join(process.cwd(), '.ghostignore'));
        mockRPC.fileReads.set(path.join(process.cwd(), '.ghostignore'), 'node_modules\n*.log\n# comment');
        
        const ignorePatterns = await gitExt.loadGhostIgnore();
        assert.ok(Array.isArray(ignorePatterns), 'Should return array');
        assert.ok(ignorePatterns.includes('node_modules'), 'Should include node_modules');
        assert.ok(ignorePatterns.includes('*.log'), 'Should include *.log');
        assert.ok(!ignorePatterns.some(p => p.startsWith('#')), 'Should filter comments');
        console.log('✅ GhostIgnore loading works\n');

        // Test 16: Security audit integration
        console.log('▶ Test 16: Security audit through gateway');
        const writeWithSecretIntent = {
            type: 'filesystem',
            operation: 'write',
            params: {
                path: 'config.js',
                content: 'const API_KEY = "AKIAIOSFODNN7EXAMPLE";'
            },
            extensionId: 'ghost-git-extension',
            requestId: 'git-req-003'
        };
        
        const manifest2 = {
            id: 'ghost-git-extension',
            capabilities: {
                filesystem: {
                    read: [],
                    write: ['**/*']
                }
            }
        };
        pipeline.registerExtension('ghost-git-extension', manifest2);
        
        const auditResult = await pipeline.process(writeWithSecretIntent);
        assert.strictEqual(auditResult.success, false, 'Should block write with secrets');
        assert.strictEqual(auditResult.stage, 'AUDIT', 'Should fail at audit stage');
        console.log('✅ Security audit blocks secrets in git operations\n');

        // Test 17: Extension method getStagedDiff via RPC
        console.log('▶ Test 17: Extension method getStagedDiff via RPC');
        const diffRequest = {
            jsonrpc: "2.0",
            id: 3,
            method: 'git.getStagedDiff',
            params: {}
        };
        
        const diffResponse = await gitExt.handleRPCRequest(diffRequest);
        assert.ok(diffResponse.result, 'Should return diff result');
        assert.ok(diffResponse.result.files, 'Should have files in result');
        console.log('✅ getStagedDiff method accessible via RPC\n');

        // Test 18: Extension state persistence
        console.log('▶ Test 18: Extension maintains state across calls');
        const call1 = await gitExt.checkGitRepo();
        const call2 = await gitExt.checkGitRepo();
        assert.strictEqual(call1, call2, 'Extension should maintain consistent state');
        console.log('✅ Extension state persists correctly\n');

        // Test 19: Concurrent request handling
        console.log('▶ Test 19: Concurrent request handling');
        const requests = [
            gitExt.handleRPCRequest({ jsonrpc: "2.0", id: 10, method: 'git.checkRepo', params: {} }),
            gitExt.handleRPCRequest({ jsonrpc: "2.0", id: 11, method: 'git.checkRepo', params: {} }),
            gitExt.handleRPCRequest({ jsonrpc: "2.0", id: 12, method: 'git.checkRepo', params: {} })
        ];
        
        const responses = await Promise.all(requests);
        assert.strictEqual(responses.length, 3, 'Should handle concurrent requests');
        assert.strictEqual(responses[0].id, 10, 'Should preserve request IDs');
        assert.strictEqual(responses[1].id, 11, 'Should preserve request IDs');
        assert.strictEqual(responses[2].id, 12, 'Should preserve request IDs');
        console.log('✅ Concurrent requests handled correctly\n');

        // Test 20: End-to-end: Git operation through full pipeline
        console.log('▶ Test 20: End-to-end git operation through full pipeline');
        const e2eManifest = {
            id: 'ghost-git-e2e',
            capabilities: {
                git: {
                    read: true,
                    write: false
                }
            }
        };
        
        pipeline.registerExtension('ghost-git-e2e', e2eManifest);
        
        const e2eIntent = {
            type: 'git',
            operation: 'log',
            params: { args: ['--oneline', '-5'] },
            extensionId: 'ghost-git-e2e',
            requestId: 'git-e2e-001'
        };
        
        const e2eResult = await pipeline.process(e2eIntent);
        // Will either succeed or fail at execution (if not in git repo)
        assert.ok(e2eResult.stage !== 'INTERCEPT', 'Should pass intercept');
        assert.ok(e2eResult.stage !== 'AUTHORIZATION', 'Should pass authorization');
        assert.ok(e2eResult.stage !== 'AUDIT', 'Should pass audit');
        console.log('✅ End-to-end git operation completed\n');

        console.log('🎉 All Git extension tests passed!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
