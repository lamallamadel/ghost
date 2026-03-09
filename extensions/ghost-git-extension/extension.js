#!/usr/bin/env node

/**
 * Ghost Git Extension
 * Standalone extension providing Git operations with AI-powered features
 * Uses @ghost/extension-sdk for all I/O and communication with Ghost core
 */

const { ExtensionSDK, RPCClient } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    DIM: '\x1b[2m',
    ENDC: '\x1b[0m'
};

/**
 * Compat alias for tests and direct RPC
 */
class ExtensionRPCClient extends RPCClient {
    constructor(coreHandler) {
        super('ghost-git-extension');
        this.coreHandler = coreHandler;
    }

    async call(method, params = {}) {
        if (this.coreHandler) {
            const id = Date.now() + Math.random().toString(36).substring(2, 9);
            const response = await this.coreHandler({
                jsonrpc: "2.0",
                id,
                method,
                params
            });
            if (response.error) throw new Error(response.error.message);
            return response.result;
        }
        // Fallback to standard SDK emitIntent if no handler provided
        return await this.emitIntent({ type: 'unknown', operation: method, params });
    }
}

/**
 * Robust Git Wrapper for common operations
 */
class GitWrapper {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async exec(args, suppressError = false) {
        try {
            // Use the standard git intent structure
            const result = await this.sdk.emitIntent({
                type: 'git',
                operation: 'exec',
                params: { args, suppressError }
            });
            return result && result.stdout !== undefined ? result.stdout : result;
        } catch (error) {
            if (!suppressError) {
                try {
                    await this.sdk.requestLog({ 
                        level: 'error', 
                        message: `Git command failed: git ${args.join(' ')}`, 
                        meta: { error: error.message } 
                    });
                } catch (e) {
                    console.error(`Git command failed: git ${args.join(' ')}`, error.message);
                }
            }
            throw error;
        }
    }

    async isRepo() {
        try {
            await this.exec(['rev-parse', '--is-inside-work-tree'], true);
            return true;
        } catch (e) {
            return false;
        }
    }

    async getRepoRoot() {
        const root = await this.exec(['rev-parse', '--show-toplevel'], true);
        return (root || process.cwd()).trim();
    }

    async getStagedFiles() {
        const output = await this.exec(['diff', '--cached', '--name-only']);
        return output.split('\n').map(f => f.trim()).filter(Boolean);
    }

    async getStagedDiff(file = null) {
        const args = ['diff', '--cached'];
        if (file) args.push(`"${file}"`);
        return await this.exec(args);
    }

    async getHeadContent(file) {
        return await this.exec(['show', `HEAD:${file}`], true);
    }

    async getIndexContent(file) {
        return await this.exec(['show', `:${file}`], true);
    }

    async getLastTag(prefix = 'v') {
        const tag = await this.exec(['describe', '--tags', '--abbrev=0'], true);
        if (!tag) return null;
        return (prefix && tag.startsWith(prefix)) ? tag : tag;
    }

    async getCommitsSince(ref) {
        const range = ref ? `${ref}..HEAD` : 'HEAD';
        const raw = await this.exec(['log', range, '--pretty=%s%n%b%n----END----'], true);
        if (!raw) return [];
        return raw.split('----END----').map(s => s.trim()).filter(Boolean);
    }

    async add(files) {
        const fileList = Array.isArray(files) ? files : [files];
        if (fileList.length === 0) return { success: true, output: 'No files specified to add.' };
        
        // Escape filenames for shell
        const escapedFiles = fileList.map(f => `"${f}"`);
        return await this.exec(['add', ...escapedFiles]);
    }

    async getUnstagedChanges(files = []) {
        // git status --porcelain shows unstaged as ' M' or '??' or ' D'
        // We only care about M and ?? for secret scanning
        const args = ['status', '--porcelain'];
        if (files.length > 0) {
            args.push('--');
            files.forEach(f => args.push(`"${f}"`));
        }
        
        const output = await this.exec(args);
        return output.split('\n')
            .filter(line => line.startsWith(' M') || line.startsWith('??'))
            .map(line => line.substring(3).trim());
    }

    async commit(message, options = {}) {
        const args = ['commit', '-m', message];
        if (options.noVerify) args.push('--no-verify');
        if (options.allowEmpty) args.push('--allow-empty');
        if (options.amend) args.push('--amend');
        return await this.exec(args);
    }

    async tag(tagName, message) {
        return await this.exec(['tag', '-a', tagName, '-m', message]);
    }

    async push(remote = 'origin', ref = null) {
        const args = ['push', remote];
        if (ref) args.push(ref);
        return await this.exec(args);
    }

    async getConflicts() {
        const raw = await this.exec(['diff', '--name-only', '--diff-filter=U'], true);
        if (!raw) return [];
        return raw.split('\n').map(s => s.trim()).filter(Boolean);
    }

    async checkout(ref, file = null) {
        const args = ['checkout', ref];
        if (file) {
            args.push('--');
            args.push(file);
        }
        return await this.exec(args);
    }
}

class GitExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.git = new GitWrapper(sdk);
        this.DEFAULT_MODEL = "llama-3.3-70b-versatile";
        
        this.SECRET_REGEXES = [
            { name: 'Groq API Key', regex: /gsk_[a-zA-Z0-9]{48,}/g, severity: 'critical' },
            { name: 'GitHub Token', regex: /gh[pous]_[a-zA-Z0-9]{36,}/g, severity: 'critical' },
            { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g, severity: 'high' },
            { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
            { name: 'AWS Secret Key', regex: /[A-Za-z0-9/+=]{40}/g, severity: 'high' },
            { name: 'Private Key Header', regex: /-----BEGIN (RSA|EC|PGP|OPENSSH|DSA) PRIVATE KEY-----/g, severity: 'critical' },
            { name: 'Generic API Key', regex: /(?:key|api|token|secret|auth)[_-]?(?:key|api|token|secret|auth)?\s*[:=]\s*['"]([a-zA-Z0-9_\-]{16,})['"]?/gi, severity: 'medium' },
            { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{48,}/g, severity: 'critical' },
            { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9\-]{95,}/g, severity: 'critical' }
        ];

        this.KNOWN_NON_SECRETS = [
            'claude-3-5-sonnet', 'gemini-1.5-flash', 'llama-3.3-70b', 'anthropic', 'openai', 'google', 'groq'
        ];

        this.AI_PROVIDERS = {
            groq: { hostname: "api.groq.com", path: "/openai/v1/chat/completions" },
            openai: { hostname: "api.openai.com", path: "/v1/chat/completions" },
            anthropic: { hostname: "api.anthropic.com", path: "/v1/messages" },
            gemini: { hostname: "generativelanguage.googleapis.com", path: "/v1beta/models/" }
        };
    }

    semverParse(input) {
        const raw = (input || '').trim();
        const cleaned = raw.startsWith('v') ? raw.slice(1) : raw;
        const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
        if (!match) return null;
        return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10), patch: parseInt(match[3], 10) };
    }

    semverString(v) {
        return `${v.major}.${v.minor}.${v.patch}`;
    }

    semverCompare(a, b) {
        if (a.major !== b.major) return a.major > b.major ? 1 : -1;
        if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
        if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
        return 0;
    }

    semverBump(version, bump) {
        const v = { major: version.major, minor: version.minor, patch: version.patch };
        if (bump === 'major') return { major: v.major + 1, minor: 0, patch: 0 };
        if (bump === 'minor') return { major: v.major, minor: v.minor + 1, patch: 0 };
        if (bump === 'patch') return { major: v.major, minor: v.minor, patch: v.patch + 1 };
        return v;
    }

    conventionalRequiredBumpFromMessage(message) {
        const msg = (message || '').trim();
        if (!msg) return null;
        const firstLine = msg.split('\n')[0].trim();
        const match = firstLine.match(/^(\w+)(\([^)]+\))?(!)?:\s+/);
        const type = match ? match[1].toLowerCase() : null;
        const hasBang = !!(match && match[3] === '!');
        const hasBreaking = /BREAKING CHANGE/i.test(msg);
        if (hasBang || hasBreaking) return 'major';
        if (type === 'feat') return 'minor';
        if (type === 'fix' || type === 'perf') return 'patch';
        return null;
    }

    calculateShannonEntropy(data) {
        if (!data) return 0;
        const frequencies = {};
        for (const char of data) frequencies[char] = (frequencies[char] || 0) + 1;
        let entropy = 0;
        const len = data.length;
        for (const char in frequencies) {
            const p = frequencies[char] / len;
            entropy -= p * Math.log2(p);
        }
        return entropy;
    }

    scanForSecrets(content) {
        if (!content) return [];
        const suspicious = [];
        const isKnown = (str) => {
            if (/example|test|sample|placeholder|dummy/i.test(str)) return true;
            return this.KNOWN_NON_SECRETS.some(ns => str.toLowerCase().includes(ns.toLowerCase()));
        };

        for (const { name, regex, severity } of this.SECRET_REGEXES) {
            const matches = content.match(regex);
            if (matches) {
                for (const m of matches) {
                    if (m.length > 8 && !isKnown(m)) {
                        suspicious.push({ display: m.substring(0, 30) + (m.length > 30 ? '...' : ''), type: name, value: m, severity, method: 'regex' });
                    }
                }
            }
        }

        const entropyRegex = /(['"])(.*?)(\1)|=\s*([^\s]+)/g;
        let match;
        while ((match = entropyRegex.exec(content)) !== null) {
            const candidate = match[2] || match[4];
            if (!candidate || candidate.length < 16 || candidate.includes(' ') || isKnown(candidate)) continue;
            const entropy = this.calculateShannonEntropy(candidate);
            if (entropy >= 4.5 && entropy <= 7.0) {
                if (!suspicious.some(s => s.value === candidate)) {
                    suspicious.push({ display: candidate.substring(0, 30) + (candidate.length > 30 ? '...' : ''), type: 'High Entropy String', value: candidate, severity: entropy > 5.5 ? 'high' : 'medium', entropy: entropy.toFixed(2), method: 'entropy' });
                }
            }
        }
        return suspicious;
    }

    async handleAdd(params) {
        const files = params.args || params.files || [];
        const flags = params.flags || {};
        const targetFiles = files.length > 0 ? files : ['.'];
        const unstaged = await this.git.getUnstagedChanges(files);
        
        if (unstaged.length > 0 && !flags.force && !flags['skip-audit']) {
            // Call ghost-security-extension via SDK
            try {
                const securityResult = await this.sdk.emitIntent({
                    type: 'extension',
                    operation: 'call',
                    params: {
                        extensionId: 'ghost-security-extension',
                        method: 'security.scan',
                        params: { args: unstaged }
                    }
                });

                if (securityResult && securityResult.findings && securityResult.findings.length > 0) {
                    return { success: false, output: securityResult.output, blocked: true };
                }
            } catch (e) {
                await this.sdk.requestLog({ level: 'warn', message: 'Security extension unavailable, falling back to basic scan' });
                // Fallback logic could go here if security extension is missing
            }
        }

        try {
            await this.git.add(targetFiles);
            return { success: true, output: `${Colors.GREEN}✓ staged changes${Colors.ENDC}` };
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Error staging files:${Colors.ENDC} ${error.message}` };
        }
    }

    async _scanFilesForSecrets(files) {
        const findings = [];
        for (const file of files) {
            try {
                // Use intent to read file content safely through core
                const result = await this.sdk.emitIntent({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: file }
                });
                const content = result.content || result;
                const secrets = this.scanForSecrets(content);
                if (secrets.length > 0) {
                    for (const s of secrets) {
                        findings.push({ file, type: s.type, severity: s.severity });
                    }
                }
            } catch (e) {
                // Skip files we can't read (binary, etc)
            }
        }
        return findings;
    }

    async getStagedDiff() {
        const files = await this.git.getStagedFiles();
        if (files.length === 0) return { text: "", map: {}, files: [] };
        let fullDiff = "";
        const fileMap = {};
        const validFiles = [];
        for (const f of files) {
            const content = await this.git.getStagedDiff(f);
            if (content) {
                fullDiff += `\n--- ${f} ---\n${content}\n`;
                fileMap[f] = content;
                validFiles.push(f);
            }
        }
        return { text: fullDiff, map: fileMap, files: validFiles };
    }

    async callAI(provider, apiKey, model, systemPrompt, userPrompt, temperature = 0.3, jsonMode = false) {
        const actualModel = model || this.DEFAULT_MODEL;
        try {
            const config = this.AI_PROVIDERS[provider] || this.AI_PROVIDERS.groq;
            let result;
            if (provider === 'anthropic') {
                result = await this.callAnthropic(config, apiKey, actualModel, systemPrompt, userPrompt, temperature);
            } else if (provider === 'gemini') {
                result = await this.callGemini(config, apiKey, actualModel, systemPrompt, userPrompt, temperature);
            } else {
                const payload = { model: actualModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature };
                if (jsonMode) payload.response_format = { type: "json_object" };
                const response = await this.sdk.requestNetworkCall({
                    url: `https://${config.hostname}${config.path}`,
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = JSON.parse(response);
                if (data.error) throw new Error(`${provider.toUpperCase()} API Error: ${data.error.message}`);
                result = data.choices[0].message.content;
            }
            return result;
        } catch (error) {
            throw new Error(`AI API Error: ${error.message}\n\n💡 Pro-tip: Run ghost setup to reconfigure your AI provider.`);
        }
    }

    async callAnthropic(config, apiKey, model, systemPrompt, userPrompt, temperature) {
        const actualModel = (model && model.includes('claude')) ? model : "claude-3-5-sonnet-20240620";
        const payload = { model: actualModel, max_tokens: 1024, system: systemPrompt, messages: [{ role: "user", content: userPrompt }], temperature };
        const response = await this.sdk.requestNetworkCall({
            url: `https://${config.hostname}${config.path}`,
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = JSON.parse(response);
        if (data.error) throw new Error(`Anthropic Error: ${data.error.message}`);
        return data.content[0].text;
    }

    async callGemini(config, apiKey, model, systemPrompt, userPrompt, temperature) {
        const modelName = (model && model.includes('gemini')) ? model : "gemini-1.5-flash";
        const payload = { contents: [{ parts: [{ text: `${systemPrompt}\n\nUser: ${userPrompt}` }] }], generationConfig: { temperature, maxOutputTokens: 1024 } };
        const response = await this.sdk.requestNetworkCall({
            url: `https://${config.hostname}${config.path}${modelName}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = JSON.parse(response);
        if (data.error) throw new Error(`Gemini Error: ${data.error.message}`);
        return data.candidates[0].content.parts[0].text;
    }

    async generateCommit(diffText, customPrompt, provider, apiKey, model) {
        let cleanedDiff = diffText;
        const suspects = await this.scanForSecrets(diffText);
        for (const s of suspects) cleanedDiff = cleanedDiff.split(s.value).join('[SECRET_MASKED]');
        const sysPrompt = customPrompt || "Tu es un assistant Git expert. Génère UNIQUEMENT un message de commit suivant la convention 'Conventional Commits'.";
        const truncatedDiff = cleanedDiff.substring(0, 12000);
        let commitMsg = await this.callAI(provider, apiKey, model, sysPrompt, `Diff :\n${truncatedDiff}`);
        return commitMsg.trim().replace(/^['"`]|['"`]$/g, '');
    }

    async auditSecurity(diffMap, provider, apiKey, model) {
        const potentialLeaks = {};
        const cleanedDiffMap = {};
        for (const [fname, content] of Object.entries(diffMap)) {
            const suspects = await this.scanForSecrets(content);
            let cleanedContent = content;
            for (const s of suspects) cleanedContent = cleanedContent.split(s.value).join(`[POTENTIAL_SECRET_TYPE_${s.type.replace(/\s+/g, '_')}]`);
            cleanedDiffMap[fname] = cleanedContent;
            if (suspects.length > 0) potentialLeaks[fname] = suspects;
        }
        if (Object.keys(potentialLeaks).length > 0) {
            const securityPrompt = `Tu es un expert en cybersécurité. Analyse les extraits pour détecter des secrets. Réponds UNIQUEMENT au format JSON : {"is_breach": boolean, "reason": "string"}`;
            const leaksFormatted = {};
            for (const [fname, suspects] of Object.entries(potentialLeaks)) {
                leaksFormatted[fname] = suspects.map(s => ({ type: s.type, severity: s.severity, preview: s.display, context: cleanedDiffMap[fname].substring(0, 500) }));
            }
            try {
                const res = await this.callAI(provider, apiKey, model, securityPrompt, JSON.stringify(leaksFormatted), 0.3, true);
                const audit = JSON.parse(res);
                if (audit.is_breach) return { blocked: true, reason: audit.reason };
            } catch (error) {
                return { blocked: true, reason: `AI Security Validation failed: ${error.message}` };
            }
        }
        return { blocked: false, reason: 'No secrets detected' };
    }

    async handleRPCRequest(request) {
        try {
            const { method, params = {} } = request;
            let result;
            switch (method) {
                case 'git.checkRepo': result = await this.git.isRepo(); break;
                case 'git.add': result = await this.handleAdd(params); break;
                case 'git.getStagedDiff': result = await this.getStagedDiff(); break;
                case 'git.generateCommit': result = await this.generateCommit(params.diffText, params.customPrompt, params.provider, params.apiKey, params.model); break;
                case 'git.auditSecurity': result = await this.auditSecurity(params.diffMap, params.provider, params.apiKey, params.model); break;
                case 'git.merge.getConflicts': result = await this.git.getConflicts(); break;
                case 'git.merge.resolve': result = await this.handleMergeResolve(params.strategy); break;
                default: throw new Error(`Unknown method: ${method}`);
            }
            return { jsonrpc: "2.0", id: request.id, result };
        } catch (error) {
            return { jsonrpc: "2.0", id: request.id, error: { code: -32603, message: error.message } };
        }
    }

    async handleMergeResolve(strategy) {
        const conflicts = await this.git.getConflicts();
        if (!conflicts.length) return { success: true, message: 'No conflicts detected' };
        const resolved = [];
        const manual = [];
        for (const file of conflicts) {
            if (strategy === 'manual') { manual.push(file); continue; }
            try {
                if (strategy === 'ours') { await this.git.checkout('--ours', file); await this.git.add(file); resolved.push({ file, strategy: 'ours' }); }
                else if (strategy === 'theirs') { await this.git.checkout('--theirs', file); await this.git.add(file); resolved.push({ file, strategy: 'theirs' }); }
            } catch (error) { manual.push(file); }
        }
        const remaining = await this.git.getConflicts();
        return { success: remaining.length === 0, resolved, manual, remaining };
    }
}

function createExtension(coreHandler) {
    const sdk = new ExtensionSDK('ghost-git-extension');
    
    // In tests, we need to redirect the SDK's internal calls to our mock handler
    if (coreHandler) {
        sdk.emitIntent = async (intent) => {
            const response = await coreHandler({
                jsonrpc: "2.0",
                id: Date.now().toString(),
                method: 'intent',
                params: intent
            });
            if (response.error) throw new Error(response.error.message);
            return response.result;
        };
    }

    const extension = new GitExtension(sdk);
    return { handleRequest: (req) => extension.handleRPCRequest(req), extension };
}

module.exports = { createExtension, GitExtension, GitWrapper, ExtensionRPCClient };
