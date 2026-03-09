import { useState, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  NodeTypes,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Play, FileText, Network, GitBranch, Terminal, Plus, Save, Trash2 } from 'lucide-react';

interface IntentNodeData {
  label: string;
  type: 'filesystem' | 'network' | 'git' | 'process';
  operation: string;
  params: Record<string, unknown>;
}

const IntentNode = ({ data }: { data: IntentNodeData }) => {
  const getIcon = () => {
    switch (data.type) {
      case 'filesystem':
        return <FileText className="w-4 h-4" />;
      case 'network':
        return <Network className="w-4 h-4" />;
      case 'git':
        return <GitBranch className="w-4 h-4" />;
      case 'process':
        return <Terminal className="w-4 h-4" />;
    }
  };

  const getColor = () => {
    switch (data.type) {
      case 'filesystem':
        return 'bg-blue-600';
      case 'network':
        return 'bg-green-600';
      case 'git':
        return 'bg-purple-600';
      case 'process':
        return 'bg-orange-600';
    }
  };

  return (
    <div className={`${getColor()} rounded-lg p-3 border-2 border-gray-700 shadow-lg min-w-[180px]`}>
      <Handle type="target" position={Position.Top} className="!bg-cyan-400" />
      <div className="flex items-center gap-2 mb-2">
        <div className="text-white">{getIcon()}</div>
        <div className="text-white font-semibold text-sm">{data.type}</div>
      </div>
      <div className="text-white text-xs mb-1">{data.operation}</div>
      <div className="text-white/70 text-xs">
        {Object.keys(data.params).length} param(s)
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-400" />
    </div>
  );
};

const nodeTypes: NodeTypes = {
  intentNode: IntentNode,
};

const initialNodes: Node<IntentNodeData>[] = [];
const initialEdges: Edge[] = [];

export function VisualIntentBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const addNode = (type: 'filesystem' | 'network' | 'git' | 'process') => {
    const operations = {
      filesystem: ['read', 'write', 'readdir', 'stat', 'mkdir', 'unlink'],
      network: ['request', 'get', 'post', 'put', 'delete'],
      git: ['status', 'log', 'diff', 'commit', 'push', 'pull', 'branch'],
      process: ['exec', 'spawn', 'kill'],
    };

    const newNode: Node<IntentNodeData> = {
      id: `${type}-${Date.now()}`,
      type: 'intentNode',
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 300 + 100,
      },
      data: {
        label: type,
        type,
        operation: operations[type][0],
        params: {},
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setShowAddMenu(false);
  };

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  };

  const updateNodeParams = (nodeId: string, params: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              params,
            },
          };
        }
        return node;
      })
    );
  };

  const updateNodeOperation = (nodeId: string, operation: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              operation,
            },
          };
        }
        return node;
      })
    );
  };

  const executeFlow = async () => {
    const intents = nodes.map((node) => ({
      type: node.data.type,
      operation: node.data.operation,
      params: node.data.params,
    }));

    try {
      const response = await fetch('http://localhost:9876/api/flow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intents, edges }),
      });

      const result = await response.json();
      console.log('Flow execution result:', result);
      alert(result.success ? 'Flow executed successfully!' : `Error: ${result.error}`);
    } catch (error) {
      console.error('Flow execution failed:', error);
      alert('Flow execution failed');
    }
  };

  const saveFlow = () => {
    const flow = { nodes, edges };
    const blob = new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'intent-flow.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const operationsByType = {
    filesystem: ['read', 'write', 'readdir', 'stat', 'mkdir', 'unlink'],
    network: ['request', 'get', 'post', 'put', 'delete'],
    git: ['status', 'log', 'diff', 'commit', 'push', 'pull', 'branch'],
    process: ['exec', 'spawn', 'kill'],
  };

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 bg-gray-900 rounded-lg border border-gray-700 relative">
        <div className="absolute top-2 left-2 z-10 flex gap-2">
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded shadow-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Node
            </button>
            {showAddMenu && (
              <div className="absolute top-full left-0 mt-1 bg-gray-800 rounded-lg border border-gray-700 shadow-xl p-2 space-y-1">
                <button
                  onClick={() => addNode('filesystem')}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Filesystem
                </button>
                <button
                  onClick={() => addNode('network')}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                >
                  <Network className="w-4 h-4" />
                  Network
                </button>
                <button
                  onClick={() => addNode('git')}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors"
                >
                  <GitBranch className="w-4 h-4" />
                  Git
                </button>
                <button
                  onClick={() => addNode('process')}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm transition-colors"
                >
                  <Terminal className="w-4 h-4" />
                  Process
                </button>
              </div>
            )}
          </div>
          <button
            onClick={executeFlow}
            disabled={nodes.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded shadow-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            Execute
          </button>
          <button
            onClick={saveFlow}
            disabled={nodes.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded shadow-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          <Controls />
        </ReactFlow>
      </div>

      <div className="w-80 bg-gray-800 rounded-lg border border-gray-700 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Node Properties</h3>
        {selectedNode ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Type</label>
              <input
                type="text"
                value={selectedNode.data.type}
                disabled
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Operation</label>
              <select
                value={selectedNode.data.operation}
                onChange={(e) => updateNodeOperation(selectedNode.id, e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
              >
                {operationsByType[selectedNode.data.type].map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Parameters (JSON)</label>
              <textarea
                value={JSON.stringify(selectedNode.data.params, null, 2)}
                onChange={(e) => {
                  try {
                    const params = JSON.parse(e.target.value);
                    updateNodeParams(selectedNode.id, params);
                  } catch {
                    // Invalid JSON, ignore
                  }
                }}
                rows={8}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white font-mono text-xs"
              />
            </div>

            <button
              onClick={() => deleteNode(selectedNode.id)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Node
            </button>
          </div>
        ) : (
          <div className="text-gray-500 text-sm">
            Click a node to edit its properties
          </div>
        )}
      </div>
    </div>
  );
}
