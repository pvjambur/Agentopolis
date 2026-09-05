import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { PixelButton } from '@/components/ui/PixelButton'
import { Panel } from '@/components/ui/Panel'
import { useAgentConfig, useSaveVendorConfig } from '@/hooks/useAgentConfig'
import type { VendorConfig } from '@/services/agentConfigService'
import apiClient from '@/services/api'
import { type CharacterType } from '@/data/characterSpriteMap'
import { cn } from '@/lib/utils'

// ── Personality data ──────────────────────────────────────────────────────────

type PersonalityType = 'negotiator' | 'fixed_mrp' | 'loyalty' | 'premium'

interface PersonalityCard {
  type: PersonalityType
  label: string
  tagline: string
  description: string
  icon: string
  engineReady: boolean
}

const PERSONALITIES: PersonalityCard[] = [
  {
    type: 'negotiator',
    label: 'Negotiator',
    tagline: 'Flex & deal',
    description:
      'Accepts counter-offers within your discount window. Maximises close rate while protecting your floor price on every round.',
    icon: '⚔️',
    engineReady: true,
  },
  {
    type: 'fixed_mrp',
    label: 'Fixed MRP',
    tagline: 'Hold the line',
    description:
      'No discounts, no counter-offers. Lists at MRP and holds firm. Ideal for high-demand or regulated products.',
    icon: '🔒',
    engineReady: false,
  },
  {
    type: 'loyalty',
    label: 'Loyalty',
    tagline: 'Reward regulars',
    description:
      'Unlocks tiered discounts for repeat buyers. Builds a loyal consumer base over multiple missions.',
    icon: '🌟',
    engineReady: false,
  },
  {
    type: 'premium',
    label: 'Premium',
    tagline: 'Quality first',
    description:
      'Minimal discounting. Leans into product quality signals in the negotiation prompt to justify price.',
    icon: '💎',
    engineReady: false,
  },
]

const TONES = [
  { value: 'friendly', label: 'Friendly', desc: 'Warm, collaborative' },
  { value: 'firm', label: 'Firm', desc: 'Direct, no-nonsense' },
  { value: 'professional', label: 'Professional', desc: 'Formal, measured' },
] as const

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: VendorConfig = {
  personality_type: 'negotiator',
  max_discount_percent: 15,
  tone: 'friendly',
  bundling_enabled: true,
  min_rounds_before_accept: 1,
}

function rowToConfig(row: Record<string, unknown> | undefined): VendorConfig {
  if (!row) return DEFAULT_CONFIG
  const p = (row.personality as Record<string, unknown>) ?? {}
  const n = (row.negotiation_rules as Record<string, unknown>) ?? {}
  return {
    personality_type: (p.personality_type as PersonalityType) ?? DEFAULT_CONFIG.personality_type,
    max_discount_percent: (n.max_discount_percent as number) ?? DEFAULT_CONFIG.max_discount_percent,
    tone: (n.tone as VendorConfig['tone']) ?? DEFAULT_CONFIG.tone,
    bundling_enabled: (n.bundling_enabled as boolean) ?? DEFAULT_CONFIG.bundling_enabled,
    min_rounds_before_accept:
      (n.min_rounds_before_accept as number) ?? DEFAULT_CONFIG.min_rounds_before_accept,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PersonalitySelector({
  selected,
  onSelect,
}: {
  selected: PersonalityType
  onSelect: (t: PersonalityType) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {PERSONALITIES.map((card) => {
        const isActive = selected === card.type
        return (
          <button
            key={card.type}
            onClick={() => onSelect(card.type)}
            className={cn(
              'text-left panel-block p-4 flex flex-col gap-2 transition-all focus:outline-none',
              'focus-visible:ring-2 focus-visible:ring-primary',
              isActive && 'panel-block-sel-primary',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-xl leading-none">{card.icon}</span>
                <div>
                  <p className={cn(
                    'font-pixel text-sm font-bold leading-tight',
                    isActive ? 'text-primary' : 'text-white'
                  )}>
                    {card.label}
                  </p>
                  <p className="font-body text-[11px] text-zinc-500">{card.tagline}</p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                {isActive && (
                  <CheckCircle2 size={14} className="text-primary" />
                )}
                {!card.engineReady && (
                  <span className="badge-pixel badge-pixel-warning text-[9px] whitespace-nowrap">
                    Engine: Phase 5
                  </span>
                )}
              </div>
            </div>

            <p className="font-body text-xs text-zinc-400 leading-relaxed">
              {card.description}
            </p>

            {!card.engineReady && (
              <p className="font-body text-[10px] text-zinc-600 leading-relaxed border-t border-zinc-800 pt-2 mt-0.5">
                Config is saved — not yet exercised by the negotiation engine.
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}

function NegotiatorFields({
  config,
  onChange,
}: {
  config: VendorConfig
  onChange: (partial: Partial<VendorConfig>) => void
}) {
  return (
    <AnimatePresence>
      <motion.div
        key="negotiator-fields"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2 }}
        className="space-y-5"
      >
        {/* Max discount slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="font-pixel text-[11px] text-zinc-400 uppercase tracking-wider">
              Max Discount
            </label>
            <span className="font-pixel text-sm text-primary">
              {config.max_discount_percent}%
            </span>
          </div>
          <div className="relative">
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={config.max_discount_percent}
              onChange={(e) => onChange({ max_discount_percent: Number(e.target.value) })}
              className={cn(
                'w-full h-2 rounded-none appearance-none cursor-pointer',
                'bg-zinc-800 border border-zinc-700',
                '[&::-webkit-slider-thumb]:appearance-none',
                '[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4',
                '[&::-webkit-slider-thumb]:bg-primary',
                '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary-dark',
                '[&::-webkit-slider-thumb]:rounded-sm',
                '[&::-webkit-slider-thumb]:cursor-pointer',
                '[&::-webkit-slider-thumb]:shadow-[2px_2px_0_#3D7A1F]',
                '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4',
                '[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2',
                '[&::-moz-range-thumb]:border-primary-dark [&::-moz-range-thumb]:rounded-sm',
                '[&::-moz-range-thumb]:cursor-pointer',
              )}
            />
            <div className="flex justify-between mt-1">
              <span className="font-body text-[10px] text-zinc-600">0%</span>
              <span className="font-body text-[10px] text-zinc-600">25%</span>
              <span className="font-body text-[10px] text-zinc-600">50%</span>
            </div>
          </div>
          <p className="font-body text-xs text-zinc-500 mt-2">
            Your agent will never discount more than {config.max_discount_percent}% below the listing price
            (but never below your floor price — that takes precedence).
          </p>
        </div>

        {/* Tone selector */}
        <div>
          <label className="font-pixel text-[11px] text-zinc-400 uppercase tracking-wider block mb-2">
            Negotiation Tone
          </label>
          <div className="grid grid-cols-3 gap-2">
            {TONES.map((t) => (
              <button
                key={t.value}
                onClick={() => onChange({ tone: t.value })}
                className={cn(
                  'panel-block p-3 text-left transition-all',
                  config.tone === t.value && 'panel-block-sel-primary',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                )}
              >
                <p className={cn(
                  'font-pixel text-xs',
                  config.tone === t.value ? 'text-primary' : 'text-white'
                )}>
                  {t.label}
                </p>
                <p className="font-body text-[10px] text-zinc-500 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Toggles row */}
        <div className="grid grid-cols-2 gap-3">
          <Panel className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-pixel text-xs text-white">Bundle Deals</p>
              <p className="font-body text-[10px] text-zinc-500 mt-0.5">
                Offer discounts on multi-item orders
              </p>
            </div>
            <button
              onClick={() => onChange({ bundling_enabled: !config.bundling_enabled })}
              className={cn(
                'w-10 h-5 rounded-none border-2 relative transition-colors shrink-0',
                config.bundling_enabled
                  ? 'bg-primary border-primary-dark'
                  : 'bg-zinc-800 border-zinc-600'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-3 h-3 bg-white transition-all',
                  config.bundling_enabled ? 'left-[18px]' : 'left-0.5'
                )}
              />
            </button>
          </Panel>

          <Panel className="p-4 flex flex-col gap-2">
            <div>
              <p className="font-pixel text-xs text-white">Min Rounds</p>
              <p className="font-body text-[10px] text-zinc-500 mt-0.5">
                Rounds before accepting first offer
              </p>
            </div>
            <input
              type="number"
              min={0}
              max={10}
              value={config.min_rounds_before_accept}
              onChange={(e) =>
                onChange({ min_rounds_before_accept: Math.min(10, Math.max(0, Number(e.target.value))) })
              }
              className="w-16 bg-zinc-900 border-2 border-accent-dark rounded-sm px-2 py-1 font-pixel text-sm text-primary text-center focus:outline-none focus:border-primary"
            />
          </Panel>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function NonNegotiatorNote({ type }: { type: PersonalityType }) {
  const card = PERSONALITIES.find((p) => p.type === type)!
  return (
    <AnimatePresence>
      <motion.div
        key={type}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="panel-block p-5 flex items-start gap-4"
      >
        <AlertCircle size={18} className="text-warning shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-pixel text-xs text-white">
            {card.label} personality selected
          </p>
          <p className="font-body text-sm text-zinc-400 leading-relaxed">
            This personality type will be saved to your config and visible in the simulation,
            but the negotiation engine only exercises <strong className="text-primary">Negotiator</strong> this phase.
            Your agent will fall back to Negotiator rules until Phase 5 wires the full engine.
          </p>
          <p className="font-body text-[11px] text-zinc-600 mt-2">
            Save now to lock in your preference for when the engine is ready.
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function VendorAgentTrainInner() {
  const { user } = useUser()
  const { data: agentConfigs, isLoading } = useAgentConfig()
  const save = useSaveVendorConfig()

  const [config, setConfig] = useState<VendorConfig>(DEFAULT_CONFIG)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const { data: profile } = useQuery<{
    display_name: string | null
    avatar_config: { character_type?: string } | null
  }>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  // Populate from saved config once loaded
  useEffect(() => {
    if (agentConfigs?.vendor) {
      setConfig(rowToConfig(agentConfigs.vendor as unknown as Record<string, unknown>))
    }
  }, [agentConfigs])

  function patch(partial: Partial<VendorConfig>) {
    setConfig((c) => ({ ...c, ...partial }))
    setSaveSuccess(false)
  }

  async function handleSave() {
    await save.mutateAsync(config)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  const characterType = (
    profile?.avatar_config?.character_type as CharacterType | undefined
  ) ?? (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)?.character_type
  const displayName = profile?.display_name ?? user?.firstName ?? 'Vendor'

  return (
    <AppShell role="vendor" characterType={characterType} displayName={displayName}>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-sm border-2 border-primary bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Bot size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="font-pixel text-2xl font-bold text-primary">Train Your Agent</h1>
            <p className="font-body text-sm text-zinc-500 mt-1">
              Configure how your AI agent negotiates on your behalf.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 gap-3">
              {[0,1,2,3].map(i => (
                <div key={i} className="panel-block h-28 bg-zinc-800" />
              ))}
            </div>
            <div className="panel-block h-32 bg-zinc-800" />
          </div>
        ) : (
          <>
            {/* Personality selector */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[11px] text-zinc-400 uppercase tracking-wider">
                  Personality Type
                </span>
                <ChevronRight size={12} className="text-zinc-600" />
                <span className="font-pixel text-[11px] text-primary uppercase tracking-wider">
                  {PERSONALITIES.find(p => p.type === config.personality_type)?.label}
                </span>
              </div>
              <PersonalitySelector
                selected={config.personality_type}
                onSelect={(t) => patch({ personality_type: t })}
              />
            </section>

            {/* Conditional fields */}
            <section>
              {config.personality_type === 'negotiator' ? (
                <NegotiatorFields config={config} onChange={patch} />
              ) : (
                <NonNegotiatorNote type={config.personality_type} />
              )}
            </section>

            {/* Save row */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t-2 border-accent-dark">
              <AnimatePresence>
                {saveSuccess && (
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <CheckCircle2 size={14} className="text-primary" />
                    <span className="font-pixel text-xs text-primary">Saved!</span>
                  </motion.div>
                )}
                {save.isError && !saveSuccess && (
                  <p className="font-body text-xs text-red-400">
                    Save failed — check your connection.
                  </p>
                )}
                {!saveSuccess && !save.isError && <span />}
              </AnimatePresence>

              <PixelButton
                variant="primary"
                size="md"
                onClick={handleSave}
                loading={save.isPending}
              >
                Save Configuration
              </PixelButton>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}

export default function VendorAgentTrainPage() {
  return (
    <ProtectedRoute requiredRole="vendor">
      <VendorAgentTrainInner />
    </ProtectedRoute>
  )
}
