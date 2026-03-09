import { Lightbulb, Star, TrendingUp, Shield, Wrench, FileText, Users } from 'lucide-react';

interface Recommendation {
  extensionId: string;
  reason: string;
  category: string;
  confidence: number;
  score: number;
}

interface RecommendationEnginePanelProps {
  recommendations: Recommendation[];
}

export function RecommendationEnginePanel({ recommendations }: RecommendationEnginePanelProps) {
  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'code-quality':
      case 'quality':
        return Shield;
      case 'testing':
        return TrendingUp;
      case 'documentation':
        return FileText;
      case 'collaboration':
        return Users;
      case 'productivity':
      case 'workflow':
        return Wrench;
      default:
        return Lightbulb;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'code-quality':
      case 'quality':
        return 'text-green-400 bg-green-900/20 border-green-600';
      case 'testing':
        return 'text-blue-400 bg-blue-900/20 border-blue-600';
      case 'documentation':
        return 'text-purple-400 bg-purple-900/20 border-purple-600';
      case 'collaboration':
        return 'text-yellow-400 bg-yellow-900/20 border-yellow-600';
      case 'productivity':
      case 'workflow':
        return 'text-cyan-400 bg-cyan-900/20 border-cyan-600';
      default:
        return 'text-gray-400 bg-gray-900/20 border-gray-600';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-orange-400';
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-yellow-400" />
        Recommended Extensions
      </h4>

      <div className="grid grid-cols-2 gap-3">
        {recommendations.slice(0, 10).map((rec, idx) => {
          const Icon = getCategoryIcon(rec.category);
          const categoryColors = getCategoryColor(rec.category);
          const confidenceColor = getConfidenceColor(rec.confidence);

          return (
            <div
              key={idx}
              className="bg-gray-900 rounded-lg p-3 border border-gray-700 hover:border-cyan-600 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded ${categoryColors} border`}>
                  <Icon className="w-4 h-4" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm text-white truncate">
                      {rec.extensionId}
                    </span>
                    <div className="flex items-center gap-1">
                      <Star className={`w-3 h-3 ${confidenceColor}`} />
                      <span className={`text-xs ${confidenceColor}`}>
                        {(rec.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-xs text-gray-400 mb-2 line-clamp-2">
                    {rec.reason}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs px-2 py-1 bg-gray-800 border border-gray-600 text-gray-300 rounded">
                      {rec.category}
                    </span>
                    <span className="text-xs text-gray-500">
                      Score: {rec.score.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {recommendations.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No recommendations available</p>
          <p className="text-xs mt-1">Recommendations will appear based on your usage patterns</p>
        </div>
      )}
    </div>
  );
}
