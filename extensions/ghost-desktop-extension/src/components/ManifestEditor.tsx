import { useState, useEffect } from 'react';
import { Save, FileText, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

interface ManifestValidation {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{
    capability: string;
    message: string;
  }>;
}

export function ManifestEditor() {
  const [extensionId, setExtensionId] = useState('');
  const [manifest, setManifest] = useState('{\n  "name": "",\n  "version": "1.0.0",\n  "capabilities": []\n}');
  const [validation, setValidation] = useState<ManifestValidation | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoValidate, setAutoValidate] = useState(true);

  useEffect(() => {
    if (autoValidate && manifest) {
      const timer = setTimeout(() => {
        validateManifest();
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, autoValidate]);

  const validateManifest = async () => {
    try {
      const parsed = JSON.parse(manifest);
      const response = await fetch('http://localhost:9876/api/manifest/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest: parsed }),
      });

      const result = await response.json();
      setValidation(result);
    } catch (error) {
      setValidation({
        valid: false,
        errors: [
          {
            path: 'root',
            message: error instanceof Error ? error.message : 'Invalid JSON',
            severity: 'error',
          },
        ],
        warnings: [],
      });
    }
  };

  const saveManifest = async () => {
    if (!extensionId) {
      alert('Please enter an extension ID');
      return;
    }

    setSaving(true);
    try {
      const parsed = JSON.parse(manifest);
      const response = await fetch(`http://localhost:9876/api/manifest/${extensionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest: parsed }),
      });

      if (response.ok) {
        alert('Manifest saved successfully');
      } else {
        const error = await response.json();
        alert(`Failed to save manifest: ${error.message}`);
      }
    } catch (error) {
      alert(`Failed to save manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const loadManifest = async () => {
    if (!extensionId) return;

    try {
      const response = await fetch(`http://localhost:9876/api/manifest/${extensionId}`);
      if (response.ok) {
        const data = await response.json();
        setManifest(JSON.stringify(data.manifest, null, 2));
      } else {
        alert('Extension not found');
      }
    } catch {
      alert('Failed to load manifest');
    }
  };

  const getLineNumbers = () => {
    const lines = manifest.split('\n');
    return lines.map((_, idx) => idx + 1).join('\n');
  };

  const insertTemplate = (template: string) => {
    const templates: Record<string, string> = {
      filesystem: '{\n  "type": "filesystem",\n  "operations": ["read", "write"]\n}',
      network: '{\n  "type": "network",\n  "allowedDomains": ["api.example.com"]\n}',
      git: '{\n  "type": "git",\n  "operations": ["status", "log"]\n}',
      process: '{\n  "type": "process",\n  "allowedCommands": ["npm", "node"]\n}',
    };

    try {
      const parsed = JSON.parse(manifest);
      if (!parsed.capabilities) {
        parsed.capabilities = [];
      }
      parsed.capabilities.push(JSON.parse(templates[template]));
      setManifest(JSON.stringify(parsed, null, 2));
    } catch {
      alert('Invalid JSON - cannot add template');
    }
  };

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">Manifest Editor</h3>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoValidate}
                onChange={(e) => setAutoValidate(e.target.checked)}
                className="rounded"
              />
              Auto-validate
            </label>
            <button
              onClick={validateManifest}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Validate
            </button>
            <button
              onClick={saveManifest}
              disabled={saving || !validation?.valid}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              <Save className="w-3 h-3" />
              Save
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Extension ID"
              value={extensionId}
              onChange={(e) => setExtensionId(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
            />
            <button
              onClick={loadManifest}
              disabled={!extensionId}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white rounded text-sm transition-colors"
            >
              Load
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="px-2 py-4 bg-gray-900 text-right text-gray-500 text-xs font-mono select-none border-r border-gray-700">
            <pre>{getLineNumbers()}</pre>
          </div>
          <textarea
            value={manifest}
            onChange={(e) => setManifest(e.target.value)}
            className="flex-1 px-4 py-4 bg-gray-900 text-white font-mono text-xs resize-none focus:outline-none"
            spellCheck={false}
          />
        </div>

        <div className="p-3 border-t border-gray-700">
          <div className="flex gap-2">
            <button
              onClick={() => insertTemplate('filesystem')}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              + Filesystem
            </button>
            <button
              onClick={() => insertTemplate('network')}
              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            >
              + Network
            </button>
            <button
              onClick={() => insertTemplate('git')}
              className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
            >
              + Git
            </button>
            <button
              onClick={() => insertTemplate('process')}
              className="px-2 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
            >
              + Process
            </button>
          </div>
        </div>
      </div>

      <div className="w-96 flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-white">Validation Results</h3>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {validation ? (
            <div className="space-y-4">
              <div className={`flex items-center gap-2 p-3 rounded border-2 ${
                validation.valid
                  ? 'bg-green-600/20 border-green-600'
                  : 'bg-red-600/20 border-red-600'
              }`}>
                {validation.valid ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-sm font-semibold text-white">Valid Manifest</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="text-sm font-semibold text-white">Invalid Manifest</span>
                  </>
                )}
              </div>

              {validation.errors.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 mb-2">Errors</h4>
                  <div className="space-y-2">
                    {validation.errors.map((error, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded border ${
                          error.severity === 'error'
                            ? 'bg-red-900/20 border-red-800'
                            : 'bg-yellow-900/20 border-yellow-800'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {error.severity === 'error' ? (
                            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                          )}
                          <div>
                            <div className="text-xs font-mono text-white">{error.path}</div>
                            <div className={`text-xs mt-1 ${
                              error.severity === 'error' ? 'text-red-300' : 'text-yellow-300'
                            }`}>
                              {error.message}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {validation.warnings.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 mb-2">Capability Warnings</h4>
                  <div className="space-y-2">
                    {validation.warnings.map((warning, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded border bg-yellow-900/20 border-yellow-800"
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="text-xs font-mono text-white">{warning.capability}</div>
                            <div className="text-xs text-yellow-300 mt-1">{warning.message}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {validation.valid && validation.errors.length === 0 && validation.warnings.length === 0 && (
                <div className="text-sm text-gray-400">
                  No issues found. Manifest is ready to use.
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              Edit the manifest to see validation results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
