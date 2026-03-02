import { useState, useEffect, useRef } from 'react';
import { Activity, Trash2, Filter, Download, ArrowRight, Clock, CheckCircle2, XCircle, Network } from 'lucide-react';

interface RPCMessage {
  id: string;
  timestamp: number;
  direction: 'request' | 'response';
  extensionId: string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  duration?: number;
  requestId?: number | string;
}

export function RPCInspector() {
  const [messages, setMessages] = useState<RPCMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<RPCMessage | null>(null);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let unsubscribe: (() => void) | null = null;

    const connectWebSocket = async () => {
      try {
        ws = new WebSocket('ws://localhost:9876/ws/rpc-inspector');
        wsRef.current = ws;

        ws.onmessage = (event) => {
          if (isPaused) return;
          
          const message = JSON.parse(event.data);
          setMessages(prev => [...prev, {
            ...message,
            id: `${message.timestamp}-${Math.random()}`
          }]);
        };

        ws.onerror = async () => {
          const { mockPlaygroundServer } = await import('@/utils/mockPlaygroundServer');
          unsubscribe = mockPlaygroundServer.subscribe('rpc-message', (message: unknown) => {
            if (isPaused) return;
            setMessages(prev => [...prev, {
              ...(message as RPCMessage),
              id: `${Date.now()}-${Math.random()}`
            }]);
          });
        };
      } catch {
        const { mockPlaygroundServer } = await import('@/utils/mockPlaygroundServer');
        unsubscribe = mockPlaygroundServer.subscribe('rpc-message', (message: unknown) => {
          if (isPaused) return;
          setMessages(prev => [...prev, {
            ...(message as RPCMessage),
            id: `${Date.now()}-${Math.random()}`
          }]);
        });
      }
    };

    connectWebSocket();

    return () => {
      ws?.close();
      unsubscribe?.();
    };
  }, [isPaused]);

  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  const clearMessages = () => {
    setMessages([]);
    setSelectedMessage(null);
  };

  const exportMessages = () => {
    const data = JSON.stringify(messages, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rpc-inspector-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredMessages = messages.filter(msg => {
    if (!filter) return true;
    const searchStr = filter.toLowerCase();
    return (
      msg.extensionId?.toLowerCase().includes(searchStr) ||
      msg.method?.toLowerCase().includes(searchStr) ||
      JSON.stringify(msg.params).toLowerCase().includes(searchStr)
    );
  });

  const getMessagePair = (msg: RPCMessage) => {
    if (msg.direction === 'request') {
      const response = messages.find(m => 
        m.direction === 'response' && 
        m.requestId === msg.requestId &&
        m.timestamp > msg.timestamp
      );
      return { request: msg, response };
    } else {
      const request = messages.find(m => 
        m.direction === 'request' && 
        m.requestId === msg.requestId &&
        m.timestamp < msg.timestamp
      );
      return { request, response: msg };
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col border-r border-white/10">
        <div className="bg-white/5 border-b border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-semibold text-white">Live RPC Traffic</h2>
              <span className="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded-full">
                {messages.length} messages
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isPaused
                    ? 'bg-yellow-600/20 text-yellow-400'
                    : 'bg-green-600/20 text-green-400'
                }`}
              >
                {isPaused ? 'Paused' : 'Recording'}
              </button>
              <button
                onClick={exportMessages}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                title="Export messages"
              >
                <Download className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={clearMessages}
                className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-lg transition-colors"
                title="Clear messages"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by extension, method, or params..."
                className="w-full pl-10 pr-3 py-2 bg-black/40 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />
              Auto-scroll
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-white/40">
              <div className="text-center">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No RPC messages yet</p>
                <p className="text-sm mt-1">Execute intents to see live traffic</p>
              </div>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const isSelected = selectedMessage?.id === msg.id;
              const isRequest = msg.direction === 'request';
              const hasError = msg.error !== undefined;

              return (
                <button
                  key={msg.id}
                  onClick={() => setSelectedMessage(msg)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-cyan-600/20 border-cyan-500/50'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isRequest ? (
                          <ArrowRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        ) : hasError ? (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                        )}
                        <span className="text-sm font-mono text-white/80 truncate">
                          {msg.method || (hasError ? 'Error' : 'Response')}
                        </span>
                      </div>
                      <div className="text-xs text-white/60 truncate">
                        {msg.extensionId}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="text-xs text-white/60 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                      {msg.duration && (
                        <span className="text-xs text-cyan-400">
                          {msg.duration}ms
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="w-1/2 bg-black/20 flex flex-col">
        {selectedMessage ? (
          <>
            <div className="bg-white/5 border-b border-white/10 p-4">
              <h3 className="text-lg font-semibold text-white mb-2">Message Details</h3>
              <div className="flex items-center gap-4 text-sm">
                <span className={`px-2 py-1 rounded ${
                  selectedMessage.direction === 'request'
                    ? 'bg-blue-600/20 text-blue-400'
                    : selectedMessage.error
                    ? 'bg-red-600/20 text-red-400'
                    : 'bg-green-600/20 text-green-400'
                }`}>
                  {selectedMessage.direction}
                </span>
                <span className="text-white/60">
                  {new Date(selectedMessage.timestamp).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedMessage.direction === 'request' && (() => {
                const pair = getMessagePair(selectedMessage);
                return pair.response ? (
                  <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowRight className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-semibold text-white">Request-Response Pair</span>
                    </div>
                    <div className="text-xs text-white/60">
                      Duration: {pair.response.duration}ms
                    </div>
                  </div>
                ) : null;
              })()}

              <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                <div className="text-sm font-semibold text-white mb-2">Extension ID</div>
                <div className="text-sm font-mono text-cyan-400">
                  {selectedMessage.extensionId}
                </div>
              </div>

              {selectedMessage.method && (
                <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                  <div className="text-sm font-semibold text-white mb-2">Method</div>
                  <div className="text-sm font-mono text-cyan-400">
                    {selectedMessage.method}
                  </div>
                </div>
              )}

              {selectedMessage.params && (
                <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                  <div className="text-sm font-semibold text-white mb-2">Parameters</div>
                  <pre className="text-xs text-green-400 font-mono overflow-auto max-h-64 p-3 bg-black/40 rounded">
                    {JSON.stringify(selectedMessage.params, null, 2)}
                  </pre>
                </div>
              )}

              {selectedMessage.result !== undefined && (
                <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                  <div className="text-sm font-semibold text-white mb-2">Result</div>
                  <pre className="text-xs text-green-400 font-mono overflow-auto max-h-64 p-3 bg-black/40 rounded">
                    {JSON.stringify(selectedMessage.result, null, 2)}
                  </pre>
                </div>
              )}

              {selectedMessage.error && (
                <div className="bg-red-900/20 rounded-lg border border-red-600/50 p-4">
                  <div className="text-sm font-semibold text-red-400 mb-2">Error</div>
                  <div className="space-y-2">
                    <div className="text-xs">
                      <span className="text-white/60">Code:</span>
                      <span className="ml-2 text-red-400 font-mono">
                        {selectedMessage.error.code}
                      </span>
                    </div>
                    <div className="text-xs">
                      <span className="text-white/60">Message:</span>
                      <div className="mt-1 text-red-300">
                        {selectedMessage.error.message}
                      </div>
                    </div>
                    {selectedMessage.error.data && (
                      <div className="text-xs">
                        <span className="text-white/60">Data:</span>
                        <pre className="mt-1 text-red-300 font-mono overflow-auto max-h-32 p-2 bg-black/40 rounded">
                          {JSON.stringify(selectedMessage.error.data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                <div className="text-sm font-semibold text-white mb-2">Raw JSON-RPC</div>
                <pre className="text-xs text-cyan-400 font-mono overflow-auto max-h-96 p-3 bg-black/40 rounded">
                  {JSON.stringify({
                    jsonrpc: '2.0',
                    ...(selectedMessage.method && { method: selectedMessage.method }),
                    ...(selectedMessage.params && { params: selectedMessage.params }),
                    ...(selectedMessage.result !== undefined && { result: selectedMessage.result }),
                    ...(selectedMessage.error && { error: selectedMessage.error }),
                    id: selectedMessage.requestId
                  }, null, 2)}
                </pre>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-white/40">
            <div className="text-center">
              <Network className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Select a message to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
