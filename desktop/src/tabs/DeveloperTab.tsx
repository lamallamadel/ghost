import { useState } from 'react';
import { Code, Bug, Activity, Play, BarChart3 } from 'lucide-react';
import { ExtensionDebugger } from '@/components/ExtensionDebugger';
import { IntentPlayground } from '@/components/IntentPlayground';
import { ProfilingDashboard } from '@/components/ProfilingDashboard';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';

type DeveloperView = 'debugger' | 'playground' | 'profiling' | 'analytics';

interface DeveloperTabProps {
  extensions: Array<{ id: string; name: string }>;
}

export function DeveloperTab({ extensions }: DeveloperTabProps) {
  const [activeView, setActiveView] = useState<DeveloperView>('playground');
  const [selectedExtension, setSelectedExtension] = useState<string>(
    extensions[0]?.id || ''
  );

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2 p-4">
          <button
            onClick={() => setActiveView('playground')}
            className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
              activeView === 'playground'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Play className="w-4 h-4" />
            Playground
          </button>
          <button
            onClick={() => setActiveView('debugger')}
            className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
              activeView === 'debugger'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Bug className="w-4 h-4" />
            Debugger
          </button>
          <button
            onClick={() => setActiveView('profiling')}
            className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
              activeView === 'profiling'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Activity className="w-4 h-4" />
            Profiling
          </button>
          <button
            onClick={() => setActiveView('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
              activeView === 'analytics'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Analytics
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeView === 'playground' && <IntentPlayground />}
        
        {activeView === 'debugger' && (
          <div className="space-y-4">
            {extensions.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-gray-400">
                <div className="text-center">
                  <Code className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No extensions available</p>
                  <p className="text-sm mt-1">Start extensions to use the debugger</p>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <label className="block text-sm text-gray-400 mb-2">
                    Select Extension to Debug
                  </label>
                  <select
                    value={selectedExtension}
                    onChange={(e) => setSelectedExtension(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
                  >
                    {extensions.map(ext => (
                      <option key={ext.id} value={ext.id}>
                        {ext.name} ({ext.id})
                      </option>
                    ))}
                  </select>
                </div>
                
                {selectedExtension && (
                  <ExtensionDebugger extensionId={selectedExtension} />
                )}
              </>
            )}
          </div>
        )}
        
        {activeView === 'profiling' && <ProfilingDashboard />}
        
        {activeView === 'analytics' && <AnalyticsDashboard />}
      </div>
    </div>
  );
}
