import { useUser } from '@clerk/react'
import { useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import apiClient from '@/services/api'

const ROLES = [
  {
    id: 'vendor',
    label: 'Vendor',
    emoji: '🏪',
    tagline: 'List your shop, train an agent, watch it sell.',
    bullets: ['Set prices & floor limits', 'AI agent negotiates for you', 'Receive payments via Razorpay'],
    accent: 'border-amber-400 bg-amber-50 dark:bg-amber-950/30',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
  {
    id: 'consumer',
    label: 'Consumer',
    emoji: '🛒',
    tagline: 'Send your AI agent to shop the open market.',
    bullets: ['Type a shopping list', 'Agent scouts & negotiates', 'Approve before any payment'],
    accent: 'border-blue-400 bg-blue-50 dark:bg-blue-950/30',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
] as const

export default function RoleSelectPage() {
  const { user, isLoaded } = useUser()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<'vendor' | 'consumer' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already has a role → sync with backend then skip straight to dashboard
  useEffect(() => {
    if (isLoaded && user) {
      const existing = user.unsafeMetadata?.role as string | undefined
      if (existing === 'vendor' || existing === 'consumer') {
        apiClient
          .post('/v1/auth/sync', {
            role: existing,
            display_name: user.fullName ?? user.primaryEmailAddress?.emailAddress ?? '',
          })
          .catch(() => {})
          .finally(() => {
            navigate({ to: existing === 'vendor' ? '/vendor/dashboard' : '/consumer/hub' })
          })
      }
    }
  }, [isLoaded, user, navigate])

  async function handleConfirm() {
    if (!selected || !user) return
    setLoading(true)
    setError(null)
    try {
      // 1. Write role to Clerk unsafeMetadata (client-side)
      await user.update({ unsafeMetadata: { role: selected } })

      // 2. Sync to Supabase users + wallets tables
      await apiClient.post('/v1/auth/sync', {
        role: selected,
        display_name: user.fullName ?? user.primaryEmailAddress?.emailAddress ?? '',
      })

      // 3. Navigate to character creation
      navigate({ to: '/onboarding/character-create' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-57px)] px-4 py-12">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Choose your role</h1>
          <p className="text-muted-foreground">You can't change this later, so pick wisely.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ROLES.map((role) => (
            <motion.button
              key={role.id}
              onClick={() => setSelected(role.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={[
                'relative flex flex-col gap-4 p-6 rounded-2xl border-2 text-left transition-all',
                selected === role.id
                  ? role.accent + ' shadow-md'
                  : 'border-border hover:border-muted-foreground/40',
              ].join(' ')}
            >
              {selected === role.id && (
                <span className={`absolute top-3 right-3 text-xs font-semibold px-2 py-0.5 rounded-full ${role.badge}`}>
                  Selected
                </span>
              )}
              <span className="text-4xl">{role.emoji}</span>
              <div className="space-y-1">
                <p className="font-semibold text-lg">{role.label}</p>
                <p className="text-sm text-muted-foreground">{role.tagline}</p>
              </div>
              <ul className="space-y-1">
                {role.bullets.map((b) => (
                  <li key={b} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-foreground/40">→</span> {b}
                  </li>
                ))}
              </ul>
            </motion.button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <div className="flex justify-center">
          <button
            onClick={handleConfirm}
            disabled={!selected || loading}
            className="bg-primary text-primary-foreground px-8 py-2.5 rounded-lg font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {loading ? 'Saving…' : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  )
}
