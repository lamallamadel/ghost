const Gateway = require('./gateway');
const ExtensionLoader = require('./extension-loader');
const { ExtensionRuntime, ExtensionProcess, SandboxedExtension } = require('./runtime');
const { PluginSandbox, SandboxError, ResourceMonitor, SandboxEscapeDetector } = require('./sandbox');
const manifestSchema = require('./manifest-schema.json');
const {
    AgentMeshNetwork,
    AgentDiscoveryService,
    CRDTStateSync,
    AgentAuthService,
    WorkflowOrchestrator,
    DistributedTelemetryCollector,
    MeshCoordinator
} = require('./mesh');

module.exports = {
    Gateway,
    ExtensionLoader,
    ExtensionRuntime,
    ExtensionProcess,
    SandboxedExtension,
    PluginSandbox,
    SandboxError,
    ResourceMonitor,
    SandboxEscapeDetector,
    manifestSchema,
    AgentMeshNetwork,
    AgentDiscoveryService,
    CRDTStateSync,
    AgentAuthService,
    WorkflowOrchestrator,
    DistributedTelemetryCollector,
    MeshCoordinator
};
