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

    completer(line) {
        if (!line.startsWith('/')) return [[], line];
        
        const registry = this.cachedRegistry || [];
        const commands = ['/help', ...registry
            .filter(ext => ext.id !== 'ghost-cli-extension' && ext.id !== 'ghost-extflo-extension')
            .map(ext => '/' + ext.id.replace('ghost-', '').replace('-extension', ''))];
        
        const hits = commands.filter(c => c.startsWith(line));
        // Show hits if any, otherwise show all commands
        return [hits.length ? hits : commands, line];
    }

    async start() {
        // Fire and forget registry fetch so autocomplete is ready soon
        this.getRegistry().catch(() => {});

        console.log(`\n${Colors.GHOST}${Colors.BOLD}Ghost CLI Modern Shell v1.0.0${Colors.RESET}`);
        console.log(`${Colors.DIM}Type ${Colors.RESET}/${Colors.DIM} and press ${Colors.BOLD}TAB${Colors.RESET}${Colors.DIM} to see commands or just talk to me.${Colors.RESET}\n`);

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: `${Colors.GHOST}ghost 👻 ${Colors.RESET}`,
            completer: (line) => this.completer(line)
        });

        this.rl.prompt();

        this.rl.on('line', async (line) => {
            const input = line.trim();
            
            if (!input) {
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

        // Resolve ONLY when the shell session ends to keep the parent process actively awaiting
        return new Promise((resolve) => {
            this.rl.on('close', () => {
                console.log(`\n${Colors.DIM}Exiting Ghost Shell. Goodbye!${Colors.RESET}`);
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
            return id.includes(cmd.toLowerCase());
        });
        
        if (extension) {
            console.log(`${Colors.DIM}Routing to ${Colors.SOFT_GREEN}${extension.id}${Colors.RESET}...\n`);
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
                console.error(`${Colors.BOLD}Error:${Colors.RESET} ${e.message}`);
            }
        } else {
            console.log(`${Colors.DIM}Unknown command: ${cmd}. Type /help for list.${Colors.RESET}`);
        }
    }

    async handleNaturalLanguage(input) {
        console.log(`${Colors.DIM}Thinking...${Colors.RESET}`);
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
            console.log(`${Colors.DIM}I can't process natural language right now. Use /help.${Colors.RESET}`);
        }
    }

    async showHelp() {
        console.log(`\n${Colors.BOLD}Available Commands:${Colors.RESET}`);
        const registry = await this.getRegistry();
        
        registry.forEach(ext => {
            if (ext.id === 'ghost-cli-extension' || ext.id === 'ghost-extflo-extension') return;
            const shortName = ext.id.replace('ghost-', '').replace('-extension', '');
            console.log(`  ${Colors.SOFT_BLUE}/${shortName.padEnd(15)}${Colors.RESET} ${Colors.DIM}via ${ext.id}${Colors.RESET}`);
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
