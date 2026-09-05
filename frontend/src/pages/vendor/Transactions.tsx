import { useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CheckCircle, Clock, CreditCard, Receipt } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type CharacterType } from '@/data/characterSpriteMap'
import apiClient from '@/services/api'

interface Shop { id: string; name: string }
interface UserProfile { display_name: string | null; avatar_config: { character_type?: string } | null }

interface TxItem {
  id: string
  item: string
  final_price: number
  opening_price: number
  round_count: number
  is_mocked_payment: boolean
  transaction_ref: string | null
  created_at: string
}

interface TxPage { items: TxItem[]; total: number; page: number; pages: number; limit: number }

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

function VendorTransactionsInner() {
  usePageTitle('Transactions')
  const { user } = useUser()
  const [selectedShop, setSelectedShop] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  const { data: shops = [] } = useQuery<Shop[]>({
    queryKey: ['shops', 'mine'],
    queryFn: () => apiClient.get('/v1/shops/mine').then((r) => r.data),
  })

  useEffect(() => {
    if (shops.length && !selectedShop) setSelectedShop(shops[0].id)
  }, [shops, selectedShop])

  const activeShopId = selectedShop ?? shops[0]?.id

  const { data: txData, isLoading, isError, refetch } = useQuery<TxPage>({
    queryKey: ['vendor-transactions', activeShopId, page],
    queryFn: () => apiClient.get(`/v1/transactions/vendor/${activeShopId}?page=${page}&limit=20`).then((r) => r.data),
    enabled: !!activeShopId,
    placeholderData: (prev) => prev,
  })

  const characterType = (profile?.avatar_config?.character_type as CharacterType | undefined)
    ?? (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)?.character_type
  const displayName = profile?.display_name ?? user?.firstName ?? 'Vendor'

  return (
    <AppShell role="vendor" characterType={characterType} displayName={displayName}>
      <div className="max-w-5xl mx-auto space-y-6">

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-pixel text-2xl font-bold text-primary">Transactions</h1>
            <p className="font-body text-sm text-zinc-500 mt-1">
              {txData ? `${txData.total} deals closed` : 'Completed negotiations'}
            </p>
          </div>
          {shops.length > 1 && (
            <select
              value={activeShopId ?? ''}
              onChange={(e) => { setSelectedShop(e.target.value); setPage(1) }}
              className="bg-zinc-900 border-2 border-accent-dark rounded-sm px-2 py-1.5 font-body text-xs text-white focus:outline-none focus:border-primary"
            >
              {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </motion.div>

        {!activeShopId && !isLoading && (
          <EmptyState icon={Receipt} title="No shops yet" description="Create a shop to see your transaction history." />
        )}

        {activeShopId && isError && <ErrorState onRetry={() => refetch()} />}

        {activeShopId && !isError && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
            className="panel-block overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-accent-dark">
                  {['Item', 'Opening', 'Final', 'Rounds', 'Payment', 'Date'].map((h) => (
                    <th key={h} className="text-left font-pixel text-[10px] text-zinc-500 px-4 py-3 first:pl-5 last:pr-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-accent-dark/30">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                  : (txData?.items ?? []).map((tx) => (
                    <tr key={tx.id} className="hover:bg-white/2 transition-colors">
                      <td className="px-4 py-3 first:pl-5">
                        <span className="font-body text-xs text-white">{tx.item}</span>
                      </td>
                      <td className="px-4 py-3 font-body text-xs text-zinc-500">₹{tx.opening_price}</td>
                      <td className="px-4 py-3 font-pixel text-xs text-primary">₹{tx.final_price}</td>
                      <td className="px-4 py-3 font-body text-xs text-zinc-400">{tx.round_count}</td>
                      <td className="px-4 py-3"><PayBadge mocked={tx.is_mocked_payment} /></td>
                      <td className="px-4 py-3 last:pr-5 font-body text-xs text-zinc-500">
                        {new Date(tx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>

            {!isLoading && !txData?.items?.length && (
              <div className="py-12 text-center">
                <p className="font-pixel text-xs text-zinc-600">No deals yet for this shop.</p>
              </div>
            )}

            {/* Pagination */}
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
          </motion.div>
        )}
      </div>
    </AppShell>
  )
}

export default function VendorTransactionsPage() {
  return <ProtectedRoute requiredRole="vendor"><VendorTransactionsInner /></ProtectedRoute>
}
