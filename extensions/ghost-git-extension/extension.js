#!/usr/bin/env node

/**
 * Ghost Git Extension
 * Standalone extension providing Git operations with AI-powered features
 * Uses JSON-RPC to communicate with Ghost core for all I/O operations
 */

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

class ExtensionRPCClient {
    constructor(coreHandler) {
        this.coreHandler = coreHandler || this.defaultHandler;
        this.requestId = 0;
    }

    defaultHandler(method, params) {
        throw new Error(`No core handler registered for RPC call: ${method}`);
    }

    _sanitizeParams(params) {
        if (!params) return params;
        const sanitized = JSON.parse(JSON.stringify(params)); // Deep copy

        const maskSecret = (val) => {
            if (typeof val !== 'string') return val;
            if (val.length < 12) return val;
            return val.substring(0, 8) + '...' + val.substring(val.length - 4);
        };

        // Sanitize network intent parameters
        if (sanitized.url && typeof sanitized.url === 'string') {
            // Mask API keys in URL (e.g., ?key=...)
            sanitized.url = sanitized.url.replace(/(key=)([a-zA-Z0-9_\-]+)/g, (m, p1, p2) => p1 + maskSecret(p2));
        }

        if (sanitized.headers && typeof sanitized.headers === 'object') {
            const sensitiveHeaders = ['x-api-key', 'authorization', 'api-key', 'token'];
            for (const key of Object.keys(sanitized.headers)) {
                if (sensitiveHeaders.includes(key.toLowerCase())) {
                    sanitized.headers[key] = maskSecret(sanitized.headers[key]);
                }
            }
        }

        if (sanitized.body && typeof sanitized.body === 'string') {
            // Mask common secret patterns in the body (JSON)
            try {
                let bodyObj = JSON.parse(sanitized.body);
                const maskInObj = (obj) => {
                    const sensitiveKeys = ['apiKey', 'api_key', 'token', 'secret', 'password', 'key'];
                    for (const k of Object.keys(obj)) {
                        if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk))) {
                            obj[k] = maskSecret(obj[k]);
                        } else if (typeof obj[k] === 'object' && obj[k] !== null) {
                            maskInObj(obj[k]);
                        }
                    }
                };
                maskInObj(bodyObj);
                sanitized.body = JSON.stringify(bodyObj);
            } catch (e) {
                // If not JSON, use regex for common patterns
                sanitized.body = sanitized.body.replace(/(sk-ant-[a-zA-Z0-9\-]{40,})/g, m => maskSecret(m));
                sanitized.body = sanitized.body.replace(/(gsk_[a-zA-Z0-9]{40,})/g, m => maskSecret(m));
            }
        }

        return sanitized;
    }

    async call(method, params = {}) {
        const id = ++this.requestId;
        
        // Check if this is a standard capability call that should be wrapped as an intent
        const capabilityMethods = ['filesystem', 'network', 'git', 'process', 'ui', 'log'];
        let request;
        
        if (capabilityMethods.includes(method)) {
            request = {
                jsonrpc: "2.0",
                id,
                method: 'intent',
                params: {
                    type: method,
                    operation: params.operation,
                    params: this._sanitizeParams(params.params || params)
                }
            };
        } else {
            request = {
                jsonrpc: "2.0",
                id,
                method,
                params: this._sanitizeParams(params)
            };
        }

        const response = await this.coreHandler(request);
        
        if (response.error) {
            let errorMsg = `RPC Error (${response.error.code}): ${response.error.message}`;
            if (response.error.data && response.error.data.violations) {
                errorMsg += '\\nViolations:\\n' + JSON.stringify(response.error.data.violations, null, 2);
            }
            throw new Error(errorMsg);
        }
        
        return response.result;
    }

    async readFile(path, options = {}) {
        const result = await this.call('filesystem', { operation: 'read', params: { path, ...options } });
        let content = result && result.content !== undefined ? result.content : result;
        if (content && typeof content === 'object' && content.type === 'Buffer') {
            content = Buffer.from(content.data).toString(options.encoding || 'utf8');
        } else if (typeof content !== 'string') {
            content = String(content);
        }
        return content;
    }

    async readDir(path, options = {}) {
        return await this.call('filesystem', { operation: 'readdir', params: { path, ...options } });
    }

    async writeFile(path, content, options = {}) {
        const result = await this.call('filesystem', { operation: 'write', params: { path, content, ...options } });
        return result && result.path !== undefined ? result.path : result;
    }

    async gitExec(args) {
        if (!args || args.length === 0) {
            throw new Error('gitExec requires at least one argument');
        }
        const result = await this.call('git', { operation: 'exec', params: { args: args } });
        return result && result.stdout !== undefined ? result.stdout : result;
    }

    async log(level, message, meta = {}) {
        console.log("[" + level.toUpperCase() + "] " + message, Object.keys(meta).length ? meta : "");
        return { success: true };
    }

    async promptUser(question) {
        console.log("[PROMPT] " + question);
        return "";
    }

    async emitIntent(type, operation, params) {
        return await this.call(type, { operation, params });
    }

    async requestFileRead(path, encoding = 'utf8') {
        const result = await this.emitIntent('filesystem', 'read', { path, encoding });
        let content = result && result.content !== undefined ? result.content : result;
        if (content && typeof content === 'object' && content.type === 'Buffer') {
            content = Buffer.from(content.data).toString(encoding || 'utf8');
        } else if (typeof content !== 'string') {
            content = String(content);
        }
        return content;
    }

    async requestFileWrite(path, content, encoding = 'utf8') {
        return await this.emitIntent('filesystem', 'write', { path, content, encoding });
    }

    async requestFileAppend(path, content, encoding = 'utf8') {
        return await this.emitIntent('filesystem', 'append', { path, content, encoding });
    }

    async requestFileExists(path) {
        try {
            await this.emitIntent('filesystem', 'stat', { path });
            return true;
        } catch (error) {
            return false;
        }
    }

    async requestFileReadDir(path, options = {}) {
        return await this.emitIntent('filesystem', 'readdir', { path, ...options });
    }

    async requestFileStat(path) {
        return await this.emitIntent('filesystem', 'stat', { path });
    }

    async requestGitExec(args, suppressError = false) {
        const result = await this.emitIntent('git', 'exec', { args, suppressError });
        return result && result.stdout !== undefined ? result.stdout : result;
    }

    async requestNetworkCall(options, payload) {
        const url = `https://${options.hostname}${options.path}`;
        const params = {
            url,
            method: options.method || 'GET',
            headers: options.headers || {},
            body: payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : undefined
        };
        const result = await this.emitIntent('network', 'https', params);
        return result && result.body !== undefined ? result.body : result;
    }

    async requestExecSync(command, options = {}) {
        return await this.emitIntent('process', 'exec', { command, options });
    }

    async requestPromptUser(question) {
        return await this.emitIntent('ui', 'prompt', { question });
    }

    async requestLog(level, message, meta = {}) {
        console.log("[" + level.toUpperCase() + "] " + message, Object.keys(meta).length ? meta : "");
        return { success: true };
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
        const actualModel = model || this.DEFAULT_MODEL;
        try {
            await this.rpc.log('info', `Initiating AI call`, { 
                provider, 
                model: actualModel, 
                temperature, 
                jsonMode,
                promptLength: userPrompt.length 
            });

            const config = this.AI_PROVIDERS[provider] || this.AI_PROVIDERS.groq;
            
            let result;
            if (provider === 'anthropic') {
                result = await this.callAnthropic(config, apiKey, actualModel, systemPrompt, userPrompt, temperature);
            } else if (provider === 'gemini') {
                result = await this.callGemini(config, apiKey, actualModel, systemPrompt, userPrompt, temperature);
            } else {
                const payload = {
                    model: actualModel,
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
                
                if (data.error) {
                    throw new Error(`${provider.toUpperCase()} API Error: ${data.error.message || JSON.stringify(data.error)}`);
                }

                if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                    throw new Error(`Unexpected ${provider.toUpperCase()} API response: ${JSON.stringify(data)}`);
                }

                result = data.choices[0].message.content;
            }

            return result;
        } catch (error) {
            await this.rpc.log('error', `AI Call failed: ${error.message}`);
            
            // Re-throw with more helpful guidance
            throw new Error(
                `AI API Error: ${error.message}\n\n` +
                `${Colors.CYAN}💡 Pro-tip:${Colors.ENDC} If this is an authentication or configuration issue,\n` +
                `please run ${Colors.BOLD}ghost setup${Colors.ENDC} to reconfigure your AI provider and API keys.\n`
            );
        }
    }

    async callAnthropic(config, apiKey, model, systemPrompt, userPrompt, temperature) {
        const actualModel = (model && model.includes('claude')) ? model : "claude-3-5-sonnet-20240620";
        
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

        if (data.error) {
            throw new Error(`Anthropic API Error: ${data.error.message || JSON.stringify(data.error)}`);
        }

        if (!data.content || !data.content[0] || !data.content[0].text) {
            throw new Error(`Unexpected Anthropic API response: ${JSON.stringify(data)}`);
        }
        
        return data.content[0].text;
    }

    async callGemini(config, apiKey, model, systemPrompt, userPrompt, temperature) {
        const modelName = (model && model.includes('gemini')) ? model : "gemini-1.5-flash";
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
        
        // Strip secrets from diff before sending to AI to avoid security blocks
        let cleanedDiff = diffText;
        const suspects = await this.scanForSecrets(diffText);
        if (suspects.length > 0) {
            await this.rpc.log('info', `Stripping ${suspects.length} detected secrets from diff before AI call`);
            for (const s of suspects) {
                cleanedDiff = cleanedDiff.split(s.value).join('[SECRET_MASKED]');
            }
        }

        const sysPrompt = customPrompt || "Tu es un assistant Git expert. Génère UNIQUEMENT un message de commit suivant la convention 'Conventional Commits' (ex: feat: add login). Sois concis, descriptif et professionnel. N'utilise pas de markdown (pas de backticks), pas de guillemets autour du message.";
        
        const truncatedDiff = cleanedDiff.substring(0, 12000);
        
        await this.rpc.log('debug', `Preparing diff for AI analysis`, { 
            originalLength: cleanedDiff.length,
            truncatedLength: truncatedDiff.length,
            truncated: cleanedDiff.length > 12000
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
        const cleanedDiffMap = {};

        for (const [fname, content] of Object.entries(diffMap)) {
            const suspects = await this.scanForSecrets(content);
            const filtered = suspects.filter(s => !isIgnored(s));
            
            // Create a cleaned version of the content for AI validation
            let cleanedContent = content;
            if (suspects.length > 0) {
                for (const s of suspects) {
                    cleanedContent = cleanedContent.split(s.value).join(`[POTENTIAL_SECRET_TYPE_${s.type.replace(/\s+/g, '_')}]`);
                }
            }
            cleanedDiffMap[fname] = cleanedContent;

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
            - Ne signale QUE les chaînes qui ressemblent à des clés d'accès réelles ou des secrets hautement probables.
            - Les secrets ont été masqués par des tags comme [POTENTIAL_SECRET_TYPE_...]. Évalue si la présence d'un secret à cet endroit est une violation.
            
            Réponds UNIQUEMENT au format JSON : {"is_breach": boolean, "reason": "string"}`;

            const leaksFormatted = {};
            for (const [fname, suspects] of Object.entries(potentialLeaks)) {
                leaksFormatted[fname] = suspects.map(s => ({
                    type: s.type,
                    severity: s.severity,
                    preview: s.display,
                    context: cleanedDiffMap[fname].substring(0, 500) // Provide some cleaned context
                }));
            }

            const valPrompt = `${securityPrompt}\n\nSecrets potentiels (avec contextes nettoyés) : ${JSON.stringify(leaksFormatted)}`;
            
            try {
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
            } catch (error) {
                await this.rpc.log('error', `AI Security Validation failed: ${error.message}`);
                return { 
                    blocked: true, 
                    reason: `AI Security Validation failed: ${error.message}` 
                };
            }
        }
        
        return { blocked: false, reason: 'No secrets detected' };
    }






    async audit(params = {}) {
        const result = await this.performFullAudit(params.flags || {});
        let output = "";

        if (result.issues === 0) {
            output = "\n" + Colors.GREEN + Colors.BOLD + "✓ Aucun secret détecté." + Colors.ENDC + " Votre dépôt semble propre.\n";
        } else {
            output = "\n" + Colors.FAIL + Colors.BOLD + "✗ " + result.issues + " problème(s) détecté(s) !" + Colors.ENDC + "\n\n";
            result.findings.forEach(finding => {
                output += Colors.BOLD + finding.file + Colors.ENDC + "\n";
                finding.suspects.forEach(s => {
                    const severityColor = s.severity === "critical" ? Colors.FAIL : Colors.WARNING;
                    output += "  " + severityColor + "●" + Colors.ENDC + " " + s.type + " " + Colors.DIM + "(" + s.method + ")" + Colors.ENDC + "\n";
                    output += "    " + Colors.DIM + s.display + Colors.ENDC + "\n";
                });
                output += "\n";
            });

            if (params.flags && params.flags.force) {
                output += Colors.WARNING + "Warning: Audit failed but continuing due to --force" + Colors.ENDC + "\n";
            }
        }

        return { 
            success: result.issues === 0,
            issues: result.issues, 
            findings: result.findings,
            output 
        };
    }

    async performFullAudit(flags = {}) {
        await this.rpc.log('info', 'SECURITY_ALERT: Starting full security audit');
        
        const ignoredPatterns = await this.loadGhostIgnore();
        const isFileIgnored = (f) => ignoredPatterns.some(p => {
            if (p.startsWith('*') && p.endsWith('*')) {
                return f.includes(p.slice(1, -1));
            } else if (p.startsWith('*')) {
                return f.endsWith(p.slice(1));
            } else if (p.endsWith('*')) {
                return f.startsWith(p.slice(0, -1)) || f.includes('/' + p.slice(0, -1));
            }
            return f.includes(p);
        });

        const readDirResult = await this.rpc.readDir(process.cwd(), { recursive: true });
        const allFiles = (readDirResult.entries || [])
            .filter(e => e.isFile)
            .map(e => {
                const ePath = e.path || e.parentPath || process.cwd();
                const relDir = require('path').relative(process.cwd(), ePath);
                return relDir ? require('path').join(relDir, e.name).split(require('path').sep).join('/') : e.name;
            });

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
                // console.log("SCANNED " + file + ", SUSPECTS: " + suspects.length + ", CONTENT PREVIEW: " + (content.substring ? content.substring(0, 50) : 'not string'));
                
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
                // Log errors to see what's failing during file processing
                console.log("Error processing file " + file + ": " + e.message);
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
        return (root || process.cwd()).trim();
    }

    async installVersionHooks(flags = {}) {
        await this.rpc.log('info', 'Installing version hooks');

        const repoRoot = await this.getRepoRoot();
        const hookPath = path.join(repoRoot, '.git', 'hooks', 'commit-msg');

        const hookContent = [
            '#!/bin/sh',
            '# Ghost version hook - installed by ghost version install-hooks',
            'MSG=$(cat "$1")',
            '',
            '# Determine required bump (Conventional Commits)',
            'REQUIRED_BUMP=""',
            'if echo "$MSG" | grep -qE "BREAKING[[:space:]]CHANGE|^[a-zA-Z]+(\\([^)]*\\))?!:"; then',
            '    REQUIRED_BUMP="major"',
            'elif echo "$MSG" | grep -qE "^feat(\\([^)]*\\))?:"; then',
            '    REQUIRED_BUMP="minor"',
            'elif echo "$MSG" | grep -qE "^fix(\\([^)]*\\))?:|^perf(\\([^)]*\\))?:"; then',
            '    REQUIRED_BUMP="patch"',
            'fi',
            '',
            'if [ -z "$REQUIRED_BUMP" ]; then',
            '    exit 0',
            'fi',
            '',
            '# Check if version was bumped (package.json staged with version change)',
            'if git diff --cached -- package.json | grep -q \'"version"\'; then',
            '    exit 0',
            'fi',
            '',
            'echo ""',
            'echo "Error: Commit requires a $REQUIRED_BUMP version bump."',
            'echo "Run: ghost version bump --bump $REQUIRED_BUMP"',
            'exit 1'
        ].join('\n');

        await this.rpc.writeFile(hookPath, hookContent);
        await this.rpc.log('info', 'Version commit-msg hook installed', { hookPath });
        return { success: true, message: 'Version hooks installed successfully' };
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
        
        await this.rpc.log('debug', 'Loading version configuration', { configPath });
        
        const exists = await this.rpc.fileExists(configPath);
        if (!exists) {
            await this.rpc.log('debug', 'No .ghost-versionrc found, using defaults', { configPath });
            return { ...defaults, _path: configPath };
        }
        
        const raw = await this.rpc.readFile(configPath);
        const parsed = this.safeJsonParse(raw, {});
        await this.rpc.log('debug', 'Version configuration loaded', { 
            configPath,
            versionFiles: parsed.versionFiles || defaults.versionFiles,
            tagPrefix: parsed.tagPrefix || defaults.tagPrefix
        });
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
        await this.rpc.log('debug', 'Fetching last git tag', { tagPrefix });
        
        const tag = await this.rpc.gitExec(['describe', '--tags', '--abbrev=0'], true);
        if (!tag) {
            await this.rpc.log('debug', 'No tags found in repository');
            return null;
        }
        
        await this.rpc.log('debug', 'Last tag retrieved', { tag, tagPrefix });
        
        if (tagPrefix && tag.startsWith(tagPrefix)) return tag;
        return tag;
    }

    async computeBumpFromCommitsSince(ref) {
        const range = ref ? `${ref}..HEAD` : 'HEAD';
        
        await this.rpc.log('debug', 'Analyzing commits for version bump', { range });
        
        const raw = await this.rpc.gitExec(['log', range, '--pretty=%s%n%b%n----END----'], true);
        if (!raw) {
            await this.rpc.log('debug', 'No commits found in range', { range });
            return null;
        }
        
        const chunks = raw.split('----END----').map(s => s.trim()).filter(Boolean);
        await this.rpc.log('debug', 'Parsed commit messages', { commitCount: chunks.length });
        
        let required = null;
        const rank = { patch: 1, minor: 2, major: 3 };
        const bumpCounts = { major: 0, minor: 0, patch: 0 };
        
        for (const c of chunks) {
            const bump = this.conventionalRequiredBumpFromMessage(c);
            if (!bump) continue;
            
            bumpCounts[bump]++;
            
            if (!required || rank[bump] > rank[required]) {
                required = bump;
                await this.rpc.log('debug', 'Bump level increased', { 
                    newLevel: bump,
                    commitPreview: c.substring(0, 60)
                });
            }
            if (required === 'major') break;
        }
        
        await this.rpc.log('info', 'Commit analysis complete', {
            totalCommits: chunks.length,
            requiredBump: required,
            majorCommits: bumpCounts.major,
            minorCommits: bumpCounts.minor,
            patchCommits: bumpCounts.patch
        });
        
        return required;
    }

    async handleVersionBump(bumpType, flags = {}) {
        await this.rpc.log('info', 'Starting version bump', { bumpType, flags });
        
        const versionConfig = await this.loadVersionConfig();
        const fileSpec = versionConfig.versionFiles[0];
        const repoRoot = await this.getRepoRoot();
        const relPath = path.resolve(repoRoot, fileSpec.path);
        
        await this.rpc.log('debug', 'Reading version file', { 
            path: relPath,
            fileType: fileSpec.type
        });
        
        const originalText = await this.rpc.readFile(relPath);
        const currentV = this.readVersionFileVersion(originalText, fileSpec);
        if (!currentV) {
            await this.rpc.log('error', 'Failed to read version from file', { path: fileSpec.path });
            throw new Error(`Unable to read version from ${fileSpec.path}`);
        }

        let effectiveBump = bumpType;
        if (bumpType === 'auto') {
            const lastTag = await this.getLastTag(versionConfig.tagPrefix || 'v');
            await this.rpc.log('debug', 'Computing automatic bump from commits', { lastTag });
            effectiveBump = await this.computeBumpFromCommitsSince(lastTag) || 'patch';
            await this.rpc.log('info', 'Automatic bump determined', { 
                effectiveBump,
                lastTag,
                source: 'conventional-commits'
            });
        }

        const nextV = this.semverBump(currentV, effectiveBump);
        const nextStr = this.semverString(nextV);
        const currentStr = this.semverString(currentV);
        
        await this.rpc.log('info', 'Version bump calculated', {
            currentVersion: currentStr,
            nextVersion: nextStr,
            bumpType: effectiveBump
        });
        
        const nextText = this.writeVersionFileText(originalText, fileSpec, nextStr);

        if (flags.dryRun) {
            await this.rpc.log('info', 'Dry run complete, no changes written', {
                currentVersion: currentStr,
                nextVersion: nextStr,
                bump: effectiveBump
            });
            return { 
                dryRun: true, 
                currentVersion: currentStr, 
                nextVersion: nextStr, 
                bump: effectiveBump 
            };
        }

        await this.rpc.log('debug', 'Writing updated version file', { 
            path: relPath,
            newVersion: nextStr
        });
        await this.rpc.writeFile(relPath, nextText);
        
        await this.rpc.log('debug', 'Staging version file', { path: fileSpec.path });
        await this.rpc.gitExec(['add', fileSpec.path]);
        
        const tagName = `${versionConfig.tagPrefix || 'v'}${nextStr}`;
        const shouldTag = flags.tag || versionConfig.autoTagAfterBump;
        
        if (shouldTag) {
            await this.rpc.log('info', 'Creating version tag', { tagName });
            await this.rpc.gitExec(['tag', '-a', tagName, '-m', `Release ${tagName}`]);
            
            if (flags.push) {
                await this.rpc.log('info', 'Pushing tag to remote', { tagName });
                await this.rpc.gitExec(['push', 'origin', tagName]);
            }
        }

        await this.rpc.log('info', 'Version bump completed successfully', {
            currentVersion: currentStr,
            nextVersion: nextStr,
            bump: effectiveBump,
            tag: shouldTag ? tagName : null,
            pushed: flags.push || false
        });

        return { 
            success: true, 
            currentVersion: currentStr, 
            nextVersion: nextStr, 
            bump: effectiveBump,
            tag: shouldTag ? tagName : null
        };
    }

    async handleVersionCheck() {
        await this.rpc.log('info', 'Starting version check');
        
        const versionConfig = await this.loadVersionConfig();
        const fileSpec = versionConfig.versionFiles[0];
        const relPath = fileSpec.path;
        
        await this.rpc.log('debug', 'Reading version from HEAD and index', { path: relPath });
        
        const headText = await this.rpc.gitExec(['show', `HEAD:${relPath}`], true);
        const indexText = await this.rpc.gitExec(['show', `:${relPath}`], true);
        const headV = headText ? this.readVersionFileVersion(headText, fileSpec) : null;
        const indexV = indexText ? this.readVersionFileVersion(indexText, fileSpec) : null;
        
        if (!headV || !indexV) {
            await this.rpc.log('error', 'Failed to read version from git', { 
                path: relPath,
                hasHeadVersion: !!headV,
                hasIndexVersion: !!indexV
            });
            throw new Error(`Unable to read ${relPath} from git`);
        }
        
        const diff = this.semverDiffType(headV, indexV);
        const headVersionStr = this.semverString(headV);
        const indexVersionStr = this.semverString(indexV);
        
        await this.rpc.log('info', 'Version check completed', {
            headVersion: headVersionStr,
            indexVersion: indexVersionStr,
            diff,
            hasChange: diff !== 'none'
        });
        
        return { 
            headVersion: headVersionStr, 
            indexVersion: indexVersionStr, 
            diff 
        };
    }

    async getConflictedFiles() {
        await this.rpc.log('debug', 'MERGE_RESOLUTION: Detecting conflicted files');
        
        const raw = await this.rpc.gitExec(['diff', '--name-only', '--diff-filter=U'], true);
        if (!raw) {
            await this.rpc.log('info', 'MERGE_RESOLUTION: No conflicts detected');
            return [];
        }
        
        const conflicts = raw.split('\n').map(s => s.trim()).filter(Boolean);
        
        await this.rpc.log('info', 'MERGE_RESOLUTION: Conflicts detected', {
            conflictCount: conflicts.length,
            files: conflicts
        });
        
        return conflicts;
    }

    async handleMergeResolve(strategy, flags = {}) {
        await this.rpc.log('info', 'MERGE_RESOLUTION: Starting merge resolution', {
            strategy,
            flags
        });
        
        const conflicts = await this.getConflictedFiles();
        if (!conflicts.length) {
            await this.rpc.log('info', 'MERGE_RESOLUTION: No conflicts to resolve');
            return { success: true, message: 'No conflicts detected' };
        }

        await this.rpc.log('info', 'MERGE_RESOLUTION: Processing conflicts', {
            totalConflicts: conflicts.length,
            strategy
        });

        const resolved = [];
        const manual = [];

        for (const file of conflicts) {
            if (strategy === 'manual') {
                await this.rpc.log('debug', 'MERGE_RESOLUTION: Marking file for manual resolution', {
                    file
                });
                manual.push(file);
                continue;
            }

            try {
                if (strategy === 'ours') {
                    await this.rpc.log('debug', 'MERGE_RESOLUTION: Applying "ours" strategy', {
                        file
                    });
                    await this.rpc.gitExec(['checkout', '--ours', '--', file], true);
                    await this.rpc.gitExec(['add', file], true);
                    resolved.push({ file, strategy: 'ours' });
                    await this.rpc.log('info', 'MERGE_RESOLUTION: File resolved with "ours" strategy', {
                        file
                    });
                } else if (strategy === 'theirs') {
                    await this.rpc.log('debug', 'MERGE_RESOLUTION: Applying "theirs" strategy', {
                        file
                    });
                    await this.rpc.gitExec(['checkout', '--theirs', '--', file], true);
                    await this.rpc.gitExec(['add', file], true);
                    resolved.push({ file, strategy: 'theirs' });
                    await this.rpc.log('info', 'MERGE_RESOLUTION: File resolved with "theirs" strategy', {
                        file
                    });
                }
            } catch (error) {
                await this.rpc.log('error', 'MERGE_RESOLUTION: Failed to resolve file', {
                    file,
                    strategy,
                    error: error.message
                });
                manual.push(file);
            }
        }

        const remaining = await this.getConflictedFiles();
        
        const result = { 
            success: remaining.length === 0, 
            resolved, 
            manual, 
            remaining 
        };

        await this.rpc.log('info', 'MERGE_RESOLUTION: Merge resolution completed', {
            totalProcessed: conflicts.length,
            resolvedCount: resolved.length,
            manualCount: manual.length,
            remainingCount: remaining.length,
            success: result.success
        });
        
        return result;
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
                    
                case 'audit':
                case 'git.performFullAudit':
                    result = await this.audit(params);
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
