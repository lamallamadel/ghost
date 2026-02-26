const readline = require('readline');
const path = require('path');
const os = require('os');
const fs = require('fs');

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

const CONFIG_DIR = path.join(os.homedir(), '.ghost', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'ghostrc.json');
const OLD_GHOSTRC = path.join(os.homedir(), '.ghostrc');
const OLD_VERSIONRC = path.join(os.homedir(), '.ghost-versionrc');

class SetupWizard {
    constructor() {
        this.rl = null;
        this.config = {
            workingDirectory: process.cwd(),
            gitEditor: process.env.EDITOR || process.env.VISUAL || 'vim',
            telemetry: {
                enabled: true
            },
            ai: {
                provider: null,
                apiKey: null
            }
        };
    }

    async run() {
        console.log(`\n${Colors.BOLD}${Colors.CYAN}Ghost CLI Setup Wizard${Colors.ENDC}`);
        console.log(`${Colors.DIM}${'─'.repeat(50)}${Colors.ENDC}\n`);

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        try {
            await this.checkForMigration();
            await this.promptWorkingDirectory();
            await this.promptGitEditor();
            await this.promptTelemetry();
            await this.promptAIProvider();
            await this.saveConfig();
            
            console.log(`\n${Colors.GREEN}${Colors.BOLD}✓ Setup complete!${Colors.ENDC}`);
            console.log(`${Colors.DIM}Configuration saved to: ${CONFIG_FILE}${Colors.ENDC}\n`);
        } catch (error) {
            console.error(`\n${Colors.FAIL}Setup failed: ${error.message}${Colors.ENDC}\n`);
            throw error;
        } finally {
            this.rl.close();
        }
    }

    async checkForMigration() {
        const oldFiles = [];
        
        if (fs.existsSync(OLD_GHOSTRC)) {
            oldFiles.push({ path: OLD_GHOSTRC, name: '.ghostrc' });
        }
        
        if (fs.existsSync(OLD_VERSIONRC)) {
            oldFiles.push({ path: OLD_VERSIONRC, name: '.ghost-versionrc' });
        }

        if (oldFiles.length === 0) {
            return;
        }

        console.log(`${Colors.WARNING}Found existing configuration files:${Colors.ENDC}`);
        oldFiles.forEach(file => {
            console.log(`  - ${file.name}`);
        });
        console.log('');

        const migrate = await this.prompt(`Would you like to migrate these settings? (y/n) [y]: `);
        
        if (migrate.toLowerCase() === 'n') {
            return;
        }

        for (const file of oldFiles) {
            try {
                const content = fs.readFileSync(file.path, 'utf8');
                const data = JSON.parse(content);
                
                if (file.name === '.ghostrc' && data.workingDirectory) {
                    this.config.workingDirectory = data.workingDirectory;
                }
                
                if (file.name === '.ghostrc' && data.gitEditor) {
                    this.config.gitEditor = data.gitEditor;
                }
                
                if (file.name === '.ghostrc' && data.telemetry) {
                    this.config.telemetry = data.telemetry;
                }
                
                if (file.name === '.ghostrc' && data.ai) {
                    this.config.ai = data.ai;
                }
                
                console.log(`${Colors.GREEN}✓${Colors.ENDC} Migrated settings from ${file.name}`);
            } catch (error) {
                console.log(`${Colors.WARNING}⚠${Colors.ENDC} Could not parse ${file.name}: ${error.message}`);
            }
        }
        
        console.log('');
    }

    async promptWorkingDirectory() {
        console.log(`${Colors.BOLD}Working Directory${Colors.ENDC}`);
        console.log(`${Colors.DIM}Default directory for Git operations${Colors.ENDC}`);
        
        const answer = await this.prompt(`Path [${this.config.workingDirectory}]: `);
        
        if (answer.trim()) {
            const expandedPath = answer.replace(/^~/, os.homedir());
            const absolutePath = path.resolve(expandedPath);
            
            if (!fs.existsSync(absolutePath)) {
                console.log(`${Colors.WARNING}⚠ Directory does not exist: ${absolutePath}${Colors.ENDC}`);
                const create = await this.prompt(`Create it? (y/n) [n]: `);
                
                if (create.toLowerCase() === 'y') {
                    try {
                        fs.mkdirSync(absolutePath, { recursive: true });
                        console.log(`${Colors.GREEN}✓${Colors.ENDC} Directory created`);
                        this.config.workingDirectory = absolutePath;
                    } catch (error) {
                        console.log(`${Colors.FAIL}✗${Colors.ENDC} Failed to create directory: ${error.message}`);
                    }
                }
            } else {
                this.config.workingDirectory = absolutePath;
            }
        }
        
        console.log('');
    }

    async promptGitEditor() {
        console.log(`${Colors.BOLD}Git Editor${Colors.ENDC}`);
        console.log(`${Colors.DIM}Default editor for Git operations${Colors.ENDC}`);
        
        const answer = await this.prompt(`Editor [${this.config.gitEditor}]: `);
        
        if (answer.trim()) {
            this.config.gitEditor = answer.trim();
        }
        
        console.log('');
    }

    async promptTelemetry() {
        console.log(`${Colors.BOLD}Telemetry${Colors.ENDC}`);
        console.log(`${Colors.DIM}Help improve Ghost CLI by sharing anonymous usage data${Colors.ENDC}`);
        console.log(`${Colors.DIM}This includes command usage statistics and performance metrics${Colors.ENDC}`);
        
        const defaultValue = this.config.telemetry.enabled ? 'y' : 'n';
        const answer = await this.prompt(`Enable telemetry? (y/n) [${defaultValue}]: `);
        
        if (answer.trim()) {
            this.config.telemetry.enabled = answer.toLowerCase() === 'y';
        }
        
        console.log('');
    }

    async promptAIProvider() {
        console.log(`${Colors.BOLD}AI Provider Configuration${Colors.ENDC}`);
        console.log(`${Colors.DIM}Configure AI provider for enhanced Git features${Colors.ENDC}`);
        console.log(`${Colors.DIM}Supported providers: groq, anthropic, gemini${Colors.ENDC}`);
        
        const configure = await this.prompt(`Configure AI provider? (y/n) [n]: `);
        
        if (configure.toLowerCase() !== 'y') {
            console.log('');
            return;
        }

        console.log(`\n${Colors.BOLD}Available providers:${Colors.ENDC}`);
        console.log(`  1. Groq (fast, open-source models)`);
        console.log(`  2. Anthropic (Claude)`);
        console.log(`  3. Gemini (Google AI)`);
        console.log('');
        
        const provider = await this.prompt(`Select provider (1-3) or name: `);
        
        let providerName;
        switch (provider.trim()) {
            case '1':
                providerName = 'groq';
                break;
            case '2':
                providerName = 'anthropic';
                break;
            case '3':
                providerName = 'gemini';
                break;
            default:
                providerName = provider.trim().toLowerCase();
        }
        
        if (!providerName || !['groq', 'anthropic', 'gemini'].includes(providerName)) {
            console.log(`${Colors.WARNING}⚠ Invalid provider, skipping AI configuration${Colors.ENDC}`);
            console.log('');
            return;
        }
        
        this.config.ai.provider = providerName;
        
        console.log(`\n${Colors.DIM}Enter your ${providerName.toUpperCase()} API key${Colors.ENDC}`);
        console.log(`${Colors.DIM}(input will be hidden)${Colors.ENDC}`);
        
        const apiKey = await this.promptSecret(`API Key: `);
        
        if (apiKey.trim()) {
            this.config.ai.apiKey = apiKey.trim();
            console.log(`${Colors.GREEN}✓${Colors.ENDC} API key configured`);
        } else {
            console.log(`${Colors.WARNING}⚠${Colors.ENDC} No API key provided, AI features will be disabled`);
        }
        
        console.log('');
    }

    async saveConfig() {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }

        const configData = JSON.stringify(this.config, null, 2);
        fs.writeFileSync(CONFIG_FILE, configData, { mode: 0o600 });
        
        console.log(`${Colors.GREEN}✓${Colors.ENDC} Configuration saved`);
    }

    prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer);
            });
        });
    }

    promptSecret(question) {
        return new Promise((resolve) => {
            const stdin = process.stdin;
            const wasRaw = stdin.isRaw;
            
            if (stdin.setRawMode) {
                stdin.setRawMode(true);
            }
            
            process.stdout.write(question);
            
            let input = '';
            
            const onData = (char) => {
                const charStr = char.toString('utf8');
                
                if (charStr === '\n' || charStr === '\r' || charStr === '\u0004') {
                    if (stdin.setRawMode) {
                        stdin.setRawMode(wasRaw);
                    }
                    stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    resolve(input);
                } else if (charStr === '\u0003') {
                    if (stdin.setRawMode) {
                        stdin.setRawMode(wasRaw);
                    }
                    stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    process.exit(0);
                } else if (charStr === '\u007f' || charStr === '\b') {
                    if (input.length > 0) {
                        input = input.slice(0, -1);
                        process.stdout.write('\b \b');
                    }
                } else if (charStr >= ' ' && charStr <= '~') {
                    input += charStr;
                    process.stdout.write('*');
                }
            };
            
            stdin.on('data', onData);
        });
    }

    static loadConfig() {
        if (!fs.existsSync(CONFIG_FILE)) {
            return null;
        }

        try {
            const content = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`${Colors.WARNING}Warning: Could not load config: ${error.message}${Colors.ENDC}`);
            return null;
        }
    }
}

module.exports = SetupWizard;
