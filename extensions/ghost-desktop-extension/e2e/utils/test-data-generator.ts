export function generateSpanEvent(overrides: Partial<any> = {}) {
  const defaultSpan = {
    spanId: `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    traceId: `trace-${Date.now()}`,
    parentSpanId: null,
    name: 'test-span',
    startTime: Date.now(),
    endTime: Date.now() + 100,
    duration: 100,
    attributes: {
      requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      extensionId: 'test-extension',
      stage: 'execute',
      status: 'completed',
      type: 'test',
      operation: 'test'
    },
    events: [],
    status: { code: 'OK' }
  };

  return {
    ...defaultSpan,
    ...overrides,
    attributes: {
      ...defaultSpan.attributes,
      ...(overrides.attributes || {})
    }
  };
}

export function generateRequestFlow(requestId?: string) {
  const id = requestId || `req-flow-${Date.now()}`;
  const stages = ['intercept', 'auth', 'audit', 'execute'];
  const baseTime = Date.now();

  return stages.map((stage, index) => ({
    spanId: `span-${stage}-${id}`,
    traceId: `trace-${id}`,
    parentSpanId: index > 0 ? `span-${stages[index - 1]}-${id}` : null,
    name: `${stage}-span`,
    startTime: baseTime + index * 100,
    endTime: baseTime + index * 100 + 50,
    duration: 50,
    attributes: {
      requestId: id,
      extensionId: 'ghost-git-extension',
      stage,
      status: index === stages.length - 1 ? 'completed' : 'approved',
      type: 'git',
      operation: 'status'
    },
    events: [],
    status: { code: 'OK' }
  }));
}

export function generateRejectedRequest(dropLayer: 'auth' | 'audit' = 'auth') {
  const requestId = `req-rejected-${Date.now()}`;
  const dropReasons = {
    auth: 'Rate limit exceeded',
    audit: 'Security policy violation'
  };

  return {
    spanId: `span-rejected-${requestId}`,
    traceId: `trace-rejected-${requestId}`,
    parentSpanId: null,
    name: `${dropLayer}-rejection`,
    startTime: Date.now(),
    endTime: Date.now() + 10,
    duration: 10,
    attributes: {
      requestId,
      extensionId: 'test-extension',
      stage: dropLayer,
      status: 'rejected',
      type: dropLayer === 'auth' ? 'network' : 'filesystem',
      operation: dropLayer === 'auth' ? 'fetch' : 'write',
      dropLayer,
      dropReason: dropReasons[dropLayer]
    },
    events: [],
    status: { code: 'FAILED' }
  };
}

export function generateBatchSpans(count: number, options: Partial<any> = {}) {
  return Array.from({ length: count }, (_, i) => 
    generateSpanEvent({
      ...options,
      spanId: `span-batch-${i}`,
      attributes: {
        requestId: `req-batch-${i}`,
        ...options.attributes
      }
    })
  );
}

export function generateMetricUpdate(extensionId: string = 'test-extension') {
  return {
    extensionId,
    requests: {
      [extensionId]: {
        total: Math.floor(Math.random() * 1000),
        approved: Math.floor(Math.random() * 900),
        rejected: Math.floor(Math.random() * 100)
      }
    },
    latencies: {
      [extensionId]: {
        intercept: { p50: 10, p95: 20, p99: 40 },
        auth: { p50: 8, p95: 15, p99: 30 },
        audit: { p50: 12, p95: 25, p99: 50 },
        execute: { p50: 50, p95: 150, p99: 300 }
      }
    },
    rateLimitViolations: {
      [extensionId]: Math.floor(Math.random() * 50)
    },
    validationFailures: {
      [extensionId]: {
        filesystem: Math.floor(Math.random() * 10),
        network: Math.floor(Math.random() * 10)
      }
    }
  };
}

export function generateGatewayState() {
  return {
    version: '1.0.0',
    uptime: Date.now() - 3600000,
    uptimeFormatted: '1h 0m 0s',
    extensionsLoaded: 3,
    pipeline: {
      totalRequests: 1500,
      totalRateLimitViolations: 25,
      totalValidationFailures: 10,
      totalAuthFailures: 5
    },
    telemetry: {
      spansCollected: 5000,
      maxSpans: 10000,
      wsConnections: 1
    }
  };
}
