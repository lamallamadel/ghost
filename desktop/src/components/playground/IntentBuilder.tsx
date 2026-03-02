import { useState } from 'react';
import { Play, Save, Trash2, Copy, CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react';

interface IntentTemplate {
  name: string;
  type: string;
  operation: string;
  params: Record<string, unknown>;
  description: string;
}

const INTENT_TEMPLATES: Record<string, IntentTemplate[]> = {
  filesystem: [
    {
      name: 'Read File',
      type: 'filesystem',
      operation: 'read',
      params: { path: 'README.md' },
      description: 'Read contents of a file'
    },
    {
      name: 'Write File',
      type: 'filesystem',
      operation: 'write',
      params: { path: 'output.txt', content: 'Hello World' },
      description: 'Write content to a file'
    },
    {
      name: 'List Directory',
      type: 'filesystem',
      operation: 'readdir',
      params: { path: '.' },
      description: 'List files in a directory'
    },
    {
      name: 'File Stats',
      type: 'filesystem',
      operation: 'stat',
      params: { path: 'package.json' },
      description: 'Get file statistics'
    }
  ],
  network: [
    {
      name: 'GET Request',
      type: 'network',
      operation: 'request',
      params: { url: 'https://api.github.com', method: 'GET' },
      description: 'Make a GET HTTP request'
    },
    {
      name: 'POST Request',
      type: 'network',
      operation: 'request',
      params: { 
        url: 'https://httpbin.org/post', 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { test: true }
      },
      description: 'Make a POST HTTP request'
    }
  ],
  git: [
    {
      name: 'Git Status',
      type: 'git',
      operation: 'status',
      params: {},
      description: 'Get repository status'
    },
    {
      name: 'Git Log',
      type: 'git',
      operation: 'log',
      params: { maxCount: 10 },
      description: 'Get commit history'
    },
    {
      name: 'Git Diff',
      type: 'git',
      operation: 'diff',
      params: {},
      description: 'Show working tree changes'
    },
    {
      name: 'Git Commit',
      type: 'git',
      operation: 'commit',
      params: { message: 'Test commit' },
      description: 'Create a new commit'
    }
  ]
};

interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration?: number;
  timestamp?: number;
}

export function IntentBuilder() {
  const [selectedCategory, setSelectedCategory] = useState('filesystem');
  const [intentType, setIntentType] = useState('filesystem');
  const [operation, setOperation] = useState('read');
  const [params, setParams] = useState('{\n  "path": "README.md"\n}');
  const [extensionId, setExtensionId] = useState('playground-extension');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [savedIntents, setSavedIntents] = useState<Array<{id: string; name: string; intent: unknown}>>([]);

  const loadTemplate = (template: IntentTemplate) => {
    setIntentType(template.type);
    setOperation(template.operation);
    setParams(JSON.stringify(template.params, null, 2));
  };

  const executeIntent = async () => {
    setExecuting(true);
    setResult(null);
    const startTime = Date.now();

    try {
      const parsedParams = JSON.parse(params);
      const intent = {
        jsonrpc: '2.0',
        method: `${intentType}:${operation}`,
        params: parsedParams,
        id: Date.now()
      };

      let data;
      try {
        const response = await fetch('http://localhost:9876/api/playground/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extensionId, intent })
        });
        data = await response.json();
      } catch {
        const { mockPlaygroundServer } = await import('@/utils/mockPlaygroundServer');
        data = await mockPlaygroundServer.executeIntent(extensionId, intent);
      }

      setResult({
        ...data,
        duration: data.duration || Date.now() - startTime,
        timestamp: Date.now()
      });
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Execution failed',
        duration: Date.now() - startTime,
        timestamp: Date.now()
      });
    } finally {
      setExecuting(false);
    }
  };

  const saveIntent = () => {
    const name = prompt('Enter intent name:');
    if (!name) return;

    const intent = {
      type: intentType,
      operation,
      params: JSON.parse(params)
    };

    setSavedIntents([...savedIntents, { id: Date.now().toString(), name, intent }]);
  };

  const copyAsCode = () => {
    const code = `await ghost.call('${intentType}:${operation}', ${params});`;
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="flex h-full">
      <div className="w-64 border-r border-white/10 bg-black/20 p-4 overflow-y-auto">
        <h3 className="text-sm font-semibold text-white mb-3">Intent Templates</h3>
        
        <div className="space-y-2">
          {Object.keys(INTENT_TEMPLATES).map((category) => (
            <div key={category}>
              <button
                onClick={() => setSelectedCategory(category)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-cyan-600/20 text-cyan-400'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
              
              {selectedCategory === category && (
                <div className="mt-1 ml-2 space-y-1">
                  {INTENT_TEMPLATES[category].map((template, idx) => (
                    <button
                      key={idx}
                      onClick={() => loadTemplate(template)}
                      className="w-full text-left px-3 py-1.5 rounded text-xs text-white/60 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {savedIntents.length > 0 && (
          <>
            <div className="mt-6 pt-6 border-t border-white/10">
              <h3 className="text-sm font-semibold text-white mb-3">Saved Intents</h3>
              <div className="space-y-1">
                {savedIntents.map((saved) => (
                  <div key={saved.id} className="flex items-center justify-between group">
                    <button
                      onClick={() => {
                        const intent = saved.intent as {type: string; operation: string; params: unknown};
                        setIntentType(intent.type);
                        setOperation(intent.operation);
                        setParams(JSON.stringify(intent.params, null, 2));
                      }}
                      className="flex-1 text-left px-3 py-1.5 rounded text-xs text-white/60 hover:bg-white/5 hover:text-white transition-colors truncate"
                    >
                      {saved.name}
                    </button>
                    <button
                      onClick={() => setSavedIntents(savedIntents.filter(s => s.id !== saved.id))}
                      className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-white/5 rounded-lg border border-white/10 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Build Intent</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Extension ID</label>
                <input
                  type="text"
                  value={extensionId}
                  onChange={(e) => setExtensionId(e.target.value)}
                  placeholder="my-extension"
                  className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Intent Type</label>
                  <select
                    value={intentType}
                    onChange={(e) => setIntentType(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  >
                    <option value="filesystem">Filesystem</option>
                    <option value="network">Network</option>
                    <option value="git">Git</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Operation</label>
                  <input
                    type="text"
                    value={operation}
                    onChange={(e) => setOperation(e.target.value)}
                    placeholder="read"
                    className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Parameters (JSON)</label>
                <textarea
                  value={params}
                  onChange={(e) => setParams(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={executeIntent}
                  disabled={executing || !extensionId}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg font-medium transition-all shadow-lg disabled:shadow-none"
                >
                  {executing ? (
                    <>
                      <Zap className="w-4 h-4 animate-pulse" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Execute Intent
                    </>
                  )}
                </button>
                <button
                  onClick={saveIntent}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  onClick={copyAsCode}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {result && (
            <div className={`bg-white/5 rounded-lg border-2 p-6 ${
              result.success ? 'border-green-500/50' : 'border-red-500/50'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  )}
                  <h3 className="text-lg font-semibold text-white">
                    {result.success ? 'Success' : 'Error'}
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/60">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {result.duration}ms
                  </div>
                  {result.timestamp && (
                    <div>
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>

              {result.error && (
                <div className="p-4 bg-red-900/20 rounded-lg border border-red-800/50 mb-4">
                  <p className="text-sm text-red-300 font-mono">{result.error}</p>
                </div>
              )}

              {result.result && (
                <div>
                  <div className="text-sm font-medium text-white/80 mb-2">Result:</div>
                  <pre className="p-4 bg-black/60 rounded-lg border border-white/10 text-xs text-green-400 overflow-auto max-h-96 font-mono">
                    {JSON.stringify(result.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div className="bg-white/5 rounded-lg border border-white/10 p-6">
            <h3 className="text-md font-semibold text-white mb-3">JSON-RPC 2.0 Format</h3>
            <div className="text-sm text-white/60 space-y-2">
              <p>All intents use the JSON-RPC 2.0 protocol:</p>
              <pre className="mt-2 p-4 bg-black/60 rounded-lg border border-white/10 text-xs text-cyan-400 overflow-auto font-mono">
{`{
  "jsonrpc": "2.0",
  "method": "<type>:<operation>",
  "params": {
    // Operation-specific parameters
  },
  "id": <request-id>
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
