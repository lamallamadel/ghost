import { Command, Users, TrendingUp, Activity } from 'lucide-react';

interface BehaviorData {
  mostUsedCommands: Array<{
    command: string;
    count: number;
    byExtension: Record<string, number>;
  }>;
  mostUsedExtensions: Array<{
    extensionId: string;
    commandCount: number;
    commands: Array<{ command: string; count: number }>;
  }>;
  commonWorkflows: Array<{
    pattern: string;
    commands: string[];
    count: number;
    avgDuration: number;
  }>;
  session: {
    commandCount: number;
    uniqueCommands: number;
    uniqueExtensions: number;
    duration: number;
    durationFormatted: string;
  };
}

interface BehaviorAnalyticsPanelProps {
  behavior: BehaviorData;
}

export function BehaviorAnalyticsPanel({ behavior }: BehaviorAnalyticsPanelProps) {
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          Behavior Analytics
        </h4>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-900 rounded p-3">
            <div className="text-sm text-gray-400 mb-1">Total Commands</div>
            <div className="text-2xl font-bold text-white">{behavior.session.commandCount}</div>
          </div>
          <div className="bg-gray-900 rounded p-3">
            <div className="text-sm text-gray-400 mb-1">Unique Commands</div>
            <div className="text-2xl font-bold text-cyan-400">{behavior.session.uniqueCommands}</div>
          </div>
          <div className="bg-gray-900 rounded p-3">
            <div className="text-sm text-gray-400 mb-1">Unique Extensions</div>
            <div className="text-2xl font-bold text-purple-400">{behavior.session.uniqueExtensions}</div>
          </div>
          <div className="bg-gray-900 rounded p-3">
            <div className="text-sm text-gray-400 mb-1">Session Duration</div>
            <div className="text-2xl font-bold text-green-400">{behavior.session.durationFormatted}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Command className="w-4 h-4 text-blue-400" />
              Most Used Commands
            </h5>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {behavior.mostUsedCommands.slice(0, 10).map((cmd, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-gray-500 font-mono text-xs">{idx + 1}</span>
                    <span className="text-gray-300 font-mono truncate">{cmd.command}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-bold">{cmd.count}</span>
                    <div className="w-20 bg-gray-800 rounded-full h-2">
                      <div
                        className="bg-cyan-500 h-2 rounded-full"
                        style={{
                          width: `${(cmd.count / behavior.mostUsedCommands[0].count) * 100}%`
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              Most Used Extensions
            </h5>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {behavior.mostUsedExtensions.slice(0, 10).map((ext, idx) => (
                <div key={idx} className="text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-gray-500 font-mono text-xs">{idx + 1}</span>
                      <span className="text-gray-300 font-mono truncate">{ext.extensionId}</span>
                    </div>
                    <span className="text-purple-400 font-bold">{ext.commandCount}</span>
                  </div>
                  <div className="ml-6 text-xs text-gray-500">
                    {ext.commands.slice(0, 2).map(c => c.command).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {behavior.commonWorkflows && behavior.commonWorkflows.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h5 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            Common Workflow Sequences
          </h5>
          <div className="space-y-3">
            {behavior.commonWorkflows.slice(0, 5).map((workflow, idx) => (
              <div key={idx} className="bg-gray-900 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-green-900/30 border border-green-600 text-green-400 text-xs font-bold rounded">
                      {workflow.count}× used
                    </span>
                    <span className="text-xs text-gray-400">
                      Avg: {formatDuration(workflow.avgDuration)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto">
                  {workflow.commands.map((cmd, cmdIdx) => (
                    <div key={cmdIdx} className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-gray-800 border border-gray-600 text-gray-300 text-xs font-mono rounded whitespace-nowrap">
                        {cmd}
                      </span>
                      {cmdIdx < workflow.commands.length - 1 && (
                        <span className="text-gray-600">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
