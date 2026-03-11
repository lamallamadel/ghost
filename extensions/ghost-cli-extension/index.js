#!/usr/bin/env node

const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');
const readline = require('readline');

const Colors = {
    GHOST: '\x1b[38;5;141m',
    SOFT_GREEN: '\x1b[38;5;120m',
    SOFT_BLUE: '\x1b[38;5;117m',
    DIM: '\x1b[2m',
    BOLD: '\x1b[1m',
    RESET: '\x1b[0m'
};

class GhostInteractiveShell {
    constructor() {
        this.sdk = new ExtensionSDK('ghost-cli-extension');
        this.rl = null;
        this.cachedRegistry = null;
        this.filteredCommands = [];
        this.selectedIndex = 0;
        this.menuLines = 0;
    }

    async init() {
        return { success: true };
    }

    async getRegistry() {
        if (this.cachedRegistry) return this.cachedRegistry;
        try {
            const registry = await this.sdk.emitIntent({
                type: 'system',
                operation: 'registry',
                params: {}
            });
            this.cachedRegistry = registry || [];
            return this.cachedRegistry;
        } catch (e) {
            return [];
        }
    }

    getAvailableCommands() {
        const registry = this.cachedRegistry || [];
        const cmds = [
            { name: 'help', description: 'Afficher toutes les commandes disponibles', extId: 'ghost-cli-extension' },
            { name: 'clear', description: 'Nettoyer le terminal', extId: 'ghost-cli-extension' }
        ];
        
        registry.forEach(ext => {
            if (ext.id === 'ghost-cli-extension' || ext.id === 'ghost-extflo-extension') return;
            const shortName = ext.id.replace('ghost-', '').replace('-extension', '');
            cmds.push({
                name: shortName,
                description: ext.description || `Exécuter via ${ext.id}`,
                extId: ext.id
            });
        });
        
        return cmds.sort((a, b) => a.name.localeCompare(b.name));
    }

    renderMenu(input) {
        if (!process.stdout.isTTY) return;
        
        const commands = this.getAvailableCommands();
        
        // Remove slash and split args
        const parts = input.substring(1).split(' ');
        const query = parts[0].toLowerCase();
        
        // If user is already typing arguments (there is a space), we don't show the command menu
        if (parts.length > 1) {
            this.clearMenu();
            return;
        }
        
        this.filteredCommands = commands.filter(c => c.name.toLowerCase().includes(query));
        
        if (this.selectedIndex >= this.filteredCommands.length) {
            this.selectedIndex = Math.max(0, this.filteredCommands.length - 1);
        }

        let output = '\n';
        
        if (this.filteredCommands.length === 0) {
            output += `  ${Colors.DIM}Aucune commande trouvée.${Colors.RESET}\n`;
            this.menuLines = 2;
        } else {
            const displayLimit = 6;
            const startIdx = Math.max(0, this.selectedIndex - Math.floor(displayLimit / 2));
            const endIdx = Math.min(this.filteredCommands.length, startIdx + displayLimit);
            
            for (let i = startIdx; i < endIdx; i++) {
                const cmd = this.filteredCommands[i];
                if (i === this.selectedIndex) {
                    output += `  ${Colors.SOFT_GREEN}❯ /${cmd.name.padEnd(15)} ${Colors.DIM}- ${cmd.description}${Colors.RESET}\n`;
                } else {
                    output += `    /${cmd.name.padEnd(15)} ${Colors.DIM}- ${cmd.description}${Colors.RESET}\n`;
                }
            }
            
            if (endIdx < this.filteredCommands.length) {
                output += `    ${Colors.DIM}... et ${this.filteredCommands.length - endIdx} autres${Colors.RESET}\n`;
                this.menuLines = (endIdx - startIdx) + 2;
            } else {
                this.menuLines = (endIdx - startIdx) + 1;
            }
        }

        // \x1b7: Save cursor
        // \x1b[J: Clear screen down
        // \x1b8: Restore cursor
        process.stdout.write(`\x1b7\x1b[J${output}\x1b8`);
    }

    clearMenu() {
        if (this.menuLines > 0 && process.stdout.isTTY) {
            process.stdout.write(`\x1b7\x1b[J\x1b8`);
            this.menuLines = 0;
        }
    }

    async start() {
        // Pre-fetch registry for fast autocomplete
        this.getRegistry().catch(() => {});

        console.log(`\n${Colors.GHOST}${Colors.BOLD}👻 Ghost CLI Modern Shell v1.0.0${Colors.RESET}`);
        console.log(`${Colors.DIM}Tapez ${Colors.RESET}/${Colors.DIM} pour ouvrir le menu interactif ou posez une question en langage naturel.${Colors.RESET}\n`);

        if (process.stdin.isTTY) {
            readline.emitKeypressEvents(process.stdin);
            process.stdin.setRawMode(true);
        }

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: `${Colors.GHOST}ghost> ${Colors.RESET}`,
            completer: () => [[], this.rl.line] // Disable default completer
        });

        // Intercept keys for the visual dropdown menu
        process.stdin.prependListener('keypress', (str, key) => {
            if (!key) return;

            // Handle exit shortcuts
            if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
                process.exit(0);
            }

            if (this.rl.line.startsWith('/')) {
                const hasSpace = this.rl.line.includes(' ');
                
                if (!hasSpace) {
                    if (key.name === 'up') {
                        if (this.filteredCommands.length > 0) {
                            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
                            this.renderMenu(this.rl.line);
                        }
                        key.name = 'null'; // Stop readline processing (history)
                    } else if (key.name === 'down') {
                        if (this.filteredCommands.length > 0) {
                            this.selectedIndex = Math.min(this.filteredCommands.length - 1, this.selectedIndex + 1);
                            this.renderMenu(this.rl.line);
                        }
                        key.name = 'null'; // Stop readline processing (history)
                    } else if (key.name === 'tab' || key.name === 'right') {
                        if (this.filteredCommands.length > 0) {
                            const selectedCmd = this.filteredCommands[this.selectedIndex];
                            // clear line using internal readline methods safely
                            this.rl.write(null, {ctrl: true, name: 'u'}); 
                            this.rl.write('/' + selectedCmd.name + ' ');
                            this.clearMenu();
                        }
                        key.name = 'null'; // Prevent default tab
                    }
                }
            }

            if (key.name === 'return') {
                this.clearMenu();
            } else if (key.name !== 'null') {
                // Let readline process the key, then update the menu
                setImmediate(() => {
                    if (this.rl.line.startsWith('/')) {
                        if (key.name !== 'up' && key.name !== 'down') {
                            this.selectedIndex = 0; // Reset index on type
                        }
                        this.renderMenu(this.rl.line);
                    } else {
                        this.clearMenu();
                    }
                });
            }
        });

        this.rl.prompt();

        this.rl.on('line', async (line) => {
            const input = line.trim();
            this.clearMenu();
            
            if (!input) {
                this.rl.prompt();
                return;
            }

            if (input === '/clear') {
                console.clear();
                this.rl.prompt();
                return;
            }

            if (input.startsWith('/')) {
                await this.handleSlashCommand(input.substring(1));
            } else {
                await this.handleNaturalLanguage(input);
            }

            this.rl.prompt();
        });

        return new Promise((resolve) => {
            this.rl.on('close', () => {
                this.clearMenu();
                console.log(`\n${Colors.DIM}Fermeture du terminal Ghost. À bientôt !${Colors.RESET}`);
                resolve({ success: true, output: "" });
                setTimeout(() => process.exit(0), 100);
            });
        });
    }

    async handleSlashCommand(input) {
        const [cmd, ...args] = input.split(' ');
        
        if (cmd === 'help' || cmd === '?') {
            await this.showHelp();
            return;
        }

        const registry = await this.getRegistry();
        const extension = registry.find(ext => {
            const id = ext.id.toLowerCase();
            const targetId = id.replace('ghost-', '').replace('-extension', '');
            return targetId === cmd.toLowerCase() || id === cmd.toLowerCase();
        });
        
        if (extension) {
            console.log(`${Colors.DIM}Exécution de ${Colors.SOFT_GREEN}${extension.id}${Colors.RESET}...\n`);
            try {
                const result = await this.sdk.emitIntent({
                    type: 'extension',
                    operation: 'call',
                    params: {
                        extensionId: extension.id,
                        method: cmd,
                        params: { subcommand: args[0], args: args.slice(1) }
                    }
                });
                
                if (result && result.output) {
                    console.log(result.output);
                } else if (result) {
                    console.log(JSON.stringify(result, null, 2));
                }
            } catch (e) {
                console.error(`${Colors.BOLD}Erreur :${Colors.RESET} ${e.message}`);
            }
        } else {
            console.log(`${Colors.DIM}Commande inconnue : /${cmd}. Tapez /help pour la liste.${Colors.RESET}`);
        }
    }

    async handleNaturalLanguage(input) {
        console.log(`${Colors.DIM}Analyse en cours...${Colors.RESET}`);
        try {
            const result = await this.sdk.emitIntent({
                type: 'extension',
                operation: 'call',
                params: {
                    extensionId: 'ghost-agent-extension',
                    method: 'solve',
                    params: { prompt: input }
                }
            });
            console.log(result.output || JSON.stringify(result, null, 2));
        } catch (e) {
            console.log(`${Colors.DIM}L'agent IA n'est pas disponible pour le moment.${Colors.RESET}`);
        }
    }

    async showHelp() {
        console.log(`\n${Colors.BOLD}Commandes Disponibles :${Colors.RESET}`);
        const cmds = this.getAvailableCommands();
        cmds.forEach(cmd => {
            console.log(`  ${Colors.SOFT_BLUE}/${cmd.name.padEnd(15)}${Colors.RESET} ${Colors.DIM}${cmd.description}${Colors.RESET}`);
        });
        console.log('');
    }
}

const shell = new GhostInteractiveShell();

class ExtensionWrapper {
    constructor() { this.sdk = shell.sdk; }
    async init(opts) { return await shell.init(opts); }
    async start(opts) { return await shell.start(opts); }
    async handleRPCRequest(req) {
        if (req.method === 'invoke') return await shell.start(req.params);
        return { error: 'Method not found' };
    }
}

if (require.main === module) {
    new ExtensionRunner(new ExtensionWrapper()).start();
}

module.exports = ExtensionWrapper;
