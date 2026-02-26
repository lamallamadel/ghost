const { MeshCoordinator } = require('../coordinator');

async function runWorkflowExample() {
    const coordinator = new MeshCoordinator({
        agentId: 'coordinator',
        port: 8100,
        capabilities: ['orchestration', 'compute']
    });

    const worker1 = new MeshCoordinator({
        agentId: 'worker-1',
        port: 8101,
        capabilities: ['compute', 'data-processing']
    });

    const worker2 = new MeshCoordinator({
        agentId: 'worker-2',
        port: 8102,
        capabilities: ['compute', 'validation']
    });

    coordinator.on('workflow-started', (event) => {
        console.log(`Workflow started: ${event.workflowId}`);
    });

    coordinator.on('workflow-completed', (event) => {
        console.log(`Workflow completed: ${event.workflowId} in ${event.duration}ms`);
        console.log('Result:', event.result);
    });

    coordinator.on('workflow-failed', (event) => {
        console.log(`Workflow failed: ${event.workflowId} - ${event.error}`);
    });

    await coordinator.start();
    await worker1.start();
    await worker2.start();

    await new Promise(resolve => setTimeout(resolve, 1000));

    await coordinator.connectToPeer('localhost', 8101);
    await coordinator.connectToPeer('localhost', 8102);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const workflow = {
        name: 'Data Processing Pipeline',
        tasks: [
            {
                id: 'fetch',
                type: 'fetch_data',
                requiredCapabilities: ['data-processing'],
                params: { source: 'database' }
            },
            {
                id: 'process',
                type: 'process_data',
                requiredCapabilities: ['data-processing'],
                params: { algorithm: 'transform' }
            },
            {
                id: 'validate',
                type: 'validate_data',
                requiredCapabilities: ['validation'],
                params: { schema: 'v1' }
            }
        ],
        dependencies: {
            'process': ['fetch'],
            'validate': ['process']
        }
    };

    coordinator.registerWorkflow('data-pipeline', workflow);

    try {
        const result = await coordinator.executeWorkflow('data-pipeline', {
            input: 'test-data',
            timestamp: Date.now()
        });
        
        console.log('\nWorkflow execution result:', result);
    } catch (error) {
        console.error('Workflow execution error:', error.message);
    }

    console.log('\nCoordinator info:', coordinator.getInfo());

    await coordinator.stop();
    await worker1.stop();
    await worker2.stop();

    console.log('\nWorkflow example completed');
}

if (require.main === module) {
    runWorkflowExample().catch(console.error);
}

module.exports = { runWorkflowExample };
