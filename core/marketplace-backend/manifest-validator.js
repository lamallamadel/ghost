const manifestSchema = require('./manifest-schema.json');

class ManifestValidator {
    constructor() {
        this.schema = manifestSchema;
    }

    validate(manifest) {
        const errors = [];

        if (!this._validateRequired(manifest, errors)) {
            return { valid: false, errors };
        }

        this._validateTypes(manifest, errors);
        this._validatePatterns(manifest, errors);
        this._validateCapabilities(manifest, errors);
        this._validatePermissions(manifest, errors);

        return {
            valid: errors.length === 0,
            errors
        };
    }

    _validateRequired(manifest, errors) {
        const required = this.schema.required || [];
        let hasAllRequired = true;

        for (const field of required) {
            if (!(field in manifest)) {
                errors.push({
                    field,
                    message: `Required field '${field}' is missing`
                });
                hasAllRequired = false;
            }
        }

        return hasAllRequired;
    }

    _validateTypes(manifest, errors) {
        const properties = this.schema.properties;

        for (const [key, value] of Object.entries(manifest)) {
            if (!properties[key]) continue;

            const expectedType = properties[key].type;
            const actualType = Array.isArray(value) ? 'array' : typeof value;

            if (expectedType === 'string' && actualType !== 'string') {
                errors.push({
                    field: key,
                    message: `Field '${key}' must be a string`
                });
            } else if (expectedType === 'object' && actualType !== 'object') {
                errors.push({
                    field: key,
                    message: `Field '${key}' must be an object`
                });
            } else if (expectedType === 'array' && actualType !== 'array') {
                errors.push({
                    field: key,
                    message: `Field '${key}' must be an array`
                });
            }
        }
    }

    _validatePatterns(manifest, errors) {
        if (manifest.id) {
            const idPattern = /^[a-z0-9-]+$/;
            if (!idPattern.test(manifest.id)) {
                errors.push({
                    field: 'id',
                    message: 'ID must contain only lowercase letters, numbers, and hyphens'
                });
            }
        }

        if (manifest.version) {
            const versionPattern = /^\d+\.\d+\.\d+$/;
            if (!versionPattern.test(manifest.version)) {
                errors.push({
                    field: 'version',
                    message: 'Version must follow semantic versioning (e.g., 1.0.0)'
                });
            }
        }
    }

    _validateCapabilities(manifest, errors) {
        const capabilities = manifest.capabilities;
        if (!capabilities) return;

        if (capabilities.filesystem) {
            if (capabilities.filesystem.read && !Array.isArray(capabilities.filesystem.read)) {
                errors.push({
                    field: 'capabilities.filesystem.read',
                    message: 'Filesystem read must be an array of glob patterns'
                });
            }
            if (capabilities.filesystem.write && !Array.isArray(capabilities.filesystem.write)) {
                errors.push({
                    field: 'capabilities.filesystem.write',
                    message: 'Filesystem write must be an array of glob patterns'
                });
            }
        }

        if (capabilities.network) {
            if (capabilities.network.allowlist) {
                if (!Array.isArray(capabilities.network.allowlist)) {
                    errors.push({
                        field: 'capabilities.network.allowlist',
                        message: 'Network allowlist must be an array'
                    });
                } else {
                    for (const url of capabilities.network.allowlist) {
                        if (!url.match(/^https?:\/\/[^\/]+$/)) {
                            errors.push({
                                field: 'capabilities.network.allowlist',
                                message: `Invalid URL format: ${url}`
                            });
                        }
                    }
                }
            }

            if (capabilities.network.rateLimit) {
                const rl = capabilities.network.rateLimit;
                if (!rl.cir || !Number.isInteger(rl.cir) || rl.cir < 1) {
                    errors.push({
                        field: 'capabilities.network.rateLimit.cir',
                        message: 'CIR must be a positive integer'
                    });
                }
                if (!rl.bc || !Number.isInteger(rl.bc) || rl.bc < 1) {
                    errors.push({
                        field: 'capabilities.network.rateLimit.bc',
                        message: 'BC must be a positive integer'
                    });
                }
                if (rl.be !== undefined && (!Number.isInteger(rl.be) || rl.be < 0)) {
                    errors.push({
                        field: 'capabilities.network.rateLimit.be',
                        message: 'BE must be a non-negative integer'
                    });
                }
            }
        }

        if (capabilities.git) {
            if (capabilities.git.read !== undefined && typeof capabilities.git.read !== 'boolean') {
                errors.push({
                    field: 'capabilities.git.read',
                    message: 'Git read must be a boolean'
                });
            }
            if (capabilities.git.write !== undefined && typeof capabilities.git.write !== 'boolean') {
                errors.push({
                    field: 'capabilities.git.write',
                    message: 'Git write must be a boolean'
                });
            }
        }

        if (capabilities.hooks) {
            if (!Array.isArray(capabilities.hooks)) {
                errors.push({
                    field: 'capabilities.hooks',
                    message: 'Hooks must be an array'
                });
            } else {
                const validHooks = ['pre-commit', 'post-commit', 'pre-push', 'post-checkout', 'commit-msg', 'pre-rebase'];
                for (const hook of capabilities.hooks) {
                    if (!validHooks.includes(hook)) {
                        errors.push({
                            field: 'capabilities.hooks',
                            message: `Invalid hook: ${hook}`
                        });
                    }
                }
            }
        }
    }

    _validatePermissions(manifest, errors) {
        const permissions = manifest.permissions;
        if (!permissions) return;

        if (!Array.isArray(permissions)) {
            errors.push({
                field: 'permissions',
                message: 'Permissions must be an array'
            });
            return;
        }

        const validPermissions = [
            'filesystem:read',
            'filesystem:write',
            'network:http',
            'network:https',
            'git:read',
            'git:write',
            'process:spawn',
            'env:read'
        ];

        for (const permission of permissions) {
            if (!validPermissions.includes(permission)) {
                errors.push({
                    field: 'permissions',
                    message: `Invalid permission: ${permission}`
                });
            }
        }
    }
}

module.exports = { ManifestValidator };
