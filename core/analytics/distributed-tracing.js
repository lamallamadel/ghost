const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class DistributedTracing extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            persistenceDir: options.persistenceDir || path.join(require('os').homedir(), '.ghost', 'analytics'),
            maxTraces: options.maxTraces || 1000,
            ...options
        };

        this.traces = new Map();
        this.spans = new Map();
        this.callGraphs = new Map();
    }

    startTrace(traceId, extensionId, operation, context = {}) {
        const timestamp = Date.now();
        
        const trace = {
            traceId,
            rootExtensionId: extensionId,
            rootOperation: operation,
            startTime: timestamp,
            endTime: null,
            duration: null,
            status: 'active',
            spans: [],
            callGraph: {
                nodes: [],
                edges: []
            },
            context: this._sanitizeContext(context)
        };

        this.traces.set(traceId, trace);

        const rootSpan = this.startSpan(traceId, null, extensionId, operation, context);

        this.emit('trace-started', { traceId, extensionId, operation, timestamp });

        return { traceId, spanId: rootSpan.spanId };
    }

    startSpan(traceId, parentSpanId, extensionId, operation, context = {}) {
        const trace = this.traces.get(traceId);
        if (!trace) {
            throw new Error(`Trace not found: ${traceId}`);
        }

        const spanId = this._generateSpanId();
        const timestamp = Date.now();

        const span = {
            spanId,
            traceId,
            parentSpanId,
            extensionId,
            operation,
            startTime: timestamp,
            endTime: null,
            duration: null,
            status: 'active',
            tags: {},
            logs: [],
            context: this._sanitizeContext(context)
        };

        this.spans.set(spanId, span);
        trace.spans.push(spanId);

        this._updateCallGraph(traceId, span);

        this.emit('span-started', { traceId, spanId, extensionId, operation, timestamp });

        return span;
    }

    endSpan(spanId, status = 'success', metadata = {}) {
        const span = this.spans.get(spanId);
        if (!span) {
            console.warn(`[DistributedTracing] Span not found: ${spanId}`);
            return;
        }

        const timestamp = Date.now();
        span.endTime = timestamp;
        span.duration = timestamp - span.startTime;
        span.status = status;
        span.metadata = metadata;

        const trace = this.traces.get(span.traceId);
        if (trace) {
            const allSpansCompleted = trace.spans.every(sid => {
                const s = this.spans.get(sid);
                return s && s.status !== 'active';
            });

            if (allSpansCompleted) {
                this._finalizeTrace(span.traceId);
            }
        }

        this.emit('span-ended', { spanId, traceId: span.traceId, duration: span.duration, status });
    }

    addSpanLog(spanId, message, data = {}) {
        const span = this.spans.get(spanId);
        if (!span) {
            return;
        }

        span.logs.push({
            timestamp: Date.now(),
            timestampISO: new Date().toISOString(),
            message,
            data
        });
    }

    addSpanTag(spanId, key, value) {
        const span = this.spans.get(spanId);
        if (!span) {
            return;
        }

        span.tags[key] = value;
    }

    getTrace(traceId) {
        const trace = this.traces.get(traceId);
        if (!trace) {
            return null;
        }

        const traceData = { ...trace };
        traceData.spans = trace.spans.map(spanId => this.spans.get(spanId));

        return traceData;
    }

    getCallGraph(traceId) {
        const trace = this.traces.get(traceId);
        if (!trace) {
            return null;
        }

        return trace.callGraph;
    }

    visualizeCallGraph(traceId) {
        const callGraph = this.getCallGraph(traceId);
        if (!callGraph) {
            return null;
        }

        const visualization = {
            traceId,
            graph: callGraph,
            mermaid: this._generateMermaidDiagram(callGraph),
            dot: this._generateDotGraph(callGraph),
            stats: this._calculateGraphStats(callGraph)
        };

        return visualization;
    }

    getCrossExtensionCalls() {
        const crossCalls = [];

        for (const [traceId, trace] of this.traces) {
            const extensions = new Set();
            const calls = [];

            for (const spanId of trace.spans) {
                const span = this.spans.get(spanId);
                if (!span) continue;

                extensions.add(span.extensionId);

                if (span.parentSpanId) {
                    const parentSpan = this.spans.get(span.parentSpanId);
                    if (parentSpan && parentSpan.extensionId !== span.extensionId) {
                        calls.push({
                            from: parentSpan.extensionId,
                            to: span.extensionId,
                            operation: span.operation,
                            duration: span.duration,
                            status: span.status
                        });
                    }
                }
            }

            if (extensions.size > 1) {
                crossCalls.push({
                    traceId,
                    extensionCount: extensions.size,
                    extensions: Array.from(extensions),
                    calls,
                    totalDuration: trace.duration
                });
            }
        }

        return crossCalls.sort((a, b) => b.extensionCount - a.extensionCount);
    }

    getExtensionInteractions() {
        const interactions = new Map();

        for (const [traceId, trace] of this.traces) {
            for (const spanId of trace.spans) {
                const span = this.spans.get(spanId);
                if (!span || !span.parentSpanId) continue;

                const parentSpan = this.spans.get(span.parentSpanId);
                if (!parentSpan || parentSpan.extensionId === span.extensionId) continue;

                const key = `${parentSpan.extensionId}->${span.extensionId}`;
                
                if (!interactions.has(key)) {
                    interactions.set(key, {
                        from: parentSpan.extensionId,
                        to: span.extensionId,
                        callCount: 0,
                        totalDuration: 0,
                        avgDuration: 0,
                        operations: new Map()
                    });
                }

                const interaction = interactions.get(key);
                interaction.callCount++;
                interaction.totalDuration += span.duration || 0;

                const opCount = interaction.operations.get(span.operation) || 0;
                interaction.operations.set(span.operation, opCount + 1);
            }
        }

        for (const [key, interaction] of interactions) {
            interaction.avgDuration = interaction.callCount > 0
                ? interaction.totalDuration / interaction.callCount
                : 0;
            interaction.operations = Array.from(interaction.operations.entries())
                .map(([operation, count]) => ({ operation, count }))
                .sort((a, b) => b.count - a.count);
        }

        return Array.from(interactions.values())
            .sort((a, b) => b.callCount - a.callCount);
    }

    getTracesByExtension(extensionId, limit = 10) {
        const traces = [];

        for (const [traceId, trace] of this.traces) {
            const hasExtension = trace.spans.some(spanId => {
                const span = this.spans.get(spanId);
                return span && span.extensionId === extensionId;
            });

            if (hasExtension) {
                traces.push(this.getTrace(traceId));
            }
        }

        return traces
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, limit);
    }

    async persist() {
        const filepath = path.join(this.options.persistenceDir, 'distributed-tracing.json');
        
        const data = {
            timestamp: Date.now(),
            traces: Array.from(this.traces.entries()),
            spans: Array.from(this.spans.entries())
        };

        try {
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
            this.emit('persisted', { filepath });
        } catch (error) {
            this.emit('persist-error', { error: error.message });
            console.error(`[DistributedTracing] Failed to persist: ${error.message}`);
        }
    }

    async load() {
        const filepath = path.join(this.options.persistenceDir, 'distributed-tracing.json');
        
        if (!fs.existsSync(filepath)) {
            return;
        }

        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const data = JSON.parse(content);

            this.traces = new Map(data.traces);
            this.spans = new Map(data.spans);

            this.emit('loaded', { filepath });
        } catch (error) {
            this.emit('load-error', { error: error.message });
            console.error(`[DistributedTracing] Failed to load: ${error.message}`);
        }
    }

    _finalizeTrace(traceId) {
        const trace = this.traces.get(traceId);
        if (!trace) return;

        const rootSpan = this.spans.get(trace.spans[0]);
        if (!rootSpan) return;

        trace.endTime = Date.now();
        trace.duration = trace.endTime - trace.startTime;
        trace.status = 'completed';

        const hasErrors = trace.spans.some(spanId => {
            const span = this.spans.get(spanId);
            return span && span.status === 'error';
        });

        if (hasErrors) {
            trace.status = 'error';
        }

        this.emit('trace-completed', {
            traceId,
            duration: trace.duration,
            status: trace.status,
            spanCount: trace.spans.length
        });

        this._cleanupOldTraces();
    }

    _updateCallGraph(traceId, span) {
        const trace = this.traces.get(traceId);
        if (!trace) return;

        const nodeExists = trace.callGraph.nodes.some(n => n.id === span.extensionId);
        if (!nodeExists) {
            trace.callGraph.nodes.push({
                id: span.extensionId,
                label: span.extensionId,
                operations: []
            });
        }

        const node = trace.callGraph.nodes.find(n => n.id === span.extensionId);
        if (!node.operations.includes(span.operation)) {
            node.operations.push(span.operation);
        }

        if (span.parentSpanId) {
            const parentSpan = this.spans.get(span.parentSpanId);
            if (parentSpan && parentSpan.extensionId !== span.extensionId) {
                const edgeExists = trace.callGraph.edges.some(
                    e => e.from === parentSpan.extensionId && 
                         e.to === span.extensionId &&
                         e.operation === span.operation
                );

                if (!edgeExists) {
                    trace.callGraph.edges.push({
                        from: parentSpan.extensionId,
                        to: span.extensionId,
                        operation: span.operation
                    });
                }
            }
        }
    }

    _generateMermaidDiagram(callGraph) {
        let mermaid = 'graph TD\n';

        for (const node of callGraph.nodes) {
            mermaid += `    ${node.id}["${node.label}"]\n`;
        }

        for (const edge of callGraph.edges) {
            mermaid += `    ${edge.from} -->|${edge.operation}| ${edge.to}\n`;
        }

        return mermaid;
    }

    _generateDotGraph(callGraph) {
        let dot = 'digraph ExtensionCalls {\n';
        dot += '    rankdir=LR;\n';
        dot += '    node [shape=box, style=rounded];\n';

        for (const node of callGraph.nodes) {
            dot += `    "${node.id}" [label="${node.label}"];\n`;
        }

        for (const edge of callGraph.edges) {
            dot += `    "${edge.from}" -> "${edge.to}" [label="${edge.operation}"];\n`;
        }

        dot += '}';
        return dot;
    }

    _calculateGraphStats(callGraph) {
        return {
            nodeCount: callGraph.nodes.length,
            edgeCount: callGraph.edges.length,
            complexity: callGraph.edges.length / Math.max(callGraph.nodes.length, 1),
            maxDepth: this._calculateMaxDepth(callGraph)
        };
    }

    _calculateMaxDepth(callGraph) {
        const adjacency = new Map();
        
        for (const edge of callGraph.edges) {
            if (!adjacency.has(edge.from)) {
                adjacency.set(edge.from, []);
            }
            adjacency.get(edge.from).push(edge.to);
        }

        const visited = new Set();
        let maxDepth = 0;

        const dfs = (node, depth) => {
            visited.add(node);
            maxDepth = Math.max(maxDepth, depth);

            const neighbors = adjacency.get(node) || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    dfs(neighbor, depth + 1);
                }
            }

            visited.delete(node);
        };

        for (const node of callGraph.nodes) {
            dfs(node.id, 1);
        }

        return maxDepth;
    }

    _cleanupOldTraces() {
        if (this.traces.size <= this.options.maxTraces) {
            return;
        }

        const sortedTraces = Array.from(this.traces.entries())
            .sort((a, b) => a[1].startTime - b[1].startTime);

        const toRemove = sortedTraces.slice(0, sortedTraces.length - this.options.maxTraces);

        for (const [traceId, trace] of toRemove) {
            for (const spanId of trace.spans) {
                this.spans.delete(spanId);
            }
            this.traces.delete(traceId);
        }
    }

    _sanitizeContext(context) {
        const sanitized = { ...context };
        const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'key'];
        
        for (const key of Object.keys(sanitized)) {
            if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
                sanitized[key] = '[REDACTED]';
            }
        }
        
        return sanitized;
    }

    _generateSpanId() {
        return `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = DistributedTracing;
