import { useState } from 'react';
import { GitBranch, Maximize2, Minimize2 } from 'lucide-react';

interface CallGraphNode {
  extensionId: string;
  operation: string;
  callCount: number;
  totalDuration: number;
  avgDuration: number;
}

interface CallGraphEdge {
  from: string;
  to: string;
  callCount: number;
}

interface CallGraph {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
}

interface DistributedTracingGraphProps {
  callGraph: CallGraph;
}

export function DistributedTracingGraph({ callGraph }: DistributedTracingGraphProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getNodeId = (node: CallGraphNode) => `${node.extensionId}:${node.operation}`;

  const getNodeColor = (node: CallGraphNode) => {
    const avgDuration = node.avgDuration;
    if (avgDuration < 10) return '#22c55e';
    if (avgDuration < 50) return '#eab308';
    if (avgDuration < 200) return '#f97316';
    return '#ef4444';
  };

  const getEdgeWidth = (edge: CallGraphEdge) => {
    const maxCalls = Math.max(...callGraph.edges.map(e => e.callCount));
    return Math.max(1, (edge.callCount / maxCalls) * 4);
  };

  const getNodeSize = (node: CallGraphNode) => {
    const maxCalls = Math.max(...callGraph.nodes.map(n => n.callCount));
    return 40 + (node.callCount / maxCalls) * 40;
  };

  const layoutNodes = () => {
    const nodes = callGraph.nodes;
    const edges = callGraph.edges;
    
    const layers: CallGraphNode[][] = [];
    const visited = new Set<string>();
    const inDegree = new Map<string, number>();
    
    nodes.forEach(node => {
      const nodeId = getNodeId(node);
      inDegree.set(nodeId, 0);
    });
    
    edges.forEach(edge => {
      const toId = edge.to;
      inDegree.set(toId, (inDegree.get(toId) || 0) + 1);
    });
    
    let currentLayer = nodes.filter(node => inDegree.get(getNodeId(node)) === 0);
    
    while (currentLayer.length > 0) {
      layers.push(currentLayer);
      currentLayer.forEach(node => visited.add(getNodeId(node)));
      
      const nextLayer: CallGraphNode[] = [];
      currentLayer.forEach(node => {
        const nodeId = getNodeId(node);
        edges.filter(e => e.from === nodeId).forEach(edge => {
          if (!visited.has(edge.to)) {
            const targetNode = nodes.find(n => getNodeId(n) === edge.to);
            if (targetNode && !nextLayer.includes(targetNode)) {
              nextLayer.push(targetNode);
            }
          }
        });
      });
      
      currentLayer = nextLayer;
    }
    
    const unvisited = nodes.filter(n => !visited.has(getNodeId(n)));
    if (unvisited.length > 0) {
      layers.push(unvisited);
    }
    
    const positions = new Map<string, { x: number; y: number }>();
    const layerHeight = 120;
    const nodeSpacing = 150;
    
    layers.forEach((layer, layerIndex) => {
      const layerWidth = layer.length * nodeSpacing;
      const startX = (800 - layerWidth) / 2;
      
      layer.forEach((node, nodeIndex) => {
        const nodeId = getNodeId(node);
        positions.set(nodeId, {
          x: startX + nodeIndex * nodeSpacing + nodeSpacing / 2,
          y: 60 + layerIndex * layerHeight
        });
      });
    });
    
    return positions;
  };

  const positions = layoutNodes();
  const svgHeight = Math.max(300, (positions.size > 0 ? Math.max(...Array.from(positions.values()).map(p => p.y)) + 80 : 300));

  const selectedNodeData = selectedNode 
    ? callGraph.nodes.find(n => getNodeId(n) === selectedNode)
    : null;

  const relatedEdges = selectedNode
    ? callGraph.edges.filter(e => e.from === selectedNode || e.to === selectedNode)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          {callGraph.nodes.length} nodes, {callGraph.edges.length} edges
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors flex items-center gap-2"
        >
          {expanded ? (
            <>
              <Minimize2 className="w-4 h-4" />
              Collapse
            </>
          ) : (
            <>
              <Maximize2 className="w-4 h-4" />
              Expand
            </>
          )}
        </button>
      </div>

      <div
        className="bg-gray-900 rounded-lg border border-gray-700 overflow-auto"
        style={{ height: expanded ? '600px' : '400px' }}
      >
        <svg width="800" height={svgHeight} className="min-w-full">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#6b7280" />
            </marker>
          </defs>

          {callGraph.edges.map((edge, idx) => {
            const fromPos = positions.get(edge.from);
            const toPos = positions.get(edge.to);
            
            if (!fromPos || !toPos) return null;

            const isRelated = relatedEdges.includes(edge);
            const strokeWidth = getEdgeWidth(edge);

            return (
              <g key={idx}>
                <line
                  x1={fromPos.x}
                  y1={fromPos.y + 20}
                  x2={toPos.x}
                  y2={toPos.y - 20}
                  stroke={isRelated ? '#06b6d4' : '#6b7280'}
                  strokeWidth={strokeWidth}
                  markerEnd="url(#arrowhead)"
                  opacity={isRelated ? 1 : 0.3}
                />
                <text
                  x={(fromPos.x + toPos.x) / 2}
                  y={(fromPos.y + toPos.y) / 2}
                  fill="#9ca3af"
                  fontSize="10"
                  textAnchor="middle"
                >
                  {edge.callCount}
                </text>
              </g>
            );
          })}

          {callGraph.nodes.map((node) => {
            const nodeId = getNodeId(node);
            const pos = positions.get(nodeId);
            
            if (!pos) return null;

            const size = getNodeSize(node);
            const color = getNodeColor(node);
            const isSelected = selectedNode === nodeId;

            return (
              <g
                key={nodeId}
                onClick={() => setSelectedNode(isSelected ? null : nodeId)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={size / 2}
                  fill={color}
                  stroke={isSelected ? '#fff' : color}
                  strokeWidth={isSelected ? 3 : 1}
                  opacity={selectedNode && !isSelected ? 0.3 : 0.8}
                />
                
                <text
                  x={pos.x}
                  y={pos.y - 5}
                  fill="#fff"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {node.extensionId.split('-')[0]}
                </text>
                <text
                  x={pos.x}
                  y={pos.y + 7}
                  fill="#fff"
                  fontSize="9"
                  textAnchor="middle"
                >
                  {node.operation}
                </text>
                <text
                  x={pos.x}
                  y={pos.y + 18}
                  fill="#fff"
                  fontSize="8"
                  textAnchor="middle"
                  opacity="0.8"
                >
                  {node.callCount}×
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selectedNodeData && (
        <div className="bg-gray-900 rounded-lg border border-cyan-600 p-4">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="w-4 h-4 text-cyan-400" />
            <h5 className="text-sm font-semibold text-white">
              {selectedNodeData.extensionId} - {selectedNodeData.operation}
            </h5>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-400 text-xs">Call Count</div>
              <div className="text-white font-bold mt-1">{selectedNodeData.callCount}</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs">Avg Duration</div>
              <div className="text-white font-bold mt-1">
                {formatDuration(selectedNodeData.avgDuration)}
              </div>
            </div>
            <div>
              <div className="text-gray-400 text-xs">Total Duration</div>
              <div className="text-white font-bold mt-1">
                {formatDuration(selectedNodeData.totalDuration)}
              </div>
            </div>
          </div>

          {relatedEdges.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="text-xs text-gray-400 mb-2">Connected Calls</div>
              <div className="space-y-1">
                {relatedEdges.map((edge, idx) => {
                  const isOutgoing = edge.from === selectedNode;
                  const otherNodeId = isOutgoing ? edge.to : edge.from;
                  const otherNode = callGraph.nodes.find(n => getNodeId(n) === otherNodeId);
                  
                  return (
                    <div key={idx} className="text-xs text-gray-300 flex items-center gap-2">
                      <span className={isOutgoing ? 'text-green-400' : 'text-blue-400'}>
                        {isOutgoing ? '→' : '←'}
                      </span>
                      <span className="font-mono">{otherNode?.extensionId || otherNodeId}</span>
                      <span className="text-gray-500">({edge.callCount}×)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22c55e' }}></div>
          <span>&lt; 10ms</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#eab308' }}></div>
          <span>10-50ms</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f97316' }}></div>
          <span>50-200ms</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ef4444' }}></div>
          <span>&gt; 200ms</span>
        </div>
      </div>
    </div>
  );
}
