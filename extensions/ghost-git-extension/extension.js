#!/usr/bin/env node

/**
 * Ghost Git Extension
 * Standalone extension providing Git operations with AI-powered features
 * Uses JSON-RPC to communicate with Ghost core for all I/O operations
 */

const path = require('path');

class ExtensionRPCClient {
    constructor(coreHandler) {
        this.coreHandler = coreHandler || this.defaultHandler;
        this.requestId = 0;
    }

    defaultHandler(method, params) {
        throw new Error(`No core handler registered for RPC call: ${method}`);
    }

    async call(method, params = {}) {
        const id = ++this.requestId;
        const request = {
            jsonrpc: "2.0",
            id,
            method,
            params
        };

        const response = await this.coreHandler(request);
        
        if (response.error) {
            throw new Error(`RPC Error (${response.error.code}): ${response.error.message}`);
        }
        
        return response.result;
    }

    async emitIntent(type, operation, params) {
        const intent = {
            type,
            operation,
            params
        };
        return await this.call('intent', intent);
    }

    async requestFileRead(path, encoding = 'utf8') {
        return await this.emitIntent('filesystem', 'read', { path, encoding });
    }

    async requestFileWrite(path, content, encoding = 'utf8') {
        return await this.emitIntent('filesystem', 'write', { path, content, encoding });
    }

    async requestFileAppend(path, content, encoding = 'utf8') {
        return await this.emitIntent('filesystem', 'append', { path, content, encoding });
    }

    async requestFileExists(path) {
        return await this.emitIntent('filesystem', 'exists', { path });
    }

    async requestFileReadDir(path, options = {}) {
        return await this.emitIntent('filesystem', 'readdir', { path, ...options });
    }

    async requestFileStat(path) {
        return await this.emitIntent('filesystem', 'stat', { path });
    }

    async requestGitExec(args, suppressError = false) {
        return await this.emitIntent('git', 'exec', { args, suppressError });
    }

    async requestNetworkCall(options, payload) {
        return await this.emitIntent('network', 'request', { options, payload });
    }

    async requestExecSync(command, options = {}) {
        return await this.emitIntent('process', 'exec', { command, options });
    }

    async requestPromptUser(question) {
        return await this.emitIntent('ui', 'prompt', { question });
    }

    async requestLog(level, message, meta = {}) {
        return await this.emitIntent('log', 'write', { level, message, meta });
    }

    async readFile(filePath) {
        return await this.requestFileRead(filePath);
    }

    async writeFile(filePath, content) {
        return await this.requestFileWrite(filePath, content);
    }

    async appendFile(filePath, content) {
        return await this.requestFileAppend(filePath, content);
    }

    async fileExists(filePath) {
        return await this.requestFileExists(filePath);
    }

    async readDir(dirPath, options = {}) {
        return await this.requestFileReadDir(dirPath, options);
    }

    async lstat(filePath) {
        return await this.requestFileStat(filePath);
    }

    async gitExec(args, suppressError = false) {
        return await this.requestGitExec(args, suppressError);
    }

    async httpsRequest(options, payload) {
        return await this.requestNetworkCall(options, payload);
    }

    async execSync(command, options = {}) {
        return await this.requestExecSync(command, options);
    }

    async promptUser(question) {
        return await this.requestPromptUser(question);
    }

    async log(level, message, meta = {}) {
        return await this.requestLog(level, message, meta);
    }
}

class GitExtension {
    constructor(rpcClient) {
        this.rpc = rpcClient;
        this.SAFE_EXTENSIONS = new Set(['.md', '.txt', '.csv', '.html', '.css', '.scss', '.lock', '.xml', '.json']);
        this.SAFE_FILES = new Set(['mvnw', 'gradlew', 'package-lock.json', 'yarn.lock', 'pom.xml']);
        this.DEFAULT_MODEL = "llama-3.3-70b-versatile";
        
        this.SECRET_REGEXES = [
            { name: 'Groq API Key', regex: /gsk_[a-zA-Z0-9]{48,}/g, severity: 'critical' },
            { name: 'GitHub Token', regex: /gh[pous]_[a-zA-Z0-9]{36,}/g, severity: 'critical' },
            { name: 'GitHub Classic Token', regex: /ghp_[a-zA-Z0-9]{36,}/g, severity: 'critical' },
            { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g, severity: 'high' },
            { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
            { name: 'AWS Secret Key', regex: /[A-Za-z0-9/+=]{40}/g, severity: 'high' },
            { name: 'Private Key Header', regex: /-----BEGIN (RSA|EC|PGP|OPENSSH|DSA) PRIVATE KEY-----/g, severity: 'critical' },
            { name: 'Generic API Key', regex: /(?:key|api|token|secret|auth)[_-]?(?:key|api|token|secret|auth)?\s*[:=]\s*['"]([a-zA-Z0-9_\-]{16,})['"]?/gi, severity: 'medium' },
            { name: 'Bearer Token', regex: /bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, severity: 'high' },
            { name: 'Basic Auth', regex: /basic\s+[a-zA-Z0-9+/=]{20,}/gi, severity: 'high' },
            { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{48,}/g, severity: 'critical' },
            { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9\-]{95,}/g, severity: 'critical' },
            { name: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, severity: 'medium' },
            { name: 'Database Connection String', regex: /(mongodb|mysql|postgresql|postgres):\/\/[^:]+:[^@]+@[^\/]+/gi, severity: 'critical' },
            { name: 'Generic Secret Pattern', regex: /(?:secret|password|passwd|pwd)[_-]?\s*[:=]\s*['"]?([a-zA-Z0-9!@#$%^&*()_+\-=]{8,})['"]?/gi, severity: 'medium' },
            { name: 'Google Cloud Service Account Key', regex: /\{"type"\s*:\s*"service_account"[^}]*"private_key"\s*:\s*"[^"]+"/gi, severity: 'critical' },
            { name: 'Google Cloud Private Key ID', regex: /"private_key_id"\s*:\s*"[a-f0-9]{40}"/gi, severity: 'critical' },
            { name: 'Stripe Live Secret Key', regex: /sk_live_[a-zA-Z0-9]{24,}/g, severity: 'critical' },
            { name: 'Stripe Live Restricted Key', regex: /rk_live_[a-zA-Z0-9]{24,}/g, severity: 'critical' },
            { name: 'Twilio API Key', regex: /SK[a-f0-9]{32}/g, severity: 'critical' },
            { name: 'Azure Storage Connection String', regex: /DefaultEndpointsProtocol=https?;.*AccountName=[^;]+;.*AccountKey=[a-zA-Z0-9+/=]{88}/gi, severity: 'critical' },
            { name: 'Azure Shared Access Signature', regex: /\?sv=\d{4}-\d{2}-\d{2}&[^\s"']+/g, severity: 'high' }
        ];

        this.KNOWN_NON_SECRETS = [
            'claude-3-5-sonnet',
            'claude-3-opus',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-2.0-flash',
            'llama-3.3-70b',
            'llama-3.1-8b',
            'gpt-4',
            'gpt-3.5-turbo',
            'anthropic',
            'openai',
            'google',
            'groq',
            'ConfigManager',
            'AIEngine',
            'DEFAULT_MODEL',
            'getDashboardHTML',
            'GhostMonitor',
            'startConsoleServer',
            'example',
            'test',
            'sample',
            'placeholder',
            'dummy',
            'fixture',
            'mock',
            'AKIAIOSFODNN7EXAMPLE',
            'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
            'base64',
            'encoding',
            'iVBORw0KGgo',
            'data:image'
        ];

        this.AI_PROVIDERS = {
            groq: {
                hostname: "api.groq.com",
                path: "/openai/v1/chat/completions"
            },
            openai: {
                hostname: "api.openai.com",
                path: "/v1/chat/completions"
            },
            anthropic: {
                hostname: "api.anthropic.com",
                path: "/v1/messages"
            },
            gemini: {
                hostname: "generativelanguage.googleapis.com",
                path: "/v1beta/models/"
            }
        };
    }

    async checkGitRepo() {
        try {
            await this.rpc.gitExec(['rev-parse', '--is-inside-work-tree']);
            return true;
        } catch (e) {
            return false;
        }
    }

    async getStagedDiff() {
        await this.rpc.log('debug', `Reading staged diff`);
        
        const filesOutput = await this.rpc.gitExec(['diff', '--cached', '--name-only']);
        if (!filesOutput) {
            await this.rpc.log('debug', `No staged files found`);
            return { text: "", map: {}, files: [] };
        }

        const files = filesOutput.split('\n').filter(f => f.trim());
        await this.rpc.log('debug', `Found ${files.length} staged files`);
        
        let fullDiff = "";
        const fileMap = {};
        const validFiles = [];

        for (let f of files) {
            f = f.trim().replace(/^"|"$/g, '');
            if (!f) continue;

            await this.rpc.log('debug', `Reading diff for file: ${f}`);
            const content = await this.rpc.gitExec(['diff', '--cached', `"${f}"`]);
            if (content) {
                fullDiff += `\n--- ${f} ---\n${content}\n`;
                fileMap[f] = content;
                validFiles.push(f);
            }
        }

        await this.rpc.log('debug', `Staged diff read complete`, { 
            totalFiles: validFiles.length,
            totalDiffLength: fullDiff.length
        });

        return { text: fullDiff, map: fileMap, files: validFiles };
    }

    calculateShannonEntropy(data) {
        if (!data) return 0;
        const frequencies = {};
        for (let char of data) {
            frequencies[char] = (frequencies[char] || 0) + 1;
        }
        
        let entropy = 0;
        const len = data.length;
        for (let char in frequencies) {
            const p = frequencies[char] / len;
            entropy -= p * Math.log2(p);
        }
        return entropy;
    }

    async loadGhostIgnore() {
        const ghostIgnorePath = path.join(process.cwd(), '.ghostignore');
        const exists = await this.rpc.fileExists(ghostIgnorePath);
        if (!exists) return [];
        
        try {
            const content = await this.rpc.readFile(ghostIgnorePath);
            return content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
        } catch (e) {
            return [];
        }
    }

    async scanForSecrets(content) {
        if (!content) return [];
        const suspicious = [];
        
        const isKnownNonSecret = (str) => {
            if (/example|test|sample|placeholder|dummy|fixture|mock/i.test(str)) return true;
            const lowerStr = str.toLowerCase();
            return this.KNOWN_NON_SECRETS.some(ns => lowerStr.includes(ns.toLowerCase()));
        };

        for (const { name, regex, severity } of this.SECRET_REGEXES) {
            const matches = content.match(regex);
            if (matches) {
                for (const m of matches) {
                    if (m.length > 8 && !isKnownNonSecret(m)) {
                        const display = m.length > 30 ? m.substring(0, 30) + '...' : m;
                        suspicious.push({ 
                            display: `${display} (${name})`, 
                            type: name, 
                            value: m,
                            severity: severity || 'medium',
                            method: 'regex'
                        });
                        await this.rpc.log('warn', 'SECURITY_ALERT: Secret pattern detected', {
                            type: name,
                            severity: severity || 'medium',
                            method: 'regex',
                            preview: display
                        });
                    }
                }
            }
        }

        const regex = /(['"])(.*?)(\1)|=\s*([^\s]+)/g;
        let match;

        while ((match = regex.exec(content)) !== null) {
            const candidate = match[2] || match[4];
            
            if (!candidate || candidate.length < 16 || candidate.includes(' ')) continue;

            if (isKnownNonSecret(candidate)) continue;
            
            const entropy = this.calculateShannonEntropy(candidate);
            if (entropy >= 4.5 && entropy <= 7.0) {
                const display = candidate.length > 30 ? candidate.substring(0, 30) + '...' : candidate;
                if (!suspicious.some(s => s.value === candidate)) {
                    const severity = entropy > 5.5 ? 'high' : 'medium';
                    suspicious.push({ 
                        display: `${display} (High Entropy)`, 
                        type: 'High Entropy String', 
                        value: candidate,
                        severity: severity,
                        entropy: entropy.toFixed(2),
                        method: 'entropy'
                    });
                    await this.rpc.log('warn', 'SECURITY_ALERT: High entropy string detected', {
                        type: 'High Entropy String',
                        severity: severity,
                        entropy: entropy.toFixed(2),
                        method: 'entropy',
                        preview: display
                    });
                }
            }
        }
        return suspicious;
    }

    async callAI(provider, apiKey, model, systemPrompt, userPrompt, temperature = 0.3, jsonMode = false) {
        await this.rpc.log('info', `Initiating AI call`, { 
            provider, 
            model, 
            temperature, 
            jsonMode,
            promptLength: userPrompt.length 
        });

        const config = this.AI_PROVIDERS[provider] || this.AI_PROVIDERS.groq;
        
        if (provider === 'anthropic') {
            return await this.callAnthropic(config, apiKey, model, systemPrompt, userPrompt, temperature);
        } else if (provider === 'gemini') {
            return await this.callGemini(config, apiKey, model, systemPrompt, userPrompt, temperature);
        }

        const payload = {
            model: model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: temperature
        };

        if (jsonMode) {
            payload.response_format = { type: "json_object" };
        }

        const options = {
            hostname: config.hostname,
            path: config.path,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Node.js/GhostCLI)'
            }
        };

        await this.rpc.log('debug', `Sending request to ${provider} API`, { 
            hostname: config.hostname,
            path: config.path
        });

        const response = await this.rpc.httpsRequest(options, payload);
        const data = JSON.parse(response);
        
        await this.rpc.log('debug', `Received response from ${provider} API`, { 
            responseLength: response.length 
        });
        
        return data.choices[0].message.content;
    }

    async callAnthropic(config, apiKey, model, systemPrompt, userPrompt, temperature) {
        const actualModel = model.includes('claude') ? model : "claude-3-5-sonnet-20240620";
        
        await this.rpc.log('debug', `Calling Anthropic API`, { 
            model: actualModel,
            maxTokens: 1024,
            temperature
        });
        
        const payload = {
            model: actualModel,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
            temperature: temperature
        };

        const options = {
            hostname: config.hostname,
            path: config.path,
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Node.js/GhostCLI)'
            }
        };

        const response = await this.rpc.httpsRequest(options, payload);
        const data = JSON.parse(response);
        
        await this.rpc.log('debug', `Anthropic API response received`, { 
            responseLength: response.length,
            contentLength: data.content?.[0]?.text?.length || 0
        });
        
        return data.content[0].text;
    }

    async callGemini(config, apiKey, model, systemPrompt, userPrompt, temperature) {
        const modelName = model.includes('gemini') ? model : "gemini-1.5-flash";
        const path = `${config.path}${modelName}:generateContent?key=${apiKey}`;
        
        await this.rpc.log('debug', `Calling Gemini API`, { 
            model: modelName,
            maxOutputTokens: 1024,
            temperature
        });
        
        const payload = {
            contents: [{
                parts: [{ text: `${systemPrompt}\n\nUser: ${userPrompt}` }]
            }],
            generationConfig: {
                temperature: temperature,
                maxOutputTokens: 1024,
            }
        };

        const options = {
            hostname: config.hostname,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Node.js/GhostCLI)'
            }
        };

        const response = await this.rpc.httpsRequest(options, payload);
        const data = JSON.parse(response);
        
        await this.rpc.log('debug', `Gemini API response received`, { 
            responseLength: response.length,
            contentLength: data.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0
        });
        
        return data.candidates[0].content.parts[0].text;
    }

    async generateCommit(diffText, customPrompt, provider, apiKey, model) {
        await this.rpc.log('info', `Starting commit message generation`, { 
            provider, 
            model,
            diffLength: diffText.length,
            hasCustomPrompt: !!customPrompt
        });
        
        const sysPrompt = customPrompt || "Tu es un assistant Git expert. Génère UNIQUEMENT un message de commit suivant la convention 'Conventional Commits' (ex: feat: add login). Sois concis, descriptif et professionnel. N'utilise pas de markdown (pas de backticks), pas de guillemets autour du message.";
        
        const truncatedDiff = diffText.substring(0, 12000);
        
        await this.rpc.log('debug', `Preparing diff for AI analysis`, { 
            originalLength: diffText.length,
            truncatedLength: truncatedDiff.length,
            truncated: diffText.length > 12000
        });
        
        let commitMsg = await this.callAI(provider, apiKey, model, sysPrompt, `Diff :\n${truncatedDiff}`);
        commitMsg = commitMsg.trim().replace(/^['"`]|['"`]$/g, '');
        
        await this.rpc.log('info', `Commit message generated successfully`, { 
            messageLength: commitMsg.length,
            messagePreview: commitMsg.substring(0, 60)
        });
        
        return commitMsg;
    }

    async auditSecurity(diffMap, provider, apiKey, model, flags = {}) {
        const ignoredPatterns = await this.loadGhostIgnore();
        const isIgnored = (secretObj) => {
            const display = typeof secretObj === 'string' ? secretObj : secretObj.display;
            return ignoredPatterns.some(pattern => display.includes(pattern));
        };

        const potentialLeaks = {};
        for (const [fname, content] of Object.entries(diffMap)) {
            const suspects = await this.scanForSecrets(content);
            const filtered = suspects.filter(s => !isIgnored(s));
            if (filtered.length > 0) {
                potentialLeaks[fname] = filtered;
                for (const suspect of filtered) {
                    await this.rpc.log('warn', 'SECURITY_ALERT: Potential leak in staged file', {
                        file: fname,
                        type: suspect.type,
                        severity: suspect.severity,
                        method: suspect.method,
                        preview: suspect.display
                    });
                }
            }
        }

        if (Object.keys(potentialLeaks).length > 0) {
            await this.rpc.log('warn', 'SECURITY_ALERT: Invoking AI validation for potential secrets', {
                filesWithLeaks: Object.keys(potentialLeaks).length,
                totalSecrets: Object.values(potentialLeaks).flat().length
            });

            const securityPrompt = `Tu es un expert en cybersécurité. Analyse les extraits de code suivants pour détecter des secrets (clés API, mots de passe, tokens).
            
            CONTEXTE : L'utilisateur est en train de modifier le code source de l'outil 'Ghost CLI'.
            
            IMPORTANT :
            - Ne signale PAS les noms de modèles d'IA comme 'claude-3-5-sonnet', 'gemini-1.5-flash', 'llama-3.3-70b-versatile', etc. Ce ne sont PAS des secrets.
            - Ne signale PAS les noms de fichiers ou de classes (ex: 'ConfigManager', 'AIEngine').
            - Ne signale PAS les noms de fournisseurs (ex: 'anthropic', 'google', 'groq').
            - Ne signale QUE les chaînes qui ressemblent à des clés d'accès réelles (ex: gsk_..., sk-..., AKIA...) ou des secrets hautement probables.
            
            Réponds UNIQUEMENT au format JSON : {"is_breach": boolean, "reason": "string"}`;

            const leaksFormatted = {};
            for (const [fname, suspects] of Object.entries(potentialLeaks)) {
                leaksFormatted[fname] = suspects.map(s => ({
                    type: s.type,
                    severity: s.severity,
                    preview: s.display
                }));
            }

            const valPrompt = `${securityPrompt}\n\nSecrets potentiels : ${JSON.stringify(leaksFormatted)}`;
            
            const res = await this.callAI(provider, apiKey, model, "Tu es un expert en cybersécurité.", valPrompt, 0.3, true);
            const audit = JSON.parse(res);
            
            if (audit.is_breach) {
                await this.rpc.log('error', 'SECURITY_ALERT: Security breach confirmed by AI validation', { 
                    reason: audit.reason,
                    filesAffected: Object.keys(potentialLeaks),
                    details: audit 
                });
                return { blocked: true, reason: audit.reason };
            }
            await this.rpc.log('info', 'SECURITY_ALERT: False positives confirmed, allowing commit', {
                reason: audit.reason
            });
            return { blocked: false, reason: 'False positives confirmed' };
        }
        
        return { blocked: false, reason: 'No secrets detected' };
    }

    async performFullAudit(flags = {}) {
        await this.rpc.log('info', 'SECURITY_ALERT: Starting full security audit');
        
        const ignoredPatterns = await this.loadGhostIgnore();
        const isFileIgnored = (f) => ignoredPatterns.some(p => f.includes(p));

        const allFiles = await this.rpc.readDir(process.cwd(), { recursive: true });
        const filteredFiles = allFiles.filter(f => 
            !f.includes('node_modules') && 
            !f.includes('.git') &&
            !isFileIgnored(f)
        );
        
        await this.rpc.log('info', 'SECURITY_ALERT: Scanning files for secrets', {
            totalFiles: filteredFiles.length
        });
        
        let issues = 0;
        const findings = [];
        
        for (const file of filteredFiles) {
            try {
                const filePath = path.join(process.cwd(), file);
                const stat = await this.rpc.lstat(filePath);
                if (stat.isDirectory) continue;
                
                const content = await this.rpc.readFile(filePath);
                const suspects = await this.scanForSecrets(content);
                
                if (suspects.length > 0) {
                    findings.push({ file, suspects });
                    issues += suspects.length;
                    for (const suspect of suspects) {
                        await this.rpc.log('warn', 'SECURITY_ALERT: Secret found in repository file', {
                            file: file,
                            type: suspect.type,
                            severity: suspect.severity,
                            method: suspect.method,
                            preview: suspect.display
                        });
                    }
                }
            } catch (e) {
                // Ignore binary files or read errors
            }
        }
        
        await this.rpc.log('info', 'SECURITY_ALERT: Full audit complete', {
            totalIssues: issues,
            filesWithIssues: findings.length
        });
        
        return { issues, findings };
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

    semverDiffType(fromV, toV) {
        if (this.semverCompare(toV, fromV) <= 0) return 'none';
        if (toV.major !== fromV.major) return 'major';
        if (toV.minor !== fromV.minor) return 'minor';
        if (toV.patch !== fromV.patch) return 'patch';
        return 'none';
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

    async getRepoRoot() {
        const root = await this.rpc.gitExec(['rev-parse', '--show-toplevel'], true);
        return root || process.cwd();
    }

    async loadVersionConfig() {
        const repoRoot = await this.getRepoRoot();
        const configPath = path.resolve(repoRoot, '.ghost-versionrc');
        const defaults = {
            versionFiles: [{ type: 'package-json', path: 'package.json' }],
            tagPrefix: 'v',
            requireVersionBump: true,
            autoTagAfterBump: true,
            notifications: { webhookUrl: null }
        };
        
        const exists = await this.rpc.fileExists(configPath);
        if (!exists) return { ...defaults, _path: configPath };
        
        const raw = await this.rpc.readFile(configPath);
        const parsed = this.safeJsonParse(raw, {});
        return { ...defaults, ...parsed, _path: configPath };
    }

    safeJsonParse(text, fallback) {
        try {
            return JSON.parse(text);
        } catch {
            return fallback;
        }
    }

    readPackageJsonVersionFromText(text) {
        const parsed = this.safeJsonParse(text, null);
        const version = parsed && typeof parsed.version === 'string' ? parsed.version : null;
        return version ? this.semverParse(version) : null;
    }

    setPackageJsonVersionText(text, nextVersionStr) {
        const parsed = this.safeJsonParse(text, null);
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid package.json');
        parsed.version = nextVersionStr;
        return JSON.stringify(parsed, null, 2) + '\n';
    }

    readVersionFileVersion(sourceText, fileSpec) {
        if (fileSpec.type === 'package-json') return this.readPackageJsonVersionFromText(sourceText);
        throw new Error(`Unsupported version file type: ${fileSpec.type}`);
    }

    writeVersionFileText(sourceText, fileSpec, nextVersionStr) {
        if (fileSpec.type === 'package-json') return this.setPackageJsonVersionText(sourceText, nextVersionStr);
        throw new Error(`Unsupported version file type: ${fileSpec.type}`);
    }

    async getLastTag(tagPrefix) {
        const tag = await this.rpc.gitExec(['describe', '--tags', '--abbrev=0'], true);
        if (!tag) return null;
        if (tagPrefix && tag.startsWith(tagPrefix)) return tag;
        return tag;
    }

    async computeBumpFromCommitsSince(ref) {
        const range = ref ? `${ref}..HEAD` : 'HEAD';
        const raw = await this.rpc.gitExec(['log', range, '--pretty=%s%n%b%n----END----'], true);
        if (!raw) return null;
        const chunks = raw.split('----END----').map(s => s.trim()).filter(Boolean);
        let required = null;
        const rank = { patch: 1, minor: 2, major: 3 };
        for (const c of chunks) {
            const bump = this.conventionalRequiredBumpFromMessage(c);
            if (!bump) continue;
            if (!required || rank[bump] > rank[required]) required = bump;
            if (required === 'major') break;
        }
        return required;
    }

    async handleVersionBump(bumpType, flags = {}) {
        const versionConfig = await this.loadVersionConfig();
        const fileSpec = versionConfig.versionFiles[0];
        const repoRoot = await this.getRepoRoot();
        const relPath = path.resolve(repoRoot, fileSpec.path);
        
        const originalText = await this.rpc.readFile(relPath);
        const currentV = this.readVersionFileVersion(originalText, fileSpec);
        if (!currentV) throw new Error(`Unable to read version from ${fileSpec.path}`);

        let effectiveBump = bumpType;
        if (bumpType === 'auto') {
            const lastTag = await this.getLastTag(versionConfig.tagPrefix || 'v');
            effectiveBump = await this.computeBumpFromCommitsSince(lastTag) || 'patch';
        }

        const nextV = this.semverBump(currentV, effectiveBump);
        const nextStr = this.semverString(nextV);
        const nextText = this.writeVersionFileText(originalText, fileSpec, nextStr);

        if (flags.dryRun) {
            return { 
                dryRun: true, 
                currentVersion: this.semverString(currentV), 
                nextVersion: nextStr, 
                bump: effectiveBump 
            };
        }

        await this.rpc.writeFile(relPath, nextText);
        await this.rpc.gitExec(['add', fileSpec.path]);
        
        const tagName = `${versionConfig.tagPrefix || 'v'}${nextStr}`;
        const shouldTag = flags.tag || versionConfig.autoTagAfterBump;
        
        if (shouldTag) {
            await this.rpc.gitExec(['tag', '-a', tagName, '-m', `Release ${tagName}`]);
            if (flags.push) {
                await this.rpc.gitExec(['push', 'origin', tagName]);
            }
        }

        return { 
            success: true, 
            currentVersion: this.semverString(currentV), 
            nextVersion: nextStr, 
            bump: effectiveBump,
            tag: shouldTag ? tagName : null
        };
    }

    async handleVersionCheck() {
        const versionConfig = await this.loadVersionConfig();
        const fileSpec = versionConfig.versionFiles[0];
        const relPath = fileSpec.path;
        
        const headText = await this.rpc.gitExec(['show', `HEAD:${relPath}`], true);
        const indexText = await this.rpc.gitExec(['show', `:${relPath}`], true);
        const headV = headText ? this.readVersionFileVersion(headText, fileSpec) : null;
        const indexV = indexText ? this.readVersionFileVersion(indexText, fileSpec) : null;
        
        if (!headV || !indexV) throw new Error(`Unable to read ${relPath} from git`);
        const diff = this.semverDiffType(headV, indexV);
        
        return { 
            headVersion: this.semverString(headV), 
            indexVersion: this.semverString(indexV), 
            diff 
        };
    }

    async getConflictedFiles() {
        const raw = await this.rpc.gitExec(['diff', '--name-only', '--diff-filter=U'], true);
        if (!raw) return [];
        return raw.split('\n').map(s => s.trim()).filter(Boolean);
    }

    async handleMergeResolve(strategy, flags = {}) {
        const conflicts = await this.getConflictedFiles();
        if (!conflicts.length) {
            return { success: true, message: 'No conflicts detected' };
        }

        const resolved = [];
        const manual = [];

        for (const file of conflicts) {
            if (strategy === 'manual') {
                manual.push(file);
                continue;
            }

            if (strategy === 'ours') {
                await this.rpc.gitExec(['checkout', '--ours', '--', `"${file}"`], true);
                await this.rpc.gitExec(['add', `"${file}"`], true);
                resolved.push({ file, strategy: 'ours' });
            } else if (strategy === 'theirs') {
                await this.rpc.gitExec(['checkout', '--theirs', '--', `"${file}"`], true);
                await this.rpc.gitExec(['add', `"${file}"`], true);
                resolved.push({ file, strategy: 'theirs' });
            }
        }

        const remaining = await this.getConflictedFiles();
        
        return { 
            success: remaining.length === 0, 
            resolved, 
            manual, 
            remaining 
        };
    }

    async handleRPCRequest(request) {
        try {
            const { method, params = {} } = request;
            let result;

            switch (method) {
                case 'git.checkRepo':
                    result = await this.checkGitRepo();
                    break;
                    
                case 'git.getStagedDiff':
                    result = await this.getStagedDiff();
                    break;
                    
                case 'git.generateCommit':
                    result = await this.generateCommit(
                        params.diffText,
                        params.customPrompt,
                        params.provider,
                        params.apiKey,
                        params.model
                    );
                    break;
                    
                case 'git.auditSecurity':
                    result = await this.auditSecurity(
                        params.diffMap,
                        params.provider,
                        params.apiKey,
                        params.model,
                        params.flags
                    );
                    break;
                    
                case 'git.performFullAudit':
                    result = await this.performFullAudit(params.flags);
                    break;
                    
                case 'git.version.bump':
                    result = await this.handleVersionBump(params.bumpType, params.flags);
                    break;
                    
                case 'git.version.check':
                    result = await this.handleVersionCheck();
                    break;
                    
                case 'git.merge.getConflicts':
                    result = await this.getConflictedFiles();
                    break;
                    
                case 'git.merge.resolve':
                    result = await this.handleMergeResolve(params.strategy, params.flags);
                    break;
                    
                default:
                    throw new Error(`Unknown method: ${method}`);
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
}

function createExtension(coreHandler) {
    const rpcClient = new ExtensionRPCClient(coreHandler);
    const extension = new GitExtension(rpcClient);
    
    return {
        handleRequest: (request) => extension.handleRPCRequest(request),
        extension,
        rpcClient
    };
}

module.exports = {
    createExtension,
    ExtensionRPCClient,
    GitExtension
};

if (require.main === module) {
    console.log('Ghost Git Extension v1.0.0');
    console.log('This is a standalone extension for Ghost CLI.');
    console.log('It must be loaded by the Ghost core to function.');
}
