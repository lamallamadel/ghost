import { useState, useEffect } from 'react';
import { RotateCw, Power, Settings, FileWarning, CheckCircle2 } from 'lucide-react';

interface ExtensionStatus {
  id: string;
  name: string;
  hotReloadEnabled: boolean;
  isRunning: boolean;
  lastReload: number | null;
  pendingRequests: number;
  watchedFiles: string[];
}

export function HotReloadManager() {
  const [extensions, setExtensions] = useState<ExtensionStatus[]>([]);
  const [preserveState, setPreserveState] = useState(true);
  const [reloadDelay, setReloadDelay] = useState(500);

  useEffect(() => {
    loadExtensions();
    const interval = setInterval(loadExtensions, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadExtensions = async () => {
    try {
      const response = await fetch('http://localhost:9876/api/extensions/status');
      if (response.ok) {
        const data = await response.json();
        setExtensions(data.extensions || []);
      }
    } catch (error) {
      console.error('Failed to load extensions:', error);
    }
  };

  const toggleHotReload = async (extensionId: string, enabled: boolean) => {
    try {
      await fetch(`http://localhost:9876/api/extensions/${extensionId}/hot-reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          enabled,
          preserveState,
          reloadDelay,
        }),
      });
      await loadExtensions();
    } catch (error) {
      console.error('Failed to toggle hot reload:', error);
    }
  };

  const manualReload = async (extensionId: string) => {
    try {
      await fetch(`http://localhost:9876/api/extensions/${extensionId}/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preserveState }),
      });
      await loadExtensions();
    } catch (error) {
      console.error('Failed to reload extension:', error);
    }
  };

  const updateSettings = async () => {
    try {
      await fetch('http://localhost:9876/api/extensions/hot-reload/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preserveState,
          reloadDelay,
        }),
      });
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-white">Hot Reload Settings</h3>
        </div>

        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={preserveState}
              onChange={(e) => {
                setPreserveState(e.target.checked);
                updateSettings();
              }}
              className="rounded"
            />
            <div>
              <div className="text-sm text-white">Preserve Request State</div>
              <div className="text-xs text-gray-400">
                Keep pending requests and restore state after reload
              </div>
            </div>
          </label>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Reload Delay (ms)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="2000"
                step="100"
                value={reloadDelay}
                onChange={(e) => setReloadDelay(parseInt(e.target.value))}
                onMouseUp={updateSettings}
                className="flex-1"
              />
              <span className="text-sm text-white w-16 text-right">{reloadDelay}ms</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Wait time after file change before reloading
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Extensions</h3>

        {extensions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <FileWarning className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No extensions loaded</p>
          </div>
        ) : (
          <div className="space-y-3">
            {extensions.map((ext) => (
              <div
                key={ext.id}
                className="bg-gray-900 rounded-lg p-4 border border-gray-700"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      ext.isRunning ? 'bg-green-400' : 'bg-gray-500'
                    }`} />
                    <div>
                      <div className="text-sm font-semibold text-white">{ext.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{ext.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => manualReload(ext.id)}
                      disabled={!ext.isRunning}
                      className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
                      title="Manual reload"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleHotReload(ext.id, !ext.hotReloadEnabled)}
                      className={`p-2 rounded transition-colors ${
                        ext.hotReloadEnabled
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-600 hover:bg-gray-500 text-white'
                      }`}
                      title={ext.hotReloadEnabled ? 'Disable hot reload' : 'Enable hot reload'}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-gray-800 rounded p-2">
                    <div className="text-gray-400 mb-1">Hot Reload</div>
                    <div className="flex items-center gap-1">
                      {ext.hotReloadEnabled ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-green-400" />
                          <span className="text-green-400">Enabled</span>
                        </>
                      ) : (
                        <span className="text-gray-500">Disabled</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-800 rounded p-2">
                    <div className="text-gray-400 mb-1">Pending Requests</div>
                    <div className={`font-semibold ${
                      ext.pendingRequests > 0 ? 'text-yellow-400' : 'text-gray-500'
                    }`}>
                      {ext.pendingRequests}
                    </div>
                  </div>

                  {ext.lastReload && (
                    <div className="bg-gray-800 rounded p-2 col-span-2">
                      <div className="text-gray-400 mb-1">Last Reload</div>
                      <div className="text-white">
                        {new Date(ext.lastReload).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {ext.watchedFiles.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-400 mb-1">Watched Files ({ext.watchedFiles.length})</div>
                    <div className="max-h-20 overflow-auto text-xs text-gray-500 space-y-0.5">
                      {ext.watchedFiles.map((file, idx) => (
                        <div key={idx} className="font-mono truncate">
                          {file}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
