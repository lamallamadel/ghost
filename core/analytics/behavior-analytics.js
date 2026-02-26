const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class BehaviorAnalytics extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            persistenceDir: options.persistenceDir || path.join(require('os').homedir(), '.ghost', 'analytics'),
            ...options
        };

        this.commands = new Map();
        this.workflows = [];
        this.sequences = new Map();
        this.sessionCommands = [];
        this.lastCommandTime = null;
        this.workflowTimeout = options.workflowTimeout || 300000;
    }

    recordCommand(command, extensionId, context = {}) {
        const timestamp = Date.now();
        const commandEvent = {
            command,
            extensionId,
            timestamp,
            timestampISO: new Date(timestamp).toISOString(),
            context: this._sanitizeContext(context)
        };

        this.sessionCommands.push(commandEvent);

        this._updateCommandMetrics(command, extensionId);
        this._detectWorkflow(commandEvent);

        this.emit('command-recorded', commandEvent);

        return commandEvent;
    }

    getMostUsedCommands(limit = 10) {
        const commandStats = Array.from(this.commands.entries())
            .map(([command, stats]) => ({
                command,
                ...stats
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);

        return commandStats;
    }

    getMostUsedExtensions(limit = 10) {
        const extensionStats = new Map();

        for (const [command, stats] of this.commands) {
            for (const [extensionId, count] of Object.entries(stats.byExtension)) {
                if (!extensionStats.has(extensionId)) {
                    extensionStats.set(extensionId, {
                        extensionId,
                        commandCount: 0,
                        commands: []
                    });
                }
                const extStats = extensionStats.get(extensionId);
                extStats.commandCount += count;
                extStats.commands.push({ command, count });
            }
        }

        return Array.from(extensionStats.values())
            .sort((a, b) => b.commandCount - a.commandCount)
            .slice(0, limit);
    }

    getCommonWorkflows(minLength = 2, limit = 10) {
        const workflowPatterns = new Map();

        for (const workflow of this.workflows) {
            if (workflow.commands.length < minLength) continue;

            const pattern = workflow.commands
                .map(c => c.command)
                .join(' → ');

            if (!workflowPatterns.has(pattern)) {
                workflowPatterns.set(pattern, {
                    pattern,
                    commands: workflow.commands.map(c => c.command),
                    count: 0,
                    avgDuration: 0,
                    durations: []
                });
            }

            const patternStats = workflowPatterns.get(pattern);
            patternStats.count++;
            patternStats.durations.push(workflow.duration);
        }

        for (const [pattern, stats] of workflowPatterns) {
            stats.avgDuration = stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
            delete stats.durations;
        }

        return Array.from(workflowPatterns.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    getCommandSequences(command, limit = 5) {
        const sequenceKey = `seq:${command}`;
        const sequences = this.sequences.get(sequenceKey) || new Map();

        return Array.from(sequences.entries())
            .map(([nextCommand, count]) => ({
                command,
                nextCommand,
                count,
                probability: 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit)
            .map((seq, idx, arr) => {
                const total = arr.reduce((sum, s) => sum + s.count, 0);
                seq.probability = Math.round((seq.count / total) * 10000) / 100;
                return seq;
            });
    }

    getSessionAnalytics() {
        if (this.sessionCommands.length === 0) {
            return {
                commandCount: 0,
                uniqueCommands: 0,
                uniqueExtensions: 0,
                duration: 0,
                commands: [],
                extensions: []
            };
        }

        const firstCommand = this.sessionCommands[0];
        const lastCommand = this.sessionCommands[this.sessionCommands.length - 1];
        const duration = lastCommand.timestamp - firstCommand.timestamp;

        const uniqueCommands = new Set(this.sessionCommands.map(c => c.command));
        const uniqueExtensions = new Set(this.sessionCommands.map(c => c.extensionId));

        const commandCounts = new Map();
        const extensionCounts = new Map();

        for (const cmd of this.sessionCommands) {
            commandCounts.set(cmd.command, (commandCounts.get(cmd.command) || 0) + 1);
            extensionCounts.set(cmd.extensionId, (extensionCounts.get(cmd.extensionId) || 0) + 1);
        }

        return {
            commandCount: this.sessionCommands.length,
            uniqueCommands: uniqueCommands.size,
            uniqueExtensions: uniqueExtensions.size,
            duration,
            durationFormatted: this._formatDuration(duration),
            commands: Array.from(commandCounts.entries())
                .map(([command, count]) => ({ command, count }))
                .sort((a, b) => b.count - a.count),
            extensions: Array.from(extensionCounts.entries())
                .map(([extensionId, count]) => ({ extensionId, count }))
                .sort((a, b) => b.count - a.count)
        };
    }

    getPredictedNextCommands(currentCommand, limit = 3) {
        const sequences = this.getCommandSequences(currentCommand, limit);
        return sequences.map(seq => ({
            command: seq.nextCommand,
            probability: seq.probability
        }));
    }

    async persist() {
        const filepath = path.join(this.options.persistenceDir, 'behavior-analytics.json');
        
        const data = {
            timestamp: Date.now(),
            commands: Array.from(this.commands.entries()),
            workflows: this.workflows,
            sequences: Array.from(this.sequences.entries())
        };

        try {
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
            this.emit('persisted', { filepath });
        } catch (error) {
            this.emit('persist-error', { error: error.message });
            console.error(`[BehaviorAnalytics] Failed to persist: ${error.message}`);
        }
    }

    async load() {
        const filepath = path.join(this.options.persistenceDir, 'behavior-analytics.json');
        
        if (!fs.existsSync(filepath)) {
            return;
        }

        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const data = JSON.parse(content);

            this.commands = new Map(data.commands);
            this.workflows = data.workflows || [];
            this.sequences = new Map(data.sequences.map(([key, value]) => [key, new Map(value)]));

            this.emit('loaded', { filepath });
        } catch (error) {
            this.emit('load-error', { error: error.message });
            console.error(`[BehaviorAnalytics] Failed to load: ${error.message}`);
        }
    }

    _updateCommandMetrics(command, extensionId) {
        if (!this.commands.has(command)) {
            this.commands.set(command, {
                count: 0,
                firstSeen: Date.now(),
                lastSeen: null,
                byExtension: {}
            });
        }

        const commandStats = this.commands.get(command);
        commandStats.count++;
        commandStats.lastSeen = Date.now();
        commandStats.byExtension[extensionId] = (commandStats.byExtension[extensionId] || 0) + 1;

        this._updateSequences(command);
    }

    _updateSequences(command) {
        if (this.sessionCommands.length < 2) {
            return;
        }

        const prevCommand = this.sessionCommands[this.sessionCommands.length - 2];
        const timeDiff = Date.now() - prevCommand.timestamp;

        if (timeDiff < this.workflowTimeout) {
            const sequenceKey = `seq:${prevCommand.command}`;
            if (!this.sequences.has(sequenceKey)) {
                this.sequences.set(sequenceKey, new Map());
            }

            const sequences = this.sequences.get(sequenceKey);
            sequences.set(command, (sequences.get(command) || 0) + 1);
        }
    }

    _detectWorkflow(commandEvent) {
        const now = Date.now();

        if (this.lastCommandTime && (now - this.lastCommandTime) > this.workflowTimeout) {
            this._finalizeCurrentWorkflow();
        }

        if (this.sessionCommands.length === 1) {
            this.currentWorkflow = {
                startTime: now,
                commands: [commandEvent]
            };
        } else if (this.currentWorkflow) {
            this.currentWorkflow.commands.push(commandEvent);
        }

        this.lastCommandTime = now;
    }

    _finalizeCurrentWorkflow() {
        if (!this.currentWorkflow || this.currentWorkflow.commands.length === 0) {
            return;
        }

        const workflow = {
            ...this.currentWorkflow,
            endTime: this.lastCommandTime,
            duration: this.lastCommandTime - this.currentWorkflow.startTime,
            commandCount: this.currentWorkflow.commands.length
        };

        this.workflows.push(workflow);
        this.currentWorkflow = null;

        if (this.workflows.length > 10000) {
            this.workflows.shift();
        }
    }

    _sanitizeContext(context) {
        const sanitized = { ...context };
        const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'key'];
        
        for (const key of Object.keys(sanitized)) {
            if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
                sanitized[key] = '[REDACTED]';
            }
        }
        
        return sanitized;
    }

    _formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

module.exports = BehaviorAnalytics;
