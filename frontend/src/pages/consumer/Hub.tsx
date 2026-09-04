import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Apple,
  Cookie,
  Cpu,
  Leaf,
  Pill,
  ShoppingBasket,
  Sofa,
  Sword,
  Wallet,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/common/StatCard'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { type CharacterType } from '@/data/characterSpriteMap'
import apiClient from '@/services/api'

interface WalletData {
  balance: number
  currency: string
}

interface UserProfile {
  id: string
  role: string
  display_name: string | null
  avatar_config: { character_type?: string } | null
}

interface Domain {
  key: string
  label: string
  icon: React.ElementType
  color: string
}

const DOMAINS: Domain[] = [
  { key: 'vegetables',  label: 'Vegetables',  icon: Leaf,           color: 'text-green-400' },
  { key: 'fruits',      label: 'Fruits',      icon: Apple,          color: 'text-red-400'   },
  { key: 'grocery',     label: 'Grocery',     icon: ShoppingBasket, color: 'text-amber-400' },
  { key: 'pharma',      label: 'Pharma',      icon: Pill,           color: 'text-blue-400'  },
  { key: 'electronics', label: 'Electronics', icon: Cpu,            color: 'text-yellow-400'},
  { key: 'furniture',   label: 'Furniture',   icon: Sofa,           color: 'text-orange-400'},
  { key: 'bakery',      label: 'Bakery',      icon: Cookie,         color: 'text-amber-600' },
]

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: i * 0.06, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
}

function DomainCard({ domain, index }: { domain: Domain; index: number }) {
  const Icon = domain.icon
  return (
    <motion.div
      custom={index + 3}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="show"
      className="panel-block p-4 flex flex-col items-center gap-2 text-center"
    >
      <Icon size={24} className={domain.color} />
      <p className="font-pixel text-[11px] font-bold text-white">{domain.label}</p>
      <span className="badge-pixel badge-pixel-warning text-[9px]">Phase 3</span>
    </motion.div>
  )
}

function ConsumerHubInner() {
  const { user } = useUser()

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  const { data: wallet, isLoading: walletLoading, error: walletError } = useQuery<WalletData>({
    queryKey: ['wallet', 'mine'],
    queryFn: () => apiClient.get('/v1/wallets/mine').then((r) => r.data),
  })

  const characterType = (profile?.avatar_config?.character_type as CharacterType | undefined)
    ?? (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)?.character_type

  const displayName =
    profile?.display_name ??
    user?.firstName ??
    user?.username ??
    'Consumer'

  const balanceDisplay = walletLoading
    ? '—'
    : wallet
      ? `₹${wallet.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      : '₹0.00'

  return (
    <AppShell role="consumer" characterType={characterType} displayName={displayName}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Page header */}
        <motion.div custom={0} variants={CARD_VARIANTS} initial="hidden" animate="show">
          <h1 className="font-pixel text-2xl font-bold text-secondary">Field Base</h1>
          <p className="font-body text-sm text-zinc-500 mt-1">
            Deploy scouts, manage your wallet, and enter the live marketplace.
          </p>
        </motion.div>

        {/* Top row: wallet + enter marketplace */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.div custom={1} variants={CARD_VARIANTS} initial="hidden" animate="show">
            {walletError ? (
              <div className="panel-block border-danger p-5 flex items-center justify-between gap-4 h-full">
                <div>
                  <p className="font-pixel text-xs text-red-400 mb-1">Wallet unavailable</p>
                  <p className="font-body text-xs text-zinc-500">Could not load balance. Check your connection.</p>
                </div>
                <button onClick={() => window.location.reload()} className="btn-pixel btn-pixel-sm btn-pixel-danger shrink-0">
                  Retry
                </button>
              </div>
            ) : (
              <StatCard
                title="Wallet Balance"
                value={balanceDisplay}
                icon={Wallet}
                variant="secondary"
                loading={walletLoading}
                subtext="Seeded for Phase 1 testing · INR"
              />
            )}
          </motion.div>

          <motion.div
            custom={2}
            variants={CARD_VARIANTS}
            initial="hidden"
            animate="show"
            className="panel-block panel-block-sel-secondary p-5 flex flex-col justify-between gap-4"
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sword size={16} className="text-secondary" />
                <span className="font-body text-xs text-zinc-400 uppercase tracking-wider">Marketplace</span>
              </div>
              <p className="font-pixel text-sm font-bold text-white">Enter the arena</p>
              <p className="font-body text-xs text-zinc-500 mt-1 leading-relaxed">
                Walk the live isometric map and watch your agent negotiate in real time.
              </p>
            </div>
            <Link
              to="/consumer/simulation"
              className="btn-pixel btn-pixel-md btn-pixel-secondary w-full justify-center"
            >
              Enter Marketplace →
            </Link>
          </motion.div>
        </div>

        {/* Scout zones */}
        <motion.section custom={3} variants={CARD_VARIANTS} initial="hidden" animate="show">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="font-pixel text-sm font-bold text-zinc-300">Scout Zones</h2>
            <span className="badge-pixel badge-pixel-warning">Phase 3</span>
          </div>
          <p className="font-body text-xs text-zinc-500 mb-4">
            Scouts will autonomously hunt deals across these domains once the agent engine is live.
          </p>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {DOMAINS.map((domain, i) => (
              <DomainCard key={domain.key} domain={domain} index={i} />
            ))}
          </div>
        </motion.section>

      </div>
    </AppShell>
  )
}

export default function ConsumerHubPage() {
  return (
    <ProtectedRoute requiredRole="consumer">
      <ConsumerHubInner />
    </ProtectedRoute>
  )
}
