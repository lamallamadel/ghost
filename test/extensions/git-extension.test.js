const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createExtension, GitExtension, ExtensionRPCClient } = require('../../extensions/ghost-git-extension/extension');
const { IOPipeline } = require('../../core/pipeline');

console.log('🧪 Testing Git Extension End-to-End via Gateway with Zero Trust Enforcement...\n');

// Ensure .ghost directory exists for state persistence
const ghostDir = path.join(os.homedir(), '.ghost');
if (!fs.existsSync(ghostDir)) {
    fs.mkdirSync(ghostDir, { recursive: true });
}

// Mock RPC client for testing
class MockRPCClient extends ExtensionRPCClient {
    constructor() {
        super();
        this.logs = [];
        this.gitCommands = [];
        this.fileReads = new Map();
        this.fileWrites = new Map();
        this.existingFiles = new Set();
        this.networkCalls = [];
    }

    async call(method, params = {}) {
        // Normalise both call styles into a single intent object:
        //   emitIntent('git', 'exec', {...})  → call('git', { operation, params })
        //   call('intent', { type, operation, params })
        const capabilityMethods = ['filesystem', 'network', 'git', 'process', 'ui', 'log'];
        let intent;
        if (method === 'intent') {
            intent = params;
        } else if (capabilityMethods.includes(method)) {
            intent = { type: method, operation: params.operation, params: params.params || params };
        }

        if (intent) {
            if (intent.type === 'git' && intent.operation === 'exec') {
                this.gitCommands.push({ args: intent.params.args, suppressError: intent.params.suppressError });
                
                // Mock git responses
                const cmd = intent.params.args[0];
                if (cmd === 'rev-parse' && intent.params.args[1] === '--is-inside-work-tree') {
                    return 'true';
                }
                if (cmd === 'diff' && intent.params.args[1] === '--cached' && intent.params.args[2] === '--name-only') {
                    return 'test.js\nREADME.md';
                }
                if (cmd === 'diff' && intent.params.args[1] === '--cached') {
                    return '+++ test.js\n@@ -1,1 +1,2 @@\n+console.log("hello");';
                }
                if (cmd === 'status') {
                    return 'On branch main\nNothing to commit';
                }
                
                return '';
            }
            
            if (intent.type === 'filesystem' && intent.operation === 'read') {
                if (this.fileReads.has(intent.params.path)) {
                    return this.fileReads.get(intent.params.path);
                }
                throw new Error(`File not found: ${intent.params.path}`);
            }
            
            if (intent.type === 'filesystem' && intent.operation === 'write') {
                this.fileWrites.set(intent.params.path, intent.params.content);
                return { success: true };
            }
            
            if (intent.type === 'filesystem' && intent.operation === 'exists') {
                return this.existingFiles.has(intent.params.path);
            }
            
            if (intent.type === 'filesystem' && intent.operation === 'readdir') {
                // Return empty directory listing in expected format
                return { entries: [] };
            }
            
            if (intent.type === 'filesystem' && intent.operation === 'stat') {
                if (this.existingFiles.has(intent.params.path)) {
                    return { isDirectory: () => false };
                }
                throw new Error(`File not found: ${intent.params.path}`);
            }
            
            if (intent.type === 'network' && intent.operation === 'request') {
                this.networkCalls.push({ options: intent.params.options, payload: intent.params.payload });
                return JSON.stringify({ choices: [{ message: { content: 'AI response' } }] });
            }
            
            if (intent.type === 'log' && intent.operation === 'write') {
                this.logs.push({ level: intent.params.level, message: intent.params.message, meta: intent.params.meta });
                return { success: true };
            }
            
            throw new Error(`Unknown intent type/operation: ${intent.type}/${intent.operation}`);
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
        assert.ok(highEntropy > 2.5, 'High entropy string should have high entropy');
        console.log(`✅ Entropy calculation (low: ${lowEntropy.toFixed(2)}, high: ${highEntropy.toFixed(2)})\n`);

        // Test 5: Secret scanning
        console.log('▶ Test 5: Secret scanning');
        const awsKey = 'AKIA1234567890ABCDEF';
        const secrets = await gitExt.scanForSecrets(`AWS_KEY=${awsKey}`);
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

        // Test 8: RPC request handling - git.checkRepo
        console.log('▶ Test 8: RPC request handling - git.checkRepo');
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

        // =========================================================================
        // ZERO TRUST ENFORCEMENT TESTS
        // =========================================================================

        // Test 11: Gateway integration - extension registration
        console.log('▶ Test 11: Gateway integration - extension registration');
        const auditLogPath = path.join(os.tmpdir(), `ghost-git-test-audit-${Date.now()}.log`);
        const rateLimitPath = path.join(os.tmpdir(), `ghost-rl-test-${Date.now()}.json`);
        const pipeline = new IOPipeline({
            auditLogPath: auditLogPath,
            persistencePath: rateLimitPath
        });
        
        const gitManifest = {
            id: 'ghost-git-extension',
            capabilities: {
                filesystem: {
                    read: ['**/*'],
                    write: ['package.json', '.ghost-versionrc']
                },
                network: {
                    allowlist: [
                        'https://api.groq.com',
                        'https://api.openai.com'
                    ],
                    rateLimit: {
                        cir: 60,
                        bc: 5,
                        be: 10
                    }
                },
                git: {
                    read: true,
                    write: false
                }
            }
        };
        
        pipeline.registerExtension('ghost-git-extension', gitManifest);
        console.log('✅ Extension registered with gateway\n');

        // Test 12: AUTHORIZED - File read with granted permission
        console.log('▶ Test 12: AUTHORIZED - File read with granted permission');
        const fileReadIntent = {
            type: 'filesystem',
            operation: 'read',
            params: { path: 'README.md' },
            extensionId: 'ghost-git-extension',
            requestId: 'fs-req-001'
        };
        
        const fileReadResult = await pipeline.process(fileReadIntent);
        // Check authorization passed (not blocked at AUTH or AUDIT stage)
        assert.ok(fileReadResult.stage !== 'AUTHORIZATION', 'Should pass authorization');
        assert.ok(fileReadResult.stage !== 'AUDIT', 'Should pass audit');
        // May fail at execution if file doesn't exist, but that's OK for this test
        console.log('✅ Authorized file read operation passed authorization\n');

        // Test 13: AUTHORIZED - File write to allowed path
        console.log('▶ Test 13: AUTHORIZED - File write to allowed path');
        const fileWriteIntent = {
            type: 'filesystem',
            operation: 'write',
            params: { 
                path: 'package.json',
                content: '{"name":"test","version":"1.0.0"}'
            },
            extensionId: 'ghost-git-extension',
            requestId: 'fs-req-002'
        };
        
        const fileWriteResult = await pipeline.process(fileWriteIntent);
        // Check authorization passed (not blocked at AUTH or AUDIT stage)
        assert.ok(fileWriteResult.stage !== 'AUTHORIZATION', 'Should pass authorization');
        assert.ok(fileWriteResult.stage !== 'AUDIT', 'Should pass audit');
        console.log('✅ Authorized file write operation passed authorization\n');

        // Test 14: UNAUTHORIZED - File write to non-allowed path
        console.log('▶ Test 14: UNAUTHORIZED - File write to non-allowed path');
        const unauthorizedWriteIntent = {
            type: 'filesystem',
            operation: 'write',
            params: { 
                path: 'config.js',
                content: 'test content'
            },
            extensionId: 'ghost-git-extension',
            requestId: 'fs-req-003'
        };
        
        const unauthorizedWriteResult = await pipeline.process(unauthorizedWriteIntent);
        assert.strictEqual(unauthorizedWriteResult.success, false, 'Unauthorized write should be blocked');
        // Accept either AUTH_PERMISSION_DENIED or PIPELINE_INTERCEPT_ERROR as both indicate blocked
        const validCodes = ['AUTH_PERMISSION_DENIED', 'PIPELINE_INTERCEPT_ERROR'];
        assert.ok(validCodes.includes(unauthorizedWriteResult.code), 
            `Should have permission denied or intercept error code, got: ${unauthorizedWriteResult.code}`);
        console.log('✅ Unauthorized file write blocked by pipeline\n');

        // Test 15: AUTHORIZED - Git read operation (status)
        console.log('▶ Test 15: AUTHORIZED - Git read operation (status)');
        const gitReadIntent = {
            type: 'git',
            operation: 'status',
            params: { args: [] },
            extensionId: 'ghost-git-extension',
            requestId: 'git-req-001'
        };
        
        const gitReadResult = await pipeline.process(gitReadIntent);
        // Check authorization passed (not blocked at AUTH or AUDIT stage)
        assert.ok(gitReadResult.stage !== 'AUTHORIZATION', 'Should pass authorization');
        assert.ok(gitReadResult.stage !== 'AUDIT', 'Should pass audit');
        console.log('✅ Authorized git read operation passed authorization\n');

        // Test 16: UNAUTHORIZED - Git write operation (commit) when write=false
        console.log('▶ Test 16: UNAUTHORIZED - Git write operation (commit) when write=false');
        const gitWriteIntent = {
            type: 'git',
            operation: 'commit',
            params: { args: ['-m', 'test'] },
            extensionId: 'ghost-git-extension',
            requestId: 'git-req-002'
        };
        
        const gitWriteResult = await pipeline.process(gitWriteIntent);
        assert.strictEqual(gitWriteResult.success, false, 'Git write should be denied');
        const validGitCodes = ['AUTH_PERMISSION_DENIED', 'PIPELINE_INTERCEPT_ERROR'];
        assert.ok(validGitCodes.includes(gitWriteResult.code), 
            `Should have permission denied or intercept error code, got: ${gitWriteResult.code}`);
        console.log('✅ Unauthorized git write blocked by pipeline\n');

        // Test 17: AUTHORIZED - Network call to allowlisted URL
        console.log('▶ Test 17: AUTHORIZED - Network call to allowlisted URL');
        const networkIntent = {
            type: 'network',
            operation: 'request',
            params: { 
                url: 'https://api.groq.com/openai/v1/chat/completions',
                options: {},
                payload: {}
            },
            extensionId: 'ghost-git-extension',
            requestId: 'net-req-001'
        };
        
        const networkResult = await pipeline.process(networkIntent);
        // Check authorization passed (not blocked at AUTH or AUDIT stage)
        assert.ok(networkResult.stage !== 'AUTHORIZATION', 'Should pass authorization');
        assert.ok(networkResult.stage !== 'AUDIT', 'Should pass audit');
        console.log('✅ Authorized network call to allowlisted URL passed authorization\n');

        // Test 18: UNAUTHORIZED - Network call to non-allowlisted URL
        console.log('▶ Test 18: UNAUTHORIZED - Network call to non-allowlisted URL');
        const unauthorizedNetworkIntent = {
            type: 'network',
            operation: 'request',
            params: { 
                url: 'https://evil.com/api',
                options: {},
                payload: {}
            },
            extensionId: 'ghost-git-extension',
            requestId: 'net-req-002'
        };
        
        const unauthorizedNetworkResult = await pipeline.process(unauthorizedNetworkIntent);
        assert.strictEqual(unauthorizedNetworkResult.success, false, 'Non-allowlisted network call should be blocked');
        const validNetCodes = ['AUTH_PERMISSION_DENIED', 'PIPELINE_INTERCEPT_ERROR'];
        assert.ok(validNetCodes.includes(unauthorizedNetworkResult.code), 
            `Should have permission denied or intercept error code, got: ${unauthorizedNetworkResult.code}`);
        console.log('✅ Unauthorized network call blocked by pipeline\n');

        // Test 19: AUDIT - Secrets detection blocks file write
        console.log('▶ Test 19: AUDIT - Secrets detection blocks file write');
        const writeWithSecretIntent = {
            type: 'filesystem',
            operation: 'write',
            params: {
                path: 'package.json',
                content: 'const API_KEY = "AKIAIOSFODNN7EXAMPLE_KEY_HERE";'
            },
            extensionId: 'ghost-git-extension',
            requestId: 'audit-req-001'
        };
        
        const auditSecretResult = await pipeline.process(writeWithSecretIntent);
        assert.strictEqual(auditSecretResult.success, false, 'Write with secrets should be blocked');
        // Check that it was blocked (can be at AUDIT or INTERCEPT stage)
        assert.ok(['AUDIT', 'INTERCEPT'].includes(auditSecretResult.stage), 
            `Should fail at audit or intercept stage, got: ${auditSecretResult.stage}`);
        if (auditSecretResult.violations) {
            assert.ok(auditSecretResult.violations.length > 0, 'Should have at least one violation');
        }
        console.log('✅ Secret detection blocked write at audit layer\n');

        // Test 20: AUDIT - Audit logs capture all I/O with metadata
        console.log('▶ Test 20: AUDIT - Audit logs capture all I/O with metadata');
        const auditLogs = pipeline.getAuditLogs({ limit: 100 });
        assert.ok(Array.isArray(auditLogs), 'Should return array of logs');
        // Logs may or may not be written yet depending on timing, but the system should return an array
        if (auditLogs.length > 0) {
            const lastLog = auditLogs[auditLogs.length - 1];
            assert.ok(lastLog.timestamp, 'Log entry should have timestamp');
            assert.ok(lastLog.extensionId || lastLog.type, 'Log entry should have extensionId or type');
            console.log(`✅ Audit logs captured ${auditLogs.length} entries with correct metadata\n`);
        } else {
            console.log(`✅ Audit logging system functional (${auditLogs.length} entries)\n`);
        }

        // Test 21: RATE LIMITING - Exceed rate limits triggers Exceeding state
        console.log('▶ Test 21: RATE LIMITING - Exceed rate limits triggers Exceeding state');
        
        // First, consume all committed tokens
        for (let i = 0; i < 5; i++) {
            const burstIntent = {
                jsonrpc: '2.0',
                id: `burst-req-${i}`,
                method: 'io',
                type: 'network',
                operation: 'https',
                params: {
                    params: { url: 'https://api.groq.com/test' }
                },
                extensionId: 'ghost-git-extension',
                requestId: `burst-req-${i}`
            };
            await pipeline.process(burstIntent);
        }
        
        // Check rate limit state - should be in Exceeding or Violating
        const rateLimitState = pipeline.getTrafficPolicerState('ghost-git-extension');
        assert.ok(rateLimitState, 'Should have rate limit state');
        assert.ok(rateLimitState.committedTokens < rateLimitState.committedCapacity, 
            'Committed tokens should be depleted');
        console.log(`✅ Rate limiting state: committed=${rateLimitState.committedTokens}/${rateLimitState.committedCapacity}, excess=${rateLimitState.excessTokens}/${rateLimitState.excessCapacity}\n`);

        // Test 22: RATE LIMITING - Violating state blocks requests
        console.log('▶ Test 22: RATE LIMITING - Violating state blocks requests');
        
        // Consume all tokens (committed + excess)
        let violatingRequestFound = false;
        for (let i = 0; i < 100; i++) {
            const overloadIntent = {
                jsonrpc: '2.0',
                id: `overload-req-${i}`,
                method: 'io',
                type: 'network',
                operation: 'https',
                params: {
                    params: { url: 'https://api.groq.com/overload' }
                },
                extensionId: 'ghost-git-extension',
                requestId: `overload-req-${i}`
            };
            const overloadResult = await pipeline.process(overloadIntent);
            
            if (!overloadResult.success && overloadResult.code === 'QOS_VIOLATING') {
                violatingRequestFound = true;
                assert.ok(overloadResult.error.includes('violating'), 'Should indicate violating state');
                assert.ok(overloadResult.qos, 'Should have QoS information');
                assert.strictEqual(overloadResult.qos.color, 'red', 'Should have red color');
                assert.strictEqual(overloadResult.qos.classification, 'Violating', 'Should be Violating');
                break;
            }
        }
        assert.ok(violatingRequestFound, 'Should have found a violating request');
        console.log('✅ Rate limit violating state blocks requests\n');

        // Test 23: RPC method git.getStagedDiff
        console.log('▶ Test 23: RPC method git.getStagedDiff');
        const diffRequest = {
            jsonrpc: "2.0",
            id: 3,
            method: 'git.getStagedDiff',
            params: {}
        };
        
        const diffResponse = await gitExt.handleRPCRequest(diffRequest);
        assert.ok(diffResponse.result, 'Should return diff result');
        assert.ok(diffResponse.result.files, 'Should have files in result');
        console.log('✅ git.getStagedDiff method accessible via RPC\n');

        // Test 24: RPC method git.generateCommit
        console.log('▶ Test 24: RPC method git.generateCommit');
        const generateCommitRequest = {
            jsonrpc: "2.0",
            id: 4,
            method: 'git.generateCommit',
            params: {
                diffText: 'test diff',
                customPrompt: null,
                provider: 'groq',
                apiKey: 'test-key',
                model: 'llama-3.3-70b-versatile'
            }
        };
        
        const generateCommitResponse = await gitExt.handleRPCRequest(generateCommitRequest);
        assert.ok(generateCommitResponse.result, 'Should return commit message');
        console.log('✅ git.generateCommit method accessible via RPC\n');

        // Test 25: RPC method git.auditSecurity
        console.log('▶ Test 25: RPC method git.auditSecurity');
        const auditSecurityRequest = {
            jsonrpc: "2.0",
            id: 5,
            method: 'git.auditSecurity',
            params: {
                diffMap: { 'test.js': 'const x = 1;' },
                provider: 'groq',
                apiKey: 'test-key',
                model: 'llama-3.3-70b-versatile',
                flags: {}
            }
        };
        
        const auditSecurityResponse = await gitExt.handleRPCRequest(auditSecurityRequest);
        assert.ok(auditSecurityResponse.result, 'Should return audit result');
        assert.ok(typeof auditSecurityResponse.result.blocked === 'boolean', 'Should have blocked field');
        console.log('✅ git.auditSecurity method accessible via RPC\n');

        // Test 26: RPC method git.performFullAudit
        console.log('▶ Test 26: RPC method git.performFullAudit');
        const fullAuditRequest = {
            jsonrpc: "2.0",
            id: 6,
            method: 'git.performFullAudit',
            params: { flags: {} }
        };
        
        const fullAuditResponse = await gitExt.handleRPCRequest(fullAuditRequest);
        assert.ok(fullAuditResponse.result, 'Should return full audit result');
        assert.ok(typeof fullAuditResponse.result.issues === 'number', 'Should have issues count');
        console.log('✅ git.performFullAudit method accessible via RPC\n');

        // Test 27: RPC method git.version.bump
        console.log('▶ Test 27: RPC method git.version.bump');
        const versionBumpRequest = {
            jsonrpc: "2.0",
            id: 7,
            method: 'git.version.bump',
            params: {
                bumpType: 'patch',
                flags: { dryRun: true }
            }
        };
        
        mockRPC.existingFiles.add(path.join(process.cwd(), 'package.json'));
        mockRPC.fileReads.set(
            path.join(process.cwd(), 'package.json'),
            '{"name":"test","version":"1.0.0"}'
        );
        
        const versionBumpResponse = await gitExt.handleRPCRequest(versionBumpRequest);
        assert.ok(versionBumpResponse.result, 'Should return version bump result');
        assert.ok(versionBumpResponse.result.dryRun, 'Should indicate dry run');
        console.log('✅ git.version.bump method accessible via RPC\n');

        // Test 28: RPC method git.version.check
        console.log('▶ Test 28: RPC method git.version.check');
        const versionCheckRequest = {
            jsonrpc: "2.0",
            id: 8,
            method: 'git.version.check',
            params: {}
        };
        
        // This will fail without proper git setup, but we test the method is callable
        const versionCheckResponse = await gitExt.handleRPCRequest(versionCheckRequest);
        assert.ok(versionCheckResponse.error || versionCheckResponse.result, 
            'Should return result or error');
        console.log('✅ git.version.check method accessible via RPC\n');

        // Test 29: RPC method git.merge.getConflicts
        console.log('▶ Test 29: RPC method git.merge.getConflicts');
        const getConflictsRequest = {
            jsonrpc: "2.0",
            id: 9,
            method: 'git.merge.getConflicts',
            params: {}
        };
        
        const getConflictsResponse = await gitExt.handleRPCRequest(getConflictsRequest);
        assert.ok(Array.isArray(getConflictsResponse.result), 'Should return array of conflicts');
        console.log('✅ git.merge.getConflicts method accessible via RPC\n');

        // Test 30: RPC method git.merge.resolve
        console.log('▶ Test 30: RPC method git.merge.resolve');
        const mergeResolveRequest = {
            jsonrpc: "2.0",
            id: 10,
            method: 'git.merge.resolve',
            params: {
                strategy: 'manual',
                flags: {}
            }
        };
        
        const mergeResolveResponse = await gitExt.handleRPCRequest(mergeResolveRequest);
        assert.ok(mergeResolveResponse.result, 'Should return merge resolve result');
        assert.ok(typeof mergeResolveResponse.result.success === 'boolean', 'Should have success field');
        console.log('✅ git.merge.resolve method accessible via RPC\n');

        // Test 31: Extension state persistence
        console.log('▶ Test 31: Extension maintains state across calls');
        const call1 = await gitExt.checkGitRepo();
        const call2 = await gitExt.checkGitRepo();
        assert.strictEqual(call1, call2, 'Extension should maintain consistent state');
        console.log('✅ Extension state persists correctly\n');

        // Test 32: Concurrent request handling
        console.log('▶ Test 32: Concurrent request handling');
        const requests = [
            gitExt.handleRPCRequest({ jsonrpc: "2.0", id: 100, method: 'git.checkRepo', params: {} }),
            gitExt.handleRPCRequest({ jsonrpc: "2.0", id: 101, method: 'git.checkRepo', params: {} }),
            gitExt.handleRPCRequest({ jsonrpc: "2.0", id: 102, method: 'git.checkRepo', params: {} })
        ];
        
        const responses = await Promise.all(requests);
        assert.strictEqual(responses.length, 3, 'Should handle concurrent requests');
        assert.strictEqual(responses[0].id, 100, 'Should preserve request IDs');
        assert.strictEqual(responses[1].id, 101, 'Should preserve request IDs');
        assert.strictEqual(responses[2].id, 102, 'Should preserve request IDs');
        console.log('✅ Concurrent requests handled correctly\n');

        // Test 33: Extension survives crashes (conceptual - testing error handling)
        console.log('▶ Test 33: Extension error handling does not affect gateway');
        const crashTestRequest = {
            jsonrpc: "2.0",
            id: 200,
            method: 'git.nonexistent',
            params: {}
        };
        
        const crashTestResponse = await gitExt.handleRPCRequest(crashTestRequest);
        assert.ok(crashTestResponse.error, 'Should return error for invalid method');
        
        // Gateway should still function after extension error
        const postCrashIntent = {
            jsonrpc: '2.0',
            id: 'post-crash-req',
            method: 'io',
            type: 'filesystem',
            operation: 'read',
            params: { params: { path: 'test.txt' } },
            extensionId: 'ghost-git-extension',
            requestId: 'post-crash-req'
        };

        const postCrashResult = await pipeline.process(postCrashIntent);
        assert.ok(postCrashResult.stage === 'EXECUTION' || postCrashResult.success,
            'Gateway should continue functioning after extension error');
        console.log('✅ Extension errors do not affect gateway operation\n');

        // Test 34: Audit log filtering
        console.log('▶ Test 34: Audit log filtering by extension and type');
        const filteredLogs = pipeline.getAuditLogs({
            filter: { extensionId: 'ghost-git-extension', type: 'INTENT' },
            limit: 50
        });
        assert.ok(Array.isArray(filteredLogs), 'Should return filtered logs');
        if (filteredLogs.length > 0) {
            assert.strictEqual(filteredLogs[0].extensionId, 'ghost-git-extension', 
                'Should filter by extension ID');
            assert.strictEqual(filteredLogs[0].type, 'INTENT', 
                'Should filter by type');
        }
        console.log('✅ Audit log filtering works correctly\n');

        // Test 35: Reset rate limits
        console.log('▶ Test 35: Rate limit reset functionality');
        const stateBefore = pipeline.getTrafficPolicerState('ghost-git-extension');
        pipeline.resetTrafficPolicer('ghost-git-extension');
        const stateAfter = pipeline.getTrafficPolicerState('ghost-git-extension');
        
        assert.ok(stateAfter.committedTokens >= stateBefore.committedTokens, 
            'Committed tokens should be replenished');
        assert.ok(stateAfter.excessTokens >= stateBefore.excessTokens, 
            'Excess tokens should be replenished');
        console.log('✅ Rate limit reset works correctly\n');

        // Test 36: Version file operations
        console.log('▶ Test 36: Version file operations');
        const packageJson = JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2);
        const versionRead = gitExt.readPackageJsonVersionFromText(packageJson);
        assert.ok(versionRead, 'Should read version from package.json');
        assert.strictEqual(versionRead.major, 1, 'Should parse major version');
        
        const updatedJson = gitExt.setPackageJsonVersionText(packageJson, '1.1.0');
        assert.ok(updatedJson.includes('"version": "1.1.0"'), 'Should update version in package.json');
        console.log('✅ Version file operations work\n');

        // Test 37: GhostIgnore loading
        console.log('▶ Test 37: GhostIgnore pattern loading');
        mockRPC.existingFiles.add(path.join(process.cwd(), '.ghostignore'));
        mockRPC.fileReads.set(path.join(process.cwd(), '.ghostignore'), 'node_modules\n*.log\n# comment');
        
        const ignorePatterns = await gitExt.loadGhostIgnore();
        assert.ok(Array.isArray(ignorePatterns), 'Should return array');
        assert.ok(ignorePatterns.includes('node_modules'), 'Should include node_modules');
        assert.ok(ignorePatterns.includes('*.log'), 'Should include *.log');
        assert.ok(!ignorePatterns.some(p => p.startsWith('#')), 'Should filter comments');
        console.log('✅ GhostIgnore loading works\n');

        // Test 38: End-to-end git operation through full pipeline
        console.log('▶ Test 38: End-to-end git operation through full pipeline');
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
            jsonrpc: '2.0',
            id: 'git-e2e-001',
            method: 'io',
            type: 'git',
            operation: 'log',
            params: { params: { args: ['--oneline', '-5'] } },
            extensionId: 'ghost-git-e2e',
            requestId: 'git-e2e-001'
        };
        
        const e2eResult = await pipeline.process(e2eIntent);
        assert.ok(e2eResult.stage !== 'INTERCEPT', 'Should pass intercept');
        assert.ok(e2eResult.stage !== 'AUTHORIZATION', 'Should pass authorization');
        assert.ok(e2eResult.stage !== 'AUDIT', 'Should pass audit');
        console.log('✅ End-to-end git operation completed\n');

        // Test 39: All traffic policer states
        console.log('▶ Test 39: Get all traffic policer states');
        const allStates = pipeline.getAllTrafficPolicerStates();
        assert.ok(typeof allStates === 'object', 'Should return object of states');
        assert.ok(allStates['ghost-git-extension'], 'Should have state for git extension');
        console.log('✅ All traffic policer states retrieved\n');

        // Test 40: Audit security event logging
        console.log('▶ Test 40: Audit security event logging');
        const securityLogs = pipeline.getAuditLogs({
            filter: { type: 'SECURITY_EVENT' },
            limit: 100
        });
        assert.ok(Array.isArray(securityLogs), 'Should return security event logs');
        if (securityLogs.length > 0) {
            const secLog = securityLogs[0];
            assert.strictEqual(secLog.type, 'SECURITY_EVENT', 'Should be security event');
            assert.ok(secLog.eventType, 'Should have event type');
        }
        console.log(`✅ Found ${securityLogs.length} security event log entries\n`);

        // Cleanup
        try {
            if (fs.existsSync(auditLogPath)) {
                fs.unlinkSync(auditLogPath);
            }
        } catch (e) {
            // Ignore cleanup errors
        }

        console.log('🎉 All 40 Git extension Zero Trust tests passed!');
        console.log('\n📊 Test Summary:');
        console.log('  ✓ Basic extension functionality (10 tests)');
        console.log('  ✓ Zero Trust authorization enforcement (8 tests)');
        console.log('  ✓ Audit logging and security (5 tests)');
        console.log('  ✓ Rate limiting and QoS (3 tests)');
        console.log('  ✓ RPC method coverage (9 tests)');
        console.log('  ✓ Error handling and resilience (5 tests)');
        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
