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
                // Simple regex to find local requires/imports
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
        this.DEFAULT_MODEL = "llama-3.3-70b-versatile";
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
        
        const stack = await this.analyzer.detectStack();
        const files = await this.analyzer.getFileTree();
        
        const context = {
            stack,
            fileCount: files.length,
            structure: files.slice(0, 20)
        };

        const prompt = `Tu es un rédacteur technique expert. Analyse ce projet et génère un README.md professionnel, complet et structuré.\n\nSTACK : ${JSON.stringify(stack)}\nSTRUCTURE : ${JSON.stringify(context.structure)}\n\nInclus : Description, Installation, Usage, et Architecture.\nRéponds UNIQUEMENT avec le contenu du fichier Markdown.`;

        try {
            const { provider, apiKey, model } = this._resolveAIConfig(flags);
            if (!provider || !apiKey) throw new Error('AI Provider not configured. Run ghost setup.');

            const readmeContent = await this.callAI(provider, apiKey, model, "Rédacteur technique expert", prompt);
            
            await this.sdk.requestFileWrite({ path: 'README.md', content: readmeContent });
            return { success: true, output: `${Colors.GREEN}✓ README.md generated successfully.${Colors.ENDC}` };
        } catch (error) {
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

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'docs.init': return await this.handleInit(params);
                case 'docs.diagram': return await this.handleDiagram(params);
                case 'docs.generate': return { success: true, output: 'API generation pending Phase 3.' };
                case 'docs.chat': return { success: true, output: 'Interactive chat pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { DocsExtension, ProjectAnalyzer };
