#!/usr/bin/env node

/**
 * Ghost Documentation Bot
 * AI-powered documentation engine
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

/**
 * Logic to analyze project structure and stack
 */
class ProjectAnalyzer {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async detectStack() {
        const stack = {
            languages: [],
            frameworks: [],
            tooling: []
        };

        const rootFiles = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: '.' } });
        
        if (rootFiles.includes('package.json')) stack.languages.push('JavaScript/Node.js');
        if (rootFiles.includes('requirements.txt') || rootFiles.includes('pyproject.toml')) stack.languages.push('Python');
        if (rootFiles.includes('go.mod')) stack.languages.push('Go');
        if (rootFiles.includes('Cargo.toml')) stack.languages.push('Rust');
        
        return stack;
    }

    async getFileTree(dir = '.', depth = 2) {
        const tree = [];
        const ignoreDirs = ['node_modules', '.git', 'dist', '.migration-backup', 'assets'];
        
        const walk = async (currentDir, currentDepth) => {
            if (currentDepth > depth) return;
            try {
                const entries = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: currentDir } });
                for (const entry of entries) {
                    if (ignoreDirs.includes(entry)) continue;
                    const fullPath = path.join(currentDir, entry);
                    tree.push(fullPath);
                    
                    try {
                        const stats = await this.sdk.emitIntent({ type: 'filesystem', operation: 'stat', params: { path: fullPath } });
                        if (stats.isDirectory) await walk(fullPath, currentDepth + 1);
                    } catch (e) {}
                }
            } catch (e) {}
        };

        await walk(dir, 0);
        return tree;
    }

    async mapDependencies() {
        const files = await this.getFileTree('.', 1);
        const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.ts'));
        const deps = [];

        for (const file of jsFiles) {
            try {
                const content = await this.sdk.requestFileRead({ path: file });
                const requireRegex = /require\(['"](\.\.?\/.*?)['"]\)/g;
                const importRegex = /from\s+['"](\.\.?\/.*?)['"]/g;
                
                let match;
                while ((match = requireRegex.exec(content)) !== null) {
                    deps.push({ from: file, to: match[1] });
                }
                while ((match = importRegex.exec(content)) !== null) {
                    deps.push({ from: file, to: match[1] });
                }
            } catch (e) {}
        }
        return deps;
    }

    generateMermaidGraph(deps) {
        let graph = "graph TD\n";
        for (const dep of deps) {
            const from = dep.from.replace(/\\/g, '/');
            const to = dep.to.replace(/\\/g, '/');
            graph += `    ${from} --> ${to}\n`;
        }
        return graph;
    }
}

class DocsExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.analyzer = new ProjectAnalyzer(sdk);
        this.DEFAULT_MODELS = {
            groq: "llama-3.3-70b-versatile",
            anthropic: "claude-3-5-sonnet-latest",
            openai: "gpt-4o",
            gemini: "gemini-1.5-pro"
        };
        this.AI_PROVIDERS = {
            groq: { hostname: "api.groq.com", path: "/openai/v1/chat/completions" },
            openai: { hostname: "api.openai.com", path: "/v1/chat/completions" },
            anthropic: { hostname: "api.anthropic.com", path: "/v1/messages" },
            gemini: { hostname: "generativelanguage.googleapis.com", path: "/v1beta/models/" }
        };
    }

    async handleInit(params) {
        const flags = params.flags || {};
        await this.sdk.requestLog({ level: 'info', message: 'Analyzing project for README generation...' });
        
        try {
            const stack = await this.analyzer.detectStack();
            const files = await this.analyzer.getFileTree();
            
            const context = {
                stack,
                fileCount: files.length,
                structure: files.slice(0, 20)
            };

            const prompt = `Tu es un rédacteur technique expert. Analyse ce projet et génère un README.md professionnel, complet et structuré.\n\nSTACK : ${JSON.stringify(stack)}\nSTRUCTURE : ${JSON.stringify(context.structure)}\n\nInclus : Description, Installation, Usage, et Architecture.`;

            const { provider, apiKey, model } = await this._resolveAIConfig(flags);
            if (!provider || !apiKey) throw new Error('AI Provider not configured. Run ghost setup.');

            const readmeContent = await this.callAI(provider, apiKey, model, "Rédacteur technique expert", prompt);
            
            await this.sdk.requestFileWrite({ path: 'README.md', content: readmeContent });
            return { success: true, output: `${Colors.GREEN}✓ README.md generated successfully.${Colors.ENDC}` };
        } catch (error) {
            console.error(`${Colors.FAIL}[Docs Bot Error]${Colors.ENDC} ${error.message}`);
            return { success: false, output: `Initialization failed: ${error.message}` };
        }
    }

    async handleDiagram(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Mapping dependencies and generating architecture diagram...' });
        
        try {
            const deps = await this.analyzer.mapDependencies();
            const mermaid = this.analyzer.generateMermaidGraph(deps);
            
            const report = `# Architectural Diagram\n\nGenerated by Ghost Documentation Bot\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`;
            await this.sdk.requestFileWrite({ path: 'docs/ARCHITECTURE.md', content: report });
            
            return { 
                success: true, 
                output: `${Colors.GREEN}✓ Architecture diagram generated at docs/ARCHITECTURE.md${Colors.ENDC}`,
                graph: mermaid 
            };
        } catch (error) {
            return { success: false, output: `Diagram generation failed: ${error.message}` };
        }
    }

    async handleGenerate(params) {
        const target = params.args?.[0];
        if (!target) return { success: false, output: "Please specify a file to generate documentation for." };

        await this.sdk.requestLog({ level: 'info', message: `Generating technical API docs for: ${target}` });

        try {
            const content = await this.sdk.requestFileRead({ path: target });
            const prompt = `Analyse ce code source et génère une documentation technique détaillée au format Markdown (JSDoc, types, fonctions, responsabilités).\n\nCODE :\n${content}`;

            const { provider, apiKey, model } = await this._resolveAIConfig(params.flags || {});
            const docs = await this.callAI(provider, apiKey, model, "Expert en documentation technique", prompt);

            const docPath = `docs/API-${path.basename(target, path.extname(target))}.md`;
            await this.sdk.requestFileWrite({ path: docPath, content: docs });

            return { success: true, output: `${Colors.GREEN}✓ API documentation generated at ${docPath}${Colors.ENDC}` };
        } catch (error) {
            return { success: false, output: `Generation failed: ${error.message}` };
        }
    }

    async handleChat(params) {
        const flags = params.flags || {};
        const { provider, apiKey, model } = await this._resolveAIConfig(flags);
        
        if (!provider || !apiKey) return { success: false, output: "AI Provider not configured." };

        let conversation = "Tu es un assistant expert sur ce projet. Réponds aux questions de l'utilisateur en utilisant le contexte du code.";
        
        const question = await this.sdk.emitIntent({ type: 'ui', operation: 'prompt', params: { question: "Sur quel aspect du code avez-vous une question ?" } });
        
        if (!question) return { success: true, output: "Chat session ended." };

        const files = await this.analyzer.getFileTree();
        const analysisPrompt = `Question de l'utilisateur : "${question}"\n\nStructure du projet : ${JSON.stringify(files.slice(0, 30))}\n\nRéponds de manière concise et technique.`;

        try {
            const answer = await this.callAI(provider, apiKey, model, conversation, analysisPrompt);
            return { success: true, output: `\n${Colors.BOLD}ASSISTANT:${Colors.ENDC}\n${answer}\n` };
        } catch (error) {
            return { success: false, output: `Chat failed: ${error.message}` };
        }
    }

    async _resolveAIConfig(flags) {
        let provider = flags.provider;
        let apiKey = flags.apiKey || flags['api-key'];
        let model = flags.model;

        if (!provider || !apiKey) {
            try {
                const config = await this.sdk.requestConfig();
                if (config && config.ai) {
                    provider = provider || config.ai.provider;
                    apiKey = apiKey || config.ai.apiKey;
                    model = model || config.ai.model;
                }
            } catch (e) {
                // Ignore config read errors
            }
        }

        return { provider, apiKey, model };
    }

    async callAI(provider, apiKey, model, systemPrompt, userPrompt) {
        const actualModel = model || this.DEFAULT_MODELS[provider] || this.DEFAULT_MODELS.groq;
        const config = this.AI_PROVIDERS[provider] || this.AI_PROVIDERS.groq;
        const isAnthropic = provider === 'anthropic';
        
        let headers = { 'Content-Type': 'application/json' };
        let payload = {
            model: actualModel,
            temperature: 0.2
        };

        if (isAnthropic) {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
            payload.system = systemPrompt;
            payload.messages = [{ role: "user", content: userPrompt }];
            payload.max_tokens = 4096;
        } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
            payload.messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ];
        }

        const response = await this.sdk.requestNetworkCall({
            url: `https://${config.hostname}${config.path}`,
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        let data;
        try {
            data = JSON.parse(response);
        } catch (e) {
            throw new Error(`Invalid JSON response from AI provider: ${response.substring(0, 100)}...`);
        }
        
        if (isAnthropic) {
            if (data.error) {
                const detailedError = `Anthropic API Error [${data.error.type}]: ${data.error.message}`;
                throw new Error(detailedError);
            }
            return data.content?.[0]?.text || JSON.stringify(data);
        } else {
            if (data.error) {
                throw new Error(data.error.message || 'AI API error');
            }
            return data.choices?.[0]?.message?.content || JSON.stringify(data);
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'docs.init': return await this.handleInit(params);
                case 'docs.diagram': return await this.handleDiagram(params);
                case 'docs.generate': return await this.handleGenerate(params);
                case 'docs.chat': return await this.handleChat(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { DocsExtension, ProjectAnalyzer };
