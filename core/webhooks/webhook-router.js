class WebhookRouter {
    constructor(config = {}) {
        this.routes = [];
        
        if (config.routes) {
            config.routes.forEach(route => this.addRoute(route));
        }
    }
    
    addRoute(config) {
        const route = {
            id: config.id || this._generateRouteId(),
            provider: config.provider,
            eventPattern: config.eventPattern,
            extensionId: config.extensionId,
            command: config.command,
            args: config.args,
            transform: config.transform,
            enabled: config.enabled !== false,
            conditions: config.conditions || []
        };
        
        this.routes.push(route);
        
        return route;
    }
    
    removeRoute(routeId) {
        const index = this.routes.findIndex(r => r.id === routeId);
        
        if (index !== -1) {
            this.routes.splice(index, 1);
            return true;
        }
        
        return false;
    }
    
    route(webhookEvent) {
        const matchingRoutes = [];
        
        for (const route of this.routes) {
            if (!route.enabled) {
                continue;
            }
            
            if (!this._matchesProvider(route, webhookEvent)) {
                continue;
            }
            
            if (!this._matchesEventPattern(route, webhookEvent)) {
                continue;
            }
            
            if (!this._matchesConditions(route, webhookEvent)) {
                continue;
            }
            
            matchingRoutes.push(route);
        }
        
        return matchingRoutes;
    }
    
    _matchesProvider(route, webhookEvent) {
        if (!route.provider) {
            return true;
        }
        
        if (Array.isArray(route.provider)) {
            return route.provider.includes(webhookEvent.provider);
        }
        
        return route.provider === webhookEvent.provider;
    }
    
    _matchesEventPattern(route, webhookEvent) {
        if (!route.eventPattern) {
            return true;
        }
        
        if (typeof route.eventPattern === 'string') {
            return this._matchPattern(route.eventPattern, webhookEvent.eventType);
        }
        
        if (Array.isArray(route.eventPattern)) {
            return route.eventPattern.some(pattern => 
                this._matchPattern(pattern, webhookEvent.eventType)
            );
        }
        
        return false;
    }
    
    _matchPattern(pattern, value) {
        if (pattern === '*') {
            return true;
        }
        
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(value);
        }
        
        return pattern === value;
    }
    
    _matchesConditions(route, webhookEvent) {
        if (!route.conditions || route.conditions.length === 0) {
            return true;
        }
        
        for (const condition of route.conditions) {
            if (!this._evaluateCondition(condition, webhookEvent)) {
                return false;
            }
        }
        
        return true;
    }
    
    _evaluateCondition(condition, webhookEvent) {
        const { path: jsonPath, operator, value } = condition;
        
        const actualValue = this._getValueByPath(webhookEvent.payload, jsonPath);
        
        switch (operator) {
            case 'equals':
                return actualValue === value;
            case 'notEquals':
                return actualValue !== value;
            case 'contains':
                return String(actualValue).includes(value);
            case 'startsWith':
                return String(actualValue).startsWith(value);
            case 'endsWith':
                return String(actualValue).endsWith(value);
            case 'exists':
                return actualValue !== undefined;
            case 'notExists':
                return actualValue === undefined;
            case 'matches':
                return new RegExp(value).test(String(actualValue));
            default:
                console.warn(`Unknown condition operator: ${operator}`);
                return false;
        }
    }
    
    _getValueByPath(obj, path) {
        if (!path) {
            return obj;
        }
        
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            
            current = current[part];
        }
        
        return current;
    }
    
    _generateRouteId() {
        return `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    getRoutes() {
        return [...this.routes];
    }
    
    clearRoutes() {
        this.routes = [];
    }
}

module.exports = { WebhookRouter };
