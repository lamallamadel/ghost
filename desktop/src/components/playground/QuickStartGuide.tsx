import { X, Zap, Eye, Activity, FileJson } from 'lucide-react';

interface QuickStartGuideProps {
  onClose: () => void;
}

export function QuickStartGuide({ onClose }: QuickStartGuideProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl border border-white/20 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Welcome to Extension Playground</h2>
            <p className="text-cyan-100 text-sm mt-1">
              Interactive toolkit for building and testing Ghost extensions
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-cyan-600/20 rounded-lg">
                  <Zap className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Intent Builder</h3>
              </div>
              <p className="text-sm text-white/70 mb-3">
                Build and test extension intents without writing code
              </p>
              <ul className="text-xs text-white/60 space-y-1">
                <li>• Choose from filesystem, network, or git operations</li>
                <li>• Use templates for common tasks</li>
                <li>• Execute intents and see results instantly</li>
                <li>• Save frequently used intents</li>
              </ul>
            </div>

            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-600/20 rounded-lg">
                  <Eye className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">RPC Inspector</h3>
              </div>
              <p className="text-sm text-white/70 mb-3">
                Monitor live JSON-RPC traffic and debug communication
              </p>
              <ul className="text-xs text-white/60 space-y-1">
                <li>• View all request/response messages</li>
                <li>• Filter by extension or method</li>
                <li>• Export message history</li>
                <li>• Pause/resume recording</li>
              </ul>
            </div>

            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-purple-600/20 rounded-lg">
                  <Activity className="w-5 h-5 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Pipeline Visualizer</h3>
              </div>
              <p className="text-sm text-white/70 mb-3">
                Watch intents flow through the execution pipeline
              </p>
              <ul className="text-xs text-white/60 space-y-1">
                <li>• See Gateway → Auth → Audit → Execute stages</li>
                <li>• Track performance of each stage</li>
                <li>• Identify bottlenecks and failures</li>
                <li>• Live execution monitoring</li>
              </ul>
            </div>

            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-green-600/20 rounded-lg">
                  <FileJson className="w-5 h-5 text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Manifest Editor</h3>
              </div>
              <p className="text-sm text-white/70 mb-3">
                Create and validate extension manifests with real-time feedback
              </p>
              <ul className="text-xs text-white/60 space-y-1">
                <li>• Start from pre-built templates</li>
                <li>• Real-time validation and error detection</li>
                <li>• Inline schema documentation</li>
                <li>• Import/export manifest files</li>
              </ul>
            </div>
          </div>

          <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 rounded-lg border border-cyan-600/50 p-4">
            <h3 className="text-md font-semibold text-cyan-400 mb-2">Quick Start Workflow</h3>
            <ol className="text-sm text-white/80 space-y-2">
              <li className="flex items-start gap-2">
                <span className="font-semibold text-cyan-400 min-w-[20px]">1.</span>
                <span>Start with the <strong>Manifest Editor</strong> to define your extension's capabilities</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold text-cyan-400 min-w-[20px]">2.</span>
                <span>Use the <strong>Intent Builder</strong> to test individual operations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold text-cyan-400 min-w-[20px]">3.</span>
                <span>Monitor the <strong>RPC Inspector</strong> to see message flow</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold text-cyan-400 min-w-[20px]">4.</span>
                <span>Check the <strong>Pipeline Visualizer</strong> to optimize performance</span>
              </li>
            </ol>
          </div>

          <div className="bg-yellow-900/20 rounded-lg border border-yellow-600/50 p-4">
            <h3 className="text-md font-semibold text-yellow-400 mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Pro Tips
            </h3>
            <ul className="text-sm text-yellow-100/80 space-y-1">
              <li>• Use templates to learn the structure of different intent types</li>
              <li>• Save frequently used intents for quick access</li>
              <li>• Keep the RPC Inspector open while developing to catch errors early</li>
              <li>• Export RPC messages to document your extension's behavior</li>
              <li>• Use "Copy as Code" to generate SDK snippets from visual intents</li>
            </ul>
          </div>

          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-medium transition-all shadow-lg"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
