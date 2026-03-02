import { useState, useEffect } from 'react';
import { FileJson, CheckCircle2, AlertTriangle, Download, Upload, Copy, Sparkles } from 'lucide-react';

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

const MANIFEST_TEMPLATE = {
  id: 'my-extension',
  name: 'My Extension',
  version: '1.0.0',
  description: 'Description of my extension',
  main: 'index.js',
  author: '',
  capabilities: {
    filesystem: false,
    network: false,
    git: false
  },
  permissions: {
    read: [],
    write: [],
    execute: []
  },
  config: {}
};

const CAPABILITY_DESCRIPTIONS = {
  filesystem: 'Access to read and write files in the repository',
  network: 'Ability to make HTTP/HTTPS requests',
  git: 'Execute Git commands and access repository state'
};

export function ManifestEditor() {
  const [manifestText, setManifestText] = useState(JSON.stringify(MANIFEST_TEMPLATE, null, 2));
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isValid, setIsValid] = useState(true);
  const [autoValidate, setAutoValidate] = useState(true);

  useEffect(() => {
    if (autoValidate) {
      validateManifest();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestText, autoValidate]);

  const validateManifest = async () => {
    try {
      const manifest = JSON.parse(manifestText);
      const errors: ValidationError[] = [];

      if (!manifest.id || typeof manifest.id !== 'string' || manifest.id.trim() === '') {
        errors.push({ field: 'id', message: 'Extension ID is required and must be a non-empty string', severity: 'error' });
      }

      if (!manifest.name || typeof manifest.name !== 'string' || manifest.name.trim() === '') {
        errors.push({ field: 'name', message: 'Extension name is required', severity: 'error' });
      }

      if (!manifest.version || typeof manifest.version !== 'string') {
        errors.push({ field: 'version', message: 'Version is required', severity: 'error' });
      } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
        errors.push({ field: 'version', message: 'Version must follow semver format (e.g., 1.0.0)', severity: 'error' });
      }

      if (!manifest.main || typeof manifest.main !== 'string') {
        errors.push({ field: 'main', message: 'Main entry point is required', severity: 'error' });
      }

      if (!manifest.capabilities) {
        errors.push({ field: 'capabilities', message: 'Capabilities object is required', severity: 'error' });
      } else {
        const declaredCapabilities = Object.keys(manifest.capabilities).filter(key => manifest.capabilities[key]);
        
        if (declaredCapabilities.length === 0) {
          errors.push({ field: 'capabilities', message: 'At least one capability should be enabled', severity: 'warning' });
        }
      }

      if (!manifest.permissions) {
        errors.push({ field: 'permissions', message: 'Permissions object is required', severity: 'warning' });
      }

      setValidationErrors(errors);
      setIsValid(errors.filter(e => e.severity === 'error').length === 0);

      return { valid: errors.filter(e => e.severity === 'error').length === 0, errors };
    } catch (error) {
      setValidationErrors([{
        field: 'json',
        message: error instanceof Error ? error.message : 'Invalid JSON',
        severity: 'error'
      }]);
      setIsValid(false);
      return { valid: false, errors: [] };
    }
  };

  const loadTemplate = (templateName: string) => {
    let template;
    switch (templateName) {
      case 'api-integration':
        template = {
          ...MANIFEST_TEMPLATE,
          id: 'api-integration-extension',
          name: 'API Integration Extension',
          description: 'Integrates with external REST APIs',
          capabilities: { filesystem: false, network: true, git: false },
          permissions: { read: [], write: [], execute: [] }
        };
        break;
      case 'file-processor':
        template = {
          ...MANIFEST_TEMPLATE,
          id: 'file-processor-extension',
          name: 'File Processor Extension',
          description: 'Processes and transforms files',
          capabilities: { filesystem: true, network: false, git: false },
          permissions: { read: ['**/*'], write: ['output/**'], execute: [] }
        };
        break;
      case 'git-workflow':
        template = {
          ...MANIFEST_TEMPLATE,
          id: 'git-workflow-extension',
          name: 'Git Workflow Extension',
          description: 'Automates Git operations',
          capabilities: { filesystem: true, network: false, git: true },
          permissions: { read: ['**/*'], write: [], execute: ['git'] }
        };
        break;
      default:
        template = MANIFEST_TEMPLATE;
    }
    setManifestText(JSON.stringify(template, null, 2));
  };

  const downloadManifest = () => {
    const blob = new Blob([manifestText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ghost-manifest.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadManifest = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          setManifestText(content);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(manifestText);
  };

  const formatManifest = () => {
    try {
      const manifest = JSON.parse(manifestText);
      setManifestText(JSON.stringify(manifest, null, 2));
    } catch {
      // Invalid JSON, don't format
    }
  };

  return (
    <div className="flex h-full">
      <div className="w-64 border-r border-white/10 bg-black/20 p-4 overflow-y-auto">
        <h3 className="text-sm font-semibold text-white mb-3">Templates</h3>
        
        <div className="space-y-2 mb-6">
          <button
            onClick={() => loadTemplate('basic')}
            className="w-full text-left px-3 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 text-white transition-colors"
          >
            Basic Extension
          </button>
          <button
            onClick={() => loadTemplate('api-integration')}
            className="w-full text-left px-3 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 text-white transition-colors"
          >
            API Integration
          </button>
          <button
            onClick={() => loadTemplate('file-processor')}
            className="w-full text-left px-3 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 text-white transition-colors"
          >
            File Processor
          </button>
          <button
            onClick={() => loadTemplate('git-workflow')}
            className="w-full text-left px-3 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 text-white transition-colors"
          >
            Git Workflow
          </button>
        </div>

        <div className="pt-6 border-t border-white/10">
          <h3 className="text-sm font-semibold text-white mb-3">Capabilities</h3>
          <div className="space-y-3 text-xs text-white/80">
            {Object.entries(CAPABILITY_DESCRIPTIONS).map(([key, desc]) => (
              <div key={key} className="p-2 bg-white/5 rounded">
                <div className="font-semibold text-cyan-400 mb-1 capitalize">{key}</div>
                <div className="text-white/60">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/10">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={autoValidate}
              onChange={(e) => setAutoValidate(e.target.checked)}
              className="rounded"
            />
            Auto-validate
          </label>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="bg-white/5 border-b border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-semibold text-white">Manifest Editor</h2>
              {isValid ? (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={formatManifest}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                title="Format JSON"
              >
                <Sparkles className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={copyToClipboard}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={uploadManifest}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                title="Upload manifest"
              >
                <Upload className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={downloadManifest}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                title="Download manifest"
              >
                <Download className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {validationErrors.length > 0 && (
            <div className="space-y-2">
              {validationErrors.map((error, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border text-sm ${
                    error.severity === 'error'
                      ? 'bg-red-900/20 border-red-600/50 text-red-300'
                      : 'bg-yellow-900/20 border-yellow-600/50 text-yellow-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">{error.field}:</span> {error.message}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 flex">
          <div className="flex-1 p-4">
            <textarea
              value={manifestText}
              onChange={(e) => setManifestText(e.target.value)}
              className="w-full h-full px-4 py-3 bg-black/40 border border-white/20 rounded-lg text-white font-mono text-sm resize-none focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              spellCheck={false}
            />
          </div>

          <div className="w-1/3 border-l border-white/10 bg-black/20 p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-3">Manifest Schema</h3>
            
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-white/5 rounded-lg">
                <div className="font-semibold text-cyan-400 mb-1">id (required)</div>
                <div className="text-white/60 mb-2">Unique identifier for the extension</div>
                <code className="text-xs text-green-400">string</code>
              </div>

              <div className="p-3 bg-white/5 rounded-lg">
                <div className="font-semibold text-cyan-400 mb-1">name (required)</div>
                <div className="text-white/60 mb-2">Display name of the extension</div>
                <code className="text-xs text-green-400">string</code>
              </div>

              <div className="p-3 bg-white/5 rounded-lg">
                <div className="font-semibold text-cyan-400 mb-1">version (required)</div>
                <div className="text-white/60 mb-2">Semantic version number</div>
                <code className="text-xs text-green-400">string (semver)</code>
              </div>

              <div className="p-3 bg-white/5 rounded-lg">
                <div className="font-semibold text-cyan-400 mb-1">description</div>
                <div className="text-white/60 mb-2">Brief description of functionality</div>
                <code className="text-xs text-green-400">string</code>
              </div>

              <div className="p-3 bg-white/5 rounded-lg">
                <div className="font-semibold text-cyan-400 mb-1">main (required)</div>
                <div className="text-white/60 mb-2">Entry point file path</div>
                <code className="text-xs text-green-400">string</code>
              </div>

              <div className="p-3 bg-white/5 rounded-lg">
                <div className="font-semibold text-cyan-400 mb-1">capabilities (required)</div>
                <div className="text-white/60 mb-2">Requested capabilities</div>
                <code className="text-xs text-green-400 block">{'{'}</code>
                <code className="text-xs text-green-400 block ml-2">filesystem: boolean,</code>
                <code className="text-xs text-green-400 block ml-2">network: boolean,</code>
                <code className="text-xs text-green-400 block ml-2">git: boolean</code>
                <code className="text-xs text-green-400 block">{'}'}</code>
              </div>

              <div className="p-3 bg-white/5 rounded-lg">
                <div className="font-semibold text-cyan-400 mb-1">permissions</div>
                <div className="text-white/60 mb-2">Fine-grained permissions</div>
                <code className="text-xs text-green-400 block">{'{'}</code>
                <code className="text-xs text-green-400 block ml-2">read: string[],</code>
                <code className="text-xs text-green-400 block ml-2">write: string[],</code>
                <code className="text-xs text-green-400 block ml-2">execute: string[]</code>
                <code className="text-xs text-green-400 block">{'}'}</code>
              </div>

              <div className="p-3 bg-white/5 rounded-lg">
                <div className="font-semibold text-cyan-400 mb-1">config</div>
                <div className="text-white/60 mb-2">Extension configuration object</div>
                <code className="text-xs text-green-400">Record&lt;string, any&gt;</code>
              </div>
            </div>

            <div className="mt-6 p-3 bg-cyan-900/20 border border-cyan-600/50 rounded-lg">
              <div className="text-xs text-cyan-400">
                <strong>Tip:</strong> Use the Intent Builder to test your extension's capabilities
                after defining the manifest.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
