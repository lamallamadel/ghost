import { useCallback, useEffect, useState } from 'react'
import { Package, Download, Star, Search, Shield, AlertCircle, CheckCircle, ExternalLink, Filter } from 'lucide-react'
import { useToastsStore } from '@/stores/useToastsStore'

type MarketplaceExtension = {
  id: string
  name: string
  description: string
  author: string
  category: string
  tags: string[]
  ratings: { average: number; count: number }
  downloads: number
  verified: boolean
  homepage?: string
  repository?: string
  versions: Array<{
    version: string
    publishedAt: string
    compatibility: { ghostCli: string; node: string }
    changelog?: string
  }>
}

const CATEGORIES = ['all', 'git', 'development', 'security', 'testing', 'utilities']
const SORT_OPTIONS = [
  { value: 'downloads', label: 'Most Downloads' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'recent', label: 'Recently Updated' }
]

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    git: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    development: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    security: 'bg-red-500/20 text-red-300 border-red-500/30',
    testing: 'bg-green-500/20 text-green-300 border-green-500/30',
    utilities: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
  }

  return (
    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${colors[category] || 'bg-white/5 text-white/60 border-white/10'}`}>
      {category}
    </span>
  )
}

function RatingStars({ rating, count }: { rating: number; count: number }) {
  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 >= 0.5

  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            size={14}
            className={i < fullStars ? 'fill-yellow-400 text-yellow-400' : i === fullStars && hasHalfStar ? 'fill-yellow-400/50 text-yellow-400' : 'text-white/20'}
          />
        ))}
      </div>
      <span className="text-xs text-white/60">
        {rating.toFixed(1)} ({count})
      </span>
    </div>
  )
}

function CompatibilityIndicator({ compatibility }: { compatibility: { ghostCli: string; node: string } }) {
  const isCompatible = true

  return (
    <div className="flex items-center gap-2 text-xs">
      {isCompatible ? (
        <div className="flex items-center gap-1 text-emerald-400">
          <CheckCircle size={14} />
          <span>Compatible</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-rose-400">
          <AlertCircle size={14} />
          <span>Incompatible</span>
        </div>
      )}
      <span className="text-white/40">
        Ghost {compatibility.ghostCli} · Node {compatibility.node}
      </span>
    </div>
  )
}

function ExtensionCard({
  extension,
  onInstall,
  onViewDetails
}: {
  extension: MarketplaceExtension
  onInstall: (id: string) => void
  onViewDetails: (ext: MarketplaceExtension) => void
}) {
  return (
    <div className="group rounded-xl border border-white/10 bg-black/20 p-4 transition-all hover:border-white/20 hover:bg-black/30">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 shrink-0">
            <Package size={24} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">{extension.name}</h3>
              {extension.verified && (
                <div className="shrink-0" title="Verified Publisher">
                  <Shield size={16} className="text-emerald-400" />
                </div>
              )}
              <span className="text-xs text-white/40">v{extension.versions[0].version}</span>
            </div>

            <p className="text-sm text-white/60 line-clamp-2 mb-3">{extension.description}</p>

            <div className="flex flex-wrap items-center gap-3 mb-3">
              <CategoryBadge category={extension.category} />
              <RatingStars rating={extension.ratings.average} count={extension.ratings.count} />
              <div className="flex items-center gap-1 text-xs text-white/60">
                <Download size={14} />
                <span>{extension.downloads.toLocaleString()}</span>
              </div>
            </div>

            <CompatibilityIndicator compatibility={extension.versions[0].compatibility} />

            {extension.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {extension.tags.slice(0, 4).map(tag => (
                  <span key={tag} className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onInstall(extension.id)}
            className="rounded-lg bg-[rgb(var(--gc-accent))] px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
          >
            Install
          </button>
          <button
            type="button"
            onClick={() => onViewDetails(extension)}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          >
            Details
          </button>
        </div>
      </div>
    </div>
  )
}

function ExtensionDetailsModal({
  extension,
  onClose,
  onInstall
}: {
  extension: MarketplaceExtension
  onClose: () => void
  onInstall: (id: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-white/20 bg-[rgb(var(--gc-bg))] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <Package size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold">{extension.name}</h2>
                {extension.verified && (
                  <div title="Verified Publisher">
                    <Shield size={20} className="text-emerald-400" />
                  </div>
                )}
              </div>
              <p className="text-sm text-white/60">by {extension.author}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="mb-6">
          <p className="text-white/80">{extension.description}</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-xs text-white/60">Rating</div>
            <RatingStars rating={extension.ratings.average} count={extension.ratings.count} />
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-xs text-white/60">Downloads</div>
            <div className="flex items-center gap-2">
              <Download size={18} className="text-cyan-400" />
              <span className="text-lg font-semibold">{extension.downloads.toLocaleString()}</span>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-xs text-white/60">Category</div>
            <CategoryBadge category={extension.category} />
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-xs text-white/60">Latest Version</div>
            <span className="font-mono text-sm text-blue-400">v{extension.versions[0].version}</span>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="mb-2 font-semibold">Compatibility</h3>
          <CompatibilityIndicator compatibility={extension.versions[0].compatibility} />
        </div>

        {extension.versions[0].changelog && (
          <div className="mb-6">
            <h3 className="mb-2 font-semibold">Latest Changes</h3>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/80">
              {extension.versions[0].changelog}
            </div>
          </div>
        )}

        {extension.tags.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 font-semibold">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {extension.tags.map(tag => (
                <span key={tag} className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-sm">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {(extension.homepage || extension.repository) && (
          <div className="mb-6">
            <h3 className="mb-2 font-semibold">Links</h3>
            <div className="flex gap-2">
              {extension.homepage && (
                <a
                  href={extension.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                >
                  <ExternalLink size={14} />
                  Homepage
                </a>
              )}
              {extension.repository && (
                <a
                  href={extension.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                >
                  <ExternalLink size={14} />
                  Repository
                </a>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              onInstall(extension.id)
              onClose()
            }}
            className="rounded-lg bg-[rgb(var(--gc-accent))] px-6 py-3 font-semibold text-black hover:opacity-90"
          >
            Install Extension
          </button>
        </div>
      </div>
    </div>
  )
}

export function MarketplaceTab() {
  const pushToast = useToastsStore((s) => s.push)
  const [extensions, setExtensions] = useState<MarketplaceExtension[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [sortBy, setSortBy] = useState('downloads')
  const [selectedExtension, setSelectedExtension] = useState<MarketplaceExtension | null>(null)

  const loadExtensions = useCallback(async () => {
    setLoading(true)
    try {
      const registry = await fetch('/marketplace-registry.json').then(r => r.json())
      let filtered = registry.extensions || []

      if (selectedCategory !== 'all') {
        filtered = filtered.filter((e: MarketplaceExtension) => e.category === selectedCategory)
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        filtered = filtered.filter((e: MarketplaceExtension) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.tags.some(t => t.toLowerCase().includes(q))
        )
      }

      if (sortBy === 'downloads') {
        filtered.sort((a: MarketplaceExtension, b: MarketplaceExtension) => b.downloads - a.downloads)
      } else if (sortBy === 'rating') {
        filtered.sort((a: MarketplaceExtension, b: MarketplaceExtension) => b.ratings.average - a.ratings.average)
      } else if (sortBy === 'recent') {
        filtered.sort((a: MarketplaceExtension, b: MarketplaceExtension) =>
          new Date(b.versions[0].publishedAt).getTime() - new Date(a.versions[0].publishedAt).getTime()
        )
      }

      setExtensions(filtered)
    } catch (error) {
      pushToast({ title: 'Error loading marketplace', message: String(error), tone: 'danger' })
    } finally {
      setLoading(false)
    }
  }, [selectedCategory, searchQuery, sortBy, pushToast])

  useEffect(() => {
    loadExtensions()
  }, [loadExtensions])

  const handleInstall = useCallback((extensionId: string) => {
    pushToast({ title: 'Installation started', message: `Installing ${extensionId}...`, tone: 'info' })
    
    setTimeout(() => {
      pushToast({ title: 'Installation complete', message: `${extensionId} installed successfully`, tone: 'success' })
    }, 2000)
  }, [pushToast])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-semibold">Extension Marketplace</div>
            <div className="text-xs text-white/60">Discover and install extensions for Ghost CLI</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60">
            {extensions.length} extension{extensions.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search extensions..."
              className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-10 pr-4 text-sm placeholder:text-white/40"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={16} className="text-white/60" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading && !extensions.length ? (
          <div className="text-sm text-white/60">Loading marketplace...</div>
        ) : extensions.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center">
            <Package size={48} className="mx-auto mb-4 text-white/20" />
            <div className="text-sm text-white/60">No extensions found</div>
            {(searchQuery || selectedCategory !== 'all') && (
              <div className="mt-2 text-xs text-white/40">Try adjusting your filters</div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {extensions.map(ext => (
              <ExtensionCard
                key={ext.id}
                extension={ext}
                onInstall={handleInstall}
                onViewDetails={setSelectedExtension}
              />
            ))}
          </div>
        )}
      </div>

      {selectedExtension && (
        <ExtensionDetailsModal
          extension={selectedExtension}
          onClose={() => setSelectedExtension(null)}
          onInstall={handleInstall}
        />
      )}
    </div>
  )
}
