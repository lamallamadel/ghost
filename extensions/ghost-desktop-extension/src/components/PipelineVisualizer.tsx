import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, Filter } from 'lucide-react';

interface PipelineStage {
  stage: 'intercept' | 'auth' | 'audit' | 'execute';
  status: 'pending' | 'success' | 'failure' | 'warning';
  duration?: number;
  timestamp: number;
  message?: string;
  details?: Record<string, unknown>;
}

interface PipelineRequest {
  id: string;
  extensionId: string;
  method: string;
  timestamp: number;
  stages: PipelineStage[];
  overallStatus: 'pending' | 'success' | 'failure';
  totalDuration?: number;
}

export function PipelineVisualizer() {
  const [requests, setRequests] = useState<PipelineRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PipelineRequest | null>(null);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    const eventSource = new EventSource('http://localhost:9876/api/pipeline/stream');

    eventSource.onmessage = (event) => {
      const request: PipelineRequest = JSON.parse(event.data);
      setRequests((prev) => {
        const existing = prev.findIndex((r) => r.id === request.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = request;
          return updated;
        }
        return [...prev.slice(-49), request];
      });
    };

    eventSource.onerror = () => {
      console.error('Pipeline stream connection error');
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failure':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-400 animate-pulse" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStageColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-600/20 border-green-600';
      case 'failure':
        return 'bg-red-600/20 border-red-600';
      case 'warning':
        return 'bg-yellow-600/20 border-yellow-600';
      case 'pending':
        return 'bg-gray-600/20 border-gray-600';
      default:
        return 'bg-gray-700/20 border-gray-700';
    }
  };

  const filteredRequests = requests.filter(
    (req) =>
      !filter ||
      req.method.toLowerCase().includes(filter.toLowerCase()) ||
      req.extensionId.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex h-full gap-4">
      <div className="w-1/3 flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Pipeline Requests</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Filter className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8 pr-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-xs w-32"
              />
            </div>
            <button
              onClick={() => setRequests([])}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {filteredRequests.map((req) => (
            <button
              key={req.id}
              onClick={() => setSelectedRequest(req)}
              className={`w-full text-left p-2 rounded border transition-colors ${
                selectedRequest?.id === req.id
                  ? 'bg-cyan-900/30 border-cyan-600'
                  : 'bg-gray-900 border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-white truncate flex-1">{req.method}</span>
                <div className="ml-2">
                  {req.overallStatus === 'success' ? (
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  ) : req.overallStatus === 'failure' ? (
                    <XCircle className="w-3 h-3 text-red-400" />
                  ) : (
                    <Clock className="w-3 h-3 text-gray-400 animate-pulse" />
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 truncate">{req.extensionId}</span>
                {req.totalDuration !== undefined && (
                  <span className="text-gray-500 ml-2">{req.totalDuration}ms</span>
                )}
              </div>
            </button>
          ))}
          {filteredRequests.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              {filter ? 'No requests match filter' : 'No requests yet'}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-white">Pipeline Flow</h3>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {selectedRequest ? (
            <div className="space-y-6">
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <h4 className="text-sm font-semibold text-white mb-3">Request Info</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">ID:</span>
                    <span className="text-white font-mono">{selectedRequest.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Extension:</span>
                    <span className="text-white font-mono">{selectedRequest.extensionId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Method:</span>
                    <span className="text-white font-mono">{selectedRequest.method}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Time:</span>
                    <span className="text-white">{new Date(selectedRequest.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {selectedRequest.totalDuration !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Duration:</span>
                      <span className="text-white">{selectedRequest.totalDuration}ms</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="relative">
                {selectedRequest.stages.map((stage, idx) => (
                  <div key={idx} className="relative">
                    <div className={`rounded-lg p-4 border-2 ${getStageColor(stage.status)}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStageIcon(stage.status)}
                          <span className="text-sm font-semibold text-white uppercase">{stage.stage}</span>
                        </div>
                        {stage.duration !== undefined && (
                          <span className="text-xs text-gray-400">{stage.duration}ms</span>
                        )}
                      </div>
                      {stage.message && (
                        <p className="text-xs text-gray-300 mb-2">{stage.message}</p>
                      )}
                      {stage.details && (
                        <div className="mt-2 p-2 bg-gray-900/50 rounded">
                          <pre className="text-xs text-gray-400 overflow-auto">
                            {JSON.stringify(stage.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                    {idx < selectedRequest.stages.length - 1 && (
                      <div className="flex justify-center my-2">
                        <div className="w-0.5 h-4 bg-gray-600"></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className={`rounded-lg p-4 border-2 ${
                selectedRequest.overallStatus === 'success'
                  ? 'bg-green-600/20 border-green-600'
                  : selectedRequest.overallStatus === 'failure'
                  ? 'bg-red-600/20 border-red-600'
                  : 'bg-gray-600/20 border-gray-600'
              }`}>
                <div className="flex items-center gap-2">
                  {selectedRequest.overallStatus === 'success' ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-400" />
                      <span className="text-sm font-semibold text-white">Request Completed</span>
                    </>
                  ) : selectedRequest.overallStatus === 'failure' ? (
                    <>
                      <XCircle className="w-5 h-5 text-red-400" />
                      <span className="text-sm font-semibold text-white">Request Failed</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-5 h-5 text-gray-400 animate-pulse" />
                      <span className="text-sm font-semibold text-white">Request In Progress</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Select a request to view pipeline flow
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
