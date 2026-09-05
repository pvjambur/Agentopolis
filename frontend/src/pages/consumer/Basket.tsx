import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { motion } from 'framer-motion'
import { CheckCircle, Clock, ShoppingBag, Zap } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { type CharacterType } from '@/data/characterSpriteMap'
import apiClient from '@/services/api'

interface UserProfile { display_name: string | null; avatar_config: { character_type?: string } | null }

interface BasketItem {
  negotiation_id: string
  item: string
  shop_name: string
  price_paid: number
  opening_price: number
  is_mocked_payment: boolean
  transaction_ref: string | null
  purchased_at: string
}

interface MissionGroup {
  mission_id: string
  instruction_text: string
  mission_date: string
  mission_status: string
  items: BasketItem[]
  total_spent: number
  item_count: number
}

function PayBadge({ mocked }: { mocked: boolean }) {
  return mocked ? (
    <span className="inline-flex items-center gap-1 font-pixel text-[9px] px-1.5 py-0.5 rounded-sm bg-zinc-700 text-zinc-300 border border-zinc-600">
      <Clock size={9} />Mock
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-pixel text-[9px] px-1.5 py-0.5 rounded-sm bg-emerald-900/60 text-emerald-400 border border-emerald-700">
      <CheckCircle size={9} />Live
    </span>
  )
}

function MissionStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'badge-pixel-primary',
    active: 'badge-pixel-secondary',
    failed: 'badge-pixel-danger',
  }
  return (
    <span className={`badge-pixel ${map[status] ?? 'badge-pixel-warning'}`}>
      {status}
    </span>
  )
}

function BasketInner() {
  usePageTitle('Basket')
  const { user } = useUser()

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  const { data: basket = [], isLoading, isError, refetch } = useQuery<MissionGroup[]>({
    queryKey: ['consumer-basket'],
    queryFn: () => apiClient.get('/v1/transactions/basket').then((r) => r.data),
    staleTime: 30_000,
  })

  const characterType = (profile?.avatar_config?.character_type as CharacterType | undefined)
    ?? (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)?.character_type
  const displayName = profile?.display_name ?? user?.firstName ?? 'Agent'

  const totalSpent = basket.reduce((s, m) => s + m.total_spent, 0)

  return (
    <AppShell role="consumer" characterType={characterType} displayName={displayName}>
      <div className="max-w-4xl mx-auto space-y-6">

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-pixel text-2xl font-bold text-secondary">My Basket</h1>
            <p className="font-body text-sm text-zinc-500 mt-1">
              Everything your agent bought, grouped by mission.
            </p>
          </div>
          {!isLoading && basket.length > 0 && (
            <div className="text-right">
              <p className="font-body text-xs text-zinc-500">Total spent</p>
              <p className="font-pixel text-xl text-secondary">₹{totalSpent.toLocaleString('en-IN')}</p>
            </div>
          )}
        </motion.div>

        {isLoading && (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="panel-block p-5 space-y-3 animate-pulse">
                <div className="h-4 w-48 bg-zinc-800 rounded" />
                <div className="h-16 bg-zinc-800/50 rounded" />
              </div>
            ))}
          </div>
        )}

        {isError && <ErrorState onRetry={() => refetch()} />}

        {!isLoading && !isError && basket.length === 0 && (
          <EmptyState
            icon={ShoppingBag}
            title="Basket is empty"
            description="Start a mission and your agent will negotiate deals for you."
            action={{ label: 'New Mission', href: '/consumer/mission/new', variant: 'secondary' }}
          />
        )}

        {!isLoading && basket.map((mission, i) => (
          <motion.div
            key={mission.mission_id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="panel-block overflow-hidden"
          >
            {/* Mission header */}
            <div className="px-5 py-4 border-b-2 border-accent-dark bg-zinc-900/40 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Zap size={12} className="text-secondary shrink-0" />
                  <span className="font-pixel text-[10px] text-zinc-400">
                    {new Date(mission.mission_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <MissionStatusBadge status={mission.mission_status} />
                </div>
                <p className="font-body text-sm text-white leading-snug line-clamp-2">{mission.instruction_text}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-body text-xs text-zinc-500">{mission.item_count} item{mission.item_count !== 1 ? 's' : ''}</p>
                <p className="font-pixel text-lg text-secondary">₹{mission.total_spent.toLocaleString('en-IN')}</p>
              </div>
            </div>

            {/* Items */}
            <table className="w-full">
              <thead>
                <tr className="border-b border-accent-dark/40">
                  {['Item', 'Shop', 'List Price', 'Paid', 'Saved', 'Payment'].map((h) => (
                    <th key={h} className="text-left font-pixel text-[10px] text-zinc-600 px-4 py-2 first:pl-5 last:pr-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-accent-dark/20">
                {mission.items.map((item) => {
                  const saved = item.opening_price - item.price_paid
                  return (
                    <tr key={item.negotiation_id} className="hover:bg-white/1 transition-colors">
                      <td className="px-4 py-2.5 first:pl-5">
                        <span className="font-body text-xs text-white">{item.item}</span>
                      </td>
                      <td className="px-4 py-2.5 font-body text-xs text-zinc-400">{item.shop_name}</td>
                      <td className="px-4 py-2.5 font-body text-xs text-zinc-500">₹{item.opening_price}</td>
                      <td className="px-4 py-2.5 font-pixel text-xs text-secondary">₹{item.price_paid}</td>
                      <td className="px-4 py-2.5">
                        {saved > 0
                          ? <span className="font-pixel text-[10px] text-emerald-400">-₹{saved.toFixed(0)}</span>
                          : <span className="font-pixel text-[10px] text-zinc-600">—</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 last:pr-5">
                        <PayBadge mocked={item.is_mocked_payment} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </motion.div>
        ))}
      </div>
    </AppShell>
  )
}

export default function ConsumerBasketPage() {
  return <ProtectedRoute requiredRole="consumer"><BasketInner /></ProtectedRoute>
}
