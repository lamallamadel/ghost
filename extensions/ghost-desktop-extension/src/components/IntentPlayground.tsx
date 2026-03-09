import { useState } from 'react';
import { Play, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface ValidationError {
  field: string;
  message: string;
}

interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration?: number;
  validationErrors?: ValidationError[];
}

export function IntentPlayground() {
  const [extensionId, setExtensionId] = useState('');
  const [intentType, setIntentType] = useState('filesystem');
  const [operation, setOperation] = useState('read');
  const [params, setParams] = useState('{}');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [executing, setExecuting] = useState(false);

  const intentTemplates: Record<string, Record<string, string>> = {
    filesystem: {
      read: '{\n  "path": "README.md"\n}',
      write: '{\n  "path": "test.txt",\n  "content": "Hello World"\n}',
      readdir: '{\n  "path": "."\n}',
      stat: '{\n  "path": "package.json"\n}'
    },
    network: {
      request: '{\n  "url": "https://api.github.com",\n  "method": "GET"\n}',
      get: '{\n  "url": "https://httpbin.org/get"\n}',
      post: '{\n  "url": "https://httpbin.org/post",\n  "body": {"test": true}\n}'
    },
    git: {
      status: '{}',
      log: '{\n  "maxCount": 10\n}',
      diff: '{}',
      commit: '{\n  "message": "Test commit"\n}'
    }
  };

  const handleIntentTypeChange = (type: string) => {
    setIntentType(type);
    const operations = Object.keys(intentTemplates[type] || {});
    setOperation(operations[0]);
    setParams((intentTemplates[type] || {})[operations[0]] || '{}');
  };

  const handleOperationChange = (op: string) => {
    setOperation(op);
    setParams((intentTemplates[intentType] || {})[op] || '{}');
  };

  const handleValidate = async () => {
    setValidating(true);
    setResult(null);

    try {
      const intent = {
        type: intentType,
        operation,
        params: JSON.parse(params)
      };

      const response = await fetch('http://localhost:9876/api/playground/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extensionId, intent })
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      });
    } finally {
      setValidating(false);
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    setResult(null);

    const startTime = Date.now();

    try {
      const intent = {
        type: intentType,
        operation,
        params: JSON.parse(params)
      };

      const response = await fetch('http://localhost:9876/api/playground/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extensionId, intent })
      });

      const data = await response.json();
      const duration = Date.now() - startTime;

      setResult({
        ...data,
        duration
      });
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Execution failed',
        duration: Date.now() - startTime
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Intent Builder</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Extension ID</label>
            <input
              type="text"
              value={extensionId}
              onChange={(e) => setExtensionId(e.target.value)}
              placeholder="my-extension"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Intent Type</label>
              <select
                value={intentType}
                onChange={(e) => handleIntentTypeChange(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
              >
                <option value="filesystem">Filesystem</option>
                <option value="network">Network</option>
                <option value="git">Git</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Operation</label>
              <select
                value={operation}
                onChange={(e) => handleOperationChange(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
              >
                {Object.keys(intentTemplates[intentType] || {}).map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Parameters (JSON)</label>
            <textarea
              value={params}
              onChange={(e) => setParams(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white font-mono text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleValidate}
              disabled={validating || !extensionId}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              <AlertCircle className="w-4 h-4" />
              {validating ? 'Validating...' : 'Validate'}
            </button>
            <button
              onClick={handleExecute}
              disabled={executing || !extensionId}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              <Play className="w-4 h-4" />
              {executing ? 'Executing...' : 'Execute'}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className={`bg-gray-800 rounded-lg p-4 border ${
          result.success ? 'border-green-600' : 'border-red-600'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
              <h4 className="text-md font-semibold text-white">
                {result.success ? 'Success' : 'Error'}
              </h4>
            </div>
            {result.duration !== undefined && (
              <div className="flex items-center gap-1 text-sm text-gray-400">
                <Clock className="w-4 h-4" />
                {result.duration}ms
              </div>
            )}
          </div>

          {result.validationErrors && result.validationErrors.length > 0 && (
            <div className="mb-3">
              <p className="text-sm text-red-400 mb-2">Validation Errors:</p>
              <ul className="list-disc list-inside space-y-1">
                {result.validationErrors.map((err, idx) => (
                  <li key={idx} className="text-sm text-red-300">
                    <span className="font-mono text-xs">{err.field}</span>: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.error && (
            <div className="p-3 bg-red-900/20 rounded border border-red-800">
              <p className="text-sm text-red-300">{result.error}</p>
            </div>
          )}

          {result.result && (
            <div>
              <p className="text-sm text-gray-400 mb-2">Result:</p>
              <pre className="p-3 bg-gray-900 rounded border border-gray-700 text-xs text-green-400 overflow-auto max-h-64">
                {JSON.stringify(result.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h4 className="text-md font-semibold text-white mb-2">Intent Schema</h4>
        <div className="text-sm text-gray-400 space-y-1">
          <p>All intents follow the JSON-RPC 2.0 format:</p>
          <pre className="mt-2 p-3 bg-gray-900 rounded border border-gray-700 text-xs text-cyan-400 overflow-auto">
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
  );
}
