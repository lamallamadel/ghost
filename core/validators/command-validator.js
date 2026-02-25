const { execFileSync } = require('child_process');

class CommandValidator {
    constructor(options = {}) {
        this.allowedCommands = options.allowedCommands || ['git'];
        this.allowedGitSubcommands = options.allowedGitSubcommands || [
            'status', 'diff', 'log', 'show', 'branch', 'tag', 'rev-parse',
            'describe', 'ls-files', 'ls-tree', 'cat-file', 'config',
            'remote', 'fetch', 'pull', 'push', 'checkout', 'add', 'commit',
            'merge', 'rebase', 'reset', 'stash', 'clean'
        ];
        this.deniedArguments = options.deniedArguments || [
            '--exec', '-c', 'core.sshCommand', 'core.gitProxy'
        ];
        this.maxArgumentLength = options.maxArgumentLength || 1000;
        this.allowShellExpansion = options.allowShellExpansion || false;
    }

    addAllowedCommand(command) {
        if (command && !this.allowedCommands.includes(command)) {
            this.allowedCommands.push(command);
        }
    }

    addAllowedGitSubcommand(subcommand) {
        if (subcommand && !this.allowedGitSubcommands.includes(subcommand)) {
            this.allowedGitSubcommands.push(subcommand);
        }
    }

    addDeniedArgument(argument) {
        if (argument && !this.deniedArguments.includes(argument)) {
            this.deniedArguments.push(argument);
        }
    }

    hasInjectionAttempt(input) {
        if (!input || typeof input !== 'string') {
            return false;
        }

        const dangerousPatterns = [
            /[;&|`$(){}[\]<>]/,
            /\$\(/,
            /\$\{/,
            /`.*`/,
            /\|\|/,
            /&&/,
            />\s*&/,
            /2>&1/,
            /[\r\n]/,
            /\x00/
        ];

        return dangerousPatterns.some(pattern => pattern.test(input));
    }

    hasPathTraversal(input) {
        if (!input || typeof input !== 'string') {
            return false;
        }

        const traversalPatterns = [
            /\.\./,
            /\.\.[\\/]/,
            /[\\/]\.\./
        ];

        return traversalPatterns.some(pattern => pattern.test(input));
    }

    sanitizeArgument(argument) {
        if (!argument || typeof argument !== 'string') {
            return '';
        }

        if (argument.length > this.maxArgumentLength) {
            throw new Error(`Argument exceeds maximum length of ${this.maxArgumentLength}`);
        }

        if (this.hasInjectionAttempt(argument)) {
            throw new Error(`Potential command injection detected in argument: ${argument}`);
        }

        return argument;
    }

    validateGitCommand(subcommand, args = []) {
        if (!subcommand || typeof subcommand !== 'string') {
            return {
                valid: false,
                reason: 'Invalid git subcommand'
            };
        }

        const normalizedSubcommand = subcommand.toLowerCase().trim();

        if (!this.allowedGitSubcommands.includes(normalizedSubcommand)) {
            return {
                valid: false,
                reason: `Git subcommand '${subcommand}' not allowed`
            };
        }

        for (const arg of args) {
            if (typeof arg !== 'string') {
                return {
                    valid: false,
                    reason: 'All arguments must be strings'
                };
            }

            if (arg.length > this.maxArgumentLength) {
                return {
                    valid: false,
                    reason: `Argument exceeds maximum length: ${arg.substring(0, 50)}...`
                };
            }

            if (this.hasInjectionAttempt(arg)) {
                return {
                    valid: false,
                    reason: `Potential command injection in argument: ${arg}`
                };
            }

            for (const deniedArg of this.deniedArguments) {
                if (arg.includes(deniedArg) || arg === deniedArg) {
                    return {
                        valid: false,
                        reason: `Denied argument detected: ${deniedArg}`
                    };
                }
            }
        }

        return {
            valid: true,
            reason: 'Git command validation passed'
        };
    }

    validateCommand(command, args = []) {
        if (!command || typeof command !== 'string') {
            return {
                valid: false,
                reason: 'Invalid command'
            };
        }

        const normalizedCommand = command.toLowerCase().trim();

        if (!this.allowedCommands.includes(normalizedCommand)) {
            return {
                valid: false,
                reason: `Command '${command}' not in allowed list`
            };
        }

        if (normalizedCommand === 'git') {
            if (args.length === 0) {
                return {
                    valid: false,
                    reason: 'Git command requires subcommand'
                };
            }
            return this.validateGitCommand(args[0], args.slice(1));
        }

        for (const arg of args) {
            if (typeof arg !== 'string') {
                return {
                    valid: false,
                    reason: 'All arguments must be strings'
                };
            }

            if (arg.length > this.maxArgumentLength) {
                return {
                    valid: false,
                    reason: `Argument exceeds maximum length: ${arg.substring(0, 50)}...`
                };
            }

            if (this.hasInjectionAttempt(arg)) {
                return {
                    valid: false,
                    reason: `Potential command injection in argument: ${arg}`
                };
            }
        }

        return {
            valid: true,
            reason: 'Command validation passed'
        };
    }

    executeGitCommand(subcommand, args = [], options = {}) {
        const validation = this.validateGitCommand(subcommand, args);
        
        if (!validation.valid) {
            throw new Error(`Git command validation failed: ${validation.reason}`);
        }

        const sanitizedArgs = args.map(arg => this.sanitizeArgument(arg));
        const fullArgs = [subcommand, ...sanitizedArgs];

        try {
            const result = execFileSync('git', fullArgs, {
                encoding: 'utf8',
                maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
                timeout: options.timeout || 30000,
                shell: false,
                ...options
            });
            return result.trim();
        } catch (error) {
            throw new Error(`Git command execution failed: ${error.message}`);
        }
    }

    executeCommand(command, args = [], options = {}) {
        const validation = this.validateCommand(command, args);
        
        if (!validation.valid) {
            throw new Error(`Command validation failed: ${validation.reason}`);
        }

        if (command.toLowerCase() === 'git') {
            if (args.length === 0) {
                throw new Error('Git command requires subcommand');
            }
            return this.executeGitCommand(args[0], args.slice(1), options);
        }

        const sanitizedArgs = args.map(arg => this.sanitizeArgument(arg));

        try {
            const result = execFileSync(command, sanitizedArgs, {
                encoding: 'utf8',
                maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
                timeout: options.timeout || 30000,
                shell: false,
                ...options
            });
            return result.trim();
        } catch (error) {
            throw new Error(`Command execution failed: ${error.message}`);
        }
    }

    buildGitCommand(subcommand, params = {}) {
        const args = [subcommand];

        for (const [key, value] of Object.entries(params)) {
            if (value === true) {
                args.push(`--${key}`);
            } else if (value !== false && value !== null && value !== undefined) {
                args.push(`--${key}`);
                args.push(String(value));
            }
        }

        return args;
    }

    executeGitCommandWithParams(subcommand, params = {}, options = {}) {
        const args = this.buildGitCommand(subcommand, params);
        return this.executeGitCommand(subcommand, args.slice(1), options);
    }

    static validateFromManifest(command, args = [], manifestCapabilities = {}) {
        if (!command || typeof command !== 'string') {
            return {
                valid: false,
                reason: 'Invalid command'
            };
        }

        const normalizedCommand = command.toLowerCase().trim();

        if (normalizedCommand === 'git') {
            if (!args || args.length === 0) {
                return {
                    valid: false,
                    reason: 'Git command requires subcommand'
                };
            }

            const subcommand = args[0];
            const gitCapabilities = manifestCapabilities.git || {};

            const readOnlyCommands = [
                'status', 'diff', 'log', 'show', 'branch', 'tag', 'rev-parse',
                'describe', 'ls-files', 'ls-tree', 'cat-file', 'config', 'remote'
            ];

            const writeCommands = [
                'fetch', 'pull', 'push', 'checkout', 'add', 'commit',
                'merge', 'rebase', 'reset', 'stash', 'clean'
            ];

            const isReadCommand = readOnlyCommands.includes(subcommand);
            const isWriteCommand = writeCommands.includes(subcommand);

            if (!isReadCommand && !isWriteCommand) {
                return {
                    valid: false,
                    reason: `Unknown git subcommand: ${subcommand}`
                };
            }

            if (isReadCommand && !gitCapabilities.read) {
                return {
                    valid: false,
                    reason: `Git read permission required for '${subcommand}' but not granted in manifest`
                };
            }

            if (isWriteCommand && !gitCapabilities.write) {
                return {
                    valid: false,
                    reason: `Git write permission required for '${subcommand}' but not granted in manifest`
                };
            }

            return {
                valid: true,
                reason: 'Git command authorized by manifest'
            };
        }

        const permissions = manifestCapabilities.permissions || [];
        if (!permissions.includes('process:spawn')) {
            return {
                valid: false,
                reason: `Command '${command}' requires process:spawn permission in manifest`
            };
        }

        return {
            valid: true,
            reason: 'Command authorized by manifest'
        };
    }

    static createDefault() {
        return new CommandValidator({
            allowedCommands: ['git'],
            allowedGitSubcommands: [
                'status', 'diff', 'log', 'show', 'branch', 'tag', 'rev-parse',
                'describe', 'ls-files', 'ls-tree', 'cat-file', 'config',
                'remote', 'fetch'
            ],
            deniedArguments: [
                '--exec', '-c', 'core.sshCommand', 'core.gitProxy'
            ],
            maxArgumentLength: 1000,
            allowShellExpansion: false
        });
    }

    static createReadOnly() {
        return new CommandValidator({
            allowedCommands: ['git'],
            allowedGitSubcommands: [
                'status', 'diff', 'log', 'show', 'branch', 'tag', 'rev-parse',
                'describe', 'ls-files', 'ls-tree', 'cat-file', 'config'
            ],
            deniedArguments: [
                '--exec', '-c', 'core.sshCommand', 'core.gitProxy',
                'push', 'pull', 'fetch'
            ],
            maxArgumentLength: 1000,
            allowShellExpansion: false
        });
    }

    static createPermissive() {
        return new CommandValidator({
            allowedCommands: ['git'],
            allowedGitSubcommands: [
                'status', 'diff', 'log', 'show', 'branch', 'tag', 'rev-parse',
                'describe', 'ls-files', 'ls-tree', 'cat-file', 'config',
                'remote', 'fetch', 'pull', 'push', 'checkout', 'add', 'commit',
                'merge', 'rebase', 'reset', 'stash', 'clean'
            ],
            deniedArguments: [
                '--exec', '-c', 'core.sshCommand', 'core.gitProxy'
            ],
            maxArgumentLength: 2000,
            allowShellExpansion: false
        });
    }
}

module.exports = CommandValidator;
