# Distributed Multi-Agent Collaboration System

A comprehensive mesh networking system for distributed agent-to-agent (A2A) communication with support for discovery, state synchronization, authentication, workflow orchestration, and telemetry collection.

## Architecture

The system consists of the following components:

### 1. AgentMeshNetwork (mesh-network.js)
**JSON-RPC over WebSocket mesh topology** where each agent directly connects to peers.

**Features:**
- Full-duplex WebSocket connections between agents
- JSON-RPC 2.0 protocol for request/response communication
- Automatic peer reconnection on disconnect
- Heartbeat-based health monitoring
- Broadcast messaging to all connected peers

**Usage:**
```javascript
const { AgentMeshNetwork } = require('./core/mesh');

const mesh = new AgentMeshNetwork({
    agentId: 'agent-1',
    port: 8001,
    capabilities: ['compute', 'storage'],
    metadata: { region: 'us-east' }
});

await mesh.start();

// Connect to peer
await mesh.connectToPeer('localhost', 8002);

// Send request to peer
const result = await mesh.sendRequest('agent-2', 'execute_task', { task: 'data' });

// Handle incoming requests
mesh.on('request', (event) => {
    const { peerId, method, params, reply } = event;
    reply({ result: 'done' });
});
```

### 2. AgentDiscoveryService (discovery-service.js)
**UDP multicast-based agent discovery** for local network discovery.

**Features:**
- UDP multicast broadcasting of agent capabilities
- Automatic agent announcement at regular intervals
- Agent leave notifications
- TTL-based agent timeout detection
- Capability-based agent filtering

**Usage:**
```javascript
const { AgentDiscoveryService } = require('./core/mesh');

const discovery = new AgentDiscoveryService({
    agentId: 'agent-1',
    port: 8001,
    capabilities: ['compute'],
    multicastAddress: '239.255.255.250',
    multicastPort: 5353
});

await discovery.start();

// Listen for discovered agents
discovery.on('agent-discovered', (agent) => {
    console.log(`Discovered ${agent.id} at ${agent.host}:${agent.port}`);
});

// Find agents by capability
const computeAgents = discovery.getAgentsByCapability('compute');
```

### 3. CRDTStateSync (crdt-state-sync.js)
**CRDT-based state synchronization** for conflict-free concurrent editing.

**Features:**
- Last-write-wins CRDT with vector clocks
- Automatic conflict resolution
- Tombstone-based deletion tracking
- Periodic state synchronization
- Event-driven state change notifications

**Usage:**
```javascript
const { CRDTStateSync } = require('./core/mesh');

const stateSync = new CRDTStateSync({
    agentId: 'agent-1',
    meshNetwork: mesh
});

stateSync.start();

// Set state
stateSync.set('config.version', '1.0.0');

// Get state
const version = stateSync.get('config.version');

// Listen for changes
stateSync.on('remote-change', (event) => {
    console.log(`State changed: ${event.key} from ${event.from}`);
});
```

### 4. AgentAuthService (auth-service.js)
**Agent authentication** using JWT tokens, shared secrets, or mutual TLS.

**Features:**
- Multiple authentication modes: JWT, shared-secret, mutual-TLS
- Token generation and verification
- Trusted agent registry
- Authentication result caching
- Token expiration handling

**Usage:**
```javascript
const { AgentAuthService } = require('./core/mesh');

const auth = new AgentAuthService({
    agentId: 'agent-1',
    authMode: 'jwt',
    jwtSecret: 'your-secret-key'
});

// Generate token
const token = auth.generateToken('agent-2', ['compute'], { region: 'us-east' });

// Verify token
const result = auth.verifyToken(token);

// Register trusted agent
auth.registerTrustedAgent('agent-2', {
    capabilities: ['compute'],
    secret: 'shared-secret'
});

// Authenticate agent
const authResult = await auth.authenticateAgent('agent-2', { token });
```

### 5. WorkflowOrchestrator (orchestrator.js)
**Workflow orchestration coordinator** that routes tasks to capable agents.

**Features:**
- DAG-based workflow execution with dependency resolution
- Capability-based agent selection
- Multiple load balancing strategies (round-robin, least-loaded, random)
- Task retry and timeout handling
- Parallel task execution within workflow levels

**Usage:**
```javascript
const { WorkflowOrchestrator } = require('./core/mesh');

const orchestrator = new WorkflowOrchestrator({
    meshNetwork: mesh,
    discoveryService: discovery,
    loadBalancingStrategy: 'least-loaded'
});

orchestrator.start();

// Register workflow
orchestrator.registerWorkflow('data-pipeline', {
    name: 'Data Processing Pipeline',
    tasks: [
        {
            id: 'fetch',
            type: 'fetch_data',
            requiredCapabilities: ['storage'],
            params: { source: 'database' }
        },
        {
            id: 'process',
            type: 'process_data',
            requiredCapabilities: ['compute'],
            params: { algorithm: 'transform' }
        }
    ],
    dependencies: {
        'process': ['fetch']
    }
});

// Execute workflow
const result = await orchestrator.executeWorkflow('data-pipeline', {
    input: 'data'
});
```

### 6. DistributedTelemetryCollector (telemetry-collector.js)
**Distributed telemetry collector** aggregating metrics from all mesh nodes.

**Features:**
- Local metric collection with custom collectors
- Remote metric aggregation from peers
- Histogram and gauge metric types
- Statistical aggregation (min, max, mean, percentiles)
- Automatic metric cleanup based on retention period

**Usage:**
```javascript
const { DistributedTelemetryCollector } = require('./core/mesh');

const telemetry = new DistributedTelemetryCollector({
    agentId: 'agent-1',
    meshNetwork: mesh,
    collectionInterval: 10000
});

telemetry.start();

// Record metrics
telemetry.recordMetric('cpu_usage', 45.2, { host: 'server-1' });
telemetry.incrementCounter('requests_total', { endpoint: '/api' });
telemetry.recordHistogram('response_time', 125, { endpoint: '/api' });

// Register custom collector
telemetry.registerCollector('system_metrics', () => {
    return {
        cpu_usage: getCpuUsage(),
        memory_usage: getMemoryUsage()
    };
});

// Get aggregated metrics
const metrics = telemetry.getAllAggregatedMetrics();
```

### 7. MeshCoordinator (coordinator.js)
**Unified coordinator** that integrates all mesh components.

**Features:**
- Single interface for all mesh operations
- Automatic component lifecycle management
- Built-in telemetry collectors for mesh health
- Simplified API for common operations

**Usage:**
```javascript
const { MeshCoordinator } = require('./core/mesh');

const coordinator = new MeshCoordinator({
    agentId: 'agent-1',
    port: 8001,
    capabilities: ['compute', 'storage'],
    metadata: { region: 'us-east' }
});

await coordinator.start();

// All operations through single interface
coordinator.setState('key', 'value');
coordinator.recordMetric('metric', 100);
await coordinator.executeWorkflow('workflow-id', context);

const info = coordinator.getInfo();
```

## Examples

Complete examples are provided in `core/mesh/examples/`:

- **basic-mesh.js** - Simple mesh network with 2 agents
- **workflow-example.js** - Workflow orchestration with task dependencies
- **distributed-state.js** - CRDT-based state synchronization across 3 agents
- **telemetry-example.js** - Distributed metrics collection and aggregation

Run examples:
```bash
node core/mesh/examples/basic-mesh.js
node core/mesh/examples/workflow-example.js
node core/mesh/examples/distributed-state.js
node core/mesh/examples/telemetry-example.js
```

## Protocol Specifications

### JSON-RPC Message Format

All mesh communication uses JSON-RPC 2.0:

**Request:**
```json
{
  "type": "request",
  "id": 1,
  "method": "execute_task",
  "params": { "task": "data" }
}
```

**Response:**
```json
{
  "type": "response",
  "id": 1,
  "result": { "status": "completed" }
}
```

### Handshake Protocol

When connecting to a peer:

1. Client sends handshake with agent info
2. Server responds with handshake_ack
3. Heartbeat monitoring starts
4. Authentication exchange (optional)

### State Synchronization Protocol

CRDT synchronization:

1. Agents broadcast state updates to all peers
2. Each update includes vector clock
3. Conflicts resolved using last-write-wins with agent ID tiebreaker
4. Periodic full state sync for consistency

### Discovery Protocol

UDP multicast discovery:

1. Agents broadcast announcement every 30s
2. Announcements include agent ID, capabilities, and port
3. Agents listening on multicast address discover peers
4. Stale agents removed after TTL expires

## Security

### Authentication Modes

**JWT (Recommended):**
- Stateless token-based authentication
- Configurable expiration
- HS256 signing algorithm

**Shared Secret:**
- Pre-shared key authentication
- SHA-256 hashing
- Suitable for trusted networks

**Mutual TLS:**
- Certificate-based authentication
- Public key fingerprint verification
- Highest security level

### Best Practices

1. Always enable authentication in production
2. Use TLS for WebSocket connections
3. Implement capability-based access control
4. Regularly rotate JWT secrets
5. Monitor authentication failures
6. Use network segmentation for agent isolation

## Performance Considerations

- **Mesh Network:** Direct peer connections reduce latency
- **State Sync:** Use selective sync for large state trees
- **Discovery:** Adjust announce interval based on network size
- **Telemetry:** Configure retention period to limit memory usage
- **Orchestrator:** Set appropriate task timeout and retry limits

## Integration with Ghost

The mesh system integrates with Ghost's existing architecture:

```javascript
const { MeshCoordinator } = require('./core/mesh');
const { ExtensionRuntime } = require('./core/runtime');

// Create mesh-enabled agent
const agent = new MeshCoordinator({
    agentId: 'ghost-agent-1',
    capabilities: ['git', 'ai-commit']
});

await agent.start();

// Register extension as workflow
const extensionWorkflow = {
    name: 'Extension Execution',
    tasks: [/* ... */]
};

agent.registerWorkflow('execute-extension', extensionWorkflow);
```

## API Reference

See individual component files for complete API documentation.

## Testing

The mesh system includes comprehensive event-driven testing:

```javascript
const mesh = new AgentMeshNetwork({ agentId: 'test' });

mesh.on('peer-connected', (event) => {
    console.log('Peer connected:', event.peerId);
});

await mesh.start();
```

## License

MIT - Part of Ghost CLI project
