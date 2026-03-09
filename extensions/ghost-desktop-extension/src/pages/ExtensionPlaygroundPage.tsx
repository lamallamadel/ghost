import { useState } from 'react';
import { Code2, Activity, FileJson, Network } from 'lucide-react';
import { RPCInspector } from '@/components/playground/RPCInspector';
import { IntentBuilder } from '@/components/playground/IntentBuilder';
import { PipelineVisualizer } from '@/components/playground/PipelineVisualizer';
import { ManifestEditor } from '@/components/playground/ManifestEditor';

type PlaygroundView = 'intent-builder' | 'rpc-inspector' | 'pipeline' | 'manifest';

export default function ExtensionPlaygroundPage() {
  const [activeView, setActiveView] = useState<PlaygroundView>('intent-builder');

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="border-b border-white/10 bg-black/30 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-white">Extension Development Playground</h1>
            <p className="text-sm text-white/60 mt-1">
              Interactive toolkit for building and testing Ghost extensions
            </p>
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-4">
          <button
            onClick={() => setActiveView('intent-builder')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeView === 'intent-builder'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/50'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Code2 className="w-4 h-4" />
            Intent Builder
          </button>
          <button
            onClick={() => setActiveView('rpc-inspector')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeView === 'rpc-inspector'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/50'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Network className="w-4 h-4" />
            RPC Inspector
          </button>
          <button
            onClick={() => setActiveView('pipeline')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeView === 'pipeline'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/50'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            Pipeline
          </button>
          <button
            onClick={() => setActiveView('manifest')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeView === 'manifest'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/50'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <FileJson className="w-4 h-4" />
            Manifest Editor
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeView === 'intent-builder' && <IntentBuilder />}
        {activeView === 'rpc-inspector' && <RPCInspector />}
        {activeView === 'pipeline' && <PipelineVisualizer />}
        {activeView === 'manifest' && <ManifestEditor />}
      </div>
    </div>
  );
}
