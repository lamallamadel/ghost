const { DistributedTracing } = require('../index');

async function tracingExample() {
    const tracing = new DistributedTracing();

    console.log('=== Simulating Cross-Extension Calls ===\n');

    const { traceId, spanId: rootSpanId } = tracing.startTrace(
        'trace-001',
        'api-gateway',
        'handleRequest',
        { endpoint: '/api/users' }
    );

    console.log(`Started trace: ${traceId}`);

    tracing.addSpanLog(rootSpanId, 'Request received');
    tracing.addSpanTag(rootSpanId, 'http.method', 'GET');

    await new Promise(resolve => setTimeout(resolve, 50));

    const authSpan = tracing.startSpan(
        traceId,
        rootSpanId,
        'auth-validator',
        'validateToken',
        { token: '[REDACTED]' }
    );

    tracing.addSpanLog(authSpan.spanId, 'Token validation started');
    await new Promise(resolve => setTimeout(resolve, 30));
    tracing.addSpanTag(authSpan.spanId, 'user.id', '12345');
    tracing.endSpan(authSpan.spanId, 'success');

    const dbSpan = tracing.startSpan(
        traceId,
        rootSpanId,
        'database-client',
        'queryUsers',
        { query: 'SELECT * FROM users' }
    );

    tracing.addSpanLog(dbSpan.spanId, 'Database query started');
    await new Promise(resolve => setTimeout(resolve, 80));
    tracing.addSpanTag(dbSpan.spanId, 'db.rows', '25');
    tracing.endSpan(dbSpan.spanId, 'success');

    const cacheSpan = tracing.startSpan(
        traceId,
        rootSpanId,
        'cache-manager',
        'cacheResults',
        { key: 'users:list' }
    );

    tracing.addSpanLog(cacheSpan.spanId, 'Caching results');
    await new Promise(resolve => setTimeout(resolve, 20));
    tracing.endSpan(cacheSpan.spanId, 'success');

    tracing.endSpan(rootSpanId, 'success');

    console.log('\n=== Trace Details ===\n');
    const trace = tracing.getTrace(traceId);
    console.log(JSON.stringify(trace, null, 2));

    console.log('\n=== Call Graph Visualization ===\n');
    const visualization = tracing.visualizeCallGraph(traceId);
    console.log('Mermaid Diagram:');
    console.log(visualization.mermaid);
    console.log('\nGraph Stats:');
    console.log(JSON.stringify(visualization.stats, null, 2));

    console.log('\n=== Simulating More Cross-Extension Calls ===\n');

    for (let i = 0; i < 5; i++) {
        const { traceId: tid, spanId: sid } = tracing.startTrace(
            `trace-${i + 2}`,
            'api-gateway',
            'handleRequest'
        );

        const span1 = tracing.startSpan(tid, sid, 'auth-validator', 'validateToken');
        tracing.endSpan(span1.spanId, 'success');

        const span2 = tracing.startSpan(tid, sid, 'database-client', 'query');
        tracing.endSpan(span2.spanId, 'success');

        tracing.endSpan(sid, 'success');
    }

    console.log('\n=== Cross-Extension Interactions ===\n');
    const interactions = tracing.getExtensionInteractions();
    console.log(JSON.stringify(interactions, null, 2));

    console.log('\n=== Cross-Extension Calls ===\n');
    const crossCalls = tracing.getCrossExtensionCalls();
    console.log(JSON.stringify(crossCalls, null, 2));

    await tracing.persist();
    console.log('\n✓ Tracing data persisted');
}

tracingExample().catch(console.error);
