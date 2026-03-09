import { useState, useEffect } from 'react';
import { ArrowRight, CheckCircle, XCircle, Clock, Filter } from 'lucide-react';

interface RPCMessage {
  id: string;
  direction: 'request' | 'response';
  timestamp: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
  duration?: number;
  extensionId: string;
  stage?: 'intercept' | 'auth' | 'audit' | 'execute';
  stageStatus?: 'success' | 'failure';
}

export function RPCInspector() {
  const [messages, setMessages] = useState<RPCMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<RPCMessage | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    const eventSource = new EventSource('http://localhost:9876/api/rpc/stream');

    eventSource.onmessage = (event) => {
      const message: RPCMessage = JSON.parse(event.data);
      setMessages((prev) => [...prev.slice(-99), message]);
      if (autoScroll) {
        setSelectedMessage(message);
      }
    };

    eventSource.onerror = () => {
      console.error('RPC stream connection error');
    };

    return () => {
      eventSource.close();
    };
  }, [autoScroll]);

  const filteredMessages = messages.filter(
    (msg) =>
      !filter ||
      msg.method?.toLowerCase().includes(filter.toLowerCase()) ||
      msg.extensionId.toLowerCase().includes(filter.toLowerCase())
  );

  const syntaxHighlight = (json: unknown) => {
    const str = JSON.stringify(json, null, 2);
    return str
      .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (match) => {
        let cls = 'text-amber-400';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'text-blue-400';
          } else {
            cls = 'text-green-400';
          }
        } else if (/true|false/.test(match)) {
          cls = 'text-purple-400';
        } else if (/null/.test(match)) {
          cls = 'text-gray-500';
        }
        return `<span class="${cls}">${match}</span>`;
      });
  };

  return (
    <div className="flex h-full gap-4">
      <div className="w-1/2 flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Message Log</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Filter className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8 pr-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-xs w-40"
              />
            </div>
            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />
              Auto
            </label>
            <button
              onClick={() => setMessages([])}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {filteredMessages.map((msg) => (
            <button
              key={msg.id}
              onClick={() => setSelectedMessage(msg)}
              className={`w-full text-left p-2 rounded border transition-colors ${
                selectedMessage?.id === msg.id
                  ? 'bg-cyan-900/30 border-cyan-600'
                  : 'bg-gray-900 border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {msg.direction === 'request' ? (
                    <ArrowRight className="w-3 h-3 text-cyan-400" />
                  ) : msg.error ? (
                    <XCircle className="w-3 h-3 text-red-400" />
                  ) : (
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  )}
                  <span className="text-xs font-mono text-white">{msg.method || 'response'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {msg.duration !== undefined && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {msg.duration}ms
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{msg.extensionId}</span>
                <span className="text-gray-500">{new Date(msg.timestamp).toLocaleTimeString()}</span>
              </div>
            </button>
          ))}
          {filteredMessages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              {filter ? 'No messages match filter' : 'No messages yet'}
            </div>
          )}
        </div>
      </div>

      <div className="w-1/2 flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-white">Message Details</h3>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {selectedMessage ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-gray-400 mb-2">Metadata</h4>
                <div className="bg-gray-900 rounded p-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">ID:</span>
                    <span className="text-white font-mono">{selectedMessage.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Extension:</span>
                    <span className="text-white font-mono">{selectedMessage.extensionId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Direction:</span>
                    <span className="text-white">{selectedMessage.direction}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Timestamp:</span>
                    <span className="text-white">{new Date(selectedMessage.timestamp).toLocaleString()}</span>
                  </div>
                  {selectedMessage.duration !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Duration:</span>
                      <span className="text-white">{selectedMessage.duration}ms</span>
                    </div>
                  )}
                  {selectedMessage.stage && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Pipeline Stage:</span>
                      <span className={`font-semibold ${
                        selectedMessage.stageStatus === 'success' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {selectedMessage.stage}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedMessage.method && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 mb-2">Method</h4>
                  <div className="bg-gray-900 rounded p-3">
                    <code className="text-sm text-cyan-400 font-mono">{selectedMessage.method}</code>
                  </div>
                </div>
              )}

              {selectedMessage.params && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 mb-2">Parameters</h4>
                  <div className="bg-gray-900 rounded p-3 overflow-auto max-h-64">
                    <pre
                      className="text-xs font-mono"
                      dangerouslySetInnerHTML={{ __html: syntaxHighlight(selectedMessage.params) }}
                    />
                  </div>
                </div>
              )}

              {selectedMessage.result && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 mb-2">Result</h4>
                  <div className="bg-gray-900 rounded p-3 overflow-auto max-h-64">
                    <pre
                      className="text-xs font-mono"
                      dangerouslySetInnerHTML={{ __html: syntaxHighlight(selectedMessage.result) }}
                    />
                  </div>
                </div>
              )}

              {selectedMessage.error && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 mb-2">Error</h4>
                  <div className="bg-red-900/20 rounded p-3 border border-red-800">
                    <pre
                      className="text-xs font-mono"
                      dangerouslySetInnerHTML={{ __html: syntaxHighlight(selectedMessage.error) }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Select a message to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
