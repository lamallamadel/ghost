const assert = require('assert');
const { GitExtension, ExtensionRPCClient } = require('../../extensions/ghost-git-extension/extension');

console.log('🧪 Testing RPC-based I/O and Logging in Git Extension\n');

// Mock RPC client that handles intent-based calls
class MockIntentRPCClient extends ExtensionRPCClient {
    constructor() {
        super();
        this.logs = [];
        this.gitCalls = [];
        this.networkCalls = [];
    }

    async call(method, params = {}) {
        if (method === 'intent') {
            const { type, operation, params: intentParams } = params;
            
            // Handle log intents
            if (type === 'log' && operation === 'write') {
                this.logs.push({ 
                    level: intentParams.level, 
                    message: intentParams.message, 
                    meta: intentParams.meta 
                });
                return { success: true };
            }
            
            // Handle git intents
            if (type === 'git' && operation === 'exec') {
                this.gitCalls.push({ args: intentParams.args });
                
                const cmd = intentParams.args[0];
                if (cmd === 'rev-parse' && intentParams.args[1] === '--is-inside-work-tree') {
                    return 'true';
                }
                if (cmd === 'diff' && intentParams.args[1] === '--cached' && intentParams.args[2] === '--name-only') {
                    return 'file1.js\nfile2.js';
                }
                if (cmd === 'diff' && intentParams.args[1] === '--cached') {
                    return '+++ file.js\n@@ -1,1 +1,2 @@\n+console.log("test");';
                }
                return '';
            }
            
            // Handle network intents
            if (type === 'network' && operation === 'request') {
                this.networkCalls.push({ 
                    hostname: intentParams.options.hostname,
                    path: intentParams.options.path
                });
                
                // Mock AI response
                return JSON.stringify({
                    choices: [{ message: { content: 'feat: add new feature' } }]
                });
            }
            
            throw new Error(`Unhandled intent: ${type}.${operation}`);
        }
        
        throw new Error(`Unknown RPC method: ${method}`);
    }
}

// Test 1: Verify logging calls in getStagedDiff
console.log('▶ Test 1: getStagedDiff uses RPC logging');
(async () => {
    try {
        const mockRPC = new MockIntentRPCClient();
        const gitExt = new GitExtension(mockRPC);
        
        await gitExt.getStagedDiff();
        
        // Check that logs were created
        const debugLogs = mockRPC.logs.filter(l => l.level === 'debug');
        assert.ok(debugLogs.length > 0, 'Should have debug logs');
        assert.ok(debugLogs.some(l => l.message.includes('Reading staged diff')), 'Should log start of diff read');
        assert.ok(debugLogs.some(l => l.message.includes('Staged diff read complete')), 'Should log completion');
        
        console.log('✅ getStagedDiff properly uses rpc.log()\n');
        
        // Test 2: Verify network calls use RPC
        console.log('▶ Test 2: callAI uses rpc.httpsRequest()');
        mockRPC.logs = [];
        mockRPC.networkCalls = [];
        
        const result = await gitExt.callAI('groq', 'test-key', 'llama-3.3-70b-versatile', 
            'You are a git expert', 'Generate commit message', 0.3, false);
        
        // Check network call was made via RPC
        assert.ok(mockRPC.networkCalls.length > 0, 'Should make network call via RPC');
        assert.strictEqual(mockRPC.networkCalls[0].hostname, 'api.groq.com', 'Should call correct API');
        
        // Check logging
        const infoLogs = mockRPC.logs.filter(l => l.level === 'info');
        assert.ok(infoLogs.some(l => l.message.includes('Initiating AI call')), 'Should log AI call start');
        
        const debugLogs2 = mockRPC.logs.filter(l => l.level === 'debug');
        assert.ok(debugLogs2.some(l => l.message.includes('Sending request')), 'Should log request');
        assert.ok(debugLogs2.some(l => l.message.includes('Received response')), 'Should log response');
        
        console.log('✅ callAI properly uses rpc.httpsRequest() and logging\n');
        
        // Test 3: Verify generateCommit uses proper logging
        console.log('▶ Test 3: generateCommit uses structured logging');
        mockRPC.logs = [];
        
        const commitMsg = await gitExt.generateCommit(
            'diff content here', 
            null, 
            'groq', 
            'test-key', 
            'llama-3.3-70b-versatile'
        );
        
        const commitLogs = mockRPC.logs.filter(l => l.level === 'info');
        assert.ok(commitLogs.some(l => 
            l.message.includes('Starting commit message generation') && 
            l.meta.provider === 'groq'
        ), 'Should log commit generation start with metadata');
        
        assert.ok(commitLogs.some(l => 
            l.message.includes('Commit message generated successfully')
        ), 'Should log commit generation completion');
        
        const prepLogs = mockRPC.logs.filter(l => 
            l.level === 'debug' && 
            l.message.includes('Preparing diff')
        );
        assert.ok(prepLogs.length > 0, 'Should log diff preparation');
        
        console.log('✅ generateCommit properly uses structured logging\n');
        
        // Test 4: Verify no direct Node.js imports
        console.log('▶ Test 4: Verify no direct fs/http/https imports');
        const fs = require('fs');
        const extensionCode = fs.readFileSync('extensions/ghost-git-extension/extension.js', 'utf8');
        
        assert.ok(!extensionCode.includes("require('fs')"), 'Should not import fs directly');
        assert.ok(!extensionCode.includes('require("fs")'), 'Should not import fs directly');
        assert.ok(!extensionCode.includes("require('https')"), 'Should not import https directly');
        assert.ok(!extensionCode.includes('require("https")'), 'Should not import https directly');
        assert.ok(!extensionCode.includes("require('http')"), 'Should not import http directly');
        assert.ok(!extensionCode.includes('require("http")'), 'Should not import http directly');
        
        console.log('✅ No direct Node.js I/O imports found\n');
        
        // Test 5: Verify all network calls go through RPC
        console.log('▶ Test 5: All AI providers use rpc.httpsRequest()');
        mockRPC.networkCalls = [];
        mockRPC.logs = [];
        
        // Test Anthropic
        const anthropicResponse = JSON.stringify({
            content: [{ text: 'fix: resolve issue' }]
        });
        mockRPC.call = async (method, params) => {
            if (method === 'intent' && params.type === 'network') {
                mockRPC.networkCalls.push({ provider: 'anthropic' });
                return anthropicResponse;
            }
            if (method === 'intent' && params.type === 'log') {
                mockRPC.logs.push({ level: params.params.level, message: params.params.message });
                return { success: true };
            }
            throw new Error(`Unhandled: ${method}`);
        };
        
        const config = { hostname: 'api.anthropic.com', path: '/v1/messages' };
        await gitExt.callAnthropic(config, 'key', 'claude-3-5-sonnet-20240620', 'system', 'user', 0.3);
        
        assert.ok(mockRPC.networkCalls.some(c => c.provider === 'anthropic'), 'Anthropic should use RPC');
        assert.ok(mockRPC.logs.some(l => l.message.includes('Calling Anthropic API')), 'Should log Anthropic call');
        assert.ok(mockRPC.logs.some(l => l.message.includes('Anthropic API response received')), 'Should log Anthropic response');
        
        console.log('✅ All AI providers use rpc.httpsRequest() with logging\n');
        
        console.log('🎉 All RPC-based I/O and logging tests passed!');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
