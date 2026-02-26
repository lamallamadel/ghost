const vm = require('vm');

class WebhookTransformPipeline {
    constructor() {
        this.transforms = new Map();
        this._registerBuiltinTransforms();
    }
    
    _registerBuiltinTransforms() {
        this.addTransform('identity', (event) => event.payload);
        
        this.addTransform('github-issue-labeled', (event) => {
            const { action, issue, label } = event.payload;
            
            return {
                action,
                issueNumber: issue?.number,
                issueTitle: issue?.title,
                issueUrl: issue?.html_url,
                label: label?.name,
                labelColor: label?.color,
                repository: event.payload.repository?.full_name
            };
        });
        
        this.addTransform('github-pull-request', (event) => {
            const { action, pull_request } = event.payload;
            
            return {
                action,
                prNumber: pull_request?.number,
                prTitle: pull_request?.title,
                prUrl: pull_request?.html_url,
                prState: pull_request?.state,
                prMerged: pull_request?.merged,
                repository: event.payload.repository?.full_name,
                author: pull_request?.user?.login,
                baseBranch: pull_request?.base?.ref,
                headBranch: pull_request?.head?.ref
            };
        });
        
        this.addTransform('gitlab-pipeline', (event) => {
            const { object_attributes } = event.payload;
            
            return {
                pipelineId: object_attributes?.id,
                status: object_attributes?.status,
                ref: object_attributes?.ref,
                sha: object_attributes?.sha,
                repository: event.payload.project?.path_with_namespace,
                duration: object_attributes?.duration
            };
        });
        
        this.addTransform('bitbucket-push', (event) => {
            const { push } = event.payload;
            const changes = push?.changes || [];
            
            return {
                repository: event.payload.repository?.full_name,
                actor: event.payload.actor?.username,
                changes: changes.map(change => ({
                    type: change.new ? 'branch' : 'unknown',
                    name: change.new?.name,
                    commits: change.commits?.map(c => ({
                        hash: c.hash,
                        message: c.message,
                        author: c.author?.user?.username
                    }))
                }))
            };
        });
    }
    
    addTransform(name, transformFunction) {
        if (typeof transformFunction !== 'function') {
            throw new Error('Transform must be a function');
        }
        
        this.transforms.set(name, transformFunction);
    }
    
    async transform(webhookEvent, transformConfig) {
        if (!transformConfig) {
            return webhookEvent.payload;
        }
        
        if (typeof transformConfig === 'string') {
            return await this._applyNamedTransform(transformConfig, webhookEvent);
        }
        
        if (typeof transformConfig === 'object' && transformConfig.type) {
            return await this._applyConfiguredTransform(transformConfig, webhookEvent);
        }
        
        return webhookEvent.payload;
    }
    
    async _applyNamedTransform(name, webhookEvent) {
        const transformFn = this.transforms.get(name);
        
        if (!transformFn) {
            console.warn(`Transform not found: ${name}, using identity`);
            return webhookEvent.payload;
        }
        
        try {
            return await transformFn(webhookEvent);
        } catch (error) {
            console.error(`Error applying transform ${name}:`, error);
            throw error;
        }
    }
    
    async _applyConfiguredTransform(config, webhookEvent) {
        const { type, options } = config;
        
        switch (type) {
            case 'javascript':
                return await this._applyJavaScriptTransform(options.code, webhookEvent);
            
            case 'jsonPath':
                return this._applyJsonPathTransform(options.path, webhookEvent);
            
            case 'template':
                return this._applyTemplateTransform(options.template, webhookEvent);
            
            case 'chain':
                return await this._applyChainTransform(options.transforms, webhookEvent);
            
            default:
                console.warn(`Unknown transform type: ${type}`);
                return webhookEvent.payload;
        }
    }
    
    async _applyJavaScriptTransform(code, webhookEvent) {
        const sandbox = {
            event: webhookEvent,
            payload: webhookEvent.payload,
            console: console,
            JSON: JSON,
            result: null
        };
        
        const context = vm.createContext(sandbox);
        
        const safeCode = this._validateAndSanitizeCode(code);
        
        try {
            vm.runInContext(safeCode, context, {
                timeout: 5000,
                displayErrors: true
            });
            
            return sandbox.result || sandbox.payload;
        } catch (error) {
            console.error('Error executing JavaScript transform:', error);
            throw new Error(`Transform execution failed: ${error.message}`);
        }
    }
    
    _validateAndSanitizeCode(code) {
        const dangerousPatterns = [
            /require\s*\(/,
            /import\s+/,
            /process\./,
            /child_process/,
            /fs\./,
            /eval\s*\(/,
            /Function\s*\(/,
            /exec\s*\(/,
            /spawn\s*\(/
        ];
        
        for (const pattern of dangerousPatterns) {
            if (pattern.test(code)) {
                throw new Error(`Transform code contains forbidden pattern: ${pattern}`);
            }
        }
        
        return code;
    }
    
    _applyJsonPathTransform(jsonPath, webhookEvent) {
        const parts = jsonPath.split('.');
        let current = webhookEvent.payload;
        
        for (const part of parts) {
            if (current === null || current === undefined) {
                return null;
            }
            
            current = current[part];
        }
        
        return current;
    }
    
    _applyTemplateTransform(template, webhookEvent) {
        let result = template;
        
        const variables = template.match(/\{\{([^}]+)\}\}/g) || [];
        
        for (const variable of variables) {
            const path = variable.replace(/\{\{|\}\}/g, '').trim();
            const value = this._applyJsonPathTransform(path, webhookEvent);
            
            result = result.replace(variable, value !== undefined ? value : '');
        }
        
        return result;
    }
    
    async _applyChainTransform(transforms, webhookEvent) {
        let result = webhookEvent.payload;
        let currentEvent = { ...webhookEvent };
        
        for (const transformConfig of transforms) {
            currentEvent.payload = result;
            result = await this.transform(currentEvent, transformConfig);
        }
        
        return result;
    }
    
    removeTransform(name) {
        return this.transforms.delete(name);
    }
    
    listTransforms() {
        return Array.from(this.transforms.keys());
    }
}

module.exports = { WebhookTransformPipeline };
