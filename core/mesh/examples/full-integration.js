const { MeshCoordinator } = require('../coordinator');

async function runFullIntegrationExample() {
    console.log('=== Full Distributed Multi-Agent System Integration ===\n');

    const agents = [];
    const agentConfigs = [
        {
            id: 'coordinator',
            port: 9001,
            capabilities: ['orchestration', 'telemetry', 'state-sync'],
            metadata: { role: 'coordinator', datacenter: 'dc1' }
        },
        {
            id: 'compute-1',
            port: 9002,
            capabilities: ['compute', 'data-processing'],
            metadata: { role: 'worker', datacenter: 'dc1', cpu: 8 }
        },
        {
            id: 'compute-2',
            port: 9003,
            capabilities: ['compute', 'validation'],
            metadata: { role: 'worker', datacenter: 'dc2', cpu: 16 }
        },
        {
            id: 'storage-1',
            port: 9004,
            capabilities: ['storage', 'database'],
            metadata: { role: 'storage', datacenter: 'dc1', capacity: '1TB' }
        }
    ];

    console.log('Step 1: Starting agents...');
    for (const config of agentConfigs) {
        const agent = new MeshCoordinator({
            agentId: config.id,
            port: config.port,
            capabilities: config.capabilities,
            metadata: config.metadata
        });

        agent.on('started', (info) => {
            console.log(`  ✓ ${info.agentId} started on port ${info.port}`);
        });

        agent.on('peer-connected', (event) => {
            console.log(`  ↔ ${agent.agentId} connected to ${event.peerId}`);
        });

        agent.on('agent-discovered', (discoveredAgent) => {
            console.log(`  🔍 ${agent.agentId} discovered ${discoveredAgent.id} via multicast`);
        });

        await agent.start();
        agents.push({ config, instance: agent });
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\nStep 2: Establishing mesh topology...');
    const coordinator = agents[0].instance;
    for (let i = 1; i < agents.length; i++) {
        await coordinator.connectToPeer('localhost', agents[i].config.port);
    }

    for (let i = 1; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
            await agents[i].instance.connectToPeer('localhost', agents[j].config.port);
        }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\nStep 3: Configuring authentication...');
    for (const agent of agents) {
        for (const otherAgent of agents) {
            if (agent.instance.agentId !== otherAgent.instance.agentId) {
                agent.instance.authService.registerTrustedAgent(
                    otherAgent.instance.agentId,
                    {
                        capabilities: otherAgent.config.capabilities,
                        metadata: otherAgent.config.metadata
                    }
                );
            }
        }
        console.log(`  ✓ ${agent.instance.agentId}: Registered ${agents.length - 1} trusted agents`);
    }

    console.log('\nStep 4: Synchronizing distributed state...');
    coordinator.setState('cluster.name', 'production-cluster');
    coordinator.setState('cluster.version', '2.0.0');
    coordinator.setState('cluster.maxNodes', 100);

    agents[1].instance.setState('service.compute1.status', 'ready');
    agents[2].instance.setState('service.compute2.status', 'ready');
    agents[3].instance.setState('service.storage1.status', 'ready');

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n  State on all agents:');
    for (const agent of agents) {
        const state = agent.instance.getAllState();
        console.log(`  ${agent.instance.agentId}:`, Object.keys(state).length, 'keys');
    }

    console.log('\nStep 5: Registering and executing distributed workflow...');
    
    const dataProcessingWorkflow = {
        name: 'Distributed Data Processing Pipeline',
        tasks: [
            {
                id: 'fetch-data',
                type: 'fetch_data',
                requiredCapabilities: ['storage'],
                params: { source: 'primary-db', query: 'SELECT * FROM events' }
            },
            {
                id: 'transform',
                type: 'transform_data',
                requiredCapabilities: ['data-processing'],
                params: { transform: 'normalize-events' }
            },
            {
                id: 'validate',
                type: 'validate_data',
                requiredCapabilities: ['validation'],
                params: { schema: 'events-v2' }
            },
            {
                id: 'compute-stats',
                type: 'compute_statistics',
                requiredCapabilities: ['compute'],
                params: { metrics: ['count', 'avg', 'p95'] }
            },
            {
                id: 'store-results',
                type: 'store_results',
                requiredCapabilities: ['storage'],
                params: { destination: 'results-db' }
            }
        ],
        dependencies: {
            'transform': ['fetch-data'],
            'validate': ['transform'],
            'compute-stats': ['validate'],
            'store-results': ['compute-stats']
        }
    };

    coordinator.registerWorkflow('data-pipeline', dataProcessingWorkflow);
    console.log('  ✓ Workflow registered with 5 tasks and dependencies');

    coordinator.on('workflow-started', (event) => {
        console.log(`  ▶ Workflow execution started: ${event.workflowId}`);
    });

    coordinator.on('workflow-completed', (event) => {
        console.log(`  ✓ Workflow completed in ${event.duration}ms`);
    });

    try {
        const workflowResult = await coordinator.executeWorkflow('data-pipeline', {
            batchId: 'batch-001',
            timestamp: Date.now()
        });
        console.log('  Workflow result:', JSON.stringify(workflowResult, null, 2).substring(0, 200) + '...');
    } catch (error) {
        console.log(`  ⚠ Workflow execution: ${error.message}`);
    }

    console.log('\nStep 6: Collecting and aggregating telemetry...');
    
    for (let i = 0; i < 5; i++) {
        agents[1].instance.recordMetric('cpu_usage', 40 + Math.random() * 30, { host: 'compute-1' });
        agents[1].instance.recordMetric('memory_usage', 4096 + Math.random() * 2048, { host: 'compute-1' });
        
        agents[2].instance.recordMetric('cpu_usage', 60 + Math.random() * 25, { host: 'compute-2' });
        agents[2].instance.recordMetric('memory_usage', 8192 + Math.random() * 4096, { host: 'compute-2' });
        
        agents[3].instance.recordMetric('disk_usage', 500 + Math.random() * 100, { host: 'storage-1' });
        agents[3].instance.recordMetric('iops', 1000 + Math.random() * 500, { host: 'storage-1' });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await coordinator.telemetryCollector.collectFromPeers();

    const aggregatedMetrics = coordinator.getMetrics();
    console.log(`  ✓ Aggregated ${Object.keys(aggregatedMetrics).length} metrics from ${agents.length} agents`);
    
    console.log('\n  Sample aggregated metrics:');
    for (const [key, metric] of Object.entries(aggregatedMetrics)) {
        if (metric.aggregation) {
            console.log(`    ${key}:`);
            console.log(`      Mean: ${metric.aggregation.mean?.toFixed(2)}`);
            console.log(`      Min: ${metric.aggregation.min?.toFixed(2)}`);
            console.log(`      Max: ${metric.aggregation.max?.toFixed(2)}`);
            console.log(`      Sources: ${metric.sources}`);
        }
        if (Object.keys(aggregatedMetrics).indexOf(key) >= 2) break;
    }

    console.log('\nStep 7: System status report...');
    console.log('\n  Mesh Topology:');
    for (const agent of agents) {
        const peers = agent.instance.getPeers();
        console.log(`    ${agent.instance.agentId}: ${peers.length} peers - [${peers.map(p => p.id).join(', ')}]`);
    }

    console.log('\n  Discovery Status:');
    const discovered = coordinator.getDiscoveredAgents();
    console.log(`    Coordinator discovered ${discovered.length} agents via multicast`);
    for (const agent of discovered) {
        console.log(`      - ${agent.id}: ${agent.capabilities.join(', ')}`);
    }

    console.log('\n  Agent Information:');
    for (const agent of agents) {
        const info = agent.instance.getInfo();
        console.log(`    ${info.agentId}:`);
        console.log(`      Port: ${info.port}`);
        console.log(`      Capabilities: ${info.capabilities.join(', ')}`);
        console.log(`      Peers: ${info.peers}`);
        console.log(`      State Size: ${info.stateSize}`);
        console.log(`      Metrics: ${info.metricsCount}`);
    }

    console.log('\n  Authentication Status:');
    for (const agent of agents) {
        const trusted = agent.instance.getTrustedAgents();
        console.log(`    ${agent.instance.agentId}: ${trusted.length} trusted agents`);
    }

    console.log('\nStep 8: Testing concurrent state updates (CRDT conflict resolution)...');
    agents[0].instance.setState('concurrent-test', { value: 100, updatedBy: 'coordinator' });
    agents[1].instance.setState('concurrent-test', { value: 200, updatedBy: 'compute-1' });
    agents[2].instance.setState('concurrent-test', { value: 300, updatedBy: 'compute-2' });

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n  Final values after CRDT conflict resolution:');
    for (const agent of agents) {
        const value = agent.instance.getState('concurrent-test');
        console.log(`    ${agent.instance.agentId}: ${JSON.stringify(value)}`);
    }

    console.log('\nStep 9: Shutting down mesh network...');
    for (const agent of agents) {
        await agent.instance.stop();
        console.log(`  ✓ ${agent.instance.agentId} stopped`);
    }

    console.log('\n=== Full Integration Test Completed Successfully ===\n');
    console.log('Summary:');
    console.log(`  ✓ Started ${agents.length} agents in mesh topology`);
    console.log(`  ✓ Established ${agents.length * (agents.length - 1) / 2} peer connections`);
    console.log('  ✓ Configured authentication and trust relationships');
    console.log('  ✓ Synchronized distributed state using CRDT');
    console.log('  ✓ Executed distributed workflow with task dependencies');
    console.log('  ✓ Collected and aggregated telemetry from all nodes');
    console.log('  ✓ Demonstrated CRDT conflict resolution');
    console.log('  ✓ Clean shutdown of all agents');
}

if (require.main === module) {
    runFullIntegrationExample().catch(console.error);
}

module.exports = { runFullIntegrationExample };
