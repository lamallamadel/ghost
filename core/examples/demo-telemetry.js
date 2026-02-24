const { IOPipeline, instrumentPipeline } = require('../pipeline');

async function main() {
    const basePipeline = new IOPipeline({
        auditLogPath: './telemetry-demo-audit.log'
    });

    const { pipeline, telemetry } = instrumentPipeline(basePipeline, {
        enabled: true
    });

    const mockManifest = {
        id: 'test-extension',
        version: '1.0.0',
        capabilities: {
            filesystem: {
                read: ['**/*.txt', '**/*.json'],
                write: ['.test/**']
            },
            network: {
                allowlist: ['https://api.example.com'],
                rateLimit: {
                    cir: 100,
                    bc: 500,
                    be: 1000
                }
            }
        }
    };

    pipeline.registerExtension('test-extension', mockManifest);

    console.log('Starting telemetry server on port 9876...');
    telemetry.startServer(9876);

    console.log('\nSimulating pipeline requests...\n');

    const requests = [
        {
            type: 'filesystem',
            operation: 'read',
            params: { path: 'test.txt' },
            extensionId: 'test-extension'
        },
        {
            type: 'filesystem',
            operation: 'write',
            params: { path: '.test/output.txt', content: 'Hello World' },
            extensionId: 'test-extension'
        },
        {
            type: 'network',
            operation: 'http',
            params: { url: 'https://api.example.com/data', method: 'GET' },
            extensionId: 'test-extension'
        }
    ];

    for (const req of requests) {
        console.log(`Processing: ${req.type}/${req.operation}`);
        const result = await pipeline.process(req);
        console.log(`Result: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.code || 'OK'})\n`);
    }

    console.log('Telemetry Summary:');
    console.log('==================\n');

    const metrics = telemetry.metrics.getMetrics();
    console.log('Metrics:', JSON.stringify(metrics, null, 2));

    console.log('\nRecent Spans:');
    const spans = telemetry.getRecentSpans(10);
    spans.forEach(span => {
        console.log(`- ${span.name}: ${span.duration}ms [${span.status.code}]`);
    });

    console.log('\nTelemetry server running at http://localhost:9876');
    console.log('Endpoints:');
    console.log('  - GET /health');
    console.log('  - GET /metrics');
    console.log('  - GET /spans');
    console.log('  - GET /logs');
    console.log('\nPress Ctrl+C to stop...\n');

    process.on('SIGINT', () => {
        console.log('\nStopping telemetry server...');
        telemetry.stopServer();
        process.exit(0);
    });
}

main().catch(console.error);
