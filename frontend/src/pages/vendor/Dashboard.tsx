import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Package, Store, TrendingUp } from 'lucide-react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/common/EmptyState'
import { StatCard } from '@/components/common/StatCard'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { type CharacterType } from '@/data/characterSpriteMap'
import apiClient from '@/services/api'

interface Shop {
  id: string
  name: string
  domain: string
  description: string | null
  is_active: boolean
  created_at: string
}

interface UserProfile {
  id: string
  role: string
  display_name: string | null
  avatar_config: { character_type?: string } | null
}

const DOMAIN_LABELS: Record<string, string> = {
  vegetables: '🥦 Vegetables',
  fruits: '🍎 Fruits',
  grocery: '🛒 Grocery',
  pharma: '💊 Pharma',
  electronics: '⚡ Electronics',
  furniture: '🪑 Furniture',
  bakery: '🍞 Bakery',
}

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: i * 0.07, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
}

function ShopCard({ shop }: { shop: Shop }) {
  return (
    <motion.div
      custom={0}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="show"
      className="panel-block panel-block-sel-primary p-5 flex items-start gap-4"
    >
      <div className="w-10 h-10 rounded-sm border-2 border-primary bg-primary/10 flex items-center justify-center shrink-0">
        <Store size={18} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-pixel text-sm font-bold text-white">{shop.name}</h3>
          <span className="badge-pixel badge-pixel-primary">
            {DOMAIN_LABELS[shop.domain] ?? shop.domain}
          </span>
          {!shop.is_active && (
            <span className="badge-pixel badge-pixel-warning">Inactive</span>
          )}
        </div>
        {shop.description && (
          <p className="font-body text-xs text-zinc-400 mt-1 leading-relaxed">{shop.description}</p>
        )}
        <p className="font-body text-[11px] text-zinc-600 mt-2">
          0 products · Created {new Date(shop.created_at).toLocaleDateString()}
        </p>
      </div>
    </motion.div>
  )
}

function ChartPlaceholder() {
  return (
    <div className="panel-block p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-pixel text-sm font-bold text-white">Revenue</h3>
          <p className="font-body text-xs text-zinc-500">Last 30 days</p>
        </div>
        <TrendingUp size={16} className="text-zinc-600" />
      </div>

      <div className="relative">
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={[]}>
            <defs>
              <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#5FA632" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#5FA632" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'Inter' }}
              axisLine={{ stroke: '#6B4319' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'Inter' }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#2B2B2B',
                border: '2px solid #6B4319',
                borderRadius: 4,
                fontFamily: 'Pixelify Sans',
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#5FA632"
              strokeWidth={2}
              fill="url(#revGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Zero-state overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="font-pixel text-xs text-zinc-600 text-center leading-relaxed">
            No sales yet —<br />data appears once your shop is live
          </p>
        </div>
      </div>
    </div>
  )
}

function VendorDashboardInner() {
  const { user } = useUser()

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  const {
    data: shops = [],
    isLoading: shopsLoading,
    error: shopsError,
  } = useQuery<Shop[]>({
    queryKey: ['shops', 'mine'],
    queryFn: () => apiClient.get('/v1/shops/mine').then((r) => r.data),
  })

  const characterType = (profile?.avatar_config?.character_type as CharacterType | undefined)
    ?? (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)?.character_type

  const displayName =
    profile?.display_name ??
    user?.firstName ??
    user?.username ??
    'Vendor'

  return (
    <AppShell role="vendor" characterType={characterType} displayName={displayName}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Page header */}
        <motion.div custom={0} variants={CARD_VARIANTS} initial="hidden" animate="show">
          <h1 className="font-pixel text-2xl font-bold text-primary">Command Center</h1>
          <p className="font-body text-sm text-zinc-500 mt-1">
            Manage your shop and monitor your agent's performance.
          </p>
        </motion.div>

        {/* Stat row */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        >
          <motion.div custom={1} variants={CARD_VARIANTS}>
            <StatCard
              title="Shops"
              value={shopsLoading ? '—' : shops.length}
              icon={Store}
              variant="primary"
              subtext="Active storefronts"
            />
          </motion.div>
          <motion.div custom={2} variants={CARD_VARIANTS}>
            <StatCard
              title="Products"
              value="0"
              icon={Package}
              variant="neutral"
              subtext="Add via Catalog (Phase 2)"
            />
          </motion.div>
          <motion.div custom={3} variants={CARD_VARIANTS}>
            <StatCard
              title="Revenue"
              value="₹0"
              icon={TrendingUp}
              variant="neutral"
              subtext="No transactions yet"
            />
          </motion.div>
        </motion.div>

        {/* Shop section */}
        <motion.section custom={4} variants={CARD_VARIANTS} initial="hidden" animate="show">
          <h2 className="font-pixel text-sm font-bold text-zinc-300 mb-3">Your Shop</h2>

          {shopsLoading && (
            <div className="panel-block p-5 flex gap-4 animate-pulse">
              <div className="w-10 h-10 rounded-sm bg-zinc-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-zinc-700 rounded" />
                <div className="h-3 w-64 bg-zinc-700 rounded" />
              </div>
            </div>
          )}

          {!shopsLoading && shopsError && (
            <div className="panel-block border-danger p-5 flex items-center justify-between gap-4">
              <p className="font-body text-sm text-red-300">
                Failed to load shop data. Check your connection.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="btn-pixel btn-pixel-sm btn-pixel-danger shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {!shopsLoading && !shopsError && shops.length === 0 && (
            <EmptyState
              icon={Store}
              title="Your first shop awaits"
              description="Create a shop, set your domain, and your AI agent will start negotiating for you. Catalog management launches in Phase 2."
              action={{ label: 'Create shop (Phase 2)', variant: 'primary' }}
            />
          )}

          {!shopsLoading && !shopsError && shops.length > 0 && (
            <div className="space-y-3">
              {shops.map((shop) => (
                <ShopCard key={shop.id} shop={shop} />
              ))}
            </div>
          )}
        </motion.section>

        {/* Chart placeholder */}
        <motion.div custom={5} variants={CARD_VARIANTS} initial="hidden" animate="show">
          <ChartPlaceholder />
        </motion.div>

      </div>
    </AppShell>
  )
}

export default function VendorDashboardPage() {
  return (
    <ProtectedRoute requiredRole="vendor">
      <VendorDashboardInner />
    </ProtectedRoute>
  )
}
