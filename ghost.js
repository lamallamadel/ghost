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

// ==============================================================================
// ⚙️ CONFIGURATION & CONSTANTES
// ==============================================================================
const CONFIG_FILE = path.join(os.homedir(), '.ghost');
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

    async getApiKey() {
        let key = process.env.GROQ_API_KEY || this.config.groq_api_key;

        if (!key) {
            console.log(`\n${Colors.WARNING}⚠️  Configuration manquante${Colors.ENDC}`);
            console.log(`${Colors.DIM}Pour utiliser Ghost, vous avez besoin d'une clé API Groq (Gratuite).${Colors.ENDC}`);
            console.log(`${Colors.BLUE}👉 Obtenir une clé : https://console.groq.com${Colors.ENDC}\n`);
            
            key = await promptUser(`${Colors.BOLD}Collez votre clé Groq (gsk_...) : ${Colors.ENDC}`);
            
            if (key && key.trim().startsWith('gsk_')) {
                this.config.groq_api_key = key.trim();
                this.save();
            } else {
                console.log(`${Colors.FAIL}❌ Clé invalide ou manquante. Abandon.${Colors.ENDC}`);
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
            }
        };
    }

    async call(systemPrompt, userPrompt, temperature = 0.3, jsonMode = false) {
        const config = this.providers[this.provider] || this.providers.groq;
        
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

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 400) {
                        try {
                            const errBody = JSON.parse(data);
                            reject(new Error(`API Error ${res.statusCode} (${this.provider}): ${errBody.error?.message || data}`));
                        } catch (e) {
                            reject(new Error(`API Error ${res.statusCode} (${this.provider}): ${data}`));
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
// 🛠️ UTILS & ARG PARSER
// ==============================================================================
function parseArgs() {
    const args = process.argv.slice(2);
    const flags = {
        model: null,
        provider: null,
        noSecurity: false,
        dryRun: false,
        help: false
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
        }
    }
    return flags;
}

function showHelp() {
    console.log(`
${Colors.BOLD}${Colors.CYAN}GHOST CLI v0.2.0${Colors.ENDC}
Assistant Git Intelligent basé sur l'IA (Groq/OpenAI)

${Colors.BOLD}USAGE:${Colors.ENDC}
  ghost [options]

${Colors.BOLD}OPTIONS:${Colors.ENDC}
  --model <name>     Utiliser un modèle spécifique (ex: llama-3.1-8b-instant)
  --provider <name>  Choisir le fournisseur (groq [défaut], openai)
  --no-security      Désactiver l'audit de sécurité
  --dry-run          Générer le message sans effectuer le commit
  --help, -h         Afficher cette aide

${Colors.BOLD}CONFIGURATION LOCALE (.ghostrc):${Colors.ENDC}
  Créez un fichier ${Colors.CYAN}.ghostrc${Colors.ENDC} JSON dans votre projet pour personnaliser le prompt :
  { "prompt": "Ton prompt personnalisé ici" }
    `);
}

// ==============================================================================
// 🛡️ SCANNER DE SECURITE
// ==============================================================================
const SECRET_REGEXES = [
    { name: 'Generic API Key', regex: /([a-z0-9_-]{20,})/gi },
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

function scanForSecrets(content) {
    if (!content) return [];
    const suspicious = [];
    
    // 1. Recherche via Regex ciblées
    for (const { name, regex } of SECRET_REGEXES) {
        const matches = content.match(regex);
        if (matches) {
            matches.forEach(m => {
                if (m.length > 8) {
                    suspicious.push(`${m.substring(0, 15)}... (${name})`);
                }
            });
        }
    }

    // 2. Recherche via Entropie (pour les secrets non-standard)
    const regex = /(['"])(.*?)(\1)|=\s*([^\s]+)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const candidate = match[2] || match[4];
        
        // Filtres heuristiques de base
        if (!candidate || candidate.length < 12 || candidate.includes(' ')) continue;
        
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

    console.clear();
    console.log(`\n${Colors.BOLD}${Colors.CYAN} 👻 GHOST CLI ${Colors.ENDC}${Colors.DIM} v0.2.0${Colors.ENDC}`);
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
            const valPrompt = `Analyse ces secrets potentiels : ${JSON.stringify(potentialLeaks)}. Réponds JSON {'is_breach': bool, 'reason': str}. Vrais secrets (API Keys, tokens) seulement. Ignore les exemples ou les faux positifs.`;
            
            try {
                const res = await ai.call("Tu es un expert sécurité.", valPrompt, 0.3, true);
                const audit = JSON.parse(res);
                
                if (audit.is_breach) {
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
