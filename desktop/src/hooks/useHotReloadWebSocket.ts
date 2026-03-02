import { useEffect, useRef, useState, useCallback } from 'react';

interface HotReloadEvent {
  type: 'hot-reload';
  event: string;
  data: unknown;
  timestamp: number;
}

interface ReloadStatus {
  isReloading: boolean;
  watchEnabled: boolean;
  hasScheduledReload: boolean;
  hasCapturedState: boolean;
}

interface HotReloadWebSocketOptions {
  onReloadStarted?: (data: unknown) => void;
  onReloadCompleted?: (data: unknown) => void;
  onReloadFailed?: (data: unknown) => void;
  onWatchEnabled?: (data: unknown) => void;
  onWatchDisabled?: (data: unknown) => void;
  onStateRestored?: (data: unknown) => void;
  onEvent?: (event: HotReloadEvent) => void;
  enabled?: boolean;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export function useHotReloadWebSocket(
  endpoint: string = 'ws://localhost:9876/ws',
  options: HotReloadWebSocketOptions = {}
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reloadStatus, setReloadStatus] = useState<Record<string, ReloadStatus>>({});

  const {
    onReloadStarted,
    onReloadCompleted,
    onReloadFailed,
    onWatchEnabled,
    onWatchDisabled,
    onStateRestored,
    onEvent,
    enabled = true,
    autoReconnect = true,
    reconnectInterval = 5000
  } = options;

  const connect = useCallback(() => {
    if (!enabled) return;

    try {
      const ws = new WebSocket(endpoint);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        ws.send(JSON.stringify({ type: 'status-request' }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'hot-reload') {
            const hotReloadEvent = message as HotReloadEvent;
            
            onEvent?.(hotReloadEvent);

            switch (hotReloadEvent.event) {
              case 'reload-started':
                onReloadStarted?.(hotReloadEvent.data);
                break;
              case 'reload-completed':
                onReloadCompleted?.(hotReloadEvent.data);
                break;
              case 'reload-failed':
                onReloadFailed?.(hotReloadEvent.data);
                break;
              case 'watch-enabled':
                onWatchEnabled?.(hotReloadEvent.data);
                break;
              case 'watch-disabled':
                onWatchDisabled?.(hotReloadEvent.data);
                break;
              case 'state-restored':
                onStateRestored?.(hotReloadEvent.data);
                break;
            }
          } else if (message.type === 'status-response') {
            setReloadStatus(message.data || {});
          } else if (message.type === 'connection' && message.event === 'connected') {
            setReloadStatus(message.data?.reloadStatus || {});
          }
        } catch (error) {
          console.error('Failed to parse hot-reload WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('Hot-reload WebSocket error:', error);
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        if (autoReconnect && enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };
    } catch (error) {
      console.error('Failed to connect to hot-reload WebSocket:', error);
      
      if (autoReconnect && enabled) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      }
    }
  }, [
    endpoint,
    enabled,
    autoReconnect,
    reconnectInterval,
    onReloadStarted,
    onReloadCompleted,
    onReloadFailed,
    onWatchEnabled,
    onWatchDisabled,
    onStateRestored,
    onEvent
  ]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendMessage = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const reloadExtension = useCallback((extensionId: string, options?: unknown) => {
    sendMessage({
      type: 'reload-request',
      data: { extensionId, options }
    });
  }, [sendMessage]);

  const enableWatch = useCallback((extensionId: string) => {
    sendMessage({
      type: 'enable-watch',
      data: { extensionId }
    });
  }, [sendMessage]);

  const disableWatch = useCallback((extensionId: string) => {
    sendMessage({
      type: 'disable-watch',
      data: { extensionId }
    });
  }, [sendMessage]);

  const refreshStatus = useCallback(() => {
    sendMessage({ type: 'status-request' });
  }, [sendMessage]);

  return {
    isConnected,
    reloadStatus,
    reloadExtension,
    enableWatch,
    disableWatch,
    refreshStatus,
    sendMessage
  };
}
