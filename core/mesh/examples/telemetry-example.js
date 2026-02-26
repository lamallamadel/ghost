const { MeshCoordinator } = require('../coordinator');

async function runTelemetryExample() {
    const collector = new MeshCoordinator({
        agentId: 'collector',
        port: 8300,
        capabilities: ['telemetry', 'aggregation']
    });

    const producers = [];
    for (let i = 0; i < 2; i++) {
        const agent = new MeshCoordinator({
            agentId: `producer-${i}`,
            port: 8301 + i,
            capabilities: ['telemetry', 'compute']
        });
        producers.push(agent);
    }

    collector.on('metrics-aggregated', (event) => {
        console.log(`Metrics aggregated: ${event.metricCount} metrics at ${new Date(event.timestamp).toISOString()}`);
    });

    await collector.start();
    for (const agent of producers) {
        await agent.start();
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    for (const agent of producers) {
        await collector.connectToPeer('localhost', agent.port);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n--- Recording metrics on producers ---');
    
    setInterval(() => {
        producers[0].recordMetric('cpu_usage', Math.random() * 100, { host: 'host-1' });
        producers[0].recordMetric('memory_usage', Math.random() * 8192, { host: 'host-1' });
        producers[0].recordMetric('requests_total', Math.floor(Math.random() * 1000), { host: 'host-1' });
    }, 2000);

    setInterval(() => {
        producers[1].recordMetric('cpu_usage', Math.random() * 100, { host: 'host-2' });
        producers[1].recordMetric('memory_usage', Math.random() * 8192, { host: 'host-2' });
        producers[1].recordMetric('requests_total', Math.floor(Math.random() * 1000), { host: 'host-2' });
    }, 2000);

    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log('\n--- Aggregated metrics on collector ---');
    const metrics = collector.getMetrics();
    for (const [key, metric] of Object.entries(metrics)) {
        console.log(`\n${key}:`);
        console.log(`  Sources: ${metric.sources}`);
        console.log(`  Aggregation:`, metric.aggregation);
    }

    console.log('\n--- Individual agent metrics ---');
    for (const agent of producers) {
        const agentMetrics = agent.telemetryCollector.getAllMetrics();
        console.log(`\n[${agent.agentId}] Metrics count:`, Object.keys(agentMetrics).length);
    }

    await collector.stop();
    for (const agent of producers) {
        await agent.stop();
    }

    console.log('\nTelemetry example completed');
}

if (require.main === module) {
    runTelemetryExample().catch(console.error);
}

module.exports = { runTelemetryExample };
