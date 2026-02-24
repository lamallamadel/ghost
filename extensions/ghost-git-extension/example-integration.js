#!/usr/bin/env node

/**
 * Example integration showing how Ghost core would use the Git extension
 * This demonstrates the RPC pattern with I/O intent emission
 */

const { createExtension } = require('./extension.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const readline = require('readline');

class GhostCoreRPCHandler {
    constructor() {
        this.requestLog = [];
    }

    async handle(request) {
        this.requestLog.push(request);
        const { method, params = {} } = request;

        try {
            let result;

            switch (method) {
                // Filesystem operations
                case 'fs.readFile':
                    result = fs.readFileSync(params.path, params.encoding || 'utf8');
                    break;

                case 'fs.writeFile':
                    fs.writeFileSync(params.path, params.content, params.encoding || 'utf8');
                    result = { success: true };
                    break;

                case 'fs.appendFile':
                    fs.appendFileSync(params.path, params.content, params.encoding || 'utf8');
                    result = { success: true };
                    break;

                case 'fs.exists':
                    result = fs.existsSync(params.path);
                    break;

                case 'fs.readDir':
                    result = fs.readdirSync(params.path, params);
                    break;

                case 'fs.lstat':
                    const stat = fs.lstatSync(params.path);
                    result = {
                        isDirectory: stat.isDirectory(),
                        isFile: stat.isFile(),
                        size: stat.size
                    };
                    break;

                // Git operations
                case 'git.exec':
                    try {
                        const cmd = `git ${params.args.join(' ')}`;
                        result = execSync(cmd, { 
                            encoding: 'utf8', 
                            stdio: ['pipe', 'pipe', 'pipe'] 
                        }).trim();
                    } catch (e) {
                        if (!params.suppressError) throw e;
                        result = "";
                    }
                    break;

                // HTTPS requests
                case 'https.request':
                    result = await this.makeHttpsRequest(params.options, params.payload);
                    break;

                // Process execution
                case 'exec.sync':
                    result = execSync(params.command, params.options || {}).toString();
                    break;

                // UI operations
                case 'ui.prompt':
                    result = await this.promptUser(params.question);
                    break;

                // Logging
                case 'log.write':
                    console.log(`[${params.level}] ${params.message}`, params.meta || '');
                    result = { success: true };
                    break;

                default:
                    throw new Error(`Unknown RPC method: ${method}`);
            }

            return {
                jsonrpc: "2.0",
                id: request.id,
                result
            };
        } catch (error) {
            return {
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: -32603,
                    message: error.message
                }
            };
        }
    }

    async makeHttpsRequest(options, payload) {
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    } else {
                        resolve(data);
                    }
                });
            });

            req.on('error', reject);
            req.write(JSON.stringify(payload));
            req.end();
        });
    }

    async promptUser(question) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise(resolve => {
            rl.question(question, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }
}

async function exampleUsage() {
    console.log('Ghost Git Extension - Example Integration\n');

    // Create core RPC handler
    const coreHandler = new GhostCoreRPCHandler();
    
    // Create extension instance
    const { handleRequest, extension } = createExtension((req) => coreHandler.handle(req));

    console.log('✅ Extension loaded successfully\n');

    // Example 1: Check if we're in a Git repository
    console.log('Example 1: Checking Git repository...');
    const repoCheck = await handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "git.checkRepo",
        params: {}
    });
    console.log(`Is Git repo: ${repoCheck.result}\n`);

    // Example 2: Get staged diff (if any)
    console.log('Example 2: Getting staged changes...');
    const diffResult = await handleRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "git.getStagedDiff",
        params: {}
    });
    console.log(`Staged files: ${diffResult.result.files.length}`);
    console.log(`Files: ${diffResult.result.files.join(', ') || 'none'}\n`);

    // Example 3: Scan for secrets in a sample text
    console.log('Example 3: Security scanning...');
    const sampleCode = `
        const apiKey = "test_key_12345678";
        const model = "claude-3-5-sonnet-20240620";
    `;
    const secrets = extension.scanForSecrets(sampleCode);
    console.log(`Secrets detected: ${secrets.length}`);
    secrets.forEach(s => console.log(`  - ${s}`));
    console.log();

    // Example 4: Semver operations
    console.log('Example 4: Version management...');
    const version = extension.semverParse('1.2.3');
    console.log(`Parsed version: ${extension.semverString(version)}`);
    const bumped = extension.semverBump(version, 'minor');
    console.log(`After minor bump: ${extension.semverString(bumped)}\n`);

    // Example 5: Conventional commit analysis
    console.log('Example 5: Conventional commits...');
    const commits = [
        'feat: add new feature',
        'fix: resolve bug',
        'feat!: breaking change'
    ];
    commits.forEach(msg => {
        const bump = extension.conventionalRequiredBumpFromMessage(msg);
        console.log(`  "${msg}" -> requires ${bump || 'none'} bump`);
    });
    console.log();

    // Show RPC call log
    console.log(`Total RPC calls made: ${coreHandler.requestLog.length}`);
    console.log('RPC methods called:');
    const methodCounts = {};
    coreHandler.requestLog.forEach(req => {
        methodCounts[req.method] = (methodCounts[req.method] || 0) + 1;
    });
    Object.entries(methodCounts).forEach(([method, count]) => {
        console.log(`  - ${method}: ${count}x`);
    });
}

if (require.main === module) {
    exampleUsage().catch(console.error);
}

module.exports = { GhostCoreRPCHandler, exampleUsage };
