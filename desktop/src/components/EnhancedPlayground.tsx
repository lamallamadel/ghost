import { useState } from 'react';
import { 
  Code2, 
  Network, 
  GitBranch, 
  FileCode, 
  Zap, 
  Activity,
  Layers
} from 'lucide-react';
import { RPCInspector } from './RPCInspector';
import { VisualIntentBuilder } from './VisualIntentBuilder';
import { PipelineVisualizer } from './PipelineVisualizer';
import { ManifestEditor } from './ManifestEditor';
import { HotReloadManager } from './HotReloadManager';
import { IntentPlayground } from './IntentPlayground';
import { ProfilingDashboard } from './ProfilingDashboard';

type PlaygroundView = 
  | 'intent-builder' 
  | 'visual-builder' 
  | 'rpc-inspector' 
  | 'pipeline' 
  | 'manifest' 
  | 'hot-reload'
  | 'profiling';

export function EnhancedPlayground() {
  const [activeView, setActiveView] = useState<PlaygroundView>('intent-builder');

  const views = [
    { id: 'intent-builder', label: 'Intent Builder', icon: Code2 },
    { id: 'visual-builder', label: 'Visual Builder', icon: GitBranch },
    { id: 'rpc-inspector', label: 'RPC Inspector', icon: Network },
    { id: 'pipeline', label: 'Pipeline Flow', icon: Layers },
    { id: 'manifest', label: 'Manifest Editor', icon: FileCode },
    { id: 'hot-reload', label: 'Hot Reload', icon: Zap },
    { id: 'profiling', label: 'Performance', icon: Activity },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-1 p-2 overflow-x-auto">
          {views.map((view) => {
            const Icon = view.icon;
            return (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id as PlaygroundView)}
                className={`flex items-center gap-2 px-3 py-2 rounded whitespace-nowrap transition-colors ${
                  activeView === view.id
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm">{view.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        {activeView === 'intent-builder' && <IntentPlayground />}
        {activeView === 'visual-builder' && <VisualIntentBuilder />}
        {activeView === 'rpc-inspector' && <RPCInspector />}
        {activeView === 'pipeline' && <PipelineVisualizer />}
        {activeView === 'manifest' && <ManifestEditor />}
        {activeView === 'hot-reload' && <HotReloadManager />}
        {activeView === 'profiling' && <ProfilingDashboard />}
      </div>
    </div>
  );
}
