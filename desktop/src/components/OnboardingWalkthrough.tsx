import { useState } from 'react'
import { X, ChevronRight, ChevronLeft, CheckCircle2, GitBranch, Shield, Database, Eye } from 'lucide-react'
import { useSessionStore } from '@/stores/useSessionStore'

type WalkthroughStep = {
  id: number
  title: string
  description: string
  icon: typeof GitBranch
  tips: string[]
  pipelineInfo?: string
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
    pipelineInfo: 'Gateway Layer: Validates repository state and initializes security context'
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
}

export function OnboardingWalkthrough({ onClose }: OnboardingWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const setOnboardingComplete = useSessionStore((s) => s.setOnboardingComplete)

  const step = steps[currentStep]
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1
  const Icon = step.icon

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
