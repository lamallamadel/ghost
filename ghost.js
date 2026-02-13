#!/usr/bin/env node

/**
 * 👻 Ghost CLI - Assistant Git Intelligent (Node.js Edition)
 * Zero-Dependency: Utilise uniquement les modules natifs Node.js
 * Compatible: Windows, Mac, Linux
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, execFileSync } = require('child_process');
const readline = require('readline');
const os = require('os');

const http = require('http');

// ==============================================================================
// ⚙️ CONFIGURATION & CONSTANTES
// ==============================================================================
const CONFIG_FILE = path.join(os.homedir(), '.ghost');
const HISTORY_FILE = path.join(os.homedir(), '.ghost_history');
const LOG_FILE = path.join(os.homedir(), '.ghost_logs.json');
const LABELS_FILE = path.join(os.homedir(), '.ghost_labels.json');
const STATS_FILE = path.join(os.homedir(), '.ghost_stats.json');
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
// 📚 HISTORY & LABELS MANAGERS
// ==============================================================================
class HistoryManager {
    constructor() {
        this.cache = [];
        this.load();
    }

    load() {
        if (!fs.existsSync(HISTORY_FILE)) {
            this.cache = [];
            return;
        }
        try {
            const raw = fs.readFileSync(HISTORY_FILE, 'utf8').trim().split('\n');
            this.cache = raw.map((line, id) => {
                // Format: [ISO_DATE] Message
                const match = line.match(/^\[(.*?)\] (.*)$/);
                if (match) {
                    return { id: id + 1, timestamp: match[1], content: match[2], favorite: false, labels: [] };
                }
                return null;
            }).filter(item => item !== null);
        } catch (e) {
            console.error("Erreur lecture historique:", e);
            this.cache = [];
        }
    }

    get(query = '', limit = 100) {
        let results = this.cache;
        if (query) {
            const lowerQ = query.toLowerCase();
            results = results.filter(h => h.content.toLowerCase().includes(lowerQ));
        }
        return results.slice(-limit).reverse();
    }
}

class LabelManager {
    constructor() {
        this.labels = [];
        this.load();
    }

    load() {
        if (fs.existsSync(LABELS_FILE)) {
            try {
                this.labels = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf8'));
            } catch (e) { this.labels = []; }
        } else {
            // Labels par défaut
            this.labels = [
                { id: 1, name: 'Feat', color: '#2ecc71' },
                { id: 2, name: 'Fix', color: '#e74c3c' },
                { id: 3, name: 'Docs', color: '#3498db' },
                { id: 4, name: 'Refactor', color: '#f1c40f' }
            ];
            this.save();
        }
    }

    save() {
        fs.writeFileSync(LABELS_FILE, JSON.stringify(this.labels, null, 2));
    }

    getAll() { return this.labels; }
    
    add(label) {
        label.id = Date.now();
        this.labels.push(label);
        this.save();
        return label;
    }
    
    delete(id) {
        this.labels = this.labels.filter(l => l.id !== id);
        this.save();
    }
}

// ==============================================================================
// 📊 MONITORING & LOGGING (Gemini-style Console)
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
                res.end(JSON.stringify({ logs: this.logs.slice(-50), metrics: this.metrics }));
            } else if (pathName === '/api/history') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(historyMgr.get()));
            } else if (pathName === '/api/labels') {
                if (req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', () => {
                        try {
                            const label = JSON.parse(body);
                            labelMgr.add(label);
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true }));
                        } catch(e) { res.writeHead(400); res.end(); }
                    });
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(labelMgr.getAll()));
                }
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
        // SPA légère sans dépendances
        return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ghost Console</title>
    <style>
        :root { --bg: #1a1a1a; --card: #2d2d2d; --text: #e0e0e0; --accent: #4af626; --danger: #e74c3c; --border: #404040; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; height: 100vh; overflow: hidden; }
        
        /* Sidebar */
        .sidebar { width: 250px; background: #222; border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 20px; }
        .logo { font-size: 24px; font-weight: bold; color: var(--accent); margin-bottom: 30px; display: flex; align-items: center; gap: 10px; }
        .nav-item { padding: 12px 15px; margin-bottom: 5px; cursor: pointer; border-radius: 6px; transition: 0.2s; display: flex; align-items: center; gap: 10px; }
        .nav-item:hover, .nav-item.active { background: #333; color: white; }
        .nav-item.active { border-left: 3px solid var(--accent); }

        /* Main Content */
        .main { flex: 1; padding: 30px; overflow-y: auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .title { font-size: 28px; font-weight: 600; }
        
        /* Dashboard Cards */
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid var(--border); }
        .metric-label { color: #888; font-size: 14px; margin-bottom: 5px; }
        .metric-value { font-size: 32px; font-weight: bold; color: var(--accent); }
        
        /* Tables & Lists */
        .table-container { background: var(--card); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 15px; text-align: left; border-bottom: 1px solid #333; }
        th { background: #252525; color: #aaa; font-weight: 500; }
        tr:hover { background: #333; }
        
        /* Badges */
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .badge.INFO { background: rgba(74, 246, 38, 0.15); color: #4af626; }
        .badge.ERROR { background: rgba(231, 76, 60, 0.15); color: #e74c3c; }
        
        /* Utility */
        .btn { padding: 8px 16px; background: var(--accent); color: black; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
        .btn:hover { opacity: 0.9; }
        .hidden { display: none; }
        
        /* Chart placeholder */
        .chart-bar { height: 8px; background: #333; border-radius: 4px; margin-top: 10px; overflow: hidden; }
        .chart-fill { height: 100%; background: var(--accent); width: 0%; transition: 1s ease; }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="logo">👻 Ghost Console</div>
        <div class="nav-item active" onclick="showTab('dashboard')">📊 Dashboard</div>
        <div class="nav-item" onclick="showTab('history')">📜 Historique</div>
        <div class="nav-item" onclick="showTab('labels')">🏷️ Labels</div>
        <div class="nav-item" onclick="showTab('settings')">⚙️ Paramètres</div>
    </div>

    <div class="main" id="app">
        <!-- Views will be injected here -->
    </div>

    <script>
        // State
        const state = {
            view: 'dashboard',
            metrics: {},
            logs: [],
            history: [],
            labels: []
        };

        // API Client
        const api = {
            getStats: () => fetch('/api/stats').then(r => r.json()),
            getHistory: () => fetch('/api/history').then(r => r.json()),
            getLabels: () => fetch('/api/labels').then(r => r.json()),
            addLabel: (l) => fetch('/api/labels', { method: 'POST', body: JSON.stringify(l) })
        };

        // Views
        const views = {
            dashboard: () => \`
                <div class="header"><div class="title">Dashboard Temps Réel</div><button class="btn" onclick="refresh()">Actualiser</button></div>
                <div class="grid">
                    <div class="card">
                        <div class="metric-label">Requêtes Totales</div>
                        <div class="metric-value">\${state.metrics.requests || 0}</div>
                        <div class="chart-bar"><div class="chart-fill" style="width: 70%"></div></div>
                    </div>
                    <div class="card">
                        <div class="metric-label">Erreurs</div>
                        <div class="metric-value" style="color: var(--danger)">\${state.metrics.errors || 0}</div>
                    </div>
                    <div class="card">
                        <div class="metric-label">Latence Moyenne</div>
                        <div class="metric-value">120ms</div>
                    </div>
                </div>
                
                <div class="table-container">
                    <table>
                        <thead><tr><th>Heure</th><th>Niveau</th><th>Message</th></tr></thead>
                        <tbody>
                            \${state.logs.map(l => {
                                const time = l.timestamp.split('T')[1].split('.')[0];
                                return \`<tr>
                                    <td style="color:#888">\${time}</td>
                                    <td><span class="badge \${l.level}">\${l.level}</span></td>
                                    <td>\${l.message}</td>
                                </tr>\`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            \`,
            history: () => \`
                <div class="header"><div class="title">Historique des Commits</div></div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>Date</th><th>Message</th><th>Actions</th></tr></thead>
                        <tbody>
                            \${state.history.map(h => {
                                const date = h.timestamp.split('T')[0];
                                return \`<tr>
                                    <td style="color:#888">\${date}</td>
                                    <td>\${h.content}</td>
                                    <td><button class="btn" style="padding:4px 8px;font-size:12px">Copier</button></td>
                                </tr>\`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            \`,
            labels: () => \`
                <div class="header"><div class="title">Gestion des Labels</div><button class="btn" onclick="addLabel()">+ Nouveau</button></div>
                <div class="grid">
                    \${state.labels.map(l => \`
                        <div class="card" style="border-left: 4px solid \${l.color}">
                            <div style="font-weight:bold; font-size:18px">\${l.name}</div>
                            <div style="color:#888;margin-top:5px">ID: \${l.id}</div>
                        </div>
                    \`).join('')}
                </div>
            \`,
            settings: () => \`
                <div class="header"><div class="title">Paramètres</div></div>
                <div class="card">
                    <h3>Apparence</h3>
                    <p style="margin:10px 0;color:#888">Thème sombre activé par défaut.</p>
                </div>
            \`
        };

        // Controller
        async function loadData() {
            const [stats, hist, lbls] = await Promise.all([
                api.getStats(),
                api.getHistory(),
                api.getLabels()
            ]);
            state.metrics = stats.metrics;
            state.logs = stats.logs.reverse();
            state.history = hist;
            state.labels = lbls;
            render();
        }

        function render() {
            document.getElementById('app').innerHTML = views[state.view]();
            
            // Update sidebar active state
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.remove('active');
                if (el.innerText.toLowerCase().includes(state.view)) el.classList.add('active');
            });
        }

        function showTab(view) {
            state.view = view;
            render();
        }

        function refresh() {
            loadData();
        }

        function addLabel() {
            const name = prompt("Nom du label :");
            if (name) {
                api.addLabel({ name, color: '#3498db' }).then(loadData);
            }
        }

        // Init
        loadData();
        setInterval(loadData, 5000); // Auto-refresh
    </script>
</body>
</html>`;
    }
}

const monitor = new GhostMonitor();
const historyMgr = new HistoryManager();
const labelMgr = new LabelManager();

// ==============================================================================
// 🔧 GESTIONNAIRE DE CONFIGURATION
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
        command: null,
        subcommand: null,
        model: null,
        provider: null,
        noSecurity: false,
        dryRun: false,
        help: false,
        history: false,
        console: false,
        audit: false,
        verbose: false,
        force: false,
        yes: false,
        tag: false,
        push: false,
        bump: null,
        fromCommits: false,
        output: null,
        ci: false,
        strategy: null
    };

    const command = args[0];
    if (command === 'audit') {
        flags.command = 'audit';
        flags.audit = true;
    } else if (command === 'console') {
        flags.command = 'console';
        flags.console = true;
    } else if (command === 'version') {
        flags.command = 'version';
        flags.subcommand = args[1] || null;
    } else if (command === 'merge') {
        flags.command = 'merge';
        flags.subcommand = args[1] || null;
    }

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
        } else if (args[i] === '--yes' || args[i] === '-y') {
            flags.yes = true;
        } else if (args[i] === '--verbose') {
            flags.verbose = true;
        } else if (args[i] === '--force') {
            flags.force = true;
        } else if (args[i] === '--tag') {
            flags.tag = true;
        } else if (args[i] === '--push') {
            flags.push = true;
        } else if (args[i] === '--from-commits') {
            flags.fromCommits = true;
        } else if (args[i] === '--bump' && args[i + 1]) {
            flags.bump = args[i + 1];
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            flags.output = args[i + 1];
            i++;
        } else if (args[i] === '--ci') {
            flags.ci = true;
        } else if (args[i] === '--strategy' && args[i + 1]) {
            flags.strategy = args[i + 1];
            i++;
        }
    }
    return flags;
}

function showHelp() {
    console.log(`
${Colors.BOLD}${Colors.CYAN}GHOST CLI v0.3.2${Colors.ENDC}
Assistant Git Intelligent multi-LLM (Groq, OpenAI, Anthropic, Gemini)

${Colors.BOLD}USAGE:${Colors.ENDC}
  ghost [command] [options]

${Colors.BOLD}COMMANDES:${Colors.ENDC}
  audit              Lancer un audit de sécurité complet du projet
  console            Démarrer la console web de monitoring (localhost)
  version            Gestion de version (bump/check/tag/hooks)
  merge              Aide à la résolution de conflits
  (défaut)           Lancer l'assistant de commit

${Colors.BOLD}OPTIONS:${Colors.ENDC}
  --model <name>     Modèle spécifique (ex: claude-3-5-sonnet-20240620, gemini-1.5-pro)
  --provider <name>  Fournisseur : groq (défaut), openai, anthropic, gemini
  --history          Afficher l'historique des commits générés
  --console          Démarrer la console de monitoring & MCP (http://localhost:3000)
  --no-security      Désactiver l'audit de sécurité
  --dry-run          Générer le message sans effectuer le commit
  --verbose          Afficher les détails de l'audit
  --force            Bypasser un blocage sécurité après confirmation
  --yes, -y          Mode non-interactif (auto-confirme)
  --ci               Sortie adaptée CI (non-interactif)
  --output <fmt>     human (défaut) | json
  --tag              Créer un tag annoté après bump de version
  --push             Pousser le tag (si créé)
  --bump <type>      major | minor | patch | auto
  --from-commits     Déterminer le bump depuis les conventional commits
  --strategy <s>     merge: ours | theirs | manual | abort
  --help, -h         Afficher cette aide

${Colors.BOLD}CONFIGURATION LOCALE (.ghostrc):${Colors.ENDC}
  { "prompt": "...", "provider": "anthropic", "model": "..." }
    `);
}

async function confirmForceBypass() {
    if (!process.stdin.isTTY) return true;
    const answer = await promptUser(`${Colors.WARNING}${Colors.BOLD}⚠️  Bypass sécurité activé.${Colors.ENDC} Tapez ${Colors.BOLD}FORCE${Colors.ENDC} pour continuer : `);
    return (answer || '').trim() === 'FORCE';
}

// ==============================================================================
// 🛡️ SCANNER DE SECURITE
// ==============================================================================
const GENERIC_API_KEY_REGEX = new RegExp(
    [
        "(?:key|api|token|secret|auth)[_-]?",
        "(?:key|api|token|secret|auth)?",
        "\\s*[:=]\\s*[\"']",
        "(?!claude|gemini|llama|gpt|text-)",
        "([a-zA-Z0-9]{16,})[\"']"
    ].join(""),
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
    const isExampleFixture = (str) => /EXAMPLE/i.test(str);

    // Le mot-clé "EXAMPLE" est couramment utilisé dans les docs officielles (AWS, etc.)
    // pour indiquer une valeur factice ; on l'ignore afin d'éviter de bloquer des tests.

    // 1) Recherche via Regex ciblées (formats connus : AWS/GitHub/Slack/...) 
    for (const { name, regex } of SECRET_REGEXES) {
        const matches = content.match(regex);
        if (matches) {
            matches.forEach(m => {
                if (m.length > 8 && !isIgnored(m) && !isExampleFixture(m)) {
                    suspicious.push(`${m.substring(0, 15)}... (${name})`);
                }
            });
        }
    }

    // 2) Recherche via Entropie (détection de chaînes aléatoires non-standard)
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
        if (KNOWN_NON_SECRETS.some(ns => candidate.includes(ns)) || isIgnored(candidate) || isExampleFixture(candidate)) continue;
        
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

function isInteractive(flags) {
    return !!process.stdin.isTTY && !flags.ci && !flags.yes;
}

function safeJsonParse(text, fallback) {
    try {
        return JSON.parse(text);
    } catch {
        return fallback;
    }
}

function createReporter(flags) {
    const mode = (flags.output || (flags.ci ? 'json' : 'human')).toLowerCase();

    const writeJson = (level, message, meta) => {
        const payload = {
            ts: new Date().toISOString(),
            level,
            message,
            meta: meta && Object.keys(meta).length ? meta : undefined
        };
        process.stdout.write(JSON.stringify(payload) + '\n');
    };

    const writeHuman = (level, message) => {
        if (level === 'ERROR') {
            process.stderr.write(`${Colors.FAIL}${message}${Colors.ENDC}\n`);
            return;
        }
        if (level === 'WARN') {
            process.stdout.write(`${Colors.WARNING}${message}${Colors.ENDC}\n`);
            return;
        }
        process.stdout.write(`${message}\n`);
    };

    const emit = (level, message, meta = {}) => {
        if (mode === 'json') return writeJson(level, message, meta);
        writeHuman(level, message);
    };

    return {
        mode,
        info: (m, meta) => emit('INFO', m, meta),
        warn: (m, meta) => emit('WARN', m, meta),
        error: (m, meta) => emit('ERROR', m, meta),
        event: (name, meta) => emit('EVENT', name, meta)
    };
}

function gitExecStrict(args) {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function semverParse(input) {
    const raw = (input || '').trim();
    const cleaned = raw.startsWith('v') ? raw.slice(1) : raw;
    const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) return null;
    return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10), patch: parseInt(match[3], 10) };
}

function semverString(v) {
    return `${v.major}.${v.minor}.${v.patch}`;
}

function semverCompare(a, b) {
    if (a.major !== b.major) return a.major > b.major ? 1 : -1;
    if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
    if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
    return 0;
}

function semverBump(version, bump) {
    const v = { major: version.major, minor: version.minor, patch: version.patch };
    if (bump === 'major') return { major: v.major + 1, minor: 0, patch: 0 };
    if (bump === 'minor') return { major: v.major, minor: v.minor + 1, patch: 0 };
    if (bump === 'patch') return { major: v.major, minor: v.minor, patch: v.patch + 1 };
    return v;
}

function semverDiffType(fromV, toV) {
    if (semverCompare(toV, fromV) <= 0) return 'none';
    if (toV.major !== fromV.major) return 'major';
    if (toV.minor !== fromV.minor) return 'minor';
    if (toV.patch !== fromV.patch) return 'patch';
    return 'none';
}

function conventionalRequiredBumpFromMessage(message) {
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

function getRepoRootSafe() {
    const root = gitExec(['rev-parse', '--show-toplevel'], true);
    return root || process.cwd();
}

function resolveFromRepoRoot(relPath) {
    return path.resolve(getRepoRootSafe(), relPath);
}

function loadVersionConfig() {
    const configPath = resolveFromRepoRoot('.ghost-versionrc');
    const defaults = {
        versionFiles: [{ type: 'package-json', path: 'package.json' }],
        tagPrefix: 'v',
        requireVersionBump: true,
        autoTagAfterBump: true,
        notifications: { webhookUrl: null }
    };
    if (!fs.existsSync(configPath)) return { ...defaults, _path: configPath };
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = safeJsonParse(raw, {});
    return { ...defaults, ...parsed, _path: configPath };
}

function readPackageJsonVersionFromText(text) {
    const parsed = safeJsonParse(text, null);
    const version = parsed && typeof parsed.version === 'string' ? parsed.version : null;
    return version ? semverParse(version) : null;
}

function setPackageJsonVersionText(text, nextVersionStr) {
    const parsed = safeJsonParse(text, null);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid package.json');
    parsed.version = nextVersionStr;
    return JSON.stringify(parsed, null, 2) + '\n';
}

function readVersionFileVersion(sourceText, fileSpec) {
    if (fileSpec.type === 'package-json') return readPackageJsonVersionFromText(sourceText);
    throw new Error(`Unsupported version file type: ${fileSpec.type}`);
}

function writeVersionFileText(sourceText, fileSpec, nextVersionStr) {
    if (fileSpec.type === 'package-json') return setPackageJsonVersionText(sourceText, nextVersionStr);
    throw new Error(`Unsupported version file type: ${fileSpec.type}`);
}

function getLastTag(tagPrefix) {
    const tag = gitExec(['describe', '--tags', '--abbrev=0'], true);
    if (!tag) return null;
    if (tagPrefix && tag.startsWith(tagPrefix)) return tag;
    return tag;
}

function computeBumpFromCommitsSince(ref) {
    const range = ref ? `${ref}..HEAD` : 'HEAD';
    const raw = gitExec(['log', range, '--pretty=%s%n%b%n----END----'], true);
    if (!raw) return null;
    const chunks = raw.split('----END----').map(s => s.trim()).filter(Boolean);
    let required = null;
    const rank = { patch: 1, minor: 2, major: 3 };
    for (const c of chunks) {
        const bump = conventionalRequiredBumpFromMessage(c);
        if (!bump) continue;
        if (!required || rank[bump] > rank[required]) required = bump;
        if (required === 'major') break;
    }
    return required;
}

async function maybeNotify(versionConfig, reporter, eventName, payload) {
    const webhookUrl = versionConfig?.notifications?.webhookUrl;
    reporter.event(eventName, payload);
    if (!webhookUrl) return;
    try {
        const url = new URL(webhookUrl);
        const body = JSON.stringify({ event: eventName, ...payload });
        const options = {
            hostname: url.hostname,
            path: url.pathname + (url.search || ''),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'ghost-cli'
            }
        };
        await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                res.on('data', () => {});
                res.on('end', () => resolve());
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    } catch (e) {
        reporter.warn(`Notification failed: ${e.message}`);
    }
}

function getConflictedFiles() {
    const raw = gitExec(['diff', '--name-only', '--diff-filter=U'], true);
    if (!raw) return [];
    return raw.split('\n').map(s => s.trim()).filter(Boolean);
}

function normalizeBumpType(input) {
    const v = (input || '').toLowerCase().trim();
    if (v === 'major' || v === 'minor' || v === 'patch') return v;
    if (v === 'auto') return 'auto';
    return null;
}

async function handleVersionCommand(flags, argv) {
    const reporter = createReporter(flags);
    const versionConfig = loadVersionConfig();

    const sub = flags.subcommand || argv[1] || null;
    if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
        reporter.info('Usage: ghost version <bump|check|tag|install-hooks|init|hook>');
        return;
    }

    if (sub === 'init') {
        if (fs.existsSync(versionConfig._path)) {
            reporter.warn(`Config already exists: ${versionConfig._path}`);
            return;
        }
        const template = {
            versionFiles: [{ type: 'package-json', path: 'package.json' }],
            tagPrefix: 'v',
            requireVersionBump: true,
            autoTagAfterBump: true,
            notifications: { webhookUrl: null }
        };
        if (flags.dryRun) {
            reporter.info(`Would write ${versionConfig._path}`);
            return;
        }
        fs.writeFileSync(versionConfig._path, JSON.stringify(template, null, 2) + '\n');
        reporter.info(`Wrote ${versionConfig._path}`);
        return;
    }

    if (sub === 'install-hooks') {
        const gitDir = gitExec(['rev-parse', '--git-dir'], true);
        if (!gitDir) throw new Error('Not a git repository');
        const hooksDir = path.resolve(getRepoRootSafe(), gitDir, 'hooks');
        const preCommitPath = path.join(hooksDir, 'pre-commit');
        const commitMsgPath = path.join(hooksDir, 'commit-msg');
        const hookTarget = path.resolve(process.argv[1]).replace(/\\/g, '/');
        const script = (hookName) => `#!/bin/sh
node "${hookTarget}" version hook ${hookName} "$@"
`;
        if (flags.dryRun) {
            reporter.info(`Would write ${preCommitPath}`);
            reporter.info(`Would write ${commitMsgPath}`);
            return;
        }
        fs.writeFileSync(preCommitPath, script('pre-commit'));
        fs.writeFileSync(commitMsgPath, script('commit-msg'));
        fs.chmodSync(preCommitPath, 0o755);
        fs.chmodSync(commitMsgPath, 0o755);
        reporter.info('Git hooks installed: pre-commit, commit-msg');
        return;
    }

    if (sub === 'hook') {
        const hookName = argv[2] || null;
        if (hookName === 'pre-commit') {
            const conflicts = getConflictedFiles();
            if (conflicts.length) {
                reporter.error(`Merge conflicts detected:\n${conflicts.map(f => ` - ${f}`).join('\n')}`);
                process.exit(1);
            }
            process.exit(0);
        }
        if (hookName === 'commit-msg') {
            const msgFile = argv[3] || argv[2];
            const msg = msgFile && fs.existsSync(msgFile) ? fs.readFileSync(msgFile, 'utf8') : '';
            const required = conventionalRequiredBumpFromMessage(msg);
            if (!required || !versionConfig.requireVersionBump) process.exit(0);

            const fileSpec = versionConfig.versionFiles[0];
            const relPath = fileSpec.path;
            const headText = gitExec(['show', `HEAD:${relPath}`], true);
            const indexText = gitExec(['show', `:${relPath}`], true);
            const headV = headText ? readVersionFileVersion(headText, fileSpec) : null;
            const indexV = indexText ? readVersionFileVersion(indexText, fileSpec) : null;

            if (!headV || !indexV) {
                reporter.error(`Version file missing or unreadable in git index/head: ${relPath}`);
                process.exit(1);
            }

            const diffType = semverDiffType(headV, indexV);
            const ok =
                (required === 'patch' && (diffType === 'patch' || diffType === 'minor' || diffType === 'major')) ||
                (required === 'minor' && (diffType === 'minor' || diffType === 'major')) ||
                (required === 'major' && diffType === 'major');

            if (!ok) {
                const msgLine = msg.split('\n')[0].trim();
                reporter.error(
                    `Commit requires a ${required} version bump but ${relPath} is not bumped in the index.\n` +
                    ` - commit: ${msgLine}\n` +
                    ` - head:   ${semverString(headV)}\n` +
                    ` - index:  ${semverString(indexV)}\n` +
                    `Fix: run "ghost version bump --bump ${required} --tag" then stage and retry.`
                );
                process.exit(1);
            }

            process.exit(0);
        }
        reporter.error('Unknown hook. Supported: pre-commit, commit-msg');
        process.exit(1);
    }

    if (sub === 'check') {
        const fileSpec = versionConfig.versionFiles[0];
        const relPath = fileSpec.path;
        const headText = gitExec(['show', `HEAD:${relPath}`], true);
        const indexText = gitExec(['show', `:${relPath}`], true);
        const headV = headText ? readVersionFileVersion(headText, fileSpec) : null;
        const indexV = indexText ? readVersionFileVersion(indexText, fileSpec) : null;
        if (!headV || !indexV) throw new Error(`Unable to read ${relPath} from git`);
        const diff = semverDiffType(headV, indexV);
        reporter.info(`Version diff (HEAD -> index): ${diff}`);
        return;
    }

    if (sub === 'tag') {
        const fileSpec = versionConfig.versionFiles[0];
        const relPath = resolveFromRepoRoot(fileSpec.path);
        const currentText = fs.readFileSync(relPath, 'utf8');
        const currentV = readVersionFileVersion(currentText, fileSpec);
        if (!currentV) throw new Error(`Unable to read version from ${fileSpec.path}`);
        const tagName = `${versionConfig.tagPrefix || 'v'}${semverString(currentV)}`;
        if (flags.dryRun) {
            reporter.info(`Would create annotated tag ${tagName}`);
            return;
        }
        gitExecStrict(['tag', '-a', tagName, '-m', `Release ${tagName}`]);
        if (flags.push) gitExecStrict(['push', 'origin', tagName]);
        await maybeNotify(versionConfig, reporter, 'version.tagged', { tag: tagName, version: semverString(currentV) });
        reporter.info(`Tag created: ${tagName}`);
        return;
    }

    if (sub === 'bump') {
        const positionalBump = argv[2] && !argv[2].startsWith('--') ? argv[2] : null;
        const bumpType = normalizeBumpType(flags.bump || positionalBump || (flags.fromCommits ? 'auto' : null) || 'auto');
        if (!bumpType) throw new Error('Invalid bump type. Use major|minor|patch|auto');

        const fileSpec = versionConfig.versionFiles[0];
        const relPath = resolveFromRepoRoot(fileSpec.path);
        const originalText = fs.readFileSync(relPath, 'utf8');
        const currentV = readVersionFileVersion(originalText, fileSpec);
        if (!currentV) throw new Error(`Unable to read version from ${fileSpec.path}`);

        let effectiveBump = bumpType;
        if (bumpType === 'auto') {
            const lastTag = getLastTag(versionConfig.tagPrefix || 'v');
            effectiveBump = computeBumpFromCommitsSince(lastTag) || 'patch';
        }

        const nextV = semverBump(currentV, effectiveBump);
        const nextStr = semverString(nextV);
        const nextText = writeVersionFileText(originalText, fileSpec, nextStr);
        const tagName = `${versionConfig.tagPrefix || 'v'}${nextStr}`;
        const shouldTag = flags.tag || versionConfig.autoTagAfterBump;

        reporter.info(`Version: ${semverString(currentV)} -> ${nextStr} (${effectiveBump})`);

        if (flags.dryRun) {
            reporter.info(`Would update ${fileSpec.path}`);
            if (shouldTag) reporter.info(`Would create tag ${tagName}`);
            return;
        }

        const touched = [];
        let tagCreated = false;
        try {
            fs.writeFileSync(relPath, nextText);
            touched.push({ absPath: relPath, originalText });
            if (checkGitRepo()) {
                gitExecStrict(['add', fileSpec.path]);
            }
            await maybeNotify(versionConfig, reporter, 'version.bumped', { version: nextStr, bump: effectiveBump, file: fileSpec.path });

            if (shouldTag) {
                gitExecStrict(['tag', '-a', tagName, '-m', `Release ${tagName}`]);
                tagCreated = true;
                if (flags.push) gitExecStrict(['push', 'origin', tagName]);
                await maybeNotify(versionConfig, reporter, 'version.tagged', { tag: tagName, version: nextStr });
            }
        } catch (e) {
            for (const t of touched) {
                try { fs.writeFileSync(t.absPath, t.originalText); } catch {}
            }
            if (tagCreated) {
                gitExec(['tag', '-d', tagName], true);
            }
            throw e;
        }

        reporter.info(`Updated ${fileSpec.path} to ${nextStr}`);
        if (shouldTag) reporter.info(`Tag: ${tagName}`);
        return;
    }

    reporter.error('Unknown version subcommand');
    process.exit(1);
}

async function handleMergeCommand(flags, argv) {
    const reporter = createReporter(flags);
    if (!checkGitRepo()) throw new Error('Not a git repository');
    const sub = flags.subcommand || argv[1] || 'status';

    const conflicts = getConflictedFiles();
    if (sub === 'status') {
        if (!conflicts.length) {
            reporter.info('No merge conflicts detected.');
            return;
        }
        reporter.warn(`Merge conflicts (${conflicts.length}):\n${conflicts.map(f => ` - ${f}`).join('\n')}`);
        process.exit(1);
    }

    if (sub === 'resolve') {
        if (!conflicts.length) {
            reporter.info('No merge conflicts detected.');
            return;
        }

        const valid = new Set(['ours', 'theirs', 'manual', 'abort']);
        const defaultStrategy = flags.strategy && valid.has(flags.strategy) ? flags.strategy : null;
        if (!defaultStrategy && !isInteractive(flags)) {
            reporter.error('Non-interactive mode requires --strategy ours|theirs|manual|abort');
            process.exit(1);
        }

        for (const file of conflicts) {
            let strategy = defaultStrategy;
            if (!strategy) {
                reporter.warn(`Conflict: ${file}`);
                const answer = await promptUser(`${Colors.BOLD}Choose strategy for this file [o]urs / [t]heirs / [m]anual / [a]bort : ${Colors.ENDC}`);
                const a = (answer || '').trim().toLowerCase();
                if (a === 'o' || a === 'ours') strategy = 'ours';
                else if (a === 't' || a === 'theirs') strategy = 'theirs';
                else if (a === 'm' || a === 'manual') strategy = 'manual';
                else if (a === 'a' || a === 'abort') strategy = 'abort';
                else strategy = 'manual';
            }

            if (strategy === 'abort') {
                reporter.error('Aborted by user.');
                process.exit(1);
            }
            if (strategy === 'manual') {
                reporter.warn(`Manual resolution required: ${file}`);
                continue;
            }
            if (strategy === 'ours') {
                gitExec(['checkout', '--ours', '--', `"${file}"`], true);
                gitExec(['add', `"${file}"`], true);
                reporter.info(`Resolved (ours): ${file}`);
                continue;
            }
            if (strategy === 'theirs') {
                gitExec(['checkout', '--theirs', '--', `"${file}"`], true);
                gitExec(['add', `"${file}"`], true);
                reporter.info(`Resolved (theirs): ${file}`);
                continue;
            }
        }

        const remaining = getConflictedFiles();
        if (remaining.length) {
            reporter.warn(`Remaining conflicts (${remaining.length}):\n${remaining.map(f => ` - ${f}`).join('\n')}`);
            process.exit(1);
        }
        reporter.info('All conflicts resolved and staged.');
        return;
    }

    reporter.error('Unknown merge subcommand. Supported: status, resolve');
    process.exit(1);
}

// ==============================================================================
// 🚀 MAIN LOOP
// ==============================================================================
async function main() {
    const flags = parseArgs();
    const argv = process.argv.slice(2);

    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (flags.console) {
        monitor.startConsoleServer(3000);
        return;
    }

    if (flags.history) {
        showHistory();
        process.exit(0);
    }

    if (flags.command === 'version') {
        await handleVersionCommand(flags, argv);
        return;
    }

    if (flags.command === 'merge') {
        await handleMergeCommand(flags, argv);
        return;
    }

    console.clear();
    console.log(`\n${Colors.BOLD}${Colors.CYAN} 👻 GHOST CLI ${Colors.ENDC}${Colors.DIM} v0.3.2${Colors.ENDC}`);
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

    // 1. Audit Complet (Commande 'audit')
    if (flags.audit) {
        console.log(`${Colors.BLUE}🛡️  Lancement de l'audit de sécurité complet...${Colors.ENDC}`);
        
        // Charger le .ghostignore à la racine
        const ignoredPatterns = loadGhostIgnore();
        const isFileIgnored = (f) => ignoredPatterns.some(p => f.includes(p));

        const allFiles = fs.readdirSync(process.cwd(), { recursive: true }).filter(f => !f.includes('node_modules') && !f.includes('.git'));
        let issues = 0;
        
        for (const file of allFiles) {
            try {
                if (isFileIgnored(file)) {
                    if (flags.verbose) console.log(`${Colors.DIM}⏩ ${file} : Ignoré (.ghostignore)${Colors.ENDC}`);
                    continue;
                }

                const filePath = path.join(process.cwd(), file);
                if (fs.lstatSync(filePath).isDirectory()) continue;
                
                const content = fs.readFileSync(filePath, 'utf8');
                const suspects = scanForSecrets(content);
                
                if (suspects.length > 0) {
                    console.log(`\n${Colors.FAIL}❌ ${file} : ${suspects.length} secret(s) potentiel(s)${Colors.ENDC}`);
                    suspects.forEach(s => console.log(`   - ${s}`));
                    issues += suspects.length;
                } else if (flags.verbose) {
                    console.log(`${Colors.GREEN}✅ ${file} : Clean${Colors.ENDC}`);
                }
            } catch (e) {
                // Ignore binary files or read errors
            }
        }
        
        if (issues === 0) {
            console.log(`\n${Colors.GREEN}✅ Aucun secret détecté.${Colors.ENDC}`);
            process.exit(0);
        } else {
            console.log(`\n${Colors.FAIL}❌ Audit échoué : ${issues} problème(s) détecté(s).${Colors.ENDC}`);
            if (flags.force) {
                const confirmed = await confirmForceBypass();
                if (confirmed) {
                    console.log(`${Colors.WARNING}⚠️  Audit forcé (--force). Sortie avec succès malgré les alertes.${Colors.ENDC}`);
                    process.exit(0);
                }
            }
            process.exit(1);
        }
    }

    // 2. Vérification Git
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
                    if (flags.force) {
                        const confirmed = await confirmForceBypass();
                        if (!confirmed) {
                            console.log(`${Colors.WARNING}🚫 Bypass annulé.${Colors.ENDC}`);
                            process.exit(1);
                        }
                        console.log(`${Colors.WARNING}⚠️  Bypass sécurité confirmé (--force).${Colors.ENDC}`);
                    } else {
                        process.exit(1);
                    }
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

module.exports = {
    semverParse,
    semverString,
    semverCompare,
    semverBump,
    semverDiffType,
    conventionalRequiredBumpFromMessage,
    computeBumpFromCommitsSince,
    normalizeBumpType,
    loadVersionConfig
};

if (require.main === module) {
    main().catch(console.error);
}
