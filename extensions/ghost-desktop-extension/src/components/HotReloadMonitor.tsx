import { useState } from 'react';
import { useHotReloadWebSocket } from '../hooks/useHotReloadWebSocket';
import { RefreshCw, Zap, ZapOff, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface HotReloadEvent {
  type: 'hot-reload';
  event: string;
  data: unknown;
  timestamp: number;
}

export function HotReloadMonitor() {
  const [events, setEvents] = useState<HotReloadEvent[]>([]);
  const [showEvents, setShowEvents] = useState(false);

  const {
    isConnected,
    reloadStatus,
    reloadExtension,
    enableWatch,
    disableWatch,
    refreshStatus
  } = useHotReloadWebSocket('ws://localhost:9876/ws', {
    onEvent: (event) => {
      setEvents((prev) => [event, ...prev].slice(0, 50));
    }
  });

  const getStatusIcon = (status: { isReloading: boolean; watchEnabled: boolean }) => {
    if (status.isReloading) {
      return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
    }
    if (status.watchEnabled) {
      return <Zap className="w-4 h-4 text-green-500" />;
    }
    return <ZapOff className="w-4 h-4 text-gray-400" />;
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'reload-started':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'reload-completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'reload-failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'watch-enabled':
        return <Zap className="w-4 h-4 text-green-500" />;
      case 'watch-disabled':
        return <ZapOff className="w-4 h-4 text-gray-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Hot Reload Monitor
          </h2>
          {isConnected ? (
            <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Connected
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              Disconnected
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEvents(!showEvents)}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded transition-colors"
          >
            {showEvents ? 'Hide' : 'Show'} Events
          </button>
          <button
            onClick={refreshStatus}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {Object.keys(reloadStatus).length > 0 && (
        <div className="space-y-2 mb-4">
          {Object.entries(reloadStatus).map(([extensionId, status]) => (
            <div
              key={extensionId}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(status)}
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {extensionId}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {status.isReloading && 'Reloading...'}
                    {!status.isReloading && status.watchEnabled && 'Watching for changes'}
                    {!status.isReloading && !status.watchEnabled && 'Not watching'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status.watchEnabled ? (
                  <button
                    onClick={() => disableWatch(extensionId)}
                    className="px-3 py-1 text-xs bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 rounded transition-colors"
                  >
                    Disable Watch
                  </button>
                ) : (
                  <button
                    onClick={() => enableWatch(extensionId)}
                    className="px-3 py-1 text-xs bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 rounded transition-colors"
                  >
                    Enable Watch
                  </button>
                )}
                <button
                  onClick={() => reloadExtension(extensionId)}
                  disabled={status.isReloading}
                  className="px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reload
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEvents && events.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Recent Events
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.map((event, index) => (
              <div
                key={`${event.timestamp}-${index}`}
                className="flex items-start gap-3 p-2 bg-gray-50 dark:bg-gray-700/30 rounded text-xs"
              >
                {getEventIcon(event.event)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {event.event}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 text-xs">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  {event.data && (
                    <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(reloadStatus).length === 0 && isConnected && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <ZapOff className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No extensions with hot-reload enabled</p>
        </div>
      )}
    </div>
  );
}
