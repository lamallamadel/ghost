import { useState, useEffect, useCallback } from 'react'
import { X, ChevronRight, ChevronLeft, CheckCircle2, GitBranch, Shield, Database, Eye, Sparkles, Download, Info } from 'lucide-react'
import { useSessionStore } from '@/stores/useSessionStore'

type WalkthroughStep = {
  id: number
  title: string
  description: string
  icon: typeof GitBranch
  tips: string[]
  pipelineInfo?: string
  showRecommendations?: boolean
}

const steps: WalkthroughStep[] = [
  {
    id: 1,
    title: 'Connect Your Repository',
    description: 'Ghost starts by connecting to your local Git repository. This establishes the security boundary for all operations.',
    icon: GitBranch,
    tips: [
      'Ghost validates that your directory is a valid Git repository',
      'The Gateway layer checks repository health and branch status',
      'All subsequent operations are scoped to this repository'
    ],
    pipelineInfo: 'Gateway Layer: Validates repository state and initializes security context',
    showRecommendations: true
  },
  {
    id: 2,
    title: 'Run Security Scan',
    description: 'Ghost scans your repository for security issues and validates extension manifests before allowing any operations.',
    icon: Shield,
    tips: [
      'The Runtime layer loads and validates extension manifests',
      'Manifest enforcement ensures extensions declare required permissions',
      'Permissions are checked against declared capabilities (file:read, git:exec, network:call)'
    ],
    pipelineInfo: 'Runtime Layer: Manifest validation → Permission checking → Capability enforcement'
  },
  {
    id: 3,
    title: 'Generate Commit',
    description: 'Ghost uses AI to analyze your changes and generate meaningful commits with full audit trails.',
    icon: Database,
    tips: [
      'The Pipeline layer intercepts all Git operations',
      'Each operation passes through: Gateway → Auth → Audit → Execute',
      'Extensions can only perform declared operations',
      'All file and network access is logged'
    ],
    pipelineInfo: 'Pipeline Layers: Gateway (validation) → Auth (permission check) → Audit (logging) → Execute'
  },
  {
    id: 4,
    title: 'View Audit Logs',
    description: 'Every operation Ghost performs is logged. Review the audit trail to see exactly what happened and when.',
    icon: Eye,
    tips: [
      'Audit logs capture all extension I/O requests',
      'Track file reads, network calls, and Git executions',
      'Logs include timestamps, permissions used, and results',
      'Use the Logs tab in the console to inspect activity'
    ],
    pipelineInfo: 'Audit Layer: Records every operation with full context for security and debugging'
  }
]

type OnboardingWalkthroughProps = {
  onClose: () => void
  repoPath?: string
}

type Recommendation = {
  extensionId: string
  reason: string
  category: string
  confidence: number
  score: number
}

export function OnboardingWalkthrough({ onClose, repoPath }: OnboardingWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [installedExtensions, setInstalledExtensions] = useState<Set<string>>(new Set())
  const setOnboardingComplete = useSessionStore((s) => s.setOnboardingComplete)

  const step = steps[currentStep]
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1
  const Icon = step.icon

  const loadRecommendations = useCallback(async () => {
    if (!repoPath) return

    setLoadingRecommendations(true)
    try {
      const result = await window.electron.invoke('recommendations.analyzeRepo', { repoPath })
      if (result.recommendations && result.recommendations.length > 0) {
        setRecommendations(result.recommendations)
      }
    } catch (error) {
      console.error('Failed to load recommendations:', error)
    } finally {
      setLoadingRecommendations(false)
    }
  }, [repoPath])

  useEffect(() => {
    if (step.showRecommendations && repoPath && recommendations.length === 0) {
      loadRecommendations()
    }
  }, [step.showRecommendations, repoPath, recommendations.length, loadRecommendations])

  const handleInstallExtension = async (extensionId: string) => {
    try {
      await window.electron.invoke('recommendations.recordFeedback', {
        extensionId,
        feedback: { installed: true, timestamp: Date.now() }
      })
      setInstalledExtensions(prev => new Set(prev).add(extensionId))
    } catch (error) {
      console.error('Failed to record installation:', error)
    }
  }

  const handleDismissExtension = async (extensionId: string) => {
    try {
      await window.electron.invoke('recommendations.recordFeedback', {
        extensionId,
        feedback: { dismissed: true, timestamp: Date.now() }
      })
      setRecommendations(prev => prev.filter(rec => rec.extensionId !== extensionId))
    } catch (error) {
      console.error('Failed to record dismissal:', error)
    }
  }

  const handleNext = () => {
    if (isLastStep) {
      setOnboardingComplete(true)
      onClose()
    } else {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    setOnboardingComplete(true)
    onClose()
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'code-quality': 'text-blue-400 border-blue-500/30 bg-blue-500/10',
      'testing': 'text-green-400 border-green-500/30 bg-green-500/10',
      'documentation': 'text-purple-400 border-purple-500/30 bg-purple-500/10',
      'automation': 'text-orange-400 border-orange-500/30 bg-orange-500/10',
      'collaboration': 'text-pink-400 border-pink-500/30 bg-pink-500/10',
      'workflow': 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
      'productivity': 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
    }
    return colors[category] || 'text-gray-400 border-gray-500/30 bg-gray-500/10'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-3xl rounded-2xl border border-white/20 bg-gradient-to-br from-black/90 to-black/70 p-8 shadow-2xl">
        <button
          type="button"
          onClick={handleSkip}
          className="absolute right-4 top-4 rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Close walkthrough"
        >
          <X size={20} />
        </button>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {steps.map((s, idx) => (
              <div
                key={s.id}
                className={`h-2 rounded-full transition-all ${
                  idx === currentStep
                    ? 'w-8 bg-[rgb(var(--gc-accent))]'
                    : idx < currentStep
                      ? 'w-2 bg-emerald-400'
                      : 'w-2 bg-white/20'
                }`}
              />
            ))}
          </div>
          <div className="text-sm text-white/60">
            Step {currentStep + 1} of {steps.length}
          </div>
        </div>

        <div className="mb-8 flex items-start gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[rgb(var(--gc-accent))]/30 bg-[rgb(var(--gc-accent))]/10">
            <Icon size={32} className="text-[rgb(var(--gc-accent))]" />
          </div>
          <div className="flex-1">
            <h2 className="mb-3 text-2xl font-bold text-white">{step.title}</h2>
            <p className="text-base leading-relaxed text-white/80">{step.description}</p>
          </div>
        </div>

        {step.pipelineInfo && (
          <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-300">
              <Shield size={16} />
              <span>Under the Hood</span>
            </div>
            <p className="text-sm leading-relaxed text-blue-200/90">{step.pipelineInfo}</p>
          </div>
        )}

        <div className="mb-8 space-y-3">
          <div className="text-sm font-semibold text-white/90">Key Points:</div>
          {step.tips.map((tip, idx) => (
            <div key={idx} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />
              <p className="text-sm leading-relaxed text-white/80">{tip}</p>
            </div>
          ))}
        </div>

        {step.showRecommendations && repoPath && (
          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
              <Sparkles size={16} className="text-yellow-400" />
              <span>Smart Suggestions for Your Repository</span>
            </div>
            
            {loadingRecommendations ? (
              <div className="flex items-center justify-center py-6 text-white/60">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-white/20 border-t-white/60"></div>
                <span className="ml-3">Analyzing repository...</span>
              </div>
            ) : recommendations.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {recommendations.map((rec) => (
                  <div
                    key={rec.extensionId}
                    className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white text-sm">{rec.extensionId}</span>
                        <span className={`text-xs px-2 py-0.5 rounded border ${getCategoryColor(rec.category)}`}>
                          {rec.category}
                        </span>
                      </div>
                      <p className="text-xs text-white/70 mb-2">{rec.reason}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-xs text-white/50">
                          <Info size={12} />
                          <span>Confidence: {Math.round(rec.confidence * 100)}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {installedExtensions.has(rec.extensionId) ? (
                        <span className="text-xs text-emerald-400 font-medium px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/30">
                          ✓ Noted
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleInstallExtension(rec.extensionId)}
                            className="flex items-center gap-1 text-xs px-3 py-1 rounded bg-[rgb(var(--gc-accent))]/20 border border-[rgb(var(--gc-accent))]/40 text-[rgb(var(--gc-accent))] hover:bg-[rgb(var(--gc-accent))]/30"
                          >
                            <Download size={12} />
                            <span>Install</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDismissExtension(rec.extensionId)}
                            className="text-xs px-3 py-1 rounded bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-6 text-white/50 text-sm">
                No recommendations available for this repository
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-white/60 hover:text-white"
          >
            Skip walkthrough
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={isFirstStep}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 rounded-lg bg-[rgb(var(--gc-accent))] px-6 py-2 text-sm font-semibold text-black hover:opacity-90"
            >
              {isLastStep ? 'Get Started' : 'Next'}
              {!isLastStep && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
