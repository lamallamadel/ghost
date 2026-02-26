const { AnalyticsPlatform } = require('../index');

async function basicExample() {
    const analytics = new AnalyticsPlatform({
        persistenceDir: './analytics-data',
        flushInterval: 30000,
        retentionDays: 30
    });

    await analytics.initialize();

    console.log('=== Extension Invocation Tracking ===\n');
    
    const context = analytics.trackExtensionInvocation(
        'code-formatter',
        'formatFile',
        { file: 'src/index.js', options: { semicolons: true } }
    );
    
    console.log('Started tracking:', context);

    await new Promise(resolve => setTimeout(resolve, 150));

    analytics.trackResourceUsage(context, {
        cpu: 0.45,
        memory: 64,
        io: 512,
        network: 0
    });

    analytics.trackExtensionSuccess(context, { formatted: true, lines: 150 });

    console.log('\n=== Metrics ===\n');
    const metrics = analytics.collector.getMetrics('code-formatter');
    console.log(JSON.stringify(metrics, null, 2));

    console.log('\n=== Dashboard ===\n');
    const dashboard = await analytics.generateDashboard();
    console.log(JSON.stringify(dashboard, null, 2));

    await analytics.persist();
    console.log('\n✓ Analytics data persisted');
}

basicExample().catch(console.error);
