const { MeshCoordinator } = require('../coordinator');

async function runBasicMeshExample() {
    const agent1 = new MeshCoordinator({
        agentId: 'agent-1',
        port: 8001,
        capabilities: ['compute', 'storage'],
        metadata: { region: 'us-east' }
    });

    const agent2 = new MeshCoordinator({
        agentId: 'agent-2',
        port: 8002,
        capabilities: ['compute', 'network'],
        metadata: { region: 'us-west' }
    });

    agent1.on('started', (info) => {
        console.log(`Agent 1 started: ${info.agentId} on port ${info.port}`);
    });

    agent2.on('started', (info) => {
        console.log(`Agent 2 started: ${info.agentId} on port ${info.port}`);
    });

    agent1.on('peer-connected', (event) => {
        console.log(`Agent 1: Peer connected - ${event.peerId}`);
    });

    agent2.on('peer-connected', (event) => {
        console.log(`Agent 2: Peer connected - ${event.peerId}`);
    });

    agent1.on('agent-discovered', (agent) => {
        console.log(`Agent 1: Discovered ${agent.id} at ${agent.host}:${agent.port}`);
    });

    agent2.on('agent-discovered', (agent) => {
        console.log(`Agent 2: Discovered ${agent.id} at ${agent.host}:${agent.port}`);
    });

    await agent1.start();
    await agent2.start();

    await new Promise(resolve => setTimeout(resolve, 2000));

    await agent1.connectToPeer('localhost', 8002);

    agent1.setState('shared-config', { version: '1.0', enabled: true });
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\nAgent 1 state:', agent1.getAllState());
    console.log('Agent 2 state:', agent2.getAllState());

    agent1.recordMetric('tasks_completed', 42, { agent: 'agent-1' });
    agent2.recordMetric('tasks_completed', 37, { agent: 'agent-2' });

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\nAgent 1 metrics:', Object.keys(agent1.getMetrics()));
    console.log('Agent 2 metrics:', Object.keys(agent2.getMetrics()));

    console.log('\nAgent 1 peers:', agent1.getPeers().map(p => p.id));
    console.log('Agent 2 peers:', agent2.getPeers().map(p => p.id));

    console.log('\nAgent 1 info:', agent1.getInfo());
    console.log('Agent 2 info:', agent2.getInfo());

    await agent1.stop();
    await agent2.stop();

    console.log('\nMesh example completed');
}

if (require.main === module) {
    runBasicMeshExample().catch(console.error);
}

module.exports = { runBasicMeshExample };
