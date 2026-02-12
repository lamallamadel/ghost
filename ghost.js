#!/usr/bin/env node

/**
 * 👻 Ghost CLI - Assistant Git Intelligent (Node.js Edition)
 * Zero-Dependency: Utilise uniquement les modules natifs Node.js
 * Compatible: Windows, Mac, Linux
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawn } = require('child_process');
const readline = require('readline');
const os = require('os');

// ==============================================================================
// ⚙️ CONFIGURATION & CONSTANTES
// ==============================================================================
const CONFIG_FILE = path.join(os.homedir(), '.ghost');
const SAFE_EXTENSIONS = new Set(['.md', '.txt', '.csv', '.html', '.css', '.scss', '.lock', '.xml', '.json']);
const SAFE_FILES = new Set(['mvnw', 'gradlew', 'package-lock.json', 'yarn.lock', 'pom.xml']);

// Couleurs ANSI
const Colors = {
    HEADER: '\x1b[95m',
    BLUE: '\x1b[94m',
    CYAN: '\x1b[96m',
    GREEN: '\x1b[92m',
    WARNING: '\x1b[93m',
    FAIL: '\x1b[91m',
    ENDC: '\x1b[0m',
    BOLD: '\x1b[1m'
};

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
        console.log(`${Colors.GREEN}Configuration sauvegardée dans ${CONFIG_FILE}${Colors.ENDC}`);
    }

    async getApiKey() {
        let key = process.env.GROQ_API_KEY || this.config.groq_api_key;

        if (!key) {
            console.log(`${Colors.WARNING}[!] Aucune clé API trouvée.${Colors.ENDC}`);
            console.log(`Obtenez une clé gratuite sur : https://console.groq.com`);
            key = await promptUser(`${Colors.BOLD}Entrez votre clé Groq (gsk_...): ${Colors.ENDC}`);
            
            if (key) {
                this.config.groq_api_key = key.trim();
                this.save();
            } else {
                console.log(`${Colors.FAIL}Clé requise pour continuer.${Colors.ENDC}`);
                process.exit(1);
            }
        }
        return key;
    }
}

// ==============================================================================
// 🧠 MOTEUR IA (Client HTTPS Natif)
// ==============================================================================
class AIEngine {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.hostname = "api.groq.com";
        this.path = "/openai/v1/chat/completions";
        this.model = "llama-3.3-70b-versatile";
    }

    async call(systemPrompt, userPrompt, temperature = 0.3, jsonMode = false) {
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
            hostname: this.hostname,
            path: this.path,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Node.js/GhostCLI)'
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 400) {
                        try {
                            const errBody = JSON.parse(data);
                            reject(new Error(`API Error ${res.statusCode}: ${errBody.error?.message || data}`));
                        } catch (e) {
                            reject(new Error(`API Error ${res.statusCode}: ${data}`));
                        }
                    } else {
                        try {
                            const result = JSON.parse(data);
                            resolve(result.choices[0].message.content);
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
// 🛡️ SCANNER DE SECURITE
// ==============================================================================
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

function scanForSecrets(content) {
    if (!content) return [];
    const suspicious = [];
    // Regex équivalente à celle de Python
    const regex = /(['"])(.*?)(\1)|=\s*([^\s]+)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        // match[2] est le contenu entre quotes, match[4] est après le =
        const candidate = match[2] || match[4];
        
        if (!candidate || candidate.length < 12 || candidate.includes(' ')) continue;
        
        if (calculateShannonEntropy(candidate) > 4.8) {
            suspicious.push(candidate.substring(0, 15) + "...");
        }
    }
    return suspicious;
}

// ==============================================================================
// 📂 GIT INTERFACE
// ==============================================================================
function gitExec(args) {
    try {
        // execSync retourne un Buffer, on convertit en string
        return execSync(`git ${args.join(' ')}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (e) {
        if (e.stderr) console.error(`${Colors.FAIL}Erreur Git: ${e.stderr.toString()}${Colors.ENDC}`);
        // Si c'est juste un diff vide ou erreur non critique, on peut renvoyer vide
        return "";
    }
}

function getStagedDiff() {
    const filesOutput = gitExec(['diff', '--cached', '--name-only']);
    if (!filesOutput) return { text: "", map: {} };

    const files = filesOutput.split('\n');
    let fullDiff = "";
    const fileMap = {};

    for (let f of files) {
        f = f.trim().replace(/^"|"$/g, ''); // Nettoyage quotes
        if (!f || SAFE_FILES.has(path.basename(f)) || SAFE_EXTENSIONS.has(path.extname(f))) continue;

        const content = gitExec(['diff', '--cached', `"${f}"`]);
        if (content) {
            fullDiff += `\n--- ${f} ---\n${content}\n`;
            fileMap[f] = content;
        }
    }

    return { text: fullDiff, map: fileMap };
}

// Helper pour input utilisateur
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
    console.log(`${Colors.BOLD}${Colors.CYAN}👻 Ghost CLI - Assistant Git Intelligent (JS)${Colors.ENDC}`);

    const config = new ConfigManager();
    const apiKey = await config.getApiKey();
    const ai = new AIEngine(apiKey);

    const { text: fullDiffText, map: diffMap } = getStagedDiff();

    if (!fullDiffText) {
        console.log(`${Colors.WARNING}[i] Aucun changement à traiter (ou fichiers ignorés).${Colors.ENDC}`);
        process.exit(0);
    }

    // 1. Audit
    console.log(`${Colors.BLUE}[1/2] 🛡️  Audit de Sécurité...${Colors.ENDC}`);
    const potentialLeaks = {};
    for (const [fname, content] of Object.entries(diffMap)) {
        const suspects = scanForSecrets(content);
        if (suspects.length > 0) potentialLeaks[fname] = suspects;
    }

    if (Object.keys(potentialLeaks).length > 0) {
        console.log(`${Colors.WARNING}⚠️  Entropie élevée détectée. Analyse approfondie IA...${Colors.ENDC}`);
        const valPrompt = `Analyse ces secrets potentiels : ${JSON.stringify(potentialLeaks)}. Réponds JSON {'is_breach': bool, 'reason': str}. Vrais secrets (API Keys) seulement.`;
        
        try {
            const res = await ai.call("Tu es un expert sécurité.", valPrompt, 0.3, true);
            const audit = JSON.parse(res);
            
            if (audit.is_breach) {
                console.log(`${Colors.FAIL}❌ [BLOCAGE] Secret détecté : ${audit.reason}${Colors.ENDC}`);
                process.exit(1);
            } else {
                console.log(`${Colors.GREEN}✅ Faux positifs confirmés.${Colors.ENDC}`);
            }
        } catch (e) {
            console.log(`${Colors.FAIL}Erreur audit IA: ${e.message}${Colors.ENDC}`);
        }
    } else {
        console.log(`${Colors.GREEN}✅ Code sain.${Colors.ENDC}`);
    }

    // 2. Génération
    console.log(`${Colors.BLUE}[2/2] ⚡ Génération du message...${Colors.ENDC}`);
    const sysPrompt = "Tu es un assistant Git. Génère UNIQUEMENT un message de commit 'Conventional Commits' concis. Pas de markdown, pas de guillemets.";
    
    try {
        let commitMsg = await ai.call(sysPrompt, `Diff :\n${fullDiffText.substring(0, 6000)}`);
        commitMsg = commitMsg.trim().replace(/^['"]|['"]$/g, '');

        console.log(`\n${Colors.BOLD}Message suggéré :${Colors.ENDC}`);
        console.log(`${Colors.CYAN}--------------------------------------------------${Colors.ENDC}`);
        console.log(commitMsg);
        console.log(`${Colors.CYAN}--------------------------------------------------${Colors.ENDC}`);

        const action = await promptUser(`\n${Colors.BOLD}[Enter] Valider  |  [n] Annuler : ${Colors.ENDC}`);

        if (action.toLowerCase() === 'n') {
            console.log(`${Colors.WARNING}Annulé.${Colors.ENDC}`);
        } else {
            try {
                execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
                console.log(`${Colors.GREEN}✅ Commité.${Colors.ENDC}`);
            } catch (e) {
                // Erreur Git (ex: hook failed) gérée par stdio inherit
            }
        }
    } catch (e) {
        console.log(`${Colors.FAIL}Erreur: ${e.message}${Colors.ENDC}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}