import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, CheckCircle2, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { PixelButton } from '@/components/ui/PixelButton'
import { Panel } from '@/components/ui/Panel'
import { useAgentConfig, useSaveConsumerConfig } from '@/hooks/useAgentConfig'
import apiClient from '@/services/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type CharacterType } from '@/data/characterSpriteMap'
import { cn } from '@/lib/utils'

// ── Defaults + helpers ────────────────────────────────────────────────────────

const DEFAULT_PRICE_WEIGHT = 0.7
const DEFAULT_BUDGET: number | null = null

function rowToPriceWeight(row: Record<string, unknown> | undefined): {
  price_weight: number
  default_budget: number | null
} {
  if (!row) return { price_weight: DEFAULT_PRICE_WEIGHT, default_budget: DEFAULT_BUDGET }
  const p = (row.personality as Record<string, unknown>) ?? {}
  return {
    price_weight: (p.price_weight as number) ?? DEFAULT_PRICE_WEIGHT,
    default_budget: (p.default_budget as number | null) ?? DEFAULT_BUDGET,
  }
}

// Convert 0-1 weight to a readable label
function weightLabel(priceWeight: number): { price: string; quality: string; hint: string } {
  const p = Math.round(priceWeight * 100)
  const q = 100 - p
  let hint = ''
  if (p >= 80) hint = 'Strongly price-first — your agent haggles hard'
  else if (p >= 60) hint = 'Price-leaning — discounts matter, quality is secondary'
  else if (p === 50) hint = 'Balanced — price and quality weighted equally'
  else if (p >= 30) hint = 'Quality-leaning — your agent values reviews and freshness'
  else hint = 'Strongly quality-first — your agent will pay a premium for the best'
  return { price: `${p}%`, quality: `${q}%`, hint }
}

// ── Slider ────────────────────────────────────────────────────────────────────

function PriceQualitySlider({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const { price, quality, hint } = weightLabel(value)
  const leftPct = Math.round(value * 100)

  return (
    <div className="space-y-4">
      {/* Labels */}
      <div className="flex items-center justify-between">
        <div className="text-center">
          <p className="font-pixel text-lg text-primary">{price}</p>
          <p className="font-body text-xs text-zinc-500">Price</p>
        </div>
        <div className="text-center">
          <p className="font-pixel text-lg text-secondary">{quality}</p>
          <p className="font-body text-xs text-zinc-500">Quality</p>
        </div>
      </div>

      {/* Track */}
      <div className="relative h-6 flex items-center">
        {/* Background track */}
        <div className="absolute inset-0 flex rounded-none overflow-hidden border-2 border-accent-dark h-3 top-1/2 -translate-y-1/2">
          <div
            className="bg-primary h-full transition-all duration-100"
            style={{ width: `${leftPct}%` }}
          />
          <div className="flex-1 bg-secondary/30 h-full" />
        </div>
        {/* Native range input (transparent, above) */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            'relative w-full h-6 appearance-none bg-transparent cursor-pointer z-10',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5',
            '[&::-webkit-slider-thumb]:bg-white',
            '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent-dark',
            '[&::-webkit-slider-thumb]:rounded-sm',
            '[&::-webkit-slider-thumb]:cursor-pointer',
            '[&::-webkit-slider-thumb]:shadow-[2px_2px_0_rgba(0,0,0,0.4)]',
            '[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5',
            '[&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2',
            '[&::-moz-range-thumb]:border-accent-dark [&::-moz-range-thumb]:rounded-sm',
            '[&::-moz-range-thumb]:cursor-pointer',
          )}
        />
      </div>

      {/* Tick marks */}
      <div className="flex justify-between px-0.5">
        {[0, 25, 50, 75, 100].map((tick) => (
          <div key={tick} className="flex flex-col items-center gap-0.5">
            <div className="w-px h-1.5 bg-zinc-700" />
            <span className="font-body text-[10px] text-zinc-600">{tick}%</span>
          </div>
        ))}
      </div>

      {/* Hint */}
      <AnimatePresence mode="wait">
        <motion.div
          key={hint}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="panel-block p-3 flex items-center gap-2"
        >
          <Bot size={13} className="text-zinc-500 shrink-0" />
          <p className="font-body text-xs text-zinc-400">{hint}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ConsumerAgentTrainInner() {
  usePageTitle('Agent Training')
  const { user } = useUser()
  const { data: agentConfigs, isLoading } = useAgentConfig()
  const save = useSaveConsumerConfig()

  const [priceWeight, setPriceWeight] = useState(DEFAULT_PRICE_WEIGHT)
  const [budgetInput, setBudgetInput] = useState('')
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
    if (agentConfigs?.consumer) {
      const { price_weight, default_budget } = rowToPriceWeight(
        agentConfigs.consumer as unknown as Record<string, unknown>
      )
      setPriceWeight(price_weight)
      setBudgetInput(default_budget != null ? String(default_budget) : '')
    }
  }, [agentConfigs])

  async function handleSave() {
    const budget = budgetInput !== '' ? parseFloat(budgetInput) : null
    await save.mutateAsync({ price_weight: priceWeight, default_budget: budget })
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  const characterType = (
    profile?.avatar_config?.character_type as CharacterType | undefined
  ) ?? (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)?.character_type
  const displayName = profile?.display_name ?? user?.firstName ?? 'Shopper'

  return (
    <AppShell role="consumer" characterType={characterType} displayName={displayName}>
      <div className="max-w-xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-sm border-2 border-secondary bg-secondary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Bot size={18} className="text-secondary" />
          </div>
          <div>
            <h1 className="font-pixel text-2xl font-bold text-secondary">Train Your Agent</h1>
            <p className="font-body text-sm text-zinc-500 mt-1">
              Set your shopping priorities. These become the defaults for every mission your agent runs.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="panel-block h-48 bg-zinc-800" />
            <div className="panel-block h-20 bg-zinc-800" />
          </div>
        ) : (
          <>
            {/* Price/quality slider */}
            <Panel className="p-5 space-y-4">
              <div>
                <p className="font-pixel text-sm text-white mb-0.5">Price vs. Quality Priority</p>
                <p className="font-body text-xs text-zinc-500">
                  Slide left to prioritise the lowest price. Slide right to prioritise quality and freshness.
                </p>
              </div>
              <PriceQualitySlider
                value={priceWeight}
                onChange={(v) => { setPriceWeight(v); setSaveSuccess(false) }}
              />
            </Panel>

            {/* Default budget */}
            <Panel className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-zinc-500" />
                <p className="font-pixel text-sm text-white">Default Budget</p>
                <span className="badge-pixel badge-pixel-warning text-[9px] ml-auto">Optional</span>
              </div>
              <p className="font-body text-xs text-zinc-500">
                Pre-fill your mission budget. You can override this per mission.
              </p>
              <div className="flex items-center gap-2">
                <span className="font-pixel text-sm text-zinc-400">₹</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={budgetInput}
                  onChange={(e) => { setBudgetInput(e.target.value); setSaveSuccess(false) }}
                  placeholder="No default set"
                  className="flex-1 bg-zinc-900 border-2 border-accent-dark rounded-sm px-3 py-2 font-body text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-secondary transition-colors"
                />
              </div>
            </Panel>

            {/* Engine context note */}
            <div className="bg-secondary/10 border-2 border-secondary-dark rounded-sm p-4">
              <p className="font-pixel text-[10px] text-secondary-light uppercase tracking-wider mb-1">
                How this is used
              </p>
              <p className="font-body text-xs text-zinc-400 leading-relaxed">
                When your agent ranks shops and routes a mission, it weights each product's
                score as <strong className="text-white">{Math.round(priceWeight * 100)}% price</strong> and{' '}
                <strong className="text-white">{Math.round((1 - priceWeight) * 100)}% quality signals</strong>.
                This is the default — per-mission overrides take precedence.
              </p>
            </div>

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
                    <CheckCircle2 size={14} className="text-secondary" />
                    <span className="font-pixel text-xs text-secondary">Saved!</span>
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
                variant="secondary"
                size="md"
                onClick={handleSave}
                loading={save.isPending}
              >
                Save Preferences
              </PixelButton>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}

export default function ConsumerAgentTrainPage() {
  return (
    <ProtectedRoute requiredRole="consumer">
      <ConsumerAgentTrainInner />
    </ProtectedRoute>
  )
}
