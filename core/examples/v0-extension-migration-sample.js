const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

/**
 * Sample v0.x Extension - FOR MIGRATION TESTING ONLY
 * 
 * This extension demonstrates legacy patterns that need migration:
 * 1. Direct fs module usage
 * 2. Direct https module usage  
 * 3. Direct git command execution
 * 4. ExtensionRPCClient without coreHandler injection
 * 5. module.exports object pattern
 * 
 * To test migration:
 * 1. Create a test directory with this file and the manifest
 * 2. Run: ghost extension migrate /path/to/test/dir
 * 3. Review the migration plan
 * 4. Run: ghost extension migrate /path/to/test/dir --apply
 * 5. Review MIGRATION_GUIDE.md for manual changes
 */

class ExtensionRPCClient {
    constructor() {
        this.requestId = 0;
    }

    async call(method, params = {}) {
        const id = ++this.requestId;
        const request = {
            jsonrpc: "2.0",
            id,
            method,
            params
        };

        // Legacy: No coreHandler injection
        const response = await this.defaultHandler(request);
        
        if (response.error) {
            throw new Error(`RPC Error: ${response.error.message}`);
        }
        
        return response.result;
    }

    defaultHandler(request) {
        throw new Error(`No core handler registered for RPC call: ${request.method}`);
    }
}

class SampleExtension {
    constructor() {
        this.rpc = new ExtensionRPCClient();
    }

    async initialize() {
        console.log('Sample v0.x Extension initialized');
    }

    async myCommand(params) {
        const { args, flags } = params;

        // Legacy pattern: Direct fs usage
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        
        // Legacy pattern: Direct git command
        const gitStatus = execSync('git status --short', { encoding: 'utf8' });
        
        // Legacy pattern: Direct https request
        const apiData = await this.makeHttpRequest('https://api.example.com/data');

        return {
            success: true,
            output: {
                package: packageJson.name,
                gitStatus,
                apiData
            }
        };
    }

    makeHttpRequest(url) {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });
    }
}

// Legacy pattern: module.exports object
module.exports = new SampleExtension();

/**
 * AFTER MIGRATION (v1.0.0 pattern):
 * 
 * const { ExtensionSDK } = require('@ghost/extension-sdk');
 * 
 * class SampleExtension {
 *     constructor(extensionId, coreHandler) {
 *         this.extensionId = extensionId;
 *         this.sdk = new ExtensionSDK(extensionId, { coreHandler });
 *     }
 * 
 *     async initialize() {
 *         console.log(`${this.extensionId} initialized`);
 *     }
 * 
 *     async myCommand(params) {
 *         const { args, flags } = params;
 * 
 *         // Use SDK instead of direct fs
 *         const packageContent = await this.sdk.requestFileRead({ path: 'package.json' });
 *         const packageJson = JSON.parse(packageContent);
 *         
 *         // Use SDK instead of direct git
 *         const gitResult = await this.sdk.requestGitExec({ 
 *             operation: 'status', 
 *             args: ['--short'] 
 *         });
 *         const gitStatus = gitResult.stdout;
 *         
 *         // Use SDK instead of direct https
 *         const apiResponse = await this.sdk.requestNetworkCall({
 *             url: 'https://api.example.com/data',
 *             method: 'GET'
 *         });
 *         const apiData = JSON.parse(apiResponse.body);
 * 
 *         return {
 *             success: true,
 *             output: {
 *                 package: packageJson.name,
 *                 gitStatus,
 *                 apiData
 *             }
 *         };
 *     }
 * }
 * 
 * function createExtension(extensionId, coreHandler) {
 *     return new SampleExtension(extensionId, coreHandler);
 * }
 * 
 * module.exports = { SampleExtension, createExtension };
 */
