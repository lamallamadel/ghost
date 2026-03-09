import { useEffect, useRef } from 'react';

interface WebSocketOptions {
  onMessage?: (data: unknown) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  onClose?: () => void;
  enabled?: boolean;
}

export function usePlaygroundWebSocket(endpoint: string, options: WebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const { onMessage, onError, onOpen, onClose, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(endpoint);
    wsRef.current = ws;

    ws.onopen = () => {
      onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      onError?.(error);
    };

    ws.onclose = () => {
      onClose?.();
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [endpoint, enabled, onMessage, onError, onOpen, onClose]);

  const sendMessage = (data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  return { sendMessage };
}
