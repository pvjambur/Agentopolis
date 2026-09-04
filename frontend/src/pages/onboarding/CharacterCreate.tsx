import { useUser } from '@clerk/react'
import { useNavigate, Link } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { type CharacterType, tileUrl, spriteMap } from '@/data/characterSpriteMap'
import apiClient from '@/services/api'

interface CharacterDef {
  id: CharacterType
  name: string
  role: 'consumer' | 'vendor'
  description: string
}

const ALL_CHARACTERS: CharacterDef[] = [
  { id: 'char_A_green_top',       name: 'Alex', role: 'consumer', description: 'Savvy shopper, sharp instincts' },
  { id: 'char_B_orange_top',      name: 'Bex',  role: 'consumer', description: 'Deals hunter, never overpays' },
  { id: 'char_E_purple_top',      name: 'Eli',  role: 'consumer', description: 'Patient negotiator, long game' },
  { id: 'char_C_grey_hair',       name: 'Cleo', role: 'vendor',   description: 'Seasoned merchant, holds firm' },
  { id: 'char_D_hardhat',         name: 'Dex',  role: 'vendor',   description: 'No-nonsense, bulk pricing king' },
  { id: 'char_F_darkhair_orange', name: 'Finn', role: 'vendor',   description: 'Premium goods, premium terms' },
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
  const isConsumer = role === 'consumer'

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-57px)] px-4 py-14">
      <div className="w-full max-w-2xl space-y-8">

        {/* Step progress + back */}
        <div className="flex items-center justify-between">
          <Link
            to="/onboarding/role-select"
            className="font-body flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 rounded"
          >
            ← Back
          </Link>
          <span className="font-pixel text-[10px] tracking-widest uppercase text-zinc-500">Step 3 of 3</span>
          <span className="w-12" aria-hidden />
        </div>

        {/* Header */}
        <div className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className={`badge-pixel ${isConsumer ? 'badge-pixel-secondary' : 'badge-pixel-primary'}`}>
              {role ?? 'player'}
            </span>
          </div>
          <h1 className="font-pixel text-3xl font-bold tracking-tight">Choose your character</h1>
          <p className="font-body text-sm text-zinc-400 max-w-sm mx-auto">
            Your AI agent wears this face in the live marketplace — visible to every vendor and consumer during negotiations. Choose the agent who matches your style.
          </p>
        </div>

        {/* Character grid */}
        <motion.div
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="show"
          className="grid grid-cols-3 gap-5"
          role="radiogroup"
          aria-label="Select your character"
        >
          {characters.map((char) => {
            const isSelected = selected === char.id
            const frontIdle = spriteMap[char.id].front.idle
            const walkA    = spriteMap[char.id].front.walk_a
            const walkB    = spriteMap[char.id].front.walk_b
            const selClass = isConsumer ? 'panel-block-sel-secondary' : 'panel-block-sel-primary'
            const focusRing = isConsumer
              ? 'focus-visible:ring-secondary'
              : 'focus-visible:ring-primary'

            return (
              <motion.button
                key={char.id}
                variants={CARD_VARIANTS}
                onClick={() => setSelected(char.id)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ x: 2, y: 2 }}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${char.name} — ${char.description}`}
                className={[
                  'relative flex flex-col items-center gap-3 p-5 text-left transition-colors duration-150',
                  'panel-block',
                  isSelected ? selClass : '',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-panel-dark',
                  focusRing,
                ].join(' ')}
              >
                {/* Selected check badge */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.span
                      key="check"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ duration: 0.12 }}
                      className={[
                        'absolute top-2.5 right-2.5 w-5 h-5 rounded-sm flex items-center justify-center',
                        isConsumer
                          ? 'bg-secondary border-2 border-secondary-dark'
                          : 'bg-primary border-2 border-primary-dark',
                      ].join(' ')}
                    >
                      <Check size={11} strokeWidth={3} color="white" />
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Sprite at 6× (96×96) */}
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
                  <p className="font-pixel font-semibold text-sm leading-tight text-white">{char.name}</p>
                  <p className="font-body text-[11px] text-zinc-300 leading-snug">{char.description}</p>
                </div>
              </motion.button>
            )
          })}
        </motion.div>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between gap-4 p-4 panel-block border-danger"
            >
              <span className="font-body text-sm text-red-300 flex-1">{error}</span>
              <button
                onClick={handleConfirm}
                className="btn-pixel btn-pixel-sm btn-pixel-danger shrink-0"
              >
                Try again
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirm */}
        <div className="flex justify-center">
          <button
            onClick={handleConfirm}
            disabled={!selected || loading}
            className={[
              'btn-pixel btn-pixel-lg',
              isConsumer ? 'btn-pixel-secondary' : 'btn-pixel-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isConsumer ? 'focus-visible:ring-secondary' : 'focus-visible:ring-primary',
            ].join(' ')}
          >
            {loading
              ? 'Saving…'
              : selected
                ? `Enter Agentopolis as ${selectedDef?.name} →`
                : 'Pick a character first'}
          </button>
        </div>

      </div>
    </div>
  )
}
