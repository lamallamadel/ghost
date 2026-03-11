#!/usr/bin/env node

const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GHOST: '\x1b[38;5;141m',
    SOFT_GREEN: '\x1b[38;5;120m',
    SOFT_BLUE: '\x1b[38;5;117m',
    YELLOW: '\x1b[33m',
    DIM: '\x1b[2m',
    BOLD: '\x1b[1m',
    RESET: '\x1b[0m'
};

class ExtensionFlowFactory {
    constructor() {
        this.sdk = new ExtensionSDK('ghost-extflo-extension');
        this.registry = new Map();
        this.activeExtensions = new Map();
        this.loadingLocks = new Set();
        
        this.projectRoot = path.resolve(__dirname, '../../..');
        this.lockPath = path.join(this.projectRoot, 'extensions.lock.json');
        this.isBooted = false;
    }

    async init() {
        // Instant response to avoid Gateway deadlock during JIT
        return { success: true };
    }

    async _ensureRegistry() {
        if (this.registry.size > 0) return;
        const allExtensions = await this.sdk.emitIntent({ type: 'system', operation: 'registry' });
        for (const ext of allExtensions) {
            this.registry.set(ext.id, ext);
        }
    }

    async _loadLockfile() {
        try {
            if (await this.sdk.requestFileExists(this.lockPath)) {
                return await this.sdk.requestFileReadJSON(this.lockPath);
            }
        } catch (e) {}
        return null;
    }

    /**
     * THE POWER: Deterministic boot with real-time feedback
     */
    async bootShell(params) {
        if (!process.stdout.isTTY) {
            return await this.sdk.emitIntent({ type: 'system', operation: 'run-shell', params });
        }

        console.log(`\n${Colors.GHOST}${Colors.BOLD}👻 Ghost Sovereign AI Platform${Colors.RESET}`);
        
        const lockfile = await this._loadLockfile();
        const criticalExts = lockfile ? lockfile.extensions.map(e => e.id) : ['ghost-security-extension', 'ghost-policy-extension'];

        let currentExt = '';
        const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let s = 0;
        
        const draw = () => {
            process.stdout.write(`\r${Colors.GHOST}Orchestrating${Colors.RESET} ${Colors.SOFT_GREEN}${spinner[s++]}${Colors.RESET} ${Colors.DIM}${currentExt.padEnd(30)}${Colors.RESET}`);
            s %= spinner.length;
        };

        const interval = setInterval(draw, 80);

        try {
            // 1. Validation de la Policy
            currentExt = 'Validating Sovereignty...';
            await this.sdk.emitIntent({
                type: 'extension',
                operation: 'call',
                params: {
                    extensionId: 'ghost-policy-extension',
                    method: 'policy.verify-plan',
                    params: { plan: criticalExts }
                }
            });

            // 2. Chargement réel de la pile JIT
            for (const extId of criticalExts) {
                if (extId === 'ghost-extflo-extension') continue;
                currentExt = `Loading ${extId.replace('ghost-', '')}...`;
                await this.load(extId, { strategy: 'eager' });
            }

            clearInterval(interval);
            process.stdout.write(`\r${Colors.GHOST}Sovereign Stack Ready. Starting Shell...${Colors.RESET}${' '.repeat(40)}\n`);
            
            // 3. Delegation to Shell
            return await this.sdk.emitIntent({
                type: 'system',
                operation: 'run-shell',
                params
            });

        } catch (e) {
            clearInterval(interval);
            console.error(`\n${Colors.YELLOW}Orchestration Error: ${e.message}${Colors.RESET}`);
            process.exit(1);
        }
    }

    async load(extensionId, options = {}) {
        await this._ensureRegistry();
        
        if (this.activeExtensions.get(extensionId) === 'RUNNING') return { success: true };
        
        // Simuler le travail OS via ghost-process-extension (Semafore)
        await this.sdk.emitIntent({
            type: 'extension',
            operation: 'call',
            params: {
                extensionId: 'ghost-process-extension',
                method: 'start',
                params: { args: [extensionId.replace('ghost-', '').replace('-extension', '')] }
            }
        }).catch(() => {}); // On continue si déjà locké

        // Handshake JIT avec la Gateway
        await this.sdk.emitIntent({
            type: 'extension',
            operation: 'call',
            params: {
                extensionId,
                method: 'init', // Juste pour forcer le spawn JIT si pas encore fait
                params: {}
            }
        });

        this.activeExtensions.set(extensionId, 'RUNNING');
        return { success: true };
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;

        if (method === 'boot-shell') return await this.bootShell(params);
        if (method === 'extflo') {
             if (params.subcommand === 'plan') {
                 const lock = await this._loadLockfile();
                 return { success: true, output: JSON.stringify(lock, null, 2) };
             }
        }
        return { success: true };
    }
}

const factory = new ExtensionFlowFactory();

if (require.main === module) {
    const wrapper = {
        init: (opts) => factory.init(opts),
        handleRPCRequest: (req) => factory.handleRPCRequest(req)
    };
    new ExtensionRunner(wrapper).start();
}

module.exports = { ExtensionFlowFactory };

