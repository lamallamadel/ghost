const Gateway = require('./gateway');
const ExtensionLoader = require('./extension-loader');
const { ExtensionRuntime, ExtensionProcess, SandboxedExtension } = require('./runtime');
const { PluginSandbox, SandboxError, ResourceMonitor, SandboxEscapeDetector } = require('./sandbox');
const manifestSchema = require('./manifest-schema.json');

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
    manifestSchema
};
