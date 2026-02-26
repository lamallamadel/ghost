const { EventEmitter } = require('events');

class WorkflowOrchestrator extends EventEmitter {
    constructor(options = {}) {
        super();
        this.meshNetwork = options.meshNetwork;
        this.discoveryService = options.discoveryService;
        this.authService = options.authService;
        
        this.workflows = new Map();
        this.taskQueue = [];
        this.runningTasks = new Map();
        this.maxConcurrentTasks = options.maxConcurrentTasks || 10;
        this.taskTimeout = options.taskTimeout || 60000;
        this.retryAttempts = options.retryAttempts || 3;
        
        this.loadBalancingStrategy = options.loadBalancingStrategy || 'round-robin';
        this.agentLoads = new Map();
        
        this.state = 'STOPPED';
    }

    start() {
        if (this.state === 'RUNNING') {
            return;
        }

        this.state = 'RUNNING';
        
        if (this.meshNetwork) {
            this.meshNetwork.on('request', (event) => {
                if (event.method === 'execute_task') {
                    this._handleTaskExecution(event);
                } else if (event.method === 'task_result') {
                    this._handleTaskResult(event);
                } else if (event.method === 'get_load') {
                    this._handleLoadQuery(event);
                }
            });
        }

        this._startProcessing();
        this.emit('started');
    }

    stop() {
        if (this.state === 'STOPPED') {
            return;
        }

        this.state = 'STOPPING';

        for (const [taskId, task] of this.runningTasks) {
            if (task.timeout) {
                clearTimeout(task.timeout);
            }
        }

        this.runningTasks.clear();
        this.taskQueue = [];

        this.state = 'STOPPED';
        this.emit('stopped');
    }

    registerWorkflow(workflowId, workflow) {
        this.workflows.set(workflowId, {
            id: workflowId,
            name: workflow.name,
            tasks: workflow.tasks || [],
            dependencies: workflow.dependencies || {},
            createdAt: Date.now()
        });

        this.emit('workflow-registered', { workflowId, workflow });
    }

    async executeWorkflow(workflowId, context = {}) {
        const workflow = this.workflows.get(workflowId);
        
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        const executionId = this._generateExecutionId();
        const execution = {
            id: executionId,
            workflowId,
            context,
            tasks: new Map(),
            completedTasks: new Set(),
            failedTasks: new Set(),
            startTime: Date.now(),
            state: 'RUNNING'
        };

        this.emit('workflow-started', { executionId, workflowId });

        try {
            const result = await this._executeWorkflowTasks(workflow, execution);
            
            execution.state = 'COMPLETED';
            execution.endTime = Date.now();
            execution.result = result;

            this.emit('workflow-completed', {
                executionId,
                workflowId,
                duration: execution.endTime - execution.startTime,
                result
            });

            return result;
        } catch (error) {
            execution.state = 'FAILED';
            execution.endTime = Date.now();
            execution.error = error.message;

            this.emit('workflow-failed', {
                executionId,
                workflowId,
                duration: execution.endTime - execution.startTime,
                error: error.message
            });

            throw error;
        }
    }

    async _executeWorkflowTasks(workflow, execution) {
        const results = {};
        const tasksByLevel = this._buildDependencyGraph(workflow);

        for (const level of tasksByLevel) {
            const levelPromises = level.map(async (task) => {
                const taskResult = await this._executeTask(task, execution.context);
                results[task.id] = taskResult;
                execution.completedTasks.add(task.id);
                return taskResult;
            });

            await Promise.all(levelPromises);
        }

        return results;
    }

    _buildDependencyGraph(workflow) {
        const tasks = workflow.tasks;
        const dependencies = workflow.dependencies || {};
        const levels = [];
        const processed = new Set();

        while (processed.size < tasks.length) {
            const level = [];
            
            for (const task of tasks) {
                if (processed.has(task.id)) continue;

                const deps = dependencies[task.id] || [];
                const allDepsProcessed = deps.every(dep => processed.has(dep));

                if (allDepsProcessed) {
                    level.push(task);
                    processed.add(task.id);
                }
            }

            if (level.length === 0) {
                throw new Error('Circular dependency detected in workflow');
            }

            levels.push(level);
        }

        return levels;
    }

    async _executeTask(task, context) {
        const taskId = this._generateTaskId();
        
        const agent = await this._selectAgent(task.requiredCapabilities || []);
        
        if (!agent) {
            throw new Error(`No agent available with capabilities: ${task.requiredCapabilities?.join(', ')}`);
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.runningTasks.delete(taskId);
                reject(new Error(`Task ${taskId} timeout`));
            }, this.taskTimeout);

            this.runningTasks.set(taskId, {
                id: taskId,
                task,
                agentId: agent.id,
                startTime: Date.now(),
                timeout: timeoutId,
                resolve,
                reject
            });

            this.meshNetwork.sendRequest(agent.id, 'execute_task', {
                taskId,
                task: {
                    type: task.type,
                    params: { ...task.params, ...context }
                }
            })
            .then((result) => {
                clearTimeout(timeoutId);
                this.runningTasks.delete(taskId);
                this._updateAgentLoad(agent.id, -1);
                
                this.emit('task-completed', {
                    taskId,
                    agentId: agent.id,
                    duration: Date.now() - this.runningTasks.get(taskId)?.startTime
                });

                resolve(result);
            })
            .catch((error) => {
                clearTimeout(timeoutId);
                this.runningTasks.delete(taskId);
                this._updateAgentLoad(agent.id, -1);

                this.emit('task-failed', {
                    taskId,
                    agentId: agent.id,
                    error: error.message
                });

                reject(error);
            });

            this._updateAgentLoad(agent.id, 1);
        });
    }

    async _selectAgent(requiredCapabilities = []) {
        let candidates = [];

        if (this.discoveryService) {
            const discovered = this.discoveryService.getDiscoveredAgents();
            candidates = discovered.filter(agent => 
                this._hasCapabilities(agent.capabilities, requiredCapabilities)
            );
        }

        if (candidates.length === 0) {
            const peers = this.meshNetwork?.getPeers() || [];
            candidates = peers.filter(peer =>
                this._hasCapabilities(peer.capabilities, requiredCapabilities)
            );
        }

        if (candidates.length === 0) {
            return null;
        }

        return this._applyLoadBalancing(candidates);
    }

    _hasCapabilities(agentCapabilities, requiredCapabilities) {
        return requiredCapabilities.every(cap => agentCapabilities.includes(cap));
    }

    _applyLoadBalancing(candidates) {
        if (this.loadBalancingStrategy === 'round-robin') {
            this._roundRobinIndex = (this._roundRobinIndex || 0) % candidates.length;
            return candidates[this._roundRobinIndex++];
        } else if (this.loadBalancingStrategy === 'least-loaded') {
            return candidates.reduce((least, agent) => {
                const agentLoad = this.agentLoads.get(agent.id) || 0;
                const leastLoad = this.agentLoads.get(least.id) || 0;
                return agentLoad < leastLoad ? agent : least;
            });
        } else if (this.loadBalancingStrategy === 'random') {
            return candidates[Math.floor(Math.random() * candidates.length)];
        }

        return candidates[0];
    }

    _updateAgentLoad(agentId, delta) {
        const currentLoad = this.agentLoads.get(agentId) || 0;
        this.agentLoads.set(agentId, Math.max(0, currentLoad + delta));
    }

    _handleTaskExecution(event) {
        const { taskId, task } = event.params;

        this.emit('task-received', { taskId, task });

        Promise.resolve()
            .then(() => this._executeLocalTask(task))
            .then((result) => {
                event.reply({ taskId, success: true, result });
            })
            .catch((error) => {
                event.reply({ taskId, success: false, error: error.message });
            });
    }

    async _executeLocalTask(task) {
        this.emit('local-task-executing', { task });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return {
            executed: true,
            timestamp: Date.now(),
            task: task.type
        };
    }

    _handleTaskResult(event) {
        const { taskId, result } = event.params;
        
        if (this.runningTasks.has(taskId)) {
            const task = this.runningTasks.get(taskId);
            task.resolve(result);
        }

        event.reply({ received: true });
    }

    _handleLoadQuery(event) {
        const load = {
            runningTasks: this.runningTasks.size,
            queuedTasks: this.taskQueue.length,
            capacity: this.maxConcurrentTasks
        };

        event.reply({ load });
    }

    _startProcessing() {
        setInterval(() => {
            this._processQueue();
        }, 1000);
    }

    _processQueue() {
        while (
            this.taskQueue.length > 0 &&
            this.runningTasks.size < this.maxConcurrentTasks
        ) {
            const task = this.taskQueue.shift();
            this._executeTask(task.task, task.context)
                .then(task.resolve)
                .catch(task.reject);
        }
    }

    _generateExecutionId() {
        return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    _generateTaskId() {
        return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    getWorkflows() {
        return Array.from(this.workflows.values());
    }

    getRunningTasks() {
        const tasks = [];
        for (const [taskId, task] of this.runningTasks) {
            tasks.push({
                id: taskId,
                agentId: task.agentId,
                startTime: task.startTime,
                duration: Date.now() - task.startTime
            });
        }
        return tasks;
    }

    getAgentLoads() {
        const loads = {};
        for (const [agentId, load] of this.agentLoads) {
            loads[agentId] = load;
        }
        return loads;
    }
}

module.exports = { WorkflowOrchestrator };
