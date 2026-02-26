const { MeshCoordinator } = require('../coordinator');

async function runDistributedStateExample() {
    const agents = [];
    const agentCount = 3;

    for (let i = 0; i < agentCount; i++) {
        const agent = new MeshCoordinator({
            agentId: `agent-${i}`,
            port: 8200 + i,
            capabilities: ['state-sync'],
            metadata: { index: i }
        });

        agent.on('state-change', (event) => {
            console.log(`[${agent.agentId}] Local state change: ${event.key} = ${JSON.stringify(event.value)}`);
        });

        agent.on('remote-state-change', (event) => {
            console.log(`[${agent.agentId}] Remote state change from ${event.from}: ${event.key}`);
        });

        agents.push(agent);
    }

    for (const agent of agents) {
        await agent.start();
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
            await agents[i].connectToPeer('localhost', 8200 + j);
        }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n--- Setting initial state ---');
    agents[0].setState('config.version', '1.0.0');
    agents[0].setState('config.features', ['feature-a', 'feature-b']);

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n--- Concurrent updates from different agents ---');
    agents[1].setState('config.timeout', 30000);
    agents[2].setState('config.maxRetries', 5);

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n--- Final state on all agents ---');
    for (const agent of agents) {
        console.log(`[${agent.agentId}] State:`, agent.getAllState());
    }

    console.log('\n--- Conflicting concurrent writes (CRDT resolution) ---');
    agents[0].setState('counter', 100);
    agents[1].setState('counter', 200);
    agents[2].setState('counter', 300);

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n--- Counter values after conflict resolution ---');
    for (const agent of agents) {
        console.log(`[${agent.agentId}] counter =`, agent.getState('counter'));
    }

    for (const agent of agents) {
        await agent.stop();
    }

    console.log('\nDistributed state example completed');
}

if (require.main === module) {
    runDistributedStateExample().catch(console.error);
}

module.exports = { runDistributedStateExample };
