#!/usr/bin/env node

/**
 * 👻 Ghost CLI - Assistant Git Intelligent (Node.js Edition)
 * Zero-Dependency: Utilise uniquement les modules natifs Node.js
 * Compatible: Windows, Mac, Linux
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const readline = require('readline');
const os = require('os');

const http = require('http');

// ==============================================================================
// ⚙️ CONFIGURATION & CONSTANTES
// ==============================================================================
const CONFIG_FILE = path.join(os.homedir(), '.ghost');
const HISTORY_FILE = path.join(os.homedir(), '.ghost_history');
const LOG_FILE = path.join(os.homedir(), '.ghost_logs.json');
const SAFE_EXTENSIONS = new Set(['.md', '.txt', '.csv', '.html', '.css', '.scss', '.lock', '.xml', '.json']);
const SAFE_FILES = new Set(['mvnw', 'gradlew', 'package-lock.json', 'yarn.lock', 'pom.xml']);

// Modèles disponibles sur Groq (Basé sur votre plan gratuit)
// llama-3.3-70b-versatile : Intelligent, Idéal pour la sécurité (Limit: 1k RPD, 12k TPM)
// llama-3.1-8b-instant    : Rapide, Idéal si quota dépassé (Limit: 14.4k RPD, 6k TPM)
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// Couleurs ANSI pour un terminal plus beau
const Colors = {
    HEADER: '\x1b[95m',
    BLUE: '\x1b[94m',
    CYAN: '\x1b[96m',
    GREEN: '\x1b[92m',
    WARNING: '\x1b[93m',
    FAIL: '\x1b[91m',
    ENDC: '\x1b[0m',
    BOLD: '\x1b[1m',
    DIM: '\x1b[2m'
};

// ==============================================================================
// � MONITORING & LOGGING (Gemini-style Console)
// ==============================================================================
class GhostMonitor {
    constructor() {
        this.logs = [];
        this.metrics = {
            startTime: Date.now(),
            requests: 0,
            tokens: 0,
            errors: 0,
            latency: []
        };
        this.loadLogs();
    }

    log(level, message, meta = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            meta
        };
        this.logs.push(entry);
        this.saveLog(entry);
        
        // Alertes automatisées
        if (level === 'ERROR' || level === 'SECURITY_ALERT') {
            console.error(`${Colors.FAIL}[${level}] ${message}${Colors.ENDC}`);
        }
    }

    recordMetric(type, value) {
        if (type === 'latency') this.metrics.latency.push(value);
        if (type === 'request') this.metrics.requests++;
        if (type === 'error') this.metrics.errors++;
    }

    saveLog(entry) {
        try {
            fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
        } catch (e) { /* Ignore */ }
    }

    loadLogs() {
        if (fs.existsSync(LOG_FILE)) {
            try {
                const content = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-50);
                this.logs = content.map(line => JSON.parse(line));
            } catch (e) { this.logs = []; }
        }
    }

    startConsoleServer(port = 3000) {
        const server = http.createServer((req, res) => {
            // Parsing basique de l'URL
            const urlParts = req.url.split('?');
            const pathName = urlParts[0];

            if (pathName === '/' || pathName === '/index.html') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(this.getDashboardHTML());
            } else if (pathName === '/api/stats') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ logs: this.logs.slice(-20), metrics: this.metrics }));
            } else if (pathName === '/mcp') {
                 // MCP Endpoint simple (JSON-RPC over HTTP)
                 let body = '';
                 req.on('data', chunk => body += chunk);
                 req.on('end', () => {
                     try {
                         const request = JSON.parse(body);
                         const response = this.handleMCPRequest(request);
                         res.writeHead(200, { 'Content-Type': 'application/json' });
                         res.end(JSON.stringify(response));
                     } catch (e) {
                         res.writeHead(400);
                         res.end(JSON.stringify({ error: e.message }));
                     }
                 });
            } else if (pathName === '/favicon.ico') {
                res.writeHead(204);
                res.end();
            } else {
                console.log(`${Colors.DIM}[404] Request: ${req.url}${Colors.ENDC}`);
                res.writeHead(404);
                res.end('Not Found');
            }
        });

        server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                console.log(`${Colors.WARNING}⚠️  Le port ${port} est occupé.${Colors.ENDC}`);
                console.log(`${Colors.DIM}Tentative sur le port ${port + 1}...${Colors.ENDC}`);
                this.startConsoleServer(port + 1);
            } else {
                console.error(`${Colors.FAIL}❌ Erreur serveur : ${e.message}${Colors.ENDC}`);
            }
        });

        server.listen(port, () => {
            console.log(`\n${Colors.CYAN}🖥️  Ghost Console accessible sur http://localhost:${port}${Colors.ENDC}`);
            console.log(`${Colors.DIM}Protocole MCP activé sur /mcp${Colors.ENDC}`);
        });
    }

    handleMCPRequest(req) {
        // Implémentation basique du protocole MCP pour l'introspection
        if (req.method === 'initialize') {
            return {
                jsonrpc: "2.0",
                id: req.id,
                result: {
                    protocolVersion: "2024-11-05",
                    capabilities: { tools: {} },
                    serverInfo: { name: "ghost-cli", version: "0.3.1" }
                }
            };
        }
        if (req.method === 'tools/list') {
            return {
                jsonrpc: "2.0",
                id: req.id,
                result: {
                    tools: [
                        { name: "get_logs", description: "Récupère les derniers logs de Ghost" },
                        { name: "get_metrics", description: "Récupère les métriques de performance" }
                    ]
                }
            };
        }
        return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } };
    }

    getDashboardHTML() {
        const js = `
            setInterval(() => {
                fetch('/api/stats').then(r => r.json()).then(data => {
                    document.getElementById('req-count').innerText = data.metrics.requests;
                    document.getElementById('err-count').innerText = data.metrics.errors;
                    const logs = document.getElementById('logs');
                    logs.innerHTML = data.logs.reverse().map(l => 
                        '<div class="log-entry"><span class="log-time">' + l.timestamp.split('T')[1].split('.')[0] + '</span><span class="log-level ' + l.level + '">' + l.level + '</span><span>' + l.message + '</span></div>'
                    ).join('');
                });
            }, 2000);
        `;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ghost Console</title>
            <style>
                body { background: #1a1a1a; color: #e0e0e0; font-family: monospace; padding: 20px; }
                .card { background: #2d2d2d; padding: 15px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #404040; }
                h1 { color: #4af626; }
                h2 { border-bottom: 1px solid #404040; padding-bottom: 5px; }
                .log-entry { padding: 5px; border-bottom: 1px solid #333; display: flex; }
                .log-time { color: #888; margin-right: 10px; width: 180px; }
                .log-level { font-weight: bold; margin-right: 10px; width: 80px; }
                .INFO { color: #4af626; } .WARNING { color: #f1c40f; } .ERROR { color: #e74c3c; }
                .metric-box { display: inline-block; width: 150px; text-align: center; background: #333; padding: 10px; margin-right: 10px; border-radius: 5px; }
                .metric-val { font-size: 24px; font-weight: bold; color: #3498db; }
            </style>
            <script>${js}</script>
        </head>
        <body>
            <h1>👻 Ghost Console</h1>
            <div class="card">
                <h2>Métriques Temps Réel</h2>
                <div class="metric-box">Requêtes<div class="metric-val" id="req-count">0</div></div>
                <div class="metric-box">Erreurs<div class="metric-val" id="err-count">0</div></div>
            </div>
            <div class="card">
                <h2>Logs & Événements</h2>
                <div id="logs">Chargement...</div>
            </div>
        </body>
        </html>
        `;
    }
}

const monitor = new GhostMonitor();

// ==============================================================================
// � GESTIONNAIRE DE CONFIGURATION
// ==============================================================================
class ConfigManager {
    constructor() {
        this.config = {};
        this.load();
    }

    load() {
        if (fs.existsSync(CONFIG_FILE)) {
            try {
                this.config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            } catch (e) {
                this.config = {};
            }
        }
    }

    save() {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 4));
        console.log(`${Colors.DIM}Configuration sauvegardée dans ${CONFIG_FILE}${Colors.ENDC}`);
    }

    async getApiKey(provider = 'groq') {
        const keyMap = {
            groq: { env: 'GROQ_API_KEY', config: 'groq_api_key', label: 'Groq', url: 'https://console.groq.com', prefix: 'gsk_' },
            openai: { env: 'OPENAI_API_KEY', config: 'openai_api_key', label: 'OpenAI', url: 'https://platform.openai.com', prefix: 'sk-' },
            anthropic: { env: 'ANTHROPIC_API_KEY', config: 'anthropic_api_key', label: 'Anthropic', url: 'https://console.anthropic.com', prefix: 'sk-ant' },
            gemini: { env: 'GEMINI_API_KEY', config: 'gemini_api_key', label: 'Gemini', url: 'https://aistudio.google.com', prefix: '' }
        };

        const info = keyMap[provider] || keyMap.groq;
        let key = process.env[info.env] || this.config[info.config];

        if (!key) {
            console.log(`\n${Colors.WARNING}⚠️  Configuration manquante pour ${info.label}${Colors.ENDC}`);
            console.log(`${Colors.DIM}Pour utiliser Ghost avec ${info.label}, vous avez besoin d'une clé API.${Colors.ENDC}`);
            console.log(`${Colors.BLUE}👉 Obtenir une clé : ${info.url}${Colors.ENDC}\n`);
            
            key = await promptUser(`${Colors.BOLD}Collez votre clé ${info.label} : ${Colors.ENDC}`);
            
            if (key && key.trim()) {
                this.config[info.config] = key.trim();
                this.save();
            } else {
                console.log(`${Colors.FAIL}❌ Clé manquante. Abandon.${Colors.ENDC}`);
                process.exit(1);
            }
        }
        return key;
    }

    getModel() {
        if (!this.config.model) {
            this.config.model = DEFAULT_MODEL;
            this.save();
        }
        return this.config.model;
    }
}

// ==============================================================================
// 🧠 MOTEUR IA (Client HTTPS Natif)
// ==============================================================================
class AIEngine {
    constructor(apiKey, model, provider = 'groq') {
        this.apiKey = apiKey;
        this.model = model || DEFAULT_MODEL;
        this.provider = provider;
        
        // Configuration des providers
        this.providers = {
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
                path: "/v1beta/models/" // Modèle injecté dynamiquement
            }
        };
    }

    async call(systemPrompt, userPrompt, temperature = 0.3, jsonMode = false) {
        monitor.log('INFO', `Appel IA via ${this.provider}`, { model: this.model });
        monitor.recordMetric('request', 1);
        const startTime = Date.now();

        try {
            const config = this.providers[this.provider] || this.providers.groq;
            
            if (this.provider === 'anthropic') {
                return await this.callAnthropic(config, systemPrompt, userPrompt, temperature);
            } else if (this.provider === 'gemini') {
                return await this.callGemini(config, systemPrompt, userPrompt, temperature);
            }

            const payload = {
                model: this.model,
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
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Node.js/GhostCLI)'
                }
            };

            const result = await this.makeRequest(options, payload);
            monitor.recordMetric('latency', Date.now() - startTime);
            return result;
        } catch (e) {
            monitor.log('ERROR', `Erreur Appel IA: ${e.message}`);
            monitor.recordMetric('error', 1);
            throw e;
        }
    }

    async callAnthropic(config, systemPrompt, userPrompt, temperature) {
        const payload = {
            model: this.model.includes('claude') ? this.model : "claude-3-5-sonnet-20240620",
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
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Node.js/GhostCLI)'
            }
        };

        const response = await this.makeRequest(options, payload);
        try {
            const data = JSON.parse(response);
            return data.content[0].text;
        } catch (e) {
            return response; // Déjà parsé si makeRequest renvoie direct content
        }
    }

    async callGemini(config, systemPrompt, userPrompt, temperature) {
        const modelName = this.model.includes('gemini') ? this.model : "gemini-1.5-flash";
        const path = `${config.path}${modelName}:generateContent?key=${this.apiKey}`;
        
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

        const response = await this.makeRequest(options, payload);
        try {
            const data = JSON.parse(response);
            return data.candidates[0].content.parts[0].text;
        } catch (e) {
            return response;
        }
    }

    async makeRequest(options, payload) {
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 400) {
                        try {
                            const errBody = JSON.parse(data);
                            reject(new Error(`API Error ${res.statusCode} (${this.provider}): ${errBody.error?.message || errBody.error || data}`));
                        } catch (e) {
                            reject(new Error(`API Error ${res.statusCode} (${this.provider}): ${data}`));
                        }
                    } else {
                        try {
                            // On renvoie la string brute pour que les méthodes spécifiques puissent parser
                            // sauf pour OpenAI/Groq où on extrait direct pour compatibilité descendante
                            if (this.provider === 'groq' || this.provider === 'openai') {
                                const result = JSON.parse(data);
                                resolve(result.choices[0].message.content);
                            } else {
                                resolve(data);
                            }
                        } catch (e) {
                            reject(e);
                        }
                    }
                });
            });

            req.on('error', (e) => reject(e));
            req.write(JSON.stringify(payload));
            req.end();
        });
    }
}

// ==============================================================================
// 🛠️ UTILS & ARG PARSER
// ==============================================================================
function saveToHistory(commitMsg) {
    try {
        const entry = `[${new Date().toISOString()}] ${commitMsg}\n`;
        fs.appendFileSync(HISTORY_FILE, entry);
    } catch (e) {
        // Ignorer les erreurs d'écriture de l'historique
    }
}

function showHistory(limit = 10) {
    if (!fs.existsSync(HISTORY_FILE)) {
        console.log(`${Colors.DIM}L'historique est vide.${Colors.ENDC}`);
        return;
    }
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').trim().split('\n');
    console.log(`\n${Colors.BOLD}${Colors.CYAN}📜 HISTORIQUE DES COMMITS (Derniers ${limit})${Colors.ENDC}`);
    lines.slice(-limit).reverse().forEach(line => {
        const [date, ...msg] = line.split(' ');
        console.log(`  ${Colors.DIM}${date}${Colors.ENDC} ${msg.join(' ')}`);
    });
    console.log("");
}

function parseArgs() {
    const args = process.argv.slice(2);
    const flags = {
        model: null,
        provider: null,
        noSecurity: false,
        dryRun: false,
        help: false,
        history: false,
        console: false
    };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--model' && args[i + 1]) {
            flags.model = args[i + 1];
            i++;
        } else if (args[i] === '--provider' && args[i + 1]) {
            flags.provider = args[i + 1];
            i++;
        } else if (args[i] === '--no-security') {
            flags.noSecurity = true;
        } else if (args[i] === '--dry-run') {
            flags.dryRun = true;
        } else if (args[i] === '--help' || args[i] === '-h') {
            flags.help = true;
        } else if (args[i] === '--history') {
            flags.history = true;
        } else if (args[i] === '--console') {
            flags.console = true;
        }
    }
    return flags;
}

function showHelp() {
    console.log(`
${Colors.BOLD}${Colors.CYAN}GHOST CLI v0.3.1${Colors.ENDC}
Assistant Git Intelligent multi-LLM (Groq, OpenAI, Anthropic, Gemini)

${Colors.BOLD}USAGE:${Colors.ENDC}
  ghost [options]

${Colors.BOLD}OPTIONS:${Colors.ENDC}
  --model <name>     Modèle spécifique (ex: claude-3-5-sonnet-20240620, gemini-1.5-pro)
  --provider <name>  Fournisseur : groq (défaut), openai, anthropic, gemini
  --history          Afficher l'historique des commits générés
  --console          Démarrer la console de monitoring & MCP (http://localhost:3000)
  --no-security      Désactiver l'audit de sécurité
  --dry-run          Générer le message sans effectuer le commit
  --help, -h         Afficher cette aide

${Colors.BOLD}CONFIGURATION LOCALE (.ghostrc):${Colors.ENDC}
  { "prompt": "...", "provider": "anthropic", "model": "..." }
    `);
}

// ==============================================================================
// 🛡️ SCANNER DE SECURITE
// ==============================================================================
const GENERIC_API_KEY_REGEX = new RegExp(
    "(?:key|api|token|secret|auth)[_-]?(?:key|api|token|secret|auth)?\\s*[:=]\\s*[\"'](?!claude|gemini|llama|gpt|text-)([a-zA-Z0-9]{16,})[\"']",
    "i"
);

const SECRET_REGEXES = [
    { name: 'Generic API Key', regex: GENERIC_API_KEY_REGEX },
    { name: 'Groq API Key', regex: /gsk_[a-zA-Z0-9]{48}/g },
    { name: 'GitHub Token', regex: /gh[pous]_[a-zA-Z0-9]{36}/g },
    { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g },
    { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
    { name: 'Private Key', regex: /-----BEGIN (RSA|EC|PGP|OPENSSH) PRIVATE KEY-----/g }
];

function calculateShannonEntropy(data) {
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

const GHOSTIGNORE_FILE = path.join(process.cwd(), '.ghostignore');

function loadGhostIgnore() {
    if (!fs.existsSync(GHOSTIGNORE_FILE)) return [];
    try {
        return fs.readFileSync(GHOSTIGNORE_FILE, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    } catch (e) {
        return [];
    }
}

function scanForSecrets(content) {
    if (!content) return [];
    const suspicious = [];
    
    const ignoredPatterns = loadGhostIgnore();
    const isIgnored = (str) => ignoredPatterns.some(pattern => str.includes(pattern));

    // 1. Recherche via Regex ciblées
    for (const { name, regex } of SECRET_REGEXES) {
        const matches = content.match(regex);
        if (matches) {
            matches.forEach(m => {
                if (m.length > 8 && !isIgnored(m)) {
                    suspicious.push(`${m.substring(0, 15)}... (${name})`);
                }
            });
        }
    }

    // 2. Recherche via Entropie (pour les secrets non-standard)
    const regex = /(['"])(.*?)(\1)|=\s*([^\s]+)/g;
    let match;

    const KNOWN_NON_SECRETS = [
        'claude-3-5-sonnet', 'gemini-1.5-flash', 'llama-3.3-70b', 
        'anthropic', 'openai', 'google', 'groq',
        'ConfigManager', 'AIEngine', 'DEFAULT_MODEL',
        'getDashboardHTML', 'GhostMonitor', 'startConsoleServer'
    ];

    while ((match = regex.exec(content)) !== null) {
        const candidate = match[2] || match[4];
        
        // Filtres heuristiques de base
        if (!candidate || candidate.length < 12 || candidate.includes(' ')) continue;

        // Ignorer si c'est un nom de modèle ou de classe connu, ou dans .ghostignore
        if (KNOWN_NON_SECRETS.some(ns => candidate.includes(ns)) || isIgnored(candidate)) continue;
        
        // Analyse mathématique (Entropie > 4.8 est souvent un secret)
        if (calculateShannonEntropy(candidate) > 4.8) {
            const display = candidate.substring(0, 15) + "...";
            if (!suspicious.some(s => s.startsWith(display))) {
                suspicious.push(`${display} (High Entropy)`);
            }
        }
    }
    return suspicious;
}

// ==============================================================================
// 📂 GIT INTERFACE
// ==============================================================================
function gitExec(args, suppressError = false) {
    try {
        return execSync(`git ${args.join(' ')}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (e) {
        if (!suppressError && e.stderr) {
            // On ignore les erreurs mineures
        }
        return "";
    }
}

function checkGitRepo() {
    try {
        execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

function getStagedDiff() {
    const filesOutput = gitExec(['diff', '--cached', '--name-only']);
    if (!filesOutput) return { text: "", map: {}, files: [] };

    const files = filesOutput.split('\n');
    let fullDiff = "";
    const fileMap = {};
    const validFiles = [];

    for (let f of files) {
        f = f.trim().replace(/^"|"$/g, '');
        if (!f) continue;

        const content = gitExec(['diff', '--cached', `"${f}"`]);
        if (content) {
            fullDiff += `\n--- ${f} ---\n${content}\n`;
            fileMap[f] = content;
            validFiles.push(f);
        }
    }

    return { text: fullDiff, map: fileMap, files: validFiles };
}

function promptUser(question) {
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

// ==============================================================================
// 🚀 MAIN LOOP
// ==============================================================================
async function main() {
    const flags = parseArgs();

    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (flags.console) {
        monitor.startConsoleServer(3000);
        // On ne quitte pas le processus, on le laisse tourner
        return;
    }

    if (flags.history) {
        showHistory();
        process.exit(0);
    }

    console.clear();
    console.log(`\n${Colors.BOLD}${Colors.CYAN} 👻 GHOST CLI ${Colors.ENDC}${Colors.DIM} v0.3.1${Colors.ENDC}`);
    console.log(`${Colors.DIM} ─────────────────────────────────────${Colors.ENDC}\n`);

    // 0. Chargement de la configuration locale .ghostrc
    const localConfigPath = path.join(process.cwd(), '.ghostrc');
    let customPrompt = null;
    if (fs.existsSync(localConfigPath)) {
        try {
            const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
            if (localConfig.prompt) customPrompt = localConfig.prompt;
            console.log(`${Colors.DIM}📝 Configuration locale .ghostrc chargée${Colors.ENDC}`);
        } catch (e) {
            console.log(`${Colors.WARNING}⚠️  Erreur lecture .ghostrc: ${e.message}${Colors.ENDC}`);
        }
    }

    // 1. Vérification Git
    if (!checkGitRepo()) {
        console.log(`${Colors.FAIL}❌ Erreur : Ce dossier n'est pas un dépôt Git.${Colors.ENDC}`);
        console.log(`💡 Solution : Lancez ${Colors.BOLD}git init${Colors.ENDC} d'abord.`);
        process.exit(1);
    }

    const config = new ConfigManager();
    const apiKey = await config.getApiKey();
    const model = flags.model || config.getModel();
    const provider = flags.provider || config.config.provider || 'groq';
    const ai = new AIEngine(apiKey, model, provider);

    // 2. Récupération du Diff
    const { text: fullDiffText, map: diffMap, files: fileList } = getStagedDiff();

    if (!fullDiffText) {
        console.log(`${Colors.WARNING}⚠️  Rien à commiter.${Colors.ENDC}`);
        console.log(`💡 Astuce : Utilisez ${Colors.BOLD}git add <fichier>${Colors.ENDC} pour préparer vos changements.\n`);
        process.exit(0);
    }

    // Affichage des fichiers détectés
    console.log(`${Colors.BOLD}📂 Fichiers détectés (${fileList.length}) :${Colors.ENDC}`);
    fileList.forEach((f, idx) => console.log(`   ${Colors.DIM}${idx + 1}. ${f}${Colors.ENDC}`));
    console.log("");

    let selectedFiles = fileList;
    let finalDiffText = fullDiffText;
    let finalDiffMap = diffMap;

    if (fileList.length > 1) {
        const selection = await promptUser(`${Colors.BOLD}Sélectionnez les fichiers (ex: 1,3,5 ou 'all' [par défaut]) : ${Colors.ENDC}`);
        if (selection && selection.toLowerCase() !== 'all' && selection.trim() !== '') {
            const indices = selection.split(',').map(s => parseInt(s.trim()) - 1).filter(idx => idx >= 0 && idx < fileList.length);
            if (indices.length > 0) {
                selectedFiles = indices.map(idx => fileList[idx]);
                finalDiffMap = {};
                finalDiffText = "";
                selectedFiles.forEach(f => {
                    finalDiffMap[f] = diffMap[f];
                    finalDiffText += `\n--- ${f} ---\n${diffMap[f]}\n`;
                });
                console.log(`${Colors.GREEN}✅ ${selectedFiles.length} fichier(s) sélectionné(s).${Colors.ENDC}\n`);
            }
        }
    }

    // 3. Audit de Sécurité
    if (!flags.noSecurity) {
        process.stdout.write(`${Colors.BLUE}🛡️  [1/2] Audit de Sécurité... ${Colors.ENDC}`);
        
        const potentialLeaks = {};
        for (const [fname, content] of Object.entries(finalDiffMap)) {
            const suspects = scanForSecrets(content);
            if (suspects.length > 0) potentialLeaks[fname] = suspects;
        }

        if (Object.keys(potentialLeaks).length > 0) {
            console.log(`\n${Colors.WARNING}⚠️  Entropie élevée ou patterns suspects détectés ! Analyse approfondie par l'IA...${Colors.ENDC}`);
            const securityPrompt = `Tu es un expert en cybersécurité. Analyse les extraits de code suivants pour détecter des secrets (clés API, mots de passe, tokens).
            
            CONTEXTE : L'utilisateur est en train de modifier le code source de l'outil 'Ghost CLI'.
            
            IMPORTANT :
            - Ne signale PAS les noms de modèles d'IA comme 'claude-3-5-sonnet', 'gemini-1.5-flash', 'llama-3.3-70b-versatile', etc. Ce ne sont PAS des secrets.
            - Ne signale PAS les noms de fichiers ou de classes (ex: 'ConfigManager', 'AIEngine').
            - Ne signale PAS les noms de fournisseurs (ex: 'anthropic', 'google', 'groq').
            - Ne signale QUE les chaînes qui ressemblent à des clés d'accès réelles (ex: gsk_..., sk-..., AKIA...) ou des secrets hautement probables.
            
            Réponds UNIQUEMENT au format JSON : {"is_breach": boolean, "reason": "string"}`;


            const valPrompt = `${securityPrompt}\n\nSecrets potentiels : ${JSON.stringify(potentialLeaks)}`;
            
            try {
                const res = await ai.call("Tu es un expert en cybersécurité.", valPrompt, 0.3, true);
                const audit = JSON.parse(res);
                
                if (audit.is_breach) {
                    monitor.log('SECURITY_ALERT', `Secret détecté : ${audit.reason}`, { details: audit });
                    console.log(`\n${Colors.FAIL}❌ [BLOCAGE SÉCURITÉ] Secret détecté !${Colors.ENDC}`);
                    console.log(`${Colors.FAIL}   Raison : ${audit.reason}${Colors.ENDC}\n`);
                    process.exit(1);
                } else {
                    console.log(`${Colors.GREEN}✅ Faux positifs confirmés (Sûr).${Colors.ENDC}`);
                }
            } catch (e) {
                console.log(`${Colors.FAIL}Erreur audit IA: ${e.message}${Colors.ENDC}`);
            }
        } else {
            console.log(`${Colors.GREEN}OK (Code sain)${Colors.ENDC}`);
        }
    } else {
        console.log(`${Colors.WARNING}⏩ Audit de sécurité ignoré (--no-security)${Colors.ENDC}`);
    }

    // 4. Génération
    const tokensEstimates = Math.ceil(finalDiffText.length / 4);
    console.log(`${Colors.BLUE}⚡ [2/2] Génération du message... ${Colors.DIM}(~${tokensEstimates} tokens)${Colors.ENDC}`);
    console.log(`${Colors.DIM}   Modèle utilisé : ${model} (${provider})${Colors.ENDC}`);
    
    const sysPrompt = customPrompt || "Tu es un assistant Git expert. Génère UNIQUEMENT un message de commit suivant la convention 'Conventional Commits' (ex: feat: add login). Sois concis, descriptif et professionnel. N'utilise pas de markdown (pas de backticks), pas de guillemets autour du message.";
    
    try {
        let commitMsg = await ai.call(sysPrompt, `Diff :\n${finalDiffText.substring(0, 12000)}`);
        commitMsg = commitMsg.trim().replace(/^['"`]|['"`]$/g, ''); // Nettoyage final

        console.log(`\n${Colors.CYAN}──────────────────────────────────────────────────${Colors.ENDC}`);
        console.log(`${Colors.BOLD}${commitMsg}${Colors.ENDC}`);
        console.log(`${Colors.CYAN}──────────────────────────────────────────────────${Colors.ENDC}\n`);

        if (flags.dryRun) {
            console.log(`${Colors.WARNING}✨ Mode --dry-run : Aucun commit effectué.${Colors.ENDC}\n`);
            process.exit(0);
        }

        const action = await promptUser(`${Colors.BOLD}[Enter]${Colors.ENDC} Valider  |  ${Colors.BOLD}[n]${Colors.ENDC} Annuler : `);

        if (action.toLowerCase() === 'n') {
        console.log(`\n${Colors.WARNING}🚫 Opération annulée.${Colors.ENDC}\n`);
    } else {
        try {
            execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
            saveToHistory(commitMsg);
            console.log(`\n${Colors.GREEN}✅ Commit effectué avec succès !${Colors.ENDC}\n`);
        } catch (e) {
            // L'erreur est déjà affichée par git via stdio: inherit
        }
    }
    } catch (e) {
        console.log(`\n${Colors.FAIL}❌ Erreur fatale : ${e.message}${Colors.ENDC}\n`);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
