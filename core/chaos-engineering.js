const fs = require('fs');
const path = require('path');
const os = require('os');

const CHAOS_CONFIG_DIR = path.join(os.homedir(), '.ghost', 'chaos');
const CHAOS_LOG_DIR = path.join(os.homedir(), '.ghost', 'chaos-logs');

const FAILURE_TYPES = {
    EXTENSION_CRASH: 'extension_crash',
    NETWORK_LATENCY: 'network_latency',
    RESOURCE_EXHAUSTION: 'resource_exhaustion',
    RANDOM_ERRORS: 'random_errors',
    CIRCUIT_BREAKER_TRIP: 'circuit_breaker_trip',
    RATE_LIMIT_EXCEED: 'rate_limit_exceed'
};

class ChaosExperiment {
    constructor(id, config) {
        this.id = id;
        this.name = config.name;
        this.description = config.description;
        this.failureType = config.failureType;
        this.targetExtension = config.targetExtension || '*';
        this.probability = config.probability || 0.1;
        this.duration = config.duration || 60000;
        this.parameters = config.parameters || {};
        this.hypothesis = config.hypothesis || '';
        this.steadyStateValidation = config.steadyStateValidation || null;
        
        this.status = 'created';
        this.startTime = null;
        this.endTime = null;
        this.results = {
            injectionCount: 0,
            affectedRequests: 0,
            errors: [],
            metrics: {},
            validation: null
        };
    }

    start() {
        this.status = 'running';
        this.startTime = Date.now();
    }

    stop() {
        this.status = 'completed';
        this.endTime = Date.now();
    }

    recordInjection(details) {
        this.results.injectionCount++;
        this.results.affectedRequests++;
    }

    recordError(error) {
        this.results.errors.push({
            message: error.message,
            timestamp: Date.now()
        });
    }

    recordMetric(key, value) {
        if (!this.results.metrics[key]) {
            this.results.metrics[key] = [];
        }
        this.results.metrics[key].push({
            value,
            timestamp: Date.now()
        });
    }

    validate(validationResult) {
        this.results.validation = validationResult;
    }

    getReport() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            failureType: this.failureType,
            hypothesis: this.hypothesis,
            status: this.status,
            duration: this.endTime ? this.endTime - this.startTime : Date.now() - this.startTime,
            startTime: this.startTime,
            endTime: this.endTime,
            results: this.results
        };
    }
}

class ChaosEngineering {
    constructor(runtime, telemetry, circuitBreaker, options = {}) {
        this.runtime = runtime;
        this.telemetry = telemetry;
        this.circuitBreaker = circuitBreaker;
        this.enabled = options.enabled !== false;
        
        this.experiments = new Map();
        this.activeExperiments = new Map();
        this.experimentHistory = [];
        this.injectionHandlers = new Map();
        
        this._ensureDirectories();
        this._registerInjectionHandlers();
    }

    _ensureDirectories() {
        try {
            if (!fs.existsSync(CHAOS_CONFIG_DIR)) {
                fs.mkdirSync(CHAOS_CONFIG_DIR, { recursive: true });
            }
            if (!fs.existsSync(CHAOS_LOG_DIR)) {
                fs.mkdirSync(CHAOS_LOG_DIR, { recursive: true });
            }
        } catch (error) {
            console.error('[ChaosEngineering] Failed to create directories:', error.message);
        }
    }

    _registerInjectionHandlers() {
        this.injectionHandlers.set(FAILURE_TYPES.EXTENSION_CRASH, 
            this._injectExtensionCrash.bind(this));
        this.injectionHandlers.set(FAILURE_TYPES.NETWORK_LATENCY, 
            this._injectNetworkLatency.bind(this));
        this.injectionHandlers.set(FAILURE_TYPES.RESOURCE_EXHAUSTION, 
            this._injectResourceExhaustion.bind(this));
        this.injectionHandlers.set(FAILURE_TYPES.RANDOM_ERRORS, 
            this._injectRandomErrors.bind(this));
        this.injectionHandlers.set(FAILURE_TYPES.CIRCUIT_BREAKER_TRIP, 
            this._injectCircuitBreakerTrip.bind(this));
        this.injectionHandlers.set(FAILURE_TYPES.RATE_LIMIT_EXCEED, 
            this._injectRateLimitExceed.bind(this));
    }

    createExperiment(config) {
        const id = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const experiment = new ChaosExperiment(id, config);
        this.experiments.set(id, experiment);
        return experiment;
    }

    async startExperiment(experimentId) {
        if (!this.enabled) {
            throw new Error('Chaos engineering is disabled');
        }

        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Experiment ${experimentId} not found`);
        }

        if (this.activeExperiments.has(experimentId)) {
            throw new Error(`Experiment ${experimentId} is already running`);
        }

        experiment.start();
        this.activeExperiments.set(experimentId, experiment);

        const intervalId = setInterval(() => {
            this._executeInjection(experiment);
        }, 1000);

        setTimeout(() => {
            this.stopExperiment(experimentId);
            clearInterval(intervalId);
        }, experiment.duration);

        this._logEvent('experiment_started', { experimentId, name: experiment.name });

        return experiment;
    }

    stopExperiment(experimentId) {
        const experiment = this.activeExperiments.get(experimentId);
        if (!experiment) {
            return;
        }

        experiment.stop();
        this.activeExperiments.delete(experimentId);
        this.experimentHistory.push(experiment);

        if (this.experimentHistory.length > 100) {
            this.experimentHistory.shift();
        }

        this._persistExperiment(experiment);
        this._logEvent('experiment_stopped', { 
            experimentId, 
            name: experiment.name,
            results: experiment.results
        });

        return experiment;
    }

    _executeInjection(experiment) {
        if (Math.random() > experiment.probability) {
            return;
        }

        const handler = this.injectionHandlers.get(experiment.failureType);
        if (!handler) {
            console.error(`[ChaosEngineering] Unknown failure type: ${experiment.failureType}`);
            return;
        }

        try {
            handler(experiment);
            experiment.recordInjection({
                type: experiment.failureType,
                timestamp: Date.now()
            });
        } catch (error) {
            experiment.recordError(error);
            console.error(`[ChaosEngineering] Injection failed:`, error.message);
        }
    }

    _injectExtensionCrash(experiment) {
        const targetExtension = this._selectTargetExtension(experiment.targetExtension);
        if (!targetExtension) return;

        const extension = this.runtime.extensions.get(targetExtension);
        if (extension && extension.process) {
            try {
                if (extension.process.kill) {
                    extension.process.kill('SIGKILL');
                }
                
                this._logEvent('chaos_injection', {
                    type: 'extension_crash',
                    extension: targetExtension,
                    experimentId: experiment.id
                });
            } catch (error) {
                experiment.recordError(error);
            }
        }
    }

    async _injectNetworkLatency(experiment) {
        const latencyMs = experiment.parameters.latencyMs || 1000;
        const targetExtension = this._selectTargetExtension(experiment.targetExtension);
        
        if (!targetExtension) return;

        const originalExecute = this.runtime._executeExtension;
        if (originalExecute) {
            this.runtime._executeExtension = async function(...args) {
                await new Promise(resolve => setTimeout(resolve, latencyMs));
                return originalExecute.apply(this, args);
            };

            setTimeout(() => {
                this.runtime._executeExtension = originalExecute;
            }, 5000);
        }

        this._logEvent('chaos_injection', {
            type: 'network_latency',
            latency: latencyMs,
            extension: targetExtension,
            experimentId: experiment.id
        });
    }

    _injectResourceExhaustion(experiment) {
        const exhaustionType = experiment.parameters.type || 'memory';
        const targetExtension = this._selectTargetExtension(experiment.targetExtension);
        
        if (!targetExtension) return;

        if (exhaustionType === 'memory') {
            const largeArray = new Array(1000000).fill('x'.repeat(1000));
            setTimeout(() => {
                largeArray.length = 0;
            }, 10000);
        } else if (exhaustionType === 'cpu') {
            const startTime = Date.now();
            while (Date.now() - startTime < 1000) {
                Math.sqrt(Math.random());
            }
        }

        this._logEvent('chaos_injection', {
            type: 'resource_exhaustion',
            exhaustionType,
            extension: targetExtension,
            experimentId: experiment.id
        });
    }

    _injectRandomErrors(experiment) {
        const errorRate = experiment.parameters.errorRate || 0.5;
        const targetExtension = this._selectTargetExtension(experiment.targetExtension);
        
        if (!targetExtension || Math.random() > errorRate) return;

        const errorMessages = [
            'Simulated chaos error: Service unavailable',
            'Simulated chaos error: Timeout',
            'Simulated chaos error: Internal server error',
            'Simulated chaos error: Connection refused'
        ];

        const error = new Error(errorMessages[Math.floor(Math.random() * errorMessages.length)]);
        error.code = 'CHAOS_INJECTED_ERROR';

        this._logEvent('chaos_injection', {
            type: 'random_error',
            error: error.message,
            extension: targetExtension,
            experimentId: experiment.id
        });

        throw error;
    }

    _injectCircuitBreakerTrip(experiment) {
        if (!this.circuitBreaker) return;

        if (this.circuitBreaker.forceOpen) {
            this.circuitBreaker.forceOpen();
            
            setTimeout(() => {
                if (this.circuitBreaker.forceClosed) {
                    this.circuitBreaker.forceClosed();
                }
            }, experiment.parameters.tripDuration || 30000);
        }

        this._logEvent('chaos_injection', {
            type: 'circuit_breaker_trip',
            experimentId: experiment.id
        });
    }

    _injectRateLimitExceed(experiment) {
        const targetExtension = this._selectTargetExtension(experiment.targetExtension);
        if (!targetExtension) return;

        const burstSize = experiment.parameters.burstSize || 100;
        
        for (let i = 0; i < burstSize; i++) {
            if (this.telemetry && this.telemetry.metrics) {
                this.telemetry.metrics.recordRequest(targetExtension, 'chaos_burst', 1);
            }
        }

        this._logEvent('chaos_injection', {
            type: 'rate_limit_exceed',
            burstSize,
            extension: targetExtension,
            experimentId: experiment.id
        });
    }

    _selectTargetExtension(targetPattern) {
        if (!this.runtime || !this.runtime.extensions) {
            return null;
        }

        if (targetPattern === '*') {
            const extensions = Array.from(this.runtime.extensions.keys());
            if (extensions.length === 0) return null;
            return extensions[Math.floor(Math.random() * extensions.length)];
        }

        return targetPattern;
    }

    shouldInjectFailure(extensionId, requestContext = {}) {
        for (const experiment of this.activeExperiments.values()) {
            if (experiment.status !== 'running') continue;

            const matches = experiment.targetExtension === '*' || 
                           experiment.targetExtension === extensionId;
            
            if (matches && Math.random() < experiment.probability) {
                return {
                    inject: true,
                    experiment: experiment,
                    failureType: experiment.failureType
                };
            }
        }

        return { inject: false };
    }

    _logEvent(event, data) {
        if (this.telemetry && this.telemetry.logger) {
            this.telemetry.logger.info(`[Chaos] ${event}`, data);
        }
    }

    _persistExperiment(experiment) {
        try {
            const logFile = path.join(CHAOS_LOG_DIR, `experiment-${experiment.id}.json`);
            fs.writeFileSync(logFile, JSON.stringify(experiment.getReport(), null, 2));
        } catch (error) {
            console.error('[ChaosEngineering] Failed to persist experiment:', error.message);
        }
    }

    getExperiment(experimentId) {
        return this.experiments.get(experimentId) || 
               this.experimentHistory.find(e => e.id === experimentId);
    }

    getActiveExperiments() {
        return Array.from(this.activeExperiments.values());
    }

    getAllExperiments() {
        return Array.from(this.experiments.values());
    }

    getExperimentHistory(limit = 50) {
        return this.experimentHistory.slice(-limit);
    }

    createPredefinedExperiments() {
        const experiments = [
            {
                name: 'Random Extension Crashes',
                description: 'Randomly crash extensions to test recovery mechanisms',
                failureType: FAILURE_TYPES.EXTENSION_CRASH,
                targetExtension: '*',
                probability: 0.05,
                duration: 300000,
                hypothesis: 'System should recover from extension crashes without data loss'
            },
            {
                name: 'Network Latency Injection',
                description: 'Add random latency to extension calls',
                failureType: FAILURE_TYPES.NETWORK_LATENCY,
                targetExtension: '*',
                probability: 0.3,
                duration: 180000,
                parameters: { latencyMs: 2000 },
                hypothesis: 'System should handle high latency gracefully with timeouts'
            },
            {
                name: 'Memory Exhaustion',
                description: 'Exhaust available memory to test resource limits',
                failureType: FAILURE_TYPES.RESOURCE_EXHAUSTION,
                targetExtension: '*',
                probability: 0.1,
                duration: 120000,
                parameters: { type: 'memory' },
                hypothesis: 'System should prevent memory exhaustion and maintain stability'
            },
            {
                name: 'Random Error Injection',
                description: 'Inject random errors into requests',
                failureType: FAILURE_TYPES.RANDOM_ERRORS,
                targetExtension: '*',
                probability: 0.2,
                duration: 240000,
                parameters: { errorRate: 0.5 },
                hypothesis: 'System should handle errors gracefully with proper error responses'
            },
            {
                name: 'Circuit Breaker Stress Test',
                description: 'Force circuit breaker to open repeatedly',
                failureType: FAILURE_TYPES.CIRCUIT_BREAKER_TRIP,
                targetExtension: '*',
                probability: 0.15,
                duration: 180000,
                parameters: { tripDuration: 30000 },
                hypothesis: 'Circuit breaker should protect system and recover automatically'
            },
            {
                name: 'Rate Limit Burst',
                description: 'Generate bursts of requests to exceed rate limits',
                failureType: FAILURE_TYPES.RATE_LIMIT_EXCEED,
                targetExtension: '*',
                probability: 0.1,
                duration: 120000,
                parameters: { burstSize: 100 },
                hypothesis: 'Rate limiter should throttle requests without crashing'
            }
        ];

        const created = [];
        for (const config of experiments) {
            const experiment = this.createExperiment(config);
            created.push(experiment);
        }

        return created;
    }

    generateResilienceReport() {
        const report = {
            timestamp: Date.now(),
            totalExperiments: this.experimentHistory.length,
            activeExperiments: this.activeExperiments.size,
            summary: {
                byType: {},
                totalInjections: 0,
                totalErrors: 0,
                averageDuration: 0
            },
            experiments: []
        };

        let totalDuration = 0;

        for (const experiment of this.experimentHistory) {
            const experimentReport = experiment.getReport();
            report.experiments.push(experimentReport);

            const type = experiment.failureType;
            if (!report.summary.byType[type]) {
                report.summary.byType[type] = {
                    count: 0,
                    totalInjections: 0,
                    totalErrors: 0
                };
            }

            report.summary.byType[type].count++;
            report.summary.byType[type].totalInjections += experiment.results.injectionCount;
            report.summary.byType[type].totalErrors += experiment.results.errors.length;
            
            report.summary.totalInjections += experiment.results.injectionCount;
            report.summary.totalErrors += experiment.results.errors.length;
            
            if (experiment.endTime) {
                totalDuration += experiment.endTime - experiment.startTime;
            }
        }

        if (this.experimentHistory.length > 0) {
            report.summary.averageDuration = totalDuration / this.experimentHistory.length;
        }

        return report;
    }
}

module.exports = {
    ChaosEngineering,
    ChaosExperiment,
    FAILURE_TYPES
};
