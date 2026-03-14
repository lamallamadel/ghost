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
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m'
};

const getLoadingSquare = (label) => {
    const square = [
        '╔═════════╗',
        '║ ███   █ ║',
        '║ █ █ █ █ ║',
        '║ █   █ █ ║',
        '╚═════════╝'
    ];

    return square.map((line, idx) => {
        if (idx === 2) {
            const inner = label.slice(0, 7).padEnd(7);
            return `║ ${inner} ║`;
        }
        return line;
    }).join('\n');
};

class AuthorExtension {
    constructor(sdk) {
        this.sdk = sdk;
    }

    _emitLoadingSquare(label) {
        const message = getLoadingSquare(label || 'init');
        process.stderr.write(`${Colors.CYAN}${message}${Colors.ENDC}\n`);
    }

    _resolveInitTarget(params = {}) {
        const raw = params.subcommand || params.args?.[0] || '';
        return String(raw).trim();
    }

    async handleInit(params) {
        const name = this._resolveInitTarget(params);
        if (!name) return { success: false, output: "Please specify an extension name (e.g., my-helper)." };

        const extId = name.startsWith('ghost-') ? name : `ghost-${name}-extension`;
        const targetDir = path.join('extensions', extId);

        this._emitLoadingSquare('scaffold');
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

            // 3. Generate package.json
            const pkg = {
                name: `@ghost/${extId}`,
                version: "1.0.0",
                description: manifest.description,
                main: "index.js",
                dependencies: { "@ghost/extension-sdk": "^1.0.0" }
            };

            // 4. Generate entry point (index.js)
            const entryPoint = `#!/usr/bin/env node\n\nconst { ExtensionSDK } = require('@ghost/extension-sdk');\n\nclass ExtensionWrapper {\n    constructor() {\n        this.sdk = new ExtensionSDK('${extId}');\n    }\n\n    async hello() {\n        return { success: true, output: 'Hello from ${name}!' };\n    }\n\n    async handleRPCRequest(request) {\n        if (request.method === '${name}.hello') return await this.hello();\n        return { error: { code: -32601, message: 'Method not found' } };\n    }\n}\n\nmodule.exports = ExtensionWrapper;\n`;

            await Promise.all([
                this.sdk.requestFileWrite({ path: path.join(targetDir, 'manifest.json'), content: JSON.stringify(manifest, null, 2) }),
                this.sdk.requestFileWrite({ path: path.join(targetDir, 'package.json'), content: JSON.stringify(pkg, null, 2) }),
                this.sdk.requestFileWrite({ path: path.join(targetDir, 'index.js'), content: entryPoint }),
            ]);

            return { 
                success: true, 
                output: `${Colors.GREEN}✓ Extension ${extId} scaffolded successfully at ${targetDir}.${Colors.ENDC}\n\nNext steps:\n1. cd ${targetDir}\n2. npm install\n3. ghost extension install .` 
            };
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Scaffolding failed:${Colors.ENDC} ${error.message}` };
        }
    }

    async handleValidate(params, _content) {
        const target = params.args?.[0] || '.';
        const manifestPath = target.endsWith('manifest.json') ? target : path.join(target, 'manifest.json');

        await this.sdk.requestLog({ level: 'info', message: `Validating extension manifest at: ${manifestPath}` });

        try {
            const content = _content !== undefined ? _content : await this.sdk.requestFileRead({ path: manifestPath });
            const manifest = JSON.parse(content);
            const errors = [];
            const warnings = [];

            // 1. Required Fields Check
            const required = ['id', 'name', 'version', 'main', 'commands'];
            for (const field of required) {
                if (!manifest[field]) errors.push(`Missing required field: ${field}`);
            }

            // 2. ID Hygiene
            if (manifest.id && !manifest.id.startsWith('ghost-')) {
                warnings.push("Extension ID should ideally start with 'ghost-' prefix.");
            }

            // 3. Permission Audit
            if (manifest.permissions && manifest.permissions.includes('filesystem:write') && !manifest.permissions.includes('filesystem:read')) {
                errors.push("Invalid permission set: 'filesystem:write' requires 'filesystem:read'.");
            }

            if (manifest.permissions && manifest.permissions.length > 5) {
                warnings.push("High number of permissions requested. Ensure the extension follows the principle of least privilege.");
            }

            // 4. Command collision check (Simulated)
            if (manifest.commands && manifest.commands.includes('setup')) {
                errors.push("Command collision: 'setup' is a reserved Ghost core command.");
            }

            let output = `\n${Colors.BOLD}EXTENSION VALIDATION REPORT${Colors.ENDC}\n${'='.repeat(30)}\n`;
            
            if (errors.length === 0) {
                output += `${Colors.GREEN}✓ Manifest is valid.${Colors.ENDC}\n`;
            } else {
                output += `${Colors.FAIL}✖ Validation failed with ${errors.length} error(s):${Colors.ENDC}\n`;
                for (const err of errors) output += `  - ${err}\n`;
            }

            if (warnings.length > 0) {
                output += `\n${Colors.WARNING}⚠ Warnings:${Colors.ENDC}\n`;
                for (const warn of warnings) output += `  - ${warn}\n`;
            }

            return { 
                success: errors.length === 0, 
                output,
                errors,
                warnings
            };
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Validation error:${Colors.ENDC} ${error.message}` };
        }
    }

    async handlePublish(params) {
        const target = params.args?.[0] || '.';
        const bump = params.flags?.bump || 'patch'; // major, minor, patch
        const manifestPath = path.join(target, 'manifest.json');
        const packagePath = path.join(target, 'package.json');

        await this.sdk.requestLog({ level: 'info', message: `Preparing publication for extension at: ${target}` });

        try {
            // 1. Read files in parallel
            const [manifestContent, pkgContent] = await Promise.all([
                this.sdk.requestFileRead({ path: manifestPath }),
                this.sdk.requestFileRead({ path: packagePath }),
            ]);

            const manifest = JSON.parse(manifestContent);
            const pkg = JSON.parse(pkgContent);

            // 2. Perform validation first (reuse already-read content)
            const validation = await this.handleValidate({ args: [target] }, manifestContent);
            if (!validation.success) {
                return { success: false, output: `${Colors.FAIL}Publication aborted: Validation failed.${Colors.ENDC}\n${validation.output}` };
            }

            // 3. Bump versions (Simple semver logic)
            const oldVersion = manifest.version;
            const parts = oldVersion.split('.').map(Number);
            if (bump === 'major') parts[0]++;
            else if (bump === 'minor') parts[1]++;
            else parts[2]++;
            const newVersion = parts.join('.');

            manifest.version = newVersion;
            pkg.version = newVersion;

            // 4. Write back files in parallel
            await Promise.all([
                this.sdk.requestFileWrite({ path: manifestPath, content: JSON.stringify(manifest, null, 2) }),
                this.sdk.requestFileWrite({ path: packagePath, content: JSON.stringify(pkg, null, 2) }),
            ]);

            // 5. Git Tagging (via git intent)
            const tagName = `${manifest.id}@${newVersion}`;
            try {
                await this.sdk.emitIntent({
                    type: 'git',
                    operation: 'exec',
                    params: { args: ['tag', '-a', tagName, '-m', `Release ${tagName}`] }
                });
            } catch (e) {
                await this.sdk.requestLog({ level: 'warn', message: 'Git tagging failed. Ensure you are in a git repository.' });
            }

            return { 
                success: true, 
                output: `${Colors.GREEN}✓ Publication prepared successfully.${Colors.ENDC}\n- Version bumped: ${oldVersion} → ${newVersion}\n- Git tag created: ${tagName}\n\nRun 'npm publish' to finalize to NPM.` 
            };
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Publication failed:${Colors.ENDC} ${error.message}` };
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'author.init': return await this.handleInit(params);
                case 'author.validate': return await this.handleValidate(params);
                case 'author.publish': return await this.handlePublish(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { AuthorExtension };
