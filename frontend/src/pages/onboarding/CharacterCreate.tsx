import { useUser } from '@clerk/react'
import { useNavigate, Link } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { type CharacterType, tileUrl, spriteMap } from '@/data/characterSpriteMap'
import apiClient from '@/services/api'

interface CharacterDef {
  id: CharacterType
  name: string
  role: 'consumer' | 'vendor'
  description: string
  ringClass: string
  focusRingClass: string
  glowClass: string
}

const ALL_CHARACTERS: CharacterDef[] = [
  {
    id: 'char_A_green_top',
    name: 'Alex',
    role: 'consumer',
    description: 'Savvy shopper, sharp instincts',
    ringClass: 'ring-blue-400',
    focusRingClass: 'focus-visible:ring-blue-400',
    glowClass: 'shadow-blue-500/30',
  },
  {
    id: 'char_B_orange_top',
    name: 'Bex',
    role: 'consumer',
    description: 'Deals hunter, never overpays',
    ringClass: 'ring-blue-400',
    focusRingClass: 'focus-visible:ring-blue-400',
    glowClass: 'shadow-blue-500/30',
  },
  {
    id: 'char_E_purple_top',
    name: 'Eli',
    role: 'consumer',
    description: 'Patient negotiator, long game',
    ringClass: 'ring-blue-400',
    focusRingClass: 'focus-visible:ring-blue-400',
    glowClass: 'shadow-blue-500/30',
  },
  {
    id: 'char_C_grey_hair',
    name: 'Cleo',
    role: 'vendor',
    description: 'Seasoned merchant, holds firm',
    ringClass: 'ring-amber-400',
    focusRingClass: 'focus-visible:ring-amber-400',
    glowClass: 'shadow-amber-500/30',
  },
  {
    id: 'char_D_hardhat',
    name: 'Dex',
    role: 'vendor',
    description: 'No-nonsense, bulk pricing king',
    ringClass: 'ring-amber-400',
    focusRingClass: 'focus-visible:ring-amber-400',
    glowClass: 'shadow-amber-500/30',
  },
  {
    id: 'char_F_darkhair_orange',
    name: 'Finn',
    role: 'vendor',
    description: 'Premium goods, premium terms',
    ringClass: 'ring-amber-400',
    focusRingClass: 'focus-visible:ring-amber-400',
    glowClass: 'shadow-amber-500/30',
  },
]

const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
}

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const ERROR_MESSAGES: Record<string, string> = {
  '404': 'Account not found — try signing out and back in.',
  '400': 'Invalid character selection.',
  default: 'Could not save your character. Check your connection and try again.',
}

function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status) return ERROR_MESSAGES[String(status)] ?? ERROR_MESSAGES.default
    return ERROR_MESSAGES.default
  }
  return ERROR_MESSAGES.default
}

export default function CharacterCreatePage() {
  const { user, isLoaded } = useUser()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<CharacterType | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const role = (user?.unsafeMetadata?.role as 'vendor' | 'consumer' | undefined) ?? null
  const characters = role ? ALL_CHARACTERS.filter((c) => c.role === role) : ALL_CHARACTERS

  // Already has avatar → skip to dashboard
  if (isLoaded && user) {
    const cfg = user.unsafeMetadata?.avatar_config as { character_type?: string } | undefined
    if (cfg?.character_type) {
      const dest = role === 'vendor' ? '/vendor/dashboard' : '/consumer/hub'
      navigate({ to: dest })
      return null
    }
  }

  async function handleConfirm() {
    if (!selected || !user) return
    setLoading(true)
    setError(null)
    try {
      await apiClient.patch('/v1/users/me/avatar', { character_type: selected })
      await user.reload()
      const dest = role === 'vendor' ? '/vendor/dashboard' : '/consumer/hub'
      navigate({ to: dest })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  const selectedDef = selected ? ALL_CHARACTERS.find((c) => c.id === selected) : null
  const accentIsBlue = selectedDef?.role === 'consumer'

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-57px)] px-4 py-14">
      <div className="w-full max-w-2xl space-y-8">

        {/* Step progress + back */}
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <Link
            to="/onboarding/role-select"
            className="flex items-center gap-1 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 rounded"
          >
            ← Back
          </Link>
          <span className="tracking-widest uppercase font-medium">Step 3 of 3</span>
          <span className="w-12" aria-hidden />
        </div>

        {/* Header */}
        <div className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <span
              className={[
                'inline-block text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full border',
                role === 'vendor'
                  ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                  : 'border-blue-500/40 text-blue-400 bg-blue-500/10',
              ].join(' ')}
            >
              {role ?? 'player'}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Choose your character</h1>
          <p className="text-sm text-zinc-400 max-w-sm mx-auto">
            Your AI agent wears this face in the live marketplace — visible to every vendor and consumer during negotiations.
          </p>
        </div>

        {/* Character grid */}
        <motion.div
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="show"
          className="grid grid-cols-3 gap-4"
          role="radiogroup"
          aria-label="Select your character"
        >
          {characters.map((char) => {
            const isSelected = selected === char.id
            const frontIdle = spriteMap[char.id].front.idle
            const walkA    = spriteMap[char.id].front.walk_a
            const walkB    = spriteMap[char.id].front.walk_b

            return (
              <motion.button
                key={char.id}
                variants={CARD_VARIANTS}
                onClick={() => setSelected(char.id)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${char.name} — ${char.description}`}
                className={[
                  'relative flex flex-col items-center gap-3 p-5 rounded-2xl border-2 text-left transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  char.focusRingClass,
                  isSelected
                    ? `border-transparent ring-2 ${char.ringClass} shadow-xl ${char.glowClass} bg-zinc-900`
                    : 'border-border bg-zinc-900/60 hover:border-zinc-600',
                ].join(' ')}
              >
                {/* Selected check */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.span
                      key="check"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ duration: 0.15 }}
                      className={[
                        'absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                        char.role === 'consumer'
                          ? 'bg-blue-400 text-black'
                          : 'bg-amber-400 text-black',
                      ].join(' ')}
                    >
                      ✓
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Sprite at 6× (96×96) — character dominates the card */}
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <img
                    src={tileUrl(frontIdle)}
                    alt={char.name}
                    width={96}
                    height={96}
                    style={{ imageRendering: 'pixelated' }}
                    draggable={false}
                    className={[
                      'absolute inset-0 transition-opacity duration-100',
                      isSelected ? 'opacity-0' : 'opacity-100',
                    ].join(' ')}
                  />
                  {/* Walk-cycle preview on selection */}
                  <img
                    src={tileUrl(walkA)}
                    alt=""
                    aria-hidden
                    width={96}
                    height={96}
                    style={{ imageRendering: 'pixelated' }}
                    draggable={false}
                    className={[
                      'absolute inset-0 transition-opacity duration-100',
                      isSelected ? 'opacity-100 animate-[walkcycle_0.4s_steps(1)_infinite]' : 'opacity-0',
                    ].join(' ')}
                  />
                  <img
                    src={tileUrl(walkB)}
                    alt=""
                    aria-hidden
                    width={96}
                    height={96}
                    style={{ imageRendering: 'pixelated' }}
                    draggable={false}
                    className={[
                      'absolute inset-0 transition-opacity duration-100',
                      isSelected ? 'opacity-100 animate-[walkcycle_0.4s_steps(1)_0.2s_infinite]' : 'opacity-0',
                    ].join(' ')}
                  />
                </div>

                {/* Labels */}
                <div className="w-full space-y-0.5 text-center">
                  <p className="font-semibold text-sm leading-tight text-white">{char.name}</p>
                  <p className="text-[11px] text-zinc-300 leading-snug">{char.description}</p>
                </div>
              </motion.button>
            )
          })}
        </motion.div>

        {/* Error with retry */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-red-950/40 border border-red-800/50 text-sm"
            >
              <span className="text-red-300">{error}</span>
              <button
                onClick={handleConfirm}
                className="shrink-0 text-xs font-medium text-red-200 underline underline-offset-2 hover:text-white transition-colors"
              >
                Try again
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirm */}
        <div className="flex justify-center">
          <motion.button
            onClick={handleConfirm}
            disabled={!selected || loading}
            whileTap={selected && !loading ? { scale: 0.97 } : {}}
            className={[
              'px-10 py-2.5 rounded-lg font-medium text-sm transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              selected && !loading
                ? accentIsBlue
                  ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/20 focus-visible:ring-blue-400'
                  : 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 focus-visible:ring-amber-400'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50',
            ].join(' ')}
          >
            {loading
              ? 'Saving…'
              : selected
                ? `Enter the market as ${selectedDef?.name} →`
                : 'Pick a character first'}
          </motion.button>
        </div>

      </div>
    </div>
  )
}
