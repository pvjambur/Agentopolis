import { useState } from 'react'
import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CheckCircle, Clock, Receipt } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type CharacterType } from '@/data/characterSpriteMap'
import apiClient from '@/services/api'

interface UserProfile { display_name: string | null; avatar_config: { character_type?: string } | null }

interface TxItem {
  id: string
  item: string
  shop_name: string
  final_price: number
  opening_price: number
  round_count: number
  is_mocked_payment: boolean
  transaction_ref: string | null
  created_at: string
}

interface TxPage { items: TxItem[]; total: number; page: number; pages: number }

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

function ConsumerTransactionsInner() {
  usePageTitle('Transactions')
  const { user } = useUser()
  const [page, setPage] = useState(1)

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  const { data: txData, isLoading, isError, refetch } = useQuery<TxPage>({
    queryKey: ['consumer-transactions', page],
    queryFn: () => apiClient.get(`/v1/transactions/consumer?page=${page}&limit=20`).then((r) => r.data),
    placeholderData: (prev) => prev,
  })

  const characterType = (profile?.avatar_config?.character_type as CharacterType | undefined)
    ?? (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)?.character_type
  const displayName = profile?.display_name ?? user?.firstName ?? 'Agent'

  return (
    <AppShell role="consumer" characterType={characterType} displayName={displayName}>
      <div className="max-w-5xl mx-auto space-y-6">

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-pixel text-2xl font-bold text-secondary">Transactions</h1>
          <p className="font-body text-sm text-zinc-500 mt-1">
            {txData ? `${txData.total} purchases by your agent` : 'Everything your agent bought'}
          </p>
        </motion.div>

        {isError && <ErrorState onRetry={() => refetch()} />}

        {!isError && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="panel-block overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-accent-dark">
                {['Item', 'Shop', 'Opening', 'Final', 'Saved', 'Payment', 'Date'].map((h) => (
                  <th key={h} className="text-left font-pixel text-[10px] text-zinc-500 px-4 py-3 first:pl-5 last:pr-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-accent-dark/30">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
                : (txData?.items ?? []).map((tx) => {
                  const saved = tx.opening_price - tx.final_price
                  return (
                    <tr key={tx.id} className="hover:bg-white/2 transition-colors">
                      <td className="px-4 py-3 first:pl-5">
                        <span className="font-body text-xs text-white">{tx.item}</span>
                      </td>
                      <td className="px-4 py-3 font-body text-xs text-zinc-400">{tx.shop_name}</td>
                      <td className="px-4 py-3 font-body text-xs text-zinc-500">₹{tx.opening_price}</td>
                      <td className="px-4 py-3 font-pixel text-xs text-secondary">₹{tx.final_price}</td>
                      <td className="px-4 py-3">
                        {saved > 0
                          ? <span className="font-pixel text-[10px] text-emerald-400">-₹{saved.toFixed(0)}</span>
                          : <span className="font-pixel text-[10px] text-zinc-600">—</span>
                        }
                      </td>
                      <td className="px-4 py-3"><PayBadge mocked={tx.is_mocked_payment} /></td>
                      <td className="px-4 py-3 last:pr-5 font-body text-xs text-zinc-500">
                        {new Date(tx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>

          {!isLoading && !txData?.items?.length && (
            <div className="py-12 text-center">
              <EmptyState
                icon={Receipt}
                title="No purchases yet"
                description="Start a mission and let your agent negotiate deals."
                action={{ label: 'New Mission', href: '/consumer/mission/new', variant: 'secondary' }}
              />
            </div>
          )}

          {(txData?.pages ?? 0) > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t-2 border-accent-dark">
              <p className="font-body text-xs text-zinc-500">
                Page {txData!.page} of {txData!.pages} · {txData!.total} total
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="btn-pixel btn-pixel-sm btn-pixel-neutral disabled:opacity-40"
                >← Prev</button>
                <button
                  disabled={page >= (txData?.pages ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn-pixel btn-pixel-sm btn-pixel-neutral disabled:opacity-40"
                >Next →</button>
              </div>
            </div>
          )}
        </motion.div>}
      </div>
    </AppShell>
  )
}

export default function ConsumerTransactionsPage() {
  return <ProtectedRoute requiredRole="consumer"><ConsumerTransactionsInner /></ProtectedRoute>
}
