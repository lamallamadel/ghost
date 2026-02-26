const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const RUNBOOK_DIR = path.join(os.homedir(), '.ghost', 'runbooks');
const RUNBOOK_LOG_DIR = path.join(os.homedir(), '.ghost', 'runbook-logs');
const INTEGRATION_CONFIG = path.join(os.homedir(), '.ghost', 'config', 'alerting-config.json');

class RunbookAutomation {
    constructor(runtime, advancedRateLimiting, circuitBreaker, telemetry, options = {}) {
        this.runtime = runtime;
        this.advancedRateLimiting = advancedRateLimiting;
        this.circuitBreaker = circuitBreaker;
        this.telemetry = telemetry;
        this.enabled = options.enabled !== false;
        this.integrationConfig = this._loadIntegrationConfig();
        
        this.runbooks = new Map();
        this.executionHistory = [];
        this.maxHistorySize = 1000;
        
        this._ensureDirectories();
        this._registerDefaultRunbooks();
    }

    _ensureDirectories() {
        try {
            if (!fs.existsSync(RUNBOOK_DIR)) {
                fs.mkdirSync(RUNBOOK_DIR, { recursive: true });
            }
            if (!fs.existsSync(RUNBOOK_LOG_DIR)) {
                fs.mkdirSync(RUNBOOK_LOG_DIR, { recursive: true });
            }
        } catch (error) {
            console.error('[RunbookAutomation] Failed to create directories:', error.message);
        }
    }

    _loadIntegrationConfig() {
        try {
            if (fs.existsSync(INTEGRATION_CONFIG)) {
                return JSON.parse(fs.readFileSync(INTEGRATION_CONFIG, 'utf8'));
            }
        } catch (error) {
            console.error('[RunbookAutomation] Failed to load integration config:', error.message);
        }
        return {
            pagerduty: { enabled: false },
            opsgenie: { enabled: false }
        };
    }

    _registerDefaultRunbooks() {
        this.registerRunbook('restart_failed_extension', {
            name: 'Restart Failed Extension',
            description: 'Restart an extension that has failed or crashed',
            triggers: ['extension_failed', 'extension_crashed'],
            autoExecute: true,
            steps: [
                { action: 'validate_extension', params: ['extensionId'] },
                { action: 'stop_extension', params: ['extensionId'] },
                { action: 'wait', params: [2000] },
                { action: 'start_extension', params: ['extensionId'] },
                { action: 'verify_health', params: ['extensionId'] }
            ]
        });

        this.registerRunbook('clear_rate_limit_state', {
            name: 'Clear Rate Limit State',
            description: 'Reset rate limiting state for an extension',
            triggers: ['rate_limit_stuck', 'false_rate_limit'],
            autoExecute: false,
            steps: [
                { action: 'check_rate_limit_state', params: ['extensionId'] },
                { action: 'backup_rate_limit_state', params: ['extensionId'] },
                { action: 'reset_rate_limiter', params: ['extensionId'] },
                { action: 'verify_rate_limit_cleared', params: ['extensionId'] }
            ]
        });

        this.registerRunbook('reset_circuit_breaker', {
            name: 'Reset Circuit Breaker',
            description: 'Force reset a stuck circuit breaker',
            triggers: ['circuit_breaker_stuck_open'],
            autoExecute: false,
            steps: [
                { action: 'check_circuit_state', params: ['extensionId'] },
                { action: 'log_circuit_history', params: ['extensionId'] },
                { action: 'force_close_circuit', params: ['extensionId'] },
                { action: 'test_circuit_recovery', params: ['extensionId'] }
            ]
        });

        this.registerRunbook('scale_rate_limits', {
            name: 'Scale Rate Limits',
            description: 'Dynamically adjust rate limits based on load',
            triggers: ['high_load_detected', 'capacity_threshold_reached'],
            autoExecute: true,
            steps: [
                { action: 'analyze_current_load', params: [] },
                { action: 'calculate_new_limits', params: [] },
                { action: 'apply_rate_limit_adjustments', params: ['newLimits'] },
                { action: 'monitor_impact', params: [300000] }
            ]
        });

        this.registerRunbook('cleanup_stuck_requests', {
            name: 'Cleanup Stuck Requests',
            description: 'Clear requests that have been pending too long',
            triggers: ['pending_request_timeout'],
            autoExecute: true,
            steps: [
                { action: 'identify_stuck_requests', params: ['extensionId'] },
                { action: 'log_stuck_requests', params: ['extensionId'] },
                { action: 'terminate_stuck_requests', params: ['extensionId'] },
                { action: 'verify_cleanup', params: ['extensionId'] }
            ]
        });
    }

    registerRunbook(id, runbook) {
        this.runbooks.set(id, {
            id,
            ...runbook,
            registeredAt: Date.now()
        });
    }

    async executeRunbook(runbookId, context = {}) {
        if (!this.enabled) {
            throw new Error('Runbook automation is disabled');
        }

        const runbook = this.runbooks.get(runbookId);
        if (!runbook) {
            throw new Error(`Runbook ${runbookId} not found`);
        }

        const executionId = `${runbookId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const execution = {
            id: executionId,
            runbookId,
            runbookName: runbook.name,
            startTime: Date.now(),
            endTime: null,
            status: 'running',
            context,
            steps: [],
            result: null,
            error: null
        };

        this.executionHistory.push(execution);
        if (this.executionHistory.length > this.maxHistorySize) {
            this.executionHistory.shift();
        }

        this._notifyIntegrations('runbook_started', {
            executionId,
            runbook: runbook.name,
            context
        });

        try {
            for (const [index, step] of runbook.steps.entries()) {
                const stepExecution = {
                    index,
                    action: step.action,
                    params: step.params,
                    startTime: Date.now(),
                    endTime: null,
                    status: 'running',
                    result: null,
                    error: null
                };

                execution.steps.push(stepExecution);

                try {
                    const result = await this._executeStep(step, context);
                    stepExecution.result = result;
                    stepExecution.status = 'success';
                    stepExecution.endTime = Date.now();

                    if (result && result.updatedContext) {
                        Object.assign(context, result.updatedContext);
                    }
                } catch (error) {
                    stepExecution.error = error.message;
                    stepExecution.status = 'failed';
                    stepExecution.endTime = Date.now();
                    
                    throw error;
                }
            }

            execution.status = 'success';
            execution.result = { message: 'Runbook executed successfully', context };
            
            this._notifyIntegrations('runbook_completed', {
                executionId,
                runbook: runbook.name,
                status: 'success'
            });

        } catch (error) {
            execution.status = 'failed';
            execution.error = error.message;
            
            this._notifyIntegrations('runbook_failed', {
                executionId,
                runbook: runbook.name,
                error: error.message,
                context
            });
        } finally {
            execution.endTime = Date.now();
            this._persistExecution(execution);
        }

        return execution;
    }

    async _executeStep(step, context) {
        const params = step.params.map(p => {
            if (typeof p === 'string' && context[p] !== undefined) {
                return context[p];
            }
            return p;
        });

        switch (step.action) {
            case 'validate_extension':
                return this._validateExtension(params[0]);
            
            case 'stop_extension':
                return this._stopExtension(params[0]);
            
            case 'start_extension':
                return this._startExtension(params[0]);
            
            case 'verify_health':
                return this._verifyHealth(params[0]);
            
            case 'wait':
                return this._wait(params[0]);
            
            case 'check_rate_limit_state':
                return this._checkRateLimitState(params[0]);
            
            case 'backup_rate_limit_state':
                return this._backupRateLimitState(params[0]);
            
            case 'reset_rate_limiter':
                return this._resetRateLimiter(params[0]);
            
            case 'verify_rate_limit_cleared':
                return this._verifyRateLimitCleared(params[0]);
            
            case 'check_circuit_state':
                return this._checkCircuitState(params[0]);
            
            case 'log_circuit_history':
                return this._logCircuitHistory(params[0]);
            
            case 'force_close_circuit':
                return this._forceCloseCircuit(params[0]);
            
            case 'test_circuit_recovery':
                return this._testCircuitRecovery(params[0]);
            
            case 'analyze_current_load':
                return this._analyzeCurrentLoad();
            
            case 'calculate_new_limits':
                return this._calculateNewLimits();
            
            case 'apply_rate_limit_adjustments':
                return this._applyRateLimitAdjustments(params[0]);
            
            case 'monitor_impact':
                return this._monitorImpact(params[0]);
            
            case 'identify_stuck_requests':
                return this._identifyStuckRequests(params[0]);
            
            case 'log_stuck_requests':
                return this._logStuckRequests(params[0]);
            
            case 'terminate_stuck_requests':
                return this._terminateStuckRequests(params[0]);
            
            case 'verify_cleanup':
                return this._verifyCleanup(params[0]);
            
            default:
                throw new Error(`Unknown action: ${step.action}`);
        }
    }

    _validateExtension(extensionId) {
        if (!this.runtime || !this.runtime.extensions) {
            throw new Error('Runtime not available');
        }
        
        const extension = this.runtime.extensions.get(extensionId);
        if (!extension) {
            throw new Error(`Extension ${extensionId} not found`);
        }
        
        return { valid: true, extension: extensionId };
    }

    async _stopExtension(extensionId) {
        if (!this.runtime) {
            throw new Error('Runtime not available');
        }
        
        const extension = this.runtime.extensions.get(extensionId);
        if (extension && extension.stop) {
            await extension.stop();
        }
        
        return { stopped: true, extension: extensionId };
    }

    async _startExtension(extensionId) {
        if (!this.runtime) {
            throw new Error('Runtime not available');
        }
        
        const extension = this.runtime.extensions.get(extensionId);
        if (extension && extension.start) {
            await extension.start();
        }
        
        return { started: true, extension: extensionId };
    }

    async _verifyHealth(extensionId) {
        const extension = this.runtime.extensions.get(extensionId);
        const isHealthy = extension && extension.state === 'RUNNING';
        
        return { healthy: isHealthy, extension: extensionId, state: extension?.state };
    }

    _wait(ms) {
        return new Promise(resolve => setTimeout(() => resolve({ waited: ms }), ms));
    }

    _checkRateLimitState(extensionId) {
        if (!this.advancedRateLimiting) {
            throw new Error('Rate limiting not available');
        }
        
        const state = this.advancedRateLimiting.getExtensionState(extensionId);
        return { state, extension: extensionId };
    }

    _backupRateLimitState(extensionId) {
        if (!this.advancedRateLimiting) {
            throw new Error('Rate limiting not available');
        }
        
        const state = this.advancedRateLimiting.getExtensionState(extensionId);
        const backupFile = path.join(RUNBOOK_LOG_DIR, `rate-limit-backup-${extensionId}-${Date.now()}.json`);
        
        fs.writeFileSync(backupFile, JSON.stringify(state, null, 2));
        
        return { backedUp: true, file: backupFile };
    }

    _resetRateLimiter(extensionId) {
        if (!this.advancedRateLimiting) {
            throw new Error('Rate limiting not available');
        }
        
        this.advancedRateLimiting.reset(extensionId);
        return { reset: true, extension: extensionId };
    }

    _verifyRateLimitCleared(extensionId) {
        if (!this.advancedRateLimiting) {
            throw new Error('Rate limiting not available');
        }
        
        const state = this.advancedRateLimiting.getExtensionState(extensionId);
        const cleared = state.currentRequests === 0;
        
        return { cleared, extension: extensionId, state };
    }

    _checkCircuitState(extensionId) {
        const state = this.circuitBreaker?.getState() || { state: 'UNKNOWN' };
        return { circuitState: state, extension: extensionId };
    }

    _logCircuitHistory(extensionId) {
        const state = this.circuitBreaker?.getState() || {};
        const logFile = path.join(RUNBOOK_LOG_DIR, `circuit-history-${extensionId}-${Date.now()}.json`);
        
        fs.writeFileSync(logFile, JSON.stringify(state, null, 2));
        
        return { logged: true, file: logFile };
    }

    _forceCloseCircuit(extensionId) {
        if (this.circuitBreaker && this.circuitBreaker.forceClosed) {
            this.circuitBreaker.forceClosed();
        }
        
        return { closed: true, extension: extensionId };
    }

    async _testCircuitRecovery(extensionId) {
        const state = this.circuitBreaker?.getState() || {};
        const recovered = state.state === 'CLOSED';
        
        return { recovered, extension: extensionId, state: state.state };
    }

    _analyzeCurrentLoad() {
        const metrics = this.telemetry?.metrics?.getMetrics() || {};
        
        let totalRequests = 0;
        for (const extMetrics of Object.values(metrics.requests || {})) {
            totalRequests += Object.values(extMetrics).reduce((sum, count) => sum + count, 0);
        }
        
        return { 
            totalRequests,
            metrics,
            timestamp: Date.now()
        };
    }

    _calculateNewLimits() {
        const metrics = this.telemetry?.metrics?.getMetrics() || {};
        const newLimits = {};
        
        for (const [extensionId, stages] of Object.entries(metrics.requests || {})) {
            const totalRequests = Object.values(stages).reduce((sum, count) => sum + count, 0);
            newLimits[extensionId] = Math.ceil(totalRequests * 1.2);
        }
        
        return { updatedContext: { newLimits } };
    }

    _applyRateLimitAdjustments(newLimits) {
        if (!newLimits || typeof newLimits !== 'object') {
            throw new Error('Invalid newLimits provided');
        }
        
        return { applied: true, limits: newLimits };
    }

    async _monitorImpact(durationMs) {
        await this._wait(durationMs);
        const metrics = this._analyzeCurrentLoad();
        
        return { monitored: true, duration: durationMs, metrics };
    }

    _identifyStuckRequests(extensionId) {
        const extension = this.runtime?.extensions?.get(extensionId);
        const stuckRequests = [];
        
        if (extension && extension.pendingRequests) {
            const now = Date.now();
            const timeout = 300000;
            
            for (const [reqId, req] of extension.pendingRequests.entries()) {
                if (req.startTime && now - req.startTime > timeout) {
                    stuckRequests.push({ id: reqId, age: now - req.startTime });
                }
            }
        }
        
        return { stuckRequests, count: stuckRequests.length, updatedContext: { stuckRequests } };
    }

    _logStuckRequests(extensionId, stuckRequests) {
        const logFile = path.join(RUNBOOK_LOG_DIR, `stuck-requests-${extensionId}-${Date.now()}.json`);
        
        fs.writeFileSync(logFile, JSON.stringify({ extensionId, stuckRequests }, null, 2));
        
        return { logged: true, file: logFile };
    }

    _terminateStuckRequests(extensionId, stuckRequests) {
        const extension = this.runtime?.extensions?.get(extensionId);
        let terminated = 0;
        
        if (extension && extension.pendingRequests && stuckRequests) {
            for (const req of stuckRequests) {
                if (extension.pendingRequests.has(req.id)) {
                    extension.pendingRequests.delete(req.id);
                    terminated++;
                }
            }
        }
        
        return { terminated, extension: extensionId };
    }

    _verifyCleanup(extensionId) {
        const extension = this.runtime?.extensions?.get(extensionId);
        const pendingCount = extension?.pendingRequests?.size || 0;
        
        return { cleaned: pendingCount === 0, pendingRequests: pendingCount };
    }

    async _notifyIntegrations(event, data) {
        if (this.integrationConfig.pagerduty?.enabled) {
            await this._notifyPagerDuty(event, data);
        }
        
        if (this.integrationConfig.opsgenie?.enabled) {
            await this._notifyOpsgenie(event, data);
        }
    }

    async _notifyPagerDuty(event, data) {
        const config = this.integrationConfig.pagerduty;
        if (!config.routingKey) return;

        const severity = event.includes('failed') ? 'error' : 'info';
        
        const payload = {
            routing_key: config.routingKey,
            event_action: event === 'runbook_failed' ? 'trigger' : 'resolve',
            dedup_key: data.executionId,
            payload: {
                summary: `Runbook: ${data.runbook || 'Unknown'}`,
                severity,
                source: 'ghost-cli',
                custom_details: data
            }
        };

        try {
            await this._makeHttpRequest('https://events.pagerduty.com/v2/enqueue', 'POST', payload);
        } catch (error) {
            console.error('[RunbookAutomation] PagerDuty notification failed:', error.message);
        }
    }

    async _notifyOpsgenie(event, data) {
        const config = this.integrationConfig.opsgenie;
        if (!config.apiKey) return;

        const payload = {
            message: `Runbook ${event}: ${data.runbook || 'Unknown'}`,
            description: JSON.stringify(data, null, 2),
            priority: event.includes('failed') ? 'P2' : 'P4',
            source: 'ghost-cli',
            tags: ['runbook', event]
        };

        try {
            await this._makeHttpRequest(
                `https://api.opsgenie.com/v2/alerts`,
                'POST',
                payload,
                { 'Authorization': `GenieKey ${config.apiKey}` }
            );
        } catch (error) {
            console.error('[RunbookAutomation] Opsgenie notification failed:', error.message);
        }
    }

    _makeHttpRequest(url, method, data, headers = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;
            
            const postData = JSON.stringify(data);
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    ...headers
                }
            };

            const req = client.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ statusCode: res.statusCode, body });
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }

    _persistExecution(execution) {
        try {
            const logFile = path.join(RUNBOOK_LOG_DIR, `execution-${execution.id}.json`);
            fs.writeFileSync(logFile, JSON.stringify(execution, null, 2));
        } catch (error) {
            console.error('[RunbookAutomation] Failed to persist execution:', error.message);
        }
    }

    getExecutionHistory(limit = 50) {
        return this.executionHistory.slice(-limit);
    }

    getRunbooks() {
        return Array.from(this.runbooks.values());
    }

    getRunbook(runbookId) {
        return this.runbooks.get(runbookId);
    }
}

module.exports = {
    RunbookAutomation
};
