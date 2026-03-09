import { useState, useEffect, useCallback } from 'react';
import { Play, Square, Bug, Circle } from 'lucide-react';

interface DebuggerProps {
  extensionId: string;
}

interface DebugInfo {
  isAttached: boolean;
  inspectorUrl: string | null;
  debugPort: number | null;
  breakpoints: Array<{
    id: string;
    scriptPath: string;
    line: number;
    condition?: string;
    enabled: boolean;
  }>;
  pid: number | null;
}

export function ExtensionDebugger({ extensionId }: DebuggerProps) {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [newBreakpoint, setNewBreakpoint] = useState({ file: '', line: '', condition: '' });
  const [loading, setLoading] = useState(false);

  const loadDebugInfo = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:9876/api/debugger/${extensionId}`);
      if (response.ok) {
        const data = await response.json();
        setDebugInfo(data);
      }
    } catch (error) {
      console.error('Failed to load debug info:', error);
    }
  }, [extensionId]);

  useEffect(() => {
    loadDebugInfo();
    const interval = setInterval(loadDebugInfo, 2000);
    return () => clearInterval(interval);
  }, [loadDebugInfo]);

  const handleAttach = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:9876/api/debugger/${extensionId}/attach`, {
        method: 'POST'
      });
      
      if (response.ok) {
        await loadDebugInfo();
      }
    } catch (error) {
      console.error('Failed to attach debugger:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDetach = async () => {
    setLoading(true);
    try {
      await fetch(`http://localhost:9876/api/debugger/${extensionId}/detach`, {
        method: 'POST'
      });
      await loadDebugInfo();
    } catch (error) {
      console.error('Failed to detach debugger:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBreakpoint = async () => {
    if (!newBreakpoint.file || !newBreakpoint.line) return;

    try {
      await fetch(`http://localhost:9876/api/debugger/${extensionId}/breakpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptPath: newBreakpoint.file,
          line: parseInt(newBreakpoint.line),
          condition: newBreakpoint.condition || undefined
        })
      });
      
      setNewBreakpoint({ file: '', line: '', condition: '' });
      await loadDebugInfo();
    } catch (error) {
      console.error('Failed to add breakpoint:', error);
    }
  };

  const handleRemoveBreakpoint = async (breakpointId: string) => {
    try {
      await fetch(`http://localhost:9876/api/debugger/${extensionId}/breakpoint/${breakpointId}`, {
        method: 'DELETE'
      });
      await loadDebugInfo();
    } catch (error) {
      console.error('Failed to remove breakpoint:', error);
    }
  };

  const openDevTools = () => {
    if (debugInfo?.inspectorUrl) {
      window.open(debugInfo.inspectorUrl, '_blank');
    }
  };

  if (!debugInfo) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-white">Node.js Debugger</h3>
          </div>
          <div className="flex items-center gap-2">
            {debugInfo.isAttached ? (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <Circle className="w-3 h-3 fill-green-400" />
                Attached
              </span>
            ) : (
              <span className="flex items-center gap-1 text-gray-400 text-sm">
                <Circle className="w-3 h-3" />
                Detached
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Extension:</span>
              <span className="ml-2 text-white font-mono">{extensionId}</span>
            </div>
            <div>
              <span className="text-gray-400">PID:</span>
              <span className="ml-2 text-white font-mono">{debugInfo.pid || 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-400">Debug Port:</span>
              <span className="ml-2 text-white font-mono">{debugInfo.debugPort || 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-400">Status:</span>
              <span className="ml-2 text-white">
                {debugInfo.isAttached ? 'Debugging' : 'Ready'}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            {!debugInfo.isAttached ? (
              <button
                onClick={handleAttach}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white rounded transition-colors"
              >
                <Play className="w-4 h-4" />
                Attach Debugger
              </button>
            ) : (
              <>
                <button
                  onClick={openDevTools}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                >
                  <Bug className="w-4 h-4" />
                  Open DevTools
                </button>
                <button
                  onClick={handleDetach}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded transition-colors"
                >
                  <Square className="w-4 h-4" />
                  Detach
                </button>
              </>
            )}
          </div>

          {debugInfo.inspectorUrl && (
            <div className="mt-3 p-3 bg-gray-900 rounded border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Inspector URL:</p>
              <code className="text-xs text-cyan-400 break-all">{debugInfo.inspectorUrl}</code>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h4 className="text-md font-semibold text-white mb-3">Breakpoints</h4>
        
        <div className="space-y-2 mb-4">
          {debugInfo.breakpoints.length === 0 ? (
            <p className="text-sm text-gray-400">No breakpoints set</p>
          ) : (
            debugInfo.breakpoints.map((bp) => (
              <div
                key={bp.id}
                className="flex items-center justify-between p-2 bg-gray-900 rounded border border-gray-700"
              >
                <div className="flex-1">
                  <div className="text-sm text-white font-mono">
                    {bp.scriptPath}:{bp.line}
                  </div>
                  {bp.condition && (
                    <div className="text-xs text-gray-400 mt-1">
                      Condition: {bp.condition}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveBreakpoint(bp.id)}
                  className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm text-gray-400">Add Breakpoint</p>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="File path"
              value={newBreakpoint.file}
              onChange={(e) => setNewBreakpoint({ ...newBreakpoint, file: e.target.value })}
              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
            />
            <input
              type="number"
              placeholder="Line"
              value={newBreakpoint.line}
              onChange={(e) => setNewBreakpoint({ ...newBreakpoint, line: e.target.value })}
              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
            />
            <input
              type="text"
              placeholder="Condition (optional)"
              value={newBreakpoint.condition}
              onChange={(e) => setNewBreakpoint({ ...newBreakpoint, condition: e.target.value })}
              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
            />
          </div>
          <button
            onClick={handleAddBreakpoint}
            disabled={!newBreakpoint.file || !newBreakpoint.line}
            className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white rounded transition-colors"
          >
            Add Breakpoint
          </button>
        </div>
      </div>
    </div>
  );
}
