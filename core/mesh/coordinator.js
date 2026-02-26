const { EventEmitter } = require('events');
const { AgentMeshNetwork } = require('./mesh-network');
const { AgentDiscoveryService } = require('./discovery-service');
const { CRDTStateSync } = require('./crdt-state-sync');
const { AgentAuthService } = require('./auth-service');
const { WorkflowOrchestrator } = require('./orchestrator');
const { DistributedTelemetryCollector } = require('./telemetry-collector');

class MeshCoordinator extends EventEmitter {
    constructor(options = {}) {
        super();
        this.agentId = options.agentId;
        this.port = options.port || 0;
        this.capabilities = options.capabilities || [];
        this.metadata = options.metadata || {};
        
        this.meshNetwork = new AgentMeshNetwork({
            agentId: this.agentId,
            port: this.port,
            capabilities: this.capabilities,
            metadata: this.metadata,
            ...options.meshNetwork
        });

        this.discoveryService = new AgentDiscoveryService({
            agentId: this.agentId,
            port: this.port,
            capabilities: this.capabilities,
            metadata: this.metadata,
            ...options.discovery
        });

        this.stateSync = new CRDTStateSync({
            agentId: this.agentId,
            meshNetwork: this.meshNetwork,
            ...options.stateSync
        });

        this.authService = new AgentAuthService({
            agentId: this.agentId,
            ...options.auth
        });

        this.orchestrator = new WorkflowOrchestrator({
            meshNetwork: this.meshNetwork,
            discoveryService: this.discoveryService,
            authService: this.authService,
            ...options.orchestrator
        });

        this.telemetryCollector = new DistributedTelemetryCollector({
            agentId: this.agentId,
            meshNetwork: this.meshNetwork,
            ...options.telemetry
        });

        this.state = 'STOPPED';
        this._setupEventHandlers();
    }

    _setupEventHandlers() {
        this.meshNetwork.on('peer-connected', (event) => {
            this.emit('peer-connected', event);
            this._authenticatePeer(event.peerId, event);
        });

        this.meshNetwork.on('peer-disconnected', (event) => {
            this.emit('peer-disconnected', event);
        });

        this.meshNetwork.on('error', (event) => {
            this.emit('error', { source: 'mesh-network', ...event });
        });

        this.discoveryService.on('agent-discovered', (agent) => {
            this.emit('agent-discovered', agent);
            this._handleDiscoveredAgent(agent);
        });

        this.discoveryService.on('agent-left', (agent) => {
            this.emit('agent-left', agent);
        });

        this.stateSync.on('change', (event) => {
            this.emit('state-change', event);
        });

        this.stateSync.on('remote-change', (event) => {
            this.emit('remote-state-change', event);
        });

        this.orchestrator.on('workflow-started', (event) => {
            this.emit('workflow-started', event);
        });

        this.orchestrator.on('workflow-completed', (event) => {
            this.emit('workflow-completed', event);
        });

        this.orchestrator.on('workflow-failed', (event) => {
            this.emit('workflow-failed', event);
        });

        this.telemetryCollector.on('metrics-aggregated', (event) => {
            this.emit('metrics-aggregated', event);
        });
    }

    async start() {
        if (this.state === 'RUNNING') {
            throw new Error('Coordinator already running');
        }

        this.state = 'STARTING';
        this.emit('starting');

        try {
            const meshInfo = await this.meshNetwork.start();
            this.port = meshInfo.port;
            
            this.discoveryService.port = this.port;
            await this.discoveryService.start();

            this.stateSync.start();
            this.orchestrator.start();
            this.telemetryCollector.start();

            this._registerBuiltInCollectors();

            this.state = 'RUNNING';
            this.emit('started', {
                agentId: this.agentId,
                port: this.port
            });

            return {
                agentId: this.agentId,
                port: this.port,
                capabilities: this.capabilities
            };
        } catch (error) {
            this.state = 'FAILED';
            this.emit('failed', { error: error.message });
            throw error;
        }
    }

    async stop() {
        if (this.state === 'STOPPED') {
            return;
        }

        this.state = 'STOPPING';
        this.emit('stopping');

        this.telemetryCollector.stop();
        this.orchestrator.stop();
        this.stateSync.stop();
        
        await this.discoveryService.stop();
        await this.meshNetwork.stop();

        this.state = 'STOPPED';
        this.emit('stopped');
    }

    async connectToPeer(host, port) {
        return await this.meshNetwork.connectToPeer(host, port);
    }

    async _handleDiscoveredAgent(agent) {
        if (this.authService.isTrusted(agent.id)) {
            try {
                await this.meshNetwork.connectToPeer(agent.host, agent.port, agent.id);
            } catch (error) {
                this.emit('connection-failed', {
                    agentId: agent.id,
                    error: error.message
                });
            }
        }
    }

    async _authenticatePeer(peerId, peerInfo) {
        try {
            const token = this.authService.generateToken(
                this.agentId,
                this.capabilities,
                this.metadata
            );

            const result = await this.meshNetwork.sendRequest(peerId, 'authenticate', {
                agentId: this.agentId,
                token
            });

            if (result.authenticated) {
                this.authService.registerTrustedAgent(peerId, {
                    capabilities: peerInfo.capabilities,
                    metadata: peerInfo.metadata
                });
                
                this.emit('peer-authenticated', {
                    peerId,
                    capabilities: peerInfo.capabilities
                });
            } else {
                this.emit('peer-authentication-failed', { peerId });
            }
        } catch (error) {
            this.emit('authentication-error', {
                peerId,
                error: error.message
            });
        }
    }

    _registerBuiltInCollectors() {
        this.telemetryCollector.registerCollector('mesh_peers', () => {
            return {
                peer_count: this.meshNetwork.getPeers().length
            };
        });

        this.telemetryCollector.registerCollector('state_sync', () => {
            const state = this.stateSync.getState();
            return {
                state_size: state.stateSize,
                tombstone_size: state.tombstoneSize
            };
        });

        this.telemetryCollector.registerCollector('orchestrator', () => {
            return {
                running_tasks: this.orchestrator.getRunningTasks().length,
                workflow_count: this.orchestrator.getWorkflows().length
            };
        });

        this.telemetryCollector.registerCollector('discovered_agents', () => {
            return {
                discovered_count: this.discoveryService.getDiscoveredAgents().length
            };
        });
    }

    setState(key, value) {
        this.stateSync.set(key, value);
    }

    getState(key) {
        return this.stateSync.get(key);
    }

    getAllState() {
        return this.stateSync.getAll();
    }

    registerWorkflow(workflowId, workflow) {
        this.orchestrator.registerWorkflow(workflowId, workflow);
    }

    async executeWorkflow(workflowId, context = {}) {
        return await this.orchestrator.executeWorkflow(workflowId, context);
    }

    recordMetric(name, value, labels = {}) {
        this.telemetryCollector.recordMetric(name, value, labels);
    }

    getMetrics() {
        return this.telemetryCollector.getAllAggregatedMetrics();
    }

    getPeers() {
        return this.meshNetwork.getPeers();
    }

    getDiscoveredAgents() {
        return this.discoveryService.getDiscoveredAgents();
    }

    getTrustedAgents() {
        return this.authService.getTrustedAgents();
    }

    getInfo() {
        return {
            agentId: this.agentId,
            port: this.port,
            capabilities: this.capabilities,
            metadata: this.metadata,
            state: this.state,
            peers: this.meshNetwork.getPeers().length,
            discoveredAgents: this.discoveryService.getDiscoveredAgents().length,
            stateSize: this.stateSync.getState().stateSize,
            runningTasks: this.orchestrator.getRunningTasks().length,
            metricsCount: Object.keys(this.telemetryCollector.getAllAggregatedMetrics()).length
        };
    }
}

module.exports = { MeshCoordinator };
