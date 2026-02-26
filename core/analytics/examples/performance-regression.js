const { PerformanceRegression } = require('../index');

async function performanceExample() {
    const performance = new PerformanceRegression({
        thresholds: {
            duration: 0.20,
            cpu: 0.30,
            memory: 0.30,
            errorRate: 0.10
        }
    });

    console.log('=== Recording Version Metrics ===\n');

    const versions = {
        '1.0.0': { duration: 100, cpu: 0.3, memory: 64, error: false },
        '1.1.0': { duration: 95, cpu: 0.28, memory: 62, error: false },
        '1.2.0': { duration: 150, cpu: 0.45, memory: 80, error: false },
        '1.3.0': { duration: 140, cpu: 0.42, memory: 78, error: false }
    };

    for (const [version, baseMetric] of Object.entries(versions)) {
        for (let i = 0; i < 50; i++) {
            const metric = {
                duration: baseMetric.duration + (Math.random() * 20 - 10),
                cpu: baseMetric.cpu + (Math.random() * 0.05 - 0.025),
                memory: baseMetric.memory + (Math.random() * 5 - 2.5),
                error: Math.random() < 0.02
            };
            performance.recordVersionMetric('my-extension', version, metric);
        }
        console.log(`Recorded 50 samples for version ${version}`);
    }

    console.log('\n=== All Version Metrics ===\n');
    const allVersions = performance.getAllVersionMetrics('my-extension');
    console.log(JSON.stringify(allVersions, null, 2));

    console.log('\n=== Setting Baseline (v1.1.0) ===\n');
    performance.setBaseline('my-extension', '1.1.0');
    const baseline = performance.getBaseline('my-extension');
    console.log(JSON.stringify(baseline, null, 2));

    console.log('\n=== Version Comparison (1.1.0 vs 1.2.0) ===\n');
    const comparison = performance.compareVersions('my-extension', '1.1.0', '1.2.0');
    console.log(JSON.stringify(comparison, null, 2));

    console.log('\n=== Performance Alerts ===\n');
    const alerts = performance.getAlerts('my-extension');
    console.log(JSON.stringify(alerts, null, 2));

    console.log('\n=== Performance Trend (Duration) ===\n');
    const trend = performance.getTrend('my-extension', 'duration', 4);
    console.log(JSON.stringify(trend, null, 2));

    await performance.persist();
    console.log('\n✓ Performance data persisted');
}

performanceExample().catch(console.error);
