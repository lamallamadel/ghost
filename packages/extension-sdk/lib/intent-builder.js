class IntentBuilder {
    constructor(extensionId) {
        this.extensionId = extensionId;
    }

    filesystem(operation, params) {
        return this._buildIntent('filesystem', operation, params);
    }

    network(operation, params) {
        return this._buildIntent('network', operation, params);
    }

    git(operation, params) {
        return this._buildIntent('git', operation, params);
    }

    process(command, args = []) {
        return this._buildIntent('process', 'spawn', { command, args });
    }

    _buildIntent(type, operation, params) {
        return {
            type,
            operation,
            params: params || {},
            extensionId: this.extensionId,
            requestId: this._generateRequestId()
        };
    }

    _generateRequestId() {
        return `${this.extensionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = { IntentBuilder };
