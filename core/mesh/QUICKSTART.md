# Mesh System Quick Start Guide

## 5-Minute Quick Start

### Step 1: Install Dependencies

```bash
npm install ws jsonwebtoken
```

### Step 2: Create Your First Agent

```javascript
const { MeshCoordinator } = require('./core/mesh');

const agent = new MeshCoordinator({
    agentId: 'my-agent',
    port: 8000,
    capabilities: ['compute']
});

await agent.start();
console.log('Agent started:', agent.getInfo());
```

### Step 3: Connect Two Agents

```javascript
// Agent 1
const agent1 = new MeshCoordinator({
    agentId: 'agent-1',
    port: 8001,
    capabilities: ['compute']
});
await agent1.start();

// Agent 2
const agent2 = new MeshCoordinator({
    agentId: 'agent-2',
    port: 8002,
    capabilities: ['storage']
});
await agent2.start();

// Connect them
await agent1.connectToPeer('localhost', 8002);

console.log('Agents connected!');
console.log('Agent 1 peers:', agent1.getPeers());
console.log('Agent 2 peers:', agent2.getPeers());
```

### Step 4: Share State

```javascript
// Set state on agent 1
agent1.setState('shared-config', { version: '1.0' });

// Wait for sync
await new Promise(resolve => setTimeout(resolve, 1000));

// Read on agent 2
const config = agent2.getState('shared-config');
console.log('Config on agent 2:', config);
```

### Step 5: Execute Workflow

```javascript
// Register workflow on coordinator
agent1.registerWorkflow('simple-task', {
    name: 'Simple Task',
    tasks: [{
        id: 'compute',
        type: 'run_computation',
        requiredCapabilities: ['compute'],
        params: { data: 'test' }
    }]
});

// Execute it
const result = await agent1.executeWorkflow('simple-task', {
    input: 'my-data'
});
console.log('Workflow result:', result);
```

### Step 6: Collect Metrics

```javascript
// Record metrics
agent1.recordMetric('cpu_usage', 45.2);
agent1.recordMetric('memory_usage', 2048);

// Collect from peers
await agent1.telemetryCollector.collectFromPeers();

// Get aggregated metrics
const metrics = agent1.getMetrics();
console.log('Metrics:', metrics);
```

## Common Patterns

### Pattern 1: Hub-and-Spoke Topology

```javascript
// Central coordinator
const hub = new MeshCoordinator({
    agentId: 'hub',
    port: 8000,
    capabilities: ['orchestration']
});
await hub.start();

// Worker agents
const workers = [];
for (let i = 1; i <= 3; i++) {
    const worker = new MeshCoordinator({
        agentId: `worker-${i}`,
        port: 8000 + i,
        capabilities: ['compute']
    });
    await worker.start();
    await hub.connectToPeer('localhost', worker.port);
    workers.push(worker);
}
```

### Pattern 2: Full Mesh Topology

```javascript
const agents = [];

// Create agents
for (let i = 0; i < 3; i++) {
    const agent = new MeshCoordinator({
        agentId: `agent-${i}`,
        port: 8000 + i
    });
    await agent.start();
    agents.push(agent);
}

// Connect all to all
for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
        await agents[i].connectToPeer('localhost', agents[j].port);
    }
}
```

### Pattern 3: Auto-Discovery Mesh

```javascript
// Agents will discover each other via multicast
const agents = [];

for (let i = 0; i < 3; i++) {
    const agent = new MeshCoordinator({
        agentId: `agent-${i}`,
        port: 8000 + i
    });
    
    // Listen for discoveries
    agent.on('agent-discovered', async (discovered) => {
        console.log(`Discovered ${discovered.id}`);
        await agent.connectToPeer(discovered.host, discovered.port);
    });
    
    await agent.start();
    agents.push(agent);
}

// Wait for discovery
await new Promise(resolve => setTimeout(resolve, 5000));
```

### Pattern 4: Workflow Pipeline

```javascript
const coordinator = new MeshCoordinator({
    agentId: 'coordinator',
    port: 8000,
    capabilities: ['orchestration']
});

coordinator.registerWorkflow('data-pipeline', {
    name: 'Data Processing Pipeline',
    tasks: [
        {
            id: 'fetch',
            type: 'fetch_data',
            requiredCapabilities: ['storage']
        },
        {
            id: 'transform',
            type: 'transform_data',
            requiredCapabilities: ['compute']
        },
        {
            id: 'validate',
            type: 'validate_data',
            requiredCapabilities: ['validation']
        },
        {
            id: 'store',
            type: 'store_data',
            requiredCapabilities: ['storage']
        }
    ],
    dependencies: {
        'transform': ['fetch'],
        'validate': ['transform'],
        'store': ['validate']
    }
});

const result = await coordinator.executeWorkflow('data-pipeline', {
    source: 'input.csv'
});
```

### Pattern 5: Distributed Telemetry

```javascript
// Central collector
const collector = new MeshCoordinator({
    agentId: 'collector',
    port: 8000,
    capabilities: ['telemetry']
});

// Register custom collector
collector.telemetryCollector.registerCollector('system', () => {
    return {
        uptime: process.uptime(),
        memory: process.memoryUsage().heapUsed
    };
});

// Producers
const producers = [];
for (let i = 1; i <= 2; i++) {
    const producer = new MeshCoordinator({
        agentId: `producer-${i}`,
        port: 8000 + i
    });
    await producer.start();
    await collector.connectToPeer('localhost', producer.port);
    
    // Record metrics periodically
    setInterval(() => {
        producer.recordMetric('requests', Math.random() * 100);
        producer.recordMetric('latency', Math.random() * 50);
    }, 2000);
    
    producers.push(producer);
}

// Collect and aggregate
setInterval(async () => {
    await collector.telemetryCollector.collectFromPeers();
    const metrics = collector.getMetrics();
    console.log('Aggregated metrics:', Object.keys(metrics).length);
}, 10000);
```

## Event Handling

### Listen to Mesh Events

```javascript
const agent = new MeshCoordinator({ agentId: 'agent-1' });

// Connection events
agent.on('started', (info) => {
    console.log('Agent started:', info);
});

agent.on('peer-connected', (event) => {
    console.log('Peer connected:', event.peerId);
});

agent.on('peer-disconnected', (event) => {
    console.log('Peer disconnected:', event.peerId);
});

// Discovery events
agent.on('agent-discovered', (agent) => {
    console.log('Agent discovered:', agent.id);
});

// State events
agent.on('state-change', (event) => {
    console.log('Local state changed:', event.key);
});

agent.on('remote-state-change', (event) => {
    console.log('Remote state changed:', event.key, 'from', event.from);
});

// Workflow events
agent.on('workflow-started', (event) => {
    console.log('Workflow started:', event.workflowId);
});

agent.on('workflow-completed', (event) => {
    console.log('Workflow completed:', event.workflowId);
});

// Telemetry events
agent.on('metrics-aggregated', (event) => {
    console.log('Metrics aggregated:', event.metricCount);
});
```

## Configuration Options

### Mesh Network Options

```javascript
const agent = new MeshCoordinator({
    // Agent identification
    agentId: 'my-agent',
    port: 8000,
    capabilities: ['compute', 'storage'],
    metadata: { region: 'us-east', version: '1.0' },
    
    // Mesh network options
    meshNetwork: {
        reconnectInterval: 5000,      // Reconnect after 5s
        heartbeatInterval: 10000,      // Heartbeat every 10s
        messageTimeout: 30000          // Request timeout 30s
    },
    
    // Discovery options
    discovery: {
        multicastAddress: '239.255.255.250',
        multicastPort: 5353,
        announceInterval: 30000,       // Announce every 30s
        agentTTL: 90000                // TTL 90s
    },
    
    // State sync options
    stateSync: {
        syncInterval: 5000             // Sync every 5s
    },
    
    // Auth options
    auth: {
        authMode: 'jwt',               // 'jwt', 'shared-secret', 'mutual-tls'
        jwtSecret: 'your-secret-key',
        tokenExpiry: '1h'
    },
    
    // Orchestrator options
    orchestrator: {
        maxConcurrentTasks: 10,
        taskTimeout: 60000,
        retryAttempts: 3,
        loadBalancingStrategy: 'round-robin'  // or 'least-loaded', 'random'
    },
    
    // Telemetry options
    telemetry: {
        collectionInterval: 10000,
        retentionPeriod: 3600000,
        maxMetricPoints: 1000
    }
});
```

## Troubleshooting

### Problem: Agents can't discover each other

**Solution:** Check multicast is enabled on network
```javascript
// Try manual connection instead
await agent1.connectToPeer('localhost', 8002);
```

### Problem: State not syncing

**Solution:** Ensure agents are connected
```javascript
console.log('Peers:', agent.getPeers());
// Wait longer for sync
await new Promise(resolve => setTimeout(resolve, 2000));
```

### Problem: Workflow tasks not executing

**Solution:** Check agent capabilities
```javascript
console.log('Agent capabilities:', agent.capabilities);
// Ensure workers have required capabilities
```

### Problem: Metrics not aggregating

**Solution:** Verify collection is running
```javascript
await agent.telemetryCollector.collectFromPeers();
const metrics = agent.getMetrics();
console.log('Metrics:', Object.keys(metrics));
```

## Best Practices

1. **Always wait for startup:** Use `await agent.start()`
2. **Handle errors:** Wrap in try/catch blocks
3. **Set meaningful capabilities:** Help with task routing
4. **Use events:** Monitor system health
5. **Clean shutdown:** Call `await agent.stop()`
6. **Test locally first:** Use localhost before network
7. **Enable auth in production:** Don't skip security
8. **Monitor metrics:** Track system health
9. **Set appropriate timeouts:** Based on your workload
10. **Use consistent agent IDs:** For tracking and debugging

## Next Steps

- Read [README.md](./README.md) for complete API documentation
- Check [MESH_IMPLEMENTATION.md](../MESH_IMPLEMENTATION.md) for architecture details
- Run examples in `examples/` directory
- Integrate with Ghost CLI extensions

## Getting Help

See the examples:
- `examples/basic-mesh.js` - Simple setup
- `examples/workflow-example.js` - Task orchestration
- `examples/distributed-state.js` - State synchronization
- `examples/telemetry-example.js` - Metrics collection
- `examples/full-integration.js` - Complete system

Happy meshing! 🕸️
