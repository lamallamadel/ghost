const { AdvancedRateLimitingManager } = require('./advanced-rate-limiting');

async function demonstrateAdvancedRateLimiting() {
    console.log('=== Advanced Rate Limiting Demo ===\n');

    const manager = new AdvancedRateLimitingManager({
        adaptive: true,
        fairQueuing: true,
        warmup: true,
        globalLimiting: true,
        analytics: true,
        global: {
            globalCIR: 1000,
            globalBC: 2000,
            sharingEnabled: true
        },
        fairQueuing: {
            maxQueueSize: 1000,
            defaultWeight: 1
        },
        analytics: {
            windowSize: 60000,
            maxDataPoints: 1000
        }
    });

    console.log('1. Registering extensions with different strategies:\n');

    manager.registerExtension('high-priority-service', {
        cir: 200,
        bc: 400,
        be: 600,
        adaptive: true,
        pidKp: 0.5,
        pidKi: 0.1,
        pidKd: 0.2,
        targetLoad: 0.75,
        priority: 3,
        weight: 3,
        globalQuota: 300,
        canShareQuota: true,
        failureThreshold: 5,
        resetTimeout: 60000
    });
    console.log('✓ Registered high-priority-service with adaptive rate limiting');

    manager.registerExtension('warmup-service', {
        cir: 100,
        bc: 200,
        be: 300,
        warmup: true,
        warmupDuration: 30000,
        warmupStartCIR: 10,
        warmupCurve: 'exponential',
        priority: 2,
        weight: 2,
        globalQuota: 150,
        canShareQuota: true
    });
    console.log('✓ Registered warmup-service with warmup rate limiting');

    manager.registerExtension('standard-service', {
        cir: 50,
        bc: 100,
        be: 150,
        priority: 1,
        weight: 1,
        globalQuota: 75,
        canShareQuota: true
    });
    console.log('✓ Registered standard-service with basic rate limiting\n');

    console.log('2. Simulating requests:\n');

    const mockRequest = async (serviceId, shouldFail = false) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (shouldFail) {
                    reject(new Error('Simulated failure'));
                } else {
                    resolve({ success: true, data: `Response from ${serviceId}` });
                }
            }, Math.random() * 100);
        });
    };

    for (let i = 0; i < 20; i++) {
        const serviceId = ['high-priority-service', 'warmup-service', 'standard-service'][i % 3];
        const shouldFail = Math.random() < 0.1;

        try {
            const result = await manager.executeWithRateLimiting(
                serviceId,
                () => mockRequest(serviceId, shouldFail),
                { requestId: `req-${i}` },
                1
            );

            if (result.success) {
                console.log(`✓ ${serviceId} request ${i} succeeded - ${result.classification?.color || 'N/A'} classification`);
            } else {
                console.log(`✗ ${serviceId} request ${i} failed - ${result.reason}`);
            }
        } catch (error) {
            console.log(`✗ ${serviceId} request ${i} error - ${error.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log('\n3. Extension States:\n');

    const services = ['high-priority-service', 'warmup-service', 'standard-service'];
    for (const serviceId of services) {
        const state = manager.getExtensionState(serviceId);
        console.log(`\n${serviceId}:`);
        
        if (state.limiter) {
            console.log(`  Rate Limiter:`);
            if (state.limiter.currentCIR) {
                console.log(`    - Current CIR: ${state.limiter.currentCIR}/min (Base: ${state.limiter.baseCIR}/min)`);
                console.log(`    - Adjustment: ${(state.limiter.adjustment || 1).toFixed(2)}x`);
                console.log(`    - System Load: ${(state.limiter.systemLoad * 100).toFixed(1)}%`);
            } else if (state.limiter.isWarming !== undefined) {
                console.log(`    - Warming: ${state.limiter.isWarming ? 'Yes' : 'No'}`);
                if (state.limiter.isWarming) {
                    console.log(`    - Progress: ${(state.limiter.warmupProgress * 100).toFixed(1)}%`);
                    console.log(`    - Current CIR: ${state.limiter.currentCIR}/min (Target: ${state.limiter.targetCIR}/min)`);
                }
            } else {
                console.log(`    - Tokens: ${Math.floor(state.limiter.committedTokens)}/${state.limiter.committedCapacity}`);
            }
        }

        if (state.circuitBreaker) {
            console.log(`  Circuit Breaker:`);
            console.log(`    - State: ${state.circuitBreaker.state}`);
            console.log(`    - Failures: ${state.circuitBreaker.failures}`);
            if (state.circuitBreaker.stats) {
                const successRate = state.circuitBreaker.stats.totalRequests > 0 ?
                    (state.circuitBreaker.stats.totalSuccesses / state.circuitBreaker.stats.totalRequests * 100).toFixed(1) : 0;
                console.log(`    - Success Rate: ${successRate}%`);
            }
        }

        if (state.queue) {
            console.log(`  Queue:`);
            console.log(`    - Size: ${state.queue.queueSize}`);
            console.log(`    - Weight: ${state.queue.weight}`);
            if (state.queue.stats) {
                console.log(`    - Served: ${state.queue.stats.served}`);
                console.log(`    - Avg Wait: ${state.queue.stats.avgWaitTime.toFixed(2)}ms`);
            }
        }

        if (state.global) {
            console.log(`  Global Quota:`);
            console.log(`    - Quota: ${state.global.quota}`);
            console.log(`    - Used: ${state.global.used}/${state.global.quota}`);
            console.log(`    - Borrowed: ${state.global.borrowed}`);
            console.log(`    - Lent: ${state.global.lent}`);
        }

        if (state.analytics?.metrics) {
            console.log(`  Analytics:`);
            console.log(`    - Avg Request Rate: ${state.analytics.metrics.avgRequestRate.toFixed(2)}/s`);
            console.log(`    - Allow Rate: ${(state.analytics.metrics.avgAllowRate * 100).toFixed(1)}%`);
            console.log(`    - Total Requests: ${state.analytics.metrics.totalRequests}`);
        }

        if (state.analytics?.prediction && state.analytics.prediction.prediction) {
            const hours = Math.floor(state.analytics.prediction.timeToExhaustion / (60 * 60 * 1000));
            const minutes = Math.floor((state.analytics.prediction.timeToExhaustion % (60 * 60 * 1000)) / (60 * 1000));
            console.log(`  Quota Exhaustion Prediction:`);
            console.log(`    - Time to Exhaustion: ${hours}h ${minutes}m`);
            console.log(`    - Confidence: ${(state.analytics.prediction.confidence * 100).toFixed(1)}%`);
        }
    }

    console.log('\n4. Global State:\n');

    const globalState = manager.getGlobalState();
    if (globalState.global) {
        console.log('Global Rate Limiter:');
        console.log(`  - Tokens: ${Math.floor(globalState.global.globalTokens)}/${globalState.global.globalCapacity}`);
        console.log(`  - Total Requests: ${globalState.global.stats.totalRequests}`);
        console.log(`  - Allow Rate: ${(globalState.global.stats.allowRate * 100).toFixed(1)}%`);
        console.log(`  - Quota Transfers: ${globalState.global.stats.quotaTransfers}`);
    }

    if (globalState.fairQueuing) {
        console.log('\nFair Queuing:');
        console.log(`  - Total Served: ${globalState.fairQueuing.totalServed}`);
        console.log(`  - Total Dropped: ${globalState.fairQueuing.totalDropped}`);
        console.log(`  - Active Queues: ${globalState.fairQueuing.activeQueues}`);
        console.log(`  - Total Queued: ${globalState.fairQueuing.totalQueued}`);
    }

    console.log('\n5. Anomalies Detection:\n');

    for (const serviceId of services) {
        const state = manager.getExtensionState(serviceId);
        if (state.analytics?.anomalies && state.analytics.anomalies.length > 0) {
            console.log(`${serviceId}:`);
            for (const anomaly of state.analytics.anomalies.slice(0, 3)) {
                console.log(`  - ${anomaly.type.toUpperCase()} at ${new Date(anomaly.timestamp).toLocaleTimeString()}`);
                console.log(`    Rate: ${anomaly.requestRate.toFixed(2)}/s (expected: ${anomaly.expectedRate.toFixed(2)}/s)`);
                console.log(`    Deviation: ${anomaly.deviation.toFixed(2)}σ`);
            }
        }
    }

    console.log('\n6. Full Dashboard Data:\n');

    const dashboard = manager.getDashboard();
    console.log('Dashboard generated with:');
    console.log(`  - Extensions: ${Object.keys(dashboard.extensions).length}`);
    console.log(`  - Timestamp: ${new Date(dashboard.timestamp).toLocaleString()}`);

    if (dashboard.overview.analytics?.global) {
        console.log(`  - Global Total Requests: ${dashboard.overview.analytics.global.totalRequests}`);
        console.log(`  - Global Allow Rate: ${(dashboard.overview.analytics.global.globalAllowRate * 100).toFixed(1)}%`);
    }

    console.log('\n=== Demo Complete ===');
}

if (require.main === module) {
    demonstrateAdvancedRateLimiting().catch(console.error);
}

module.exports = { demonstrateAdvancedRateLimiting };
