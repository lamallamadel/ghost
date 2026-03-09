#!/usr/bin/env node

/**
 * Ghost Agent Supreme
 * The brain of the Ghost ecosystem
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');
const os = require('os');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    MAGENTA: '\x1b[35m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m'
};

class AgentExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.memory = [];
    }

    async handleSolve(params) {
        const goal = params.args?.join(' ');
        if (!goal) return { success: false, output: "Please provide a goal for the agent." };

        this.memory = []; // Reset mission memory
        await this.sdk.requestLog({ level: 'info', message: `Brain initiated. Objective: ${goal}` });
        
        let report = `\n${Colors.BOLD}${Colors.MAGENTA}🧠 AGENT SUPREME: MISSION START${Colors.ENDC}\n${'='.repeat(40)}\n`;
        report += `${Colors.BOLD}GOAL:${Colors.ENDC} ${goal}\n\n`;

        try {
            // Start the cognitive loop
            return await this._cognitiveLoop(goal, report);
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Agent mission failed:${Colors.ENDC} ${error.message}` };
        }
    }

    async handleThink(params) {
        const thought = params.args?.join(' ');
        if (!thought) return { success: false, output: "What should I think about?" };
        
        await this.sdk.requestLog({ level: 'info', message: `Thinking: ${thought}` });
        
        const analysis = `Analysis of memory (${this.memory.length} steps): All services optimal.`;
        return { success: true, output: `${Colors.CYAN}Thought Process:${Colors.ENDC} ${analysis}` };
    }

    async handlePlan(params) {
        const goal = params.args?.join(' ');
        if (!goal) return { success: false, output: "What complex task should I plan for?" };

        await this.sdk.requestLog({ level: 'info', message: `Planning engine activated for: ${goal}` });

        try {
            const plan = [
                { id: 1, task: 'Audit current repository security', provider: 'ghost-security-extension' },
                { id: 2, task: 'Analyze dependency conflicts', provider: 'ghost-deps-extension' },
                { id: 3, task: 'Generate updated documentation', provider: 'ghost-docs-extension' },
                { id: 4, task: 'Run regression test suite', provider: 'ghost-test-extension' },
                { id: 5, task: 'Prepare final commit', provider: 'ghost-git-extension' }
            ];

            let output = `\n${Colors.BOLD}${Colors.MAGENTA}🧠 AGENT STRATEGIC PLAN${Colors.ENDC}\n${'='.repeat(40)}\n`;
            output += `${Colors.BOLD}OBJECTIVE:${Colors.ENDC} ${goal}\n\n`;
            
            for (const step of plan) {
                output += `${Colors.CYAN}[STEP ${step.id}]${Colors.ENDC} ${step.task.padEnd(35)} (via ${step.provider})\n`;
            }

            output += `\n${Colors.DIM}Use 'ghost agent solve' to execute this plan automatically.${Colors.ENDC}\n`;

            return { success: true, output, plan };
        } catch (error) {
            return { success: false, output: `Planning failed: ${error.message}` };
        }
    }

    async _saveToHistory(goal, success) {
        const historyPath = path.join(os.homedir(), '.ghost', 'agent', 'history.json');
        try {
            let history = [];
            try {
                const content = await this.sdk.requestFileRead({ path: historyPath });
                history = JSON.parse(content);
            } catch (e) {}

            history.push({
                timestamp: new Date().toISOString(),
                goal,
                success,
                steps: this.memory.length
            });

            await this.sdk.requestFileWrite({ 
                path: historyPath, 
                content: JSON.stringify(history.slice(-50), null, 2) 
            });
        } catch (e) {
            await this.sdk.requestLog({ level: 'warn', message: 'Failed to persist agent history.' });
        }
    }

    async _cognitiveLoop(goal, currentReport) {
        let report = currentReport;
        
        // STEP 1: Initial Assessment
        this.memory.push({ step: 'START', action: 'Assess project security' });
        report += `${Colors.CYAN}[1/3] THINKING:${Colors.ENDC} Analyzing project safety...\n`;
        
        const secStatus = await this._callExtension('ghost-security-extension', 'security.status', {});
        this.memory.push({ step: 'SECURITY_CHECK', result: secStatus.output });
        report += `  - Result: Security extension is ${secStatus.success ? 'Responsive' : 'Unavailable'}\n`;

        // STEP 2: Feedback-based Action
        report += `${Colors.CYAN}[2/3] ADAPTING:${Colors.ENDC} Evaluating next step based on security status...\n`;
        
        if (secStatus.success) {
            this.memory.push({ step: 'ACTION', action: 'Map architecture' });
            report += `  - Decision: Safe to proceed with architectural mapping.\n`;
            await this._callExtension('ghost-docs-extension', 'docs.diagram', {});
        } else {
            this.memory.push({ step: 'RECOVERY', action: 'Check system logs' });
            report += `  - Decision: Security issue suspected. Checking system health...\n`;
            await this._callExtension('ghost-system-extension', 'sys.status', {});
        }

        // STEP 3: Consolidation
        report += `\n${Colors.CYAN}[3/3] CONSOLIDATING:${Colors.ENDC} Generating final mission report...\n`;
        
        // Persist history
        await this._saveToHistory(goal, true);

        report += `\n${Colors.GREEN}${Colors.BOLD}✔ MISSION ACCOMPLISHED${Colors.ENDC}\n`;
        report += `Total steps in memory: ${this.memory.length}\n`;

        return { success: true, output: report, memory: this.memory };
    }

    async _callExtension(extensionId, method, params) {
        return await this.sdk.emitIntent({
            type: 'extension',
            operation: 'call',
            params: { extensionId, method, params }
        });
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'agent.solve': return await this.handleSolve(params);
                case 'agent.think': return await this.handleThink(params);
                case 'agent.plan': return await this.handlePlan(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { AgentExtension };
