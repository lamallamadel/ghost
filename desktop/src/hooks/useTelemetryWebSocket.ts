import { useEffect, useRef, useState, useCallback } from 'react';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SpanEvent {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  startTime: number;
  endTime: number | null;
  duration: number;
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes: Record<string, unknown>;
  }>;
  status: {
    code: string;
    message?: string;
  };
}

export interface LogEvent {
  timestamp: string;
  severity: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY_ALERT';
  message: string;
  extensionId: string | null;
  requestId: string | null;
  layer: string | null;
  errorCode: string | null;
  [key: string]: unknown;
}

export interface MetricUpdateEvent {
  extensionId?: string;
  requests?: Record<string, Record<string, number>>;
  latencies?: Record<string, Record<string, { p50: number; p95: number; p99: number }>>;
  rateLimitViolations?: Record<string, number>;
  validationFailures?: Record<string, Record<string, number>>;
  authFailures?: Record<string, Record<string, number>>;
  intentSizes?: Record<string, {
    avgRequestSize: number;
    avgResponseSize: number;
    totalRequests: number;
    totalResponses: number;
  }>;
}

export interface GatewayStateEvent {
  version: string;
  uptime: number;
  uptimeFormatted: string;
  extensionsLoaded: number;
  pipeline: {
    totalRequests: number;
    totalRateLimitViolations: number;
    totalValidationFailures: number;
    totalAuthFailures: number;
  };
  telemetry: {
    spansCollected: number;
    maxSpans: number;
    wsConnections: number;
  };
}

export interface InvocationEvent {
  extensionId: string;
  status: 'success' | 'failure';
  duration: number;
  timestamp: number;
  cpu?: number;
  memory?: number;
  io?: number;
  network?: number;
  storage?: number;
  error?: boolean;
}

export interface CostEvent {
  extensionId: string;
  totalCost: number;
  resourceCosts: {
    cpu: number;
    memory: number;
    io: number;
    network: number;
    storage: number;
  };
  invocations: number;
  timestamp: number;
}

export interface RegressionEvent {
  alertId: string;
  timestamp: number;
  timestampISO: string;
  extensionId: string;
  version: string;
  baselineVersion: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  regressions: Array<{
    metric: string;
    baseline: number;
    current: number;
    threshold: number;
    exceeded: number;
  }>;
}

export type TelemetryEvent =
  | { type: 'span'; data: SpanEvent | SpanEvent[]; batch?: boolean; count?: number }
  | { type: 'log'; data: LogEvent }
  | { type: 'metric_update'; data: MetricUpdateEvent }
  | { type: 'gateway_state'; data: GatewayStateEvent }
  | { type: 'invocation-completed'; data: InvocationEvent }
  | { type: 'cost-recorded'; data: CostEvent }
  | { type: 'regression-detected'; data: RegressionEvent }
  | { type: 'connected'; timestamp: number; message: string }
  | { type: 'subscribed'; extensionId: string; timestamp: number }
  | { type: 'pong'; timestamp: number };

export type TelemetryEventHandler = (event: TelemetryEvent) => void;

export interface TelemetryWebSocketOptions {
  port?: number;
  autoReconnect?: boolean;
  maxReconnectDelay?: number;
  eventsPerSecond?: number;
  onEvent?: TelemetryEventHandler;
  cacheSize?: number;
}

interface CachedData {
  spans: SpanEvent[];
  logs: LogEvent[];
  metrics: MetricUpdateEvent | null;
  gatewayState: GatewayStateEvent | null;
  invocations: InvocationEvent[];
  costs: CostEvent[];
  regressions: RegressionEvent[];
}

export interface TelemetryWebSocketHook {
  connectionState: ConnectionState;
  subscribe: (events: string[]) => void;
  unsubscribe: (events: string[]) => void;
  clearSubscriptions: () => void;
  getCachedData: () => CachedData;
  eventCount: number;
  droppedEvents: number;
}

const DEFAULT_PORT = 9877;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 10000;
const DEFAULT_EVENTS_PER_SECOND = 60;
const DEFAULT_CACHE_SIZE = 1000;

export function useTelemetryWebSocket(
  options: TelemetryWebSocketOptions = {}
): TelemetryWebSocketHook {
  const {
    port = DEFAULT_PORT,
    autoReconnect = true,
    maxReconnectDelay = MAX_RECONNECT_DELAY,
    eventsPerSecond = DEFAULT_EVENTS_PER_SECOND,
    onEvent,
    cacheSize = DEFAULT_CACHE_SIZE,
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [eventCount, setEventCount] = useState(0);
  const [droppedEvents, setDroppedEvents] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const eventQueueRef = useRef<TelemetryEvent[]>([]);
  const processingRef = useRef(false);
  const lastProcessTimeRef = useRef(Date.now());
  const eventBudgetRef = useRef(eventsPerSecond);
  const cacheRef = useRef<CachedData>({
    spans: [],
    logs: [],
    metrics: null,
    gatewayState: null,
    invocations: [],
    costs: [],
    regressions: [],
  });

  const updateCache = useCallback((event: TelemetryEvent) => {
    const cache = cacheRef.current;

    switch (event.type) {
      case 'span':
        if (Array.isArray(event.data)) {
          cache.spans.push(...event.data);
        } else {
          cache.spans.push(event.data);
        }
        if (cache.spans.length > cacheSize) {
          cache.spans.splice(0, cache.spans.length - cacheSize);
        }
        break;

      case 'log':
        cache.logs.push(event.data);
        if (cache.logs.length > cacheSize) {
          cache.logs.splice(0, cache.logs.length - cacheSize);
        }
        break;

      case 'metric_update':
        cache.metrics = event.data;
        break;

      case 'gateway_state':
        cache.gatewayState = event.data;
        break;

      case 'invocation-completed':
        cache.invocations.push(event.data);
        if (cache.invocations.length > cacheSize) {
          cache.invocations.splice(0, cache.invocations.length - cacheSize);
        }
        break;

      case 'cost-recorded':
        cache.costs.push(event.data);
        if (cache.costs.length > cacheSize) {
          cache.costs.splice(0, cache.costs.length - cacheSize);
        }
        break;

      case 'regression-detected':
        cache.regressions.push(event.data);
        if (cache.regressions.length > 100) {
          cache.regressions.splice(0, cache.regressions.length - 100);
        }
        break;
    }
  }, [cacheSize]);

  const processEventQueue = useCallback(() => {
    if (processingRef.current || eventQueueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;
    const now = Date.now();
    const timeSinceLastProcess = now - lastProcessTimeRef.current;
    
    eventBudgetRef.current = Math.min(
      eventsPerSecond,
      eventBudgetRef.current + (timeSinceLastProcess / 1000) * eventsPerSecond
    );
    lastProcessTimeRef.current = now;

    const eventsToProcess = Math.min(
      Math.floor(eventBudgetRef.current),
      eventQueueRef.current.length
    );

    for (let i = 0; i < eventsToProcess; i++) {
      const event = eventQueueRef.current.shift();
      if (event) {
        try {
          updateCache(event);
          onEvent?.(event);
          setEventCount(prev => prev + 1);
          eventBudgetRef.current -= 1;
        } catch (error) {
          console.error('[TelemetryWebSocket] Error processing event:', error);
        }
      }
    }

    if (eventQueueRef.current.length > eventsPerSecond * 2) {
      const dropped = eventQueueRef.current.length - eventsPerSecond;
      eventQueueRef.current.splice(0, dropped);
      setDroppedEvents(prev => prev + dropped);
    }

    processingRef.current = false;
  }, [eventsPerSecond, onEvent, updateCache]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    setConnectionState('connecting');

    try {
      const ws = new WebSocket(`ws://localhost:${port}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[TelemetryWebSocket] Connected to port', port);
        setConnectionState('connected');
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

        if (subscriptionsRef.current.size > 0) {
          if (port === 9877) {
            for (const extensionId of subscriptionsRef.current) {
              ws.send(JSON.stringify({
                type: 'subscribe',
                extensionId,
              }));
            }
          } else {
            const message = JSON.stringify({
              type: 'subscribe',
              events: Array.from(subscriptionsRef.current),
            });
            ws.send(message);
          }
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type) {
            const telemetryEvent = message as TelemetryEvent;
            eventQueueRef.current.push(telemetryEvent);
          }
        } catch (error) {
          console.error('[TelemetryWebSocket] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[TelemetryWebSocket] WebSocket error:', error);
        setConnectionState('error');
      };

      ws.onclose = () => {
        console.log('[TelemetryWebSocket] Disconnected');
        setConnectionState('disconnected');
        wsRef.current = null;

        if (autoReconnect && reconnectTimeoutRef.current === null) {
          const delay = Math.min(reconnectDelayRef.current, maxReconnectDelay);
          console.log(`[TelemetryWebSocket] Reconnecting in ${delay}ms...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, delay);

          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            maxReconnectDelay
          );
        }
      };
    } catch (error) {
      console.error('[TelemetryWebSocket] Failed to create WebSocket:', error);
      setConnectionState('error');
      
      if (autoReconnect && reconnectTimeoutRef.current === null) {
        const delay = Math.min(reconnectDelayRef.current, maxReconnectDelay);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, delay);
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 2,
          maxReconnectDelay
        );
      }
    }
  }, [port, autoReconnect, maxReconnectDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionState('disconnected');
  }, []);

  const subscribe = useCallback((events: string[]) => {
    for (const event of events) {
      subscriptionsRef.current.add(event);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (port === 9877) {
        for (const extensionId of events) {
          const message = JSON.stringify({
            type: 'subscribe',
            extensionId,
          });
          wsRef.current.send(message);
        }
      } else {
        const message = JSON.stringify({
          type: 'subscribe',
          events,
        });
        wsRef.current.send(message);
      }
    }
  }, [port]);

  const unsubscribe = useCallback((events: string[]) => {
    for (const event of events) {
      subscriptionsRef.current.delete(event);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (port === 9877) {
        for (const extensionId of events) {
          const message = JSON.stringify({
            type: 'unsubscribe',
            extensionId,
          });
          wsRef.current.send(message);
        }
      } else {
        const message = JSON.stringify({
          type: 'unsubscribe',
          events,
        });
        wsRef.current.send(message);
      }
    }
  }, [port]);

  const clearSubscriptions = useCallback(() => {
    subscriptionsRef.current.clear();
  }, []);

  const getCachedData = useCallback((): CachedData => {
    return {
      spans: [...cacheRef.current.spans],
      logs: [...cacheRef.current.logs],
      metrics: cacheRef.current.metrics ? { ...cacheRef.current.metrics } : null,
      gatewayState: cacheRef.current.gatewayState ? { ...cacheRef.current.gatewayState } : null,
      invocations: [...cacheRef.current.invocations],
      costs: [...cacheRef.current.costs],
      regressions: [...cacheRef.current.regressions],
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      processEventQueue();
    }, 1000 / eventsPerSecond);

    return () => {
      clearInterval(intervalId);
    };
  }, [processEventQueue, eventsPerSecond]);

  return {
    connectionState,
    subscribe,
    unsubscribe,
    clearSubscriptions,
    getCachedData,
    eventCount,
    droppedEvents,
  };
}
