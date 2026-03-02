const { AnalyticsPlatform } = require('../index');
const path = require('path');
const os = require('os');

async function populateSampleData() {
    const analytics = new AnalyticsPlatform({
        persistenceDir: path.join(os.homedir(), '.ghost', 'analytics'),
        flushInterval: 60000,
        retentionDays: 30
    });

    await analytics.initialize();

    console.log('[Sample Data] Generating analytics data...');

    const extensions = [
        'ghost-git-extension',
        'ghost-npm-extension',
        'ghost-docker-extension',
        'ghost-lint-extension'
    ];

    const operations = {
        'ghost-git-extension': ['status', 'commit', 'push', 'pull', 'branch'],
        'ghost-npm-extension': ['install', 'test', 'build', 'publish'],
        'ghost-docker-extension': ['build', 'run', 'ps', 'logs'],
        'ghost-lint-extension': ['check', 'fix', 'format']
    };

    for (let i = 0; i < 200; i++) {
        const extensionId = extensions[Math.floor(Math.random() * extensions.length)];
        const method = operations[extensionId][Math.floor(Math.random() * operations[extensionId].length)];
        
        const context = analytics.trackExtensionInvocation(extensionId, method, {
            param1: 'value1',
            param2: 'value2'
        });

        await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));

        const duration = Math.random() * 200 + 10;
        const success = Math.random() > 0.15;

        analytics.trackResourceUsage(context, {
            cpu: Math.random() * 5,
            memory: Math.random() * 100 + 20,
            io: Math.random() * 1024 * 10,
            network: Math.random() * 1024 * 5
        });

        if (success) {
            analytics.trackExtensionSuccess(context, { status: 'ok', data: {} });
        } else {
            analytics.trackExtensionFailure(context, new Error('Sample error'));
        }

        analytics.trackVersionMetric(extensionId, '1.0.0', {
            duration,
            cpu: Math.random() * 5,
            memory: Math.random() * 100,
            errorRate: success ? 0 : 1
        });

        if (Math.random() > 0.7) {
            const targetExtension = extensions[Math.floor(Math.random() * extensions.length)];
            if (targetExtension !== extensionId) {
                const childSpanId = analytics.trackCrossExtensionCall(
                    context.spanId,
                    targetExtension,
                    'delegate',
                    {}
                );
                
                await new Promise(resolve => setTimeout(resolve, Math.random() * 30));
                
                analytics.tracing.endSpan(childSpanId, 'success', {});
            }
        }

        if (i % 10 === 0) {
            console.log(`[Sample Data] Generated ${i} invocations...`);
        }
    }

    for (const extensionId of extensions) {
        analytics.performance.setBaseline(extensionId, '1.0.0');
        
        analytics.trackVersionMetric(extensionId, '1.1.0', {
            duration: Math.random() * 300 + 50,
            cpu: Math.random() * 8,
            memory: Math.random() * 150,
            errorRate: 0.2
        });
    }

    await analytics.persist();
    console.log('[Sample Data] Sample data generated successfully!');
    console.log('[Sample Data] Start the API server with: node core/analytics/start-api-server.js');

    await analytics.shutdown();
}

populateSampleData().catch(console.error);
