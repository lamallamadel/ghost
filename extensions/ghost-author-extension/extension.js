#!/usr/bin/env node

/**
 * Ghost Author Kit
 * Developer toolkit for extension authoring
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m'
};

class AuthorExtension {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async handleInit(params) {
        const name = params.args?.[0];
        if (!name) return { success: false, output: "Please specify an extension name (e.g., my-helper)." };

        const extId = name.startsWith('ghost-') ? name : `ghost-${name}-extension`;
        const targetDir = path.join('extensions', extId);

        await this.sdk.requestLog({ level: 'info', message: `Scaffolding new extension: ${extId}` });

        try {
            // 1. Create Directory
            // Note: mkdir is implied by file write if missing in some envs, 
            // but here we use a process intent for safety
            await this.sdk.emitIntent({
                type: 'process',
                operation: 'spawn',
                params: { command: 'mkdir', args: [targetDir], options: { shell: true } }
            });

            // 2. Generate Manifest
            const manifest = {
                id: extId,
                name: name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                version: "1.0.0",
                description: "Description of your extension.",
                main: "index.js",
                commands: ["hello"],
                permissions: ["filesystem:read"]
            };

            await this.sdk.requestFileWrite({ 
                path: path.join(targetDir, 'manifest.json'), 
                content: JSON.stringify(manifest, null, 2) 
            });

            // 3. Generate package.json
            const pkg = {
                name: `@ghost/${extId}`,
                version: "1.0.0",
                description: manifest.description,
                main: "index.js",
                dependencies: { "@ghost/extension-sdk": "^1.0.0" }
            };

            await this.sdk.requestFileWrite({ 
                path: path.join(targetDir, 'package.json'), 
                content: JSON.stringify(pkg, null, 2) 
            });

            // 4. Generate entry point (index.js)
            const entryPoint = `#!/usr/bin/env node\n\nconst { ExtensionSDK } = require('@ghost/extension-sdk');\n\nclass ExtensionWrapper {\n    constructor() {\n        this.sdk = new ExtensionSDK('${extId}');\n    }\n\n    async hello() {\n        return { success: true, output: 'Hello from ${name}!' };\n    }\n\n    async handleRPCRequest(request) {\n        if (request.method === '${name}.hello') return await this.hello();\n        return { error: { code: -32601, message: 'Method not found' } };\n    }\n}\n\nmodule.exports = ExtensionWrapper;\n`;

            await this.sdk.requestFileWrite({ 
                path: path.join(targetDir, 'index.js'), 
                content: entryPoint 
            });

            return { 
                success: true, 
                output: `${Colors.GREEN}✓ Extension ${extId} scaffolded successfully at ${targetDir}.${Colors.ENDC}\n\nNext steps:\n1. cd ${targetDir}\n2. npm install\n3. ghost extension install .` 
            };
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Scaffolding failed:${Colors.ENDC} ${error.message}` };
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'author.init': return await this.handleInit(params);
                case 'author.validate': return { success: true, output: 'Validation pending Phase 2.' };
                case 'author.publish': return { success: true, output: 'Publishing pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { AuthorExtension };
